import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import ApplicationService from '../../services/applicationService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { 
    getApplicationSettings, 
    getUserApplications, 
    createApplication, 
    getApplication,
    getApplicationRoles,
    updateApplication,
    getApplicationRoleSettings
} from '../../utils/database.js';

function getApplicationStatusPresentation(statusValue) {
    const normalized = typeof statusValue === 'string' ? statusValue.trim().toLowerCase() : 'unknown';
    const statusLabel =
        normalized === 'pending' ? 'En progreso' :
        normalized === 'approved' ? 'Aceptada' :
        normalized === 'denied' ? 'Rechazada' :
        'Desconocido';
    const statusEmoji =
        normalized === 'pending' ? '🟡' :
        normalized === 'approved' ? '🟢' :
        normalized === 'denied' ? '🔴' :
        '⚪';

    return { normalized, statusLabel, statusEmoji };
}

export default {
    data: new SlashCommandBuilder()
        .setName("apply")
        .setDescription("Gestiona solicitudes de roles")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("submit")
                .setDescription("Enviar una solicitud para un rol")
                .addStringOption((option) =>
                    option
                        .setName("application")
                        .setDescription("La solicitud que deseas enviar")
                        .setRequired(true)
                        .setAutocomplete(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("status")
                .setDescription("Ver el estado de tu solicitud")
                .addStringOption((option) =>
                    option
                        .setName("id")
                        .setDescription("ID de la solicitud (déjalo vacío para ver todas)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("Listar solicitudes disponibles"),
        ),

    category: "Community",

    execute: withErrorHandling(async (interaction) => {
        if (!interaction.inGuild()) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed("Este comando solo puede usarse en un servidor.")],
                flags: ["Ephemeral"],
            });
        }

        const { options, guild, member } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand !== "submit") {
            const isListCommand = subcommand === "list";
            await InteractionHelper.safeDefer(interaction, { flags: isListCommand ? [] : ["Ephemeral"] });
        }

        logger.info(`Comando apply ejecutado: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild.id,
            subcommand
        });

        const settings = await getApplicationSettings(
            interaction.client,
            guild.id,
        );
        
        if (!settings.enabled) {
            throw createError(
                'Solicitudes desactivadas',
                ErrorTypes.CONFIGURATION,
                'Las solicitudes están desactivadas en este servidor.',
                { guildId: guild.id }
            );
        }

        if (subcommand === "submit") {
            await handleSubmit(interaction, settings);
        } else if (subcommand === "status") {
            await handleStatus(interaction);
        } else if (subcommand === "list") {
            await handleList(interaction);
        }
    }, { type: 'command', commandName: 'apply' })
};

export async function handleApplicationModal(interaction) {
    if (!interaction.isModalSubmit()) return;
    
    const customId = interaction.customId;
    if (!customId.startsWith('app_modal_')) return;
    
    const roleId = customId.split('_')[2];
    
    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    const applicationRole = applicationRoles.find(appRole => appRole.roleId === roleId);
    
    if (!applicationRole) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Configuración de solicitud no encontrada.')],
            flags: ["Ephemeral"]
        });
    }
    
    const role = interaction.guild.roles.cache.get(roleId);
    
    if (!role) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Rol no encontrado.')],
            flags: ["Ephemeral"]
        });
    }
    
    const answers = [];
    const settings = await getApplicationSettings(interaction.client, interaction.guild.id);
    
    let questions = settings.questions || ["¿Por qué quieres este rol?", "¿Cuál es tu experiencia?"];
    const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, roleId);
    if (roleSettings.questions && roleSettings.questions.length > 0) {
        questions = roleSettings.questions;
    }
    
    for (let i = 0; i < questions.length; i++) {
        const answer = interaction.fields.getTextInputValue(`q${i}`);
        answers.push({
            question: questions[i],
            answer: answer
        });
    }
    
    try {
        const application = await ApplicationService.submitApplication(interaction.client, {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            roleId: roleId,
            roleName: applicationRole.name,
            username: interaction.user.tag,
            avatar: interaction.user.displayAvatarURL(),
            answers: answers
        });
        
        const embed = successEmbed(
            'Solicitud enviada',
            `Tu solicitud para **${applicationRole.name}** ha sido enviada correctamente.\n\n` +
            `ID de la solicitud: \`${application.id}\`\n` +
            `Puedes ver el estado con \`/apply status id:${application.id}\``
        );
        
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
        
        const settings = await getApplicationSettings(interaction.client, interaction.guild.id);
        const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, roleId);
        
        const logChannelId = roleSettings.logChannelId || settings.logChannelId;
        
        if (logChannelId) {
            const logChannel = interaction.guild.channels.cache.get(logChannelId);
            if (logChannel) {
                const logEmbed = createEmbed({
                    title: '📝 Nueva solicitud',
                    description: `**Usuario:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
                        `**Solicitud:** ${applicationRole.name}\n` +
                        `**Rol:** ${role.name}\n` +
                        `**ID de la solicitud:** \`${application.id}\`\n` +
                        `**Estado:** 🟡 En progreso`
                }).setColor(getColor('warning'));
                
                const logMessage = await logChannel.send({ embeds: [logEmbed] });
                
                await updateApplication(interaction.client, interaction.guild.id, application.id, {
                    logMessageId: logMessage.id,
                    logChannelId: logChannelId
                });
            }
        }
        
    } catch (error) {
        logger.error('Error al crear solicitud:', {
            error: error.message,
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            roleId,
            stack: error.stack
        });
        
        await handleInteractionError(interaction, error, {
            type: 'modal',
            handler: 'application_submission'
        });
    }
}
async function handleList(interaction) {
    try {
        const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
        
        if (applicationRoles.length === 0) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("No hay solicitudes disponibles actualmente.")],
            });
        }

        const embed = createEmbed({
            title: "Solicitudes disponibles",
            description: "Estos son los roles a los que puedes postularte:"
        });

        applicationRoles.forEach((appRole, index) => {
            const role = interaction.guild.roles.cache.get(appRole.roleId);
            embed.addFields({
                name: `${index + 1}. ${appRole.name}`,
                value: `**Rol:** ${role ? `<@&${appRole.roleId}>` : 'Rol no encontrado'}\n` +
                       `**Aplicar con:** \`/apply submit application:"${appRole.name}"\``,
                inline: false
            });
        });

        embed.setFooter({
            text: "Usa /apply submit application:<nombre> para aplicar a cualquiera de estos roles."
        });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
        logger.error('Error al listar solicitudes:', {
            error: error.message,
            guildId: interaction.guild.id,
            stack: error.stack
        });
        
        throw createError(
            'Error al cargar solicitudes',
            ErrorTypes.DATABASE,
            'No se pudieron cargar las solicitudes. Inténtalo más tarde.',
            { guildId: interaction.guild.id }
        );
    }
}

async function handleSubmit(interaction, settings) {
    const applicationName = interaction.options.getString("application");
    const member = interaction.member;

    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    
    const applicationRole = applicationRoles.find(appRole => 
        appRole.name.toLowerCase() === applicationName.toLowerCase()
    );

    if (!applicationRole) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                errorEmbed(
                    "Solicitud no encontrada.",
                    "Usa `/apply list` para ver las solicitudes disponibles."
                ),
            ],
            flags: ["Ephemeral"],
        });
    }

    const userApps = await getUserApplications(
        interaction.client,
        interaction.guild.id,
        interaction.user.id,
    );
    const pendingApp = userApps.find((app) => app.status === "pending");

    if (pendingApp) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                errorEmbed(
                    `Ya tienes una solicitud pendiente. Espera a que sea revisada.`,
                ),
            ],
            flags: ["Ephemeral"],
        });
    }

    const role = interaction.guild.roles.cache.get(applicationRole.roleId);
    if (!role) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('El rol para esta solicitud ya no existe.')],
            flags: ["Ephemeral"]
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_modal_${applicationRole.roleId}`)
        .setTitle(`Solicitud para ${applicationRole.name}`);

    let questions = settings.questions || ["¿Por qué quieres este rol?", "¿Cuál es tu experiencia?"];
    const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, applicationRole.roleId);
    if (roleSettings.questions && roleSettings.questions.length > 0) {
        questions = roleSettings.questions;
    }

    questions.forEach((question, index) => {
        const input = new TextInputBuilder()
            .setCustomId(`q${index}`)
            .setLabel(
                question.length > 45
                    ? `${question.substring(0, 42)}...`
                    : question,
            )
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
    });

    await interaction.showModal(modal);
}

async function handleStatus(interaction) {
    const appId = interaction.options.getString("id");

    if (appId) {
        const application = await getApplication(
            interaction.client,
            interaction.guild.id,
            appId,
        );

        if (!application || application.userId !== interaction.user.id) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Solicitud no encontrada o no tienes permiso para verla.",
                    ),
                ],
                flags: ["Ephemeral"],
            });
        }

        const submittedAt = application?.createdAt ? new Date(application.createdAt) : null;
        const submittedAtDisplay = submittedAt && !Number.isNaN(submittedAt.getTime())
            ? submittedAt.toLocaleString()
            : 'Fecha desconocida';
        const statusView = getApplicationStatusPresentation(application.status);

        const embed = createEmbed({
            title: `Solicitud #${application.id} - ${application.roleName || 'Rol desconocido'}`,
            description:
                `**ID de la solicitud:** \`${application.id}\`\n` +
                `**Estado:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                `**Enviada:** ${submittedAtDisplay}`
        });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    } else {
        const applications = await getUserApplications(
            interaction.client,
            interaction.guild.id,
            interaction.user.id,
        );

        if (applications.length === 0) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed("No has enviado ninguna solicitud aún."),
                ],
                flags: ["Ephemeral"],
            });
        }

        const recentApplications = applications
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            .slice(0, 10);

        const embed = createEmbed({
            title: "Tus solicitudes",
            description: `Mostrando ${recentApplications.length} solicitud(es) recientes.`
        });

        recentApplications.forEach((application) => {
            const submittedAt = application?.createdAt ? new Date(application.createdAt) : null;
            const submittedAtDisplay = submittedAt && !Number.isNaN(submittedAt.getTime())
                ? submittedAt.toLocaleDateString()
                : 'Fecha desconocida';
            const statusView = getApplicationStatusPresentation(application.status);

            embed.addFields({
                name: `${statusView.statusEmoji} ${application.roleName || 'Rol desconocido'} (${statusView.statusLabel})`,
                value:
                    `**ID:** \`${application.id}\`\n` +
                    `**Estado:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                    `**Enviada:** ${submittedAtDisplay}`,
                inline: true,
            });
        });

        if (applications.length > recentApplications.length) {
            embed.setFooter({ text: `Mostrando las últimas ${recentApplications.length} de ${applications.length} solicitudes.` });
        }

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    }
}



