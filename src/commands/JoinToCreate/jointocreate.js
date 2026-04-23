import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, LabelBuilder } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    initializeJoinToCreate,
    getChannelConfiguration,
    updateChannelConfig,
    removeTriggerChannel,
    hasManageGuildPermission,
    logConfigurationChange,
    getConfiguration
} from '../../services/joinToCreateService.js';


export default {
    data: new SlashCommandBuilder()
        .setName("jointocreate")
        .setDescription("Administrar el sistema de canales de voz Join to Create.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("Configurar un nuevo canal de voz Join to Create.")
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription("Categoría donde se creará el canal.")
                        .addChannelTypes(ChannelType.GuildCategory)
                )
                .addStringOption((option) =>
                    option
                        .setName("channel_name")
                        .setDescription("Selecciona una plantilla para nombrar los canales de voz temporales.")
                        .addChoices(
                            { name: "{username}'s Room (Default)", value: "{username}'s Room" },
                            { name: "{username}'s Channel", value: "{username}'s Channel" },
                            { name: "{username}'s Lounge", value: "{username}'s Lounge" },
                            { name: "{username}'s Space", value: "{username}'s Space" },
                            { name: "{displayName}'s Room", value: "{displayName}'s Room" },
                            { name: "{username}'s VC", value: "{username}'s VC" },
                            { name: "🎵 {username}'s Music Room", value: "🎵 {username}'s Music Room" },
                            { name: "🎮 {username}'s Gaming Room", value: "🎮 {username}'s Gaming Room" },
                            { name: "💬 {username}'s Chat Room", value: "💬 {username}'s Chat Room" },
                            { name: "{username}'s Private Room", value: "{username}'s Private Room" }
                        )
                )
                .addIntegerOption((option) =>
                    option
                        .setName("user_limit")
                        .setDescription("Número máximo de usuarios en canales temporales. (0 = ilimitado)")
                )
                .addIntegerOption((option) =>
                    option
                        .setName("bitrate")
                        .setDescription("Bitrate para canales temporales en kbps (8-96).")
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Configurar un sistema Join to Create existente.")
                .addChannelOption((option) =>
                    option
                        .setName("trigger_channel")
                        .setDescription("El canal disparador de Join to Create a configurar.")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildVoice)
                )
        ),
    category: "utility",

    async execute(interaction, config, client) {
        try {
            
            if (!hasManageGuildPermission(interaction.member)) {
                throw new TitanBotError(
                    'El usuario no tiene permiso de ManageGuild',
                    ErrorTypes.PERMISSION,
                    'Necesitas permiso de **Administrar servidor** para usar este comando.'
                );
            }

            const subcommand = interaction.options.getSubcommand();
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            let responseEmbed;

            if (subcommand === "setup") {
                await handleSetupSubcommand(interaction, client);
                return;
            } else if (subcommand === "dashboard") {
                await handleConfigSubcommand(interaction, client);
                return;
            }

        } catch (error) {
            try {
                let errorMessage = 'Ocurrió un error al ejecutar este comando.';
                
                if (error instanceof TitanBotError) {
                    errorMessage = error.userMessage || 'Ocurrió un error. Inténtalo de nuevo.';
                    logger.debug(`TitanBotError [${error.type}]: ${error.message}`, error.context || {});
                } else {
                    logger.error('Error inesperado en el comando jointocreate:', error);
                    errorMessage = 'Ocurrió un error inesperado. Inténtalo de nuevo o contacta soporte.';
                }

                const errorEmbedObj = errorEmbed("⚠️ Error", errorMessage);

                if (interaction.deferred) {
                    return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbedObj] });
                } else {
                    return await InteractionHelper.safeReply(interaction, { embeds: [errorEmbedObj], flags: MessageFlags.Ephemeral });
                }
            } catch (replyError) {
                logger.error('Error al enviar mensaje de error:', replyError);
            }
        }
    }
};

async function handleSetupSubcommand(interaction, client) {
    try {
        const category = interaction.options.getChannel('category');
        const nameTemplate = interaction.options.getString('channel_name') || "{username}'s Sala";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        logger.debug(`Configurando Join to Create en el servidor ${guildId} con plantilla: ${nameTemplate}`);

        // Check if guild already has a Join to Create channel configured
        const existingConfig = await getConfiguration(client, guildId);
        
        if (Array.isArray(existingConfig.triggerChannels) && existingConfig.triggerChannels.length > 0) {
            const activeTriggerChannels = [];
            const staleTriggerChannelIds = [];

            for (const existingChannelId of existingConfig.triggerChannels) {
                const existingChannel = await interaction.guild.channels.fetch(existingChannelId).catch(() => null);
                if (existingChannel) {
                    activeTriggerChannels.push(existingChannel);
                } else {
                    staleTriggerChannelIds.push(existingChannelId);
                }
            }

            if (staleTriggerChannelIds.length > 0) {
                for (const staleChannelId of staleTriggerChannelIds) {
                    logger.info(`Limpiando canal disparador JTC obsoleto ${staleChannelId} del servidor ${guildId}`);
                    await removeTriggerChannel(client, guildId, staleChannelId);
                }
            }

            if (activeTriggerChannels.length > 0) {
                const primaryTrigger = activeTriggerChannels[0];
                const errorMessage = `Este servidor ya tiene un canal Join to Create configurado: ${primaryTrigger}\n\nUsa \`/jointocreate dashboard\` para modificarlo, o elimínalo antes de crear uno nuevo.`;

                throw new TitanBotError(
                    'El servidor ya tiene un canal Join to Create',
                    ErrorTypes.VALIDATION,
                    errorMessage,
                    {
                        guildId,
                        activeTriggerCount: activeTriggerChannels.length,
                        expected: true,
                        suppressErrorLog: true
                    }
                );
            }
        }

        // Create the trigger channel
        logger.debug('Creando canal disparador Join to Create...');
        let triggerChannel = await interaction.guild.channels.create({
            name: 'Join to Create',
            type: ChannelType.GuildVoice,
            parent: category?.id,
            userLimit: 0,
            bitrate: 64000,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                },
            ],
        });

        logger.debug(`Canal disparador ${triggerChannel.id} creado, inicializando configuración...`);

        // Initialize the Join to Create configuration
        const config = await initializeJoinToCreate(client, guildId, triggerChannel.id, {
            nameTemplate: nameTemplate,
            userLimit: userLimit,
            bitrate: bitrate * 1000,
            categoryId: category?.id
        });

        await logConfigurationChange(client, guildId, interaction.user.id, 'Inicializó Join to Create', {
    channelId: triggerChannel.id,
    nameTemplate,
    userLimit,
    bitrate
});

logger.info(`Sistema Join to Create creado correctamente en el servidor ${guildId}`);

const responseEmbed = successEmbed(
    '✅ Configuración completada',
    `Canal Join to Create creado: ${triggerChannel}\n\n` +
    `**Configuración:**\n` +
    `• Plantilla: \`${nameTemplate}\`\n` +
    `• Límite de usuarios: ${userLimit === 0 ? 'Ilimitado' : userLimit + ' usuarios'}\n` +
    `• Bitrate: ${bitrate} kbps\n` +
    `${category ? `• Categoría: ${category.name}` : '• Categoría: Nivel raíz'}`
);

return await InteractionHelper.safeEditReply(interaction, { embeds: [responseEmbed] });

} catch (error) {
    logger.error('Error en handleSetupSubcommand:', error);
    if (error instanceof TitanBotError) {
        throw error;
    }
    throw new TitanBotError(
        `Error de configuración: ${error.message}`,
        ErrorTypes.DISCORD_API,
        'Error al configurar el sistema Join to Create. Por favor verifica los permisos del bot.'
    );
}
}

async function handleConfigSubcommand(interaction, client) {
    try {
        const triggerChannel = interaction.options.getChannel('trigger_channel');
        const guildId = interaction.guild.id;

        const currentConfig = await getChannelConfiguration(client, guildId, triggerChannel.id);
        const channelConfig = currentConfig.channelConfig || {};

        const configEmbed = new EmbedBuilder()
            .setTitle('⚙️ Configuración de Join to Create')
            .setDescription(`Configuración para ${triggerChannel}`)
            .setColor(getColor('info'))
            .addFields(
                {
                    name: '📝 Plantilla del nombre del canal',
                    value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate || "{username}'s Room"}\``,
                    inline: false
                },
                {
                    name: '👥 Límite de usuarios',
                    value: `${(channelConfig.userLimit ?? currentConfig.userLimit ?? 0) === 0 ? 'Ilimitado' : (channelConfig.userLimit ?? currentConfig.userLimit ?? 0) + ' usuarios'}`,
                    inline: true
                },
                {
                    name: '🎵 Bitrate',
                    value: `${(channelConfig.bitrate ?? currentConfig.bitrate ?? 64000) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'Usa los botones de abajo para modificar la configuración • Solo se admite un canal disparador por servidor' })
            .setTimestamp();

        const nameButton = new ButtonBuilder()
            .setCustomId(`jtc_config_name_${triggerChannel.id}`)
            .setLabel('📝 Plantilla de nombre')
            .setStyle(ButtonStyle.Primary);

        const limitButton = new ButtonBuilder()
            .setCustomId(`jtc_config_limit_${triggerChannel.id}`)
            .setLabel('👥 Límite de usuarios')
            .setStyle(ButtonStyle.Primary);

        const bitrateButton = new ButtonBuilder()
            .setCustomId(`jtc_config_bitrate_${triggerChannel.id}`)
            .setLabel('🎵 Bitrate')
            .setStyle(ButtonStyle.Primary);

        const deleteButton = new ButtonBuilder()
            .setCustomId(`jtc_config_delete_${triggerChannel.id}`)
            .setLabel('🗑️ Eliminar canal')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(
            nameButton,
            limitButton,
            bitrateButton,
            deleteButton
        );

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [configEmbed],
            components: [row]
        });

        const message = await interaction.fetchReply();

        if (!message || typeof message.createMessageComponentCollector !== 'function') {
            throw new TitanBotError(
                'No se pudo obtener la respuesta de la interacción para el colector',
                ErrorTypes.DISCORD_API,
                'No se pudieron cargar los controles de configuración. Ejecuta el comando nuevamente.'
            );
        }

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000
        });

        collector.on('collect', async (buttonInteraction) => {
            try {
                if (!hasManageGuildPermission(buttonInteraction.member)) {
                    await buttonInteraction.reply({
                        content: '❌ Necesitas permiso de **Administrar servidor** para usar estos controles.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const customId = buttonInteraction.customId;

                if (customId.includes('jtc_config_name_')) {
                    await handleNameTemplateModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_limit_')) {
                    await handleUserLimitModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_bitrate_')) {
                    await handleBitrateModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_delete_')) {
                    await handleChannelDeletion(buttonInteraction, triggerChannel, currentConfig, client);
                }
            } catch (error) {
                const userMessage = error instanceof TitanBotError
                    ? error.userMessage || 'Ocurrió un error.'
                    : 'Ocurrió un error al procesar tu solicitud.';

                if (error instanceof TitanBotError) {
                    logger.debug(`Error de interacción de botón: ${error.message}`, error.context || {});
                } else {
                    logger.error('Error inesperado en interacción de botones:', error);
                }

                await buttonInteraction.reply({
                    content: `❌ ${userMessage}`,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                nameButton.setDisabled(true),
                limitButton.setDisabled(true),
                bitrateButton.setDisabled(true),
                deleteButton.setDisabled(true)
            );

            message.edit({
                components: [disabledRow],
                embeds: [configEmbed.setFooter({ text: 'Sesión de configuración expirada. Ejecuta el comando nuevamente para hacer cambios.' })]
            }).catch(() => {});
        });

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Error de configuración: ${error.message}`,
            ErrorTypes.DATABASE,
            'No se pudo cargar la configuración.'
        );
    }
}

async function handleNameTemplateModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const TEMPLATE_OPTIONS = [
            { label: "{username}'s Room (Default)", value: "{username}'s Room" },
            { label: "{username}'s Channel", value: "{username}'s Channel" },
            { label: "{username}'s Lounge", value: "{username}'s Lounge" },
            { label: "{username}'s Space", value: "{username}'s Space" },
            { label: "{displayName}'s Room", value: "{displayName}'s Room" },
            { label: "{username}'s VC", value: "{username}'s VC" },
            { label: "🎵 {username}'s Music Room", value: "🎵 {username}'s Music Room" },
            { label: "🎮 {username}'s Gaming Room", value: "🎮 {username}'s Gaming Room" },
            { label: "💬 {username}'s Chat Room", value: "💬 {username}'s Chat Room" },
            { label: "{username}'s Private Room", value: "{username}'s Private Room" },
        ];

        const currentTemplate = currentConfig.channelConfig?.nameTemplate
            || currentConfig.channelNameTemplate
            || "{username}'s Sala";

        const templateSelect = new StringSelectMenuBuilder()
    .setCustomId('template')
    .setPlaceholder('Elige una plantilla de nombre...')
    .setOptions(
        TEMPLATE_OPTIONS.map(o => ({
            label: o.label,
            value: o.value,
            default: o.value === currentTemplate,
        })),
    );

const templateLabel = new LabelBuilder()
    .setLabel('Plantilla de nombre del canal')
    .setStringSelectMenuComponent(templateSelect);

const modal = new ModalBuilder()
    .setCustomId(`jtc_name_modal_${triggerChannel.id}`)
    .setTitle('Plantilla de nombre del canal')
    .addLabelComponents(templateLabel);

await interaction.showModal(modal);

const modalSubmission = await interaction.awaitModalSubmit({
    filter: (i) =>
        i.customId === `jtc_name_modal_${triggerChannel.id}` &&
        i.user.id === interaction.user.id,
    time: 60000
});

// Recheck permissions
if (!hasManageGuildPermission(modalSubmission.member)) {
    await modalSubmission.reply({
        content: '❌ Necesitas el permiso **Administrar servidor** para modificar esta configuración.',
        flags: MessageFlags.Ephemeral
    });
    return;
}

const [newTemplate] = modalSubmission.fields.getStringSelectValues('template');

await updateChannelConfig(client, interaction.guild.id, triggerChannel.id, {
    nameTemplate: newTemplate
});

await logConfigurationChange(
    client,
    interaction.guild.id,
    interaction.user.id,
    'Plantilla de nombre del canal actualizada',
    {
        channelId: triggerChannel.id,
        newTemplate
    }
);

await modalSubmission.reply({
    embeds: [
        successEmbed(
            '✅ Actualizado',
            `La plantilla de nombre del canal se cambió a \`${newTemplate}\``
        )
    ],
    flags: MessageFlags.Ephemeral
});

} catch (error) {
    if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
        return;
    }
    if (error instanceof TitanBotError) {
        throw error;
    }
    logger.error('Error inesperado en el modal de plantilla de nombre:', error);
    throw new TitanBotError(
        `Error del modal: ${error.message}`,
        ErrorTypes.UNKNOWN,
        'Ocurrió un error al actualizar la plantilla.'
    );
}
}

async function handleUserLimitModal(interaction, triggerChannel, currentConfig, client) {
try {
    const currentLimit =
        currentConfig.channelConfig.userLimit ??
        currentConfig.userLimit ??
        0;

    const modal = new ModalBuilder()
        .setCustomId(`jtc_limit_modal_${triggerChannel.id}`)
        .setTitle('Configurar límite de usuarios')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('user_limit')
                    .setLabel('Ingresa el límite de usuarios (0-99, 0 = ilimitado)')
                    .setPlaceholder('Ingresa un número entre 0 y 99')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(2)
                    .setValue(currentLimit.toString())
            )
        );

    await interaction.showModal(modal);

    const modalSubmission = await interaction.awaitModalSubmit({
        filter: (i) =>
            i.customId === `jtc_limit_modal_${triggerChannel.id}` &&
            i.user.id === interaction.user.id,
        time: 60000
    });

    // Recheck permissions
    if (!hasManageGuildPermission(modalSubmission.member)) {
        await modalSubmission.reply({
            content: '❌ Necesitas el permiso **Administrar servidor** para modificar esta configuración.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const userInput = modalSubmission.fields
        .getTextInputValue('user_limit')
        .trim();

    await updateChannelConfig(client, interaction.guild.id, triggerChannel.id, {
        userLimit: parseInt(userInput)
    });

    await logConfigurationChange(
        client,
        interaction.guild.id,
        interaction.user.id,
        'Límite de usuarios actualizado',
        {
            channelId: triggerChannel.id,
            userLimit: parseInt(userInput)
        }
    );

    await modalSubmission.reply({
        embeds: [
            successEmbed(
                '✅ Actualizado',
                `El límite de usuarios cambió a ${
                    parseInt(userInput) === 0
                        ? 'Ilimitado'
                        : parseInt(userInput) + ' usuarios'
                }`
            )
        ],
        flags: MessageFlags.Ephemeral
    });

} catch (error) {
    if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
        return;
    }
    if (error instanceof TitanBotError) {
        throw error;
    }
    logger.error('Error inesperado en el modal de límite de usuarios:', error);
    throw new TitanBotError(
        `Error del modal: ${error.message}`,
        ErrorTypes.UNKNOWN,
        'Ocurrió un error al actualizar el límite de usuarios.'
    );
}
}

async function handleBitrateModal(interaction, triggerChannel, currentConfig, client) {
try {
    const currentBitrate =
        ((
            currentConfig.channelConfig.bitrate ??
            currentConfig.bitrate ??
            64000
        ) / 1000);

    const modal = new ModalBuilder()
        .setCustomId(`jtc_bitrate_modal_${triggerChannel.id}`)
        .setTitle('Configurar bitrate')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('bitrate')
                    .setLabel('Ingresa el bitrate en kbps (8-384)')
                    .setPlaceholder('Ingresa un número entre 8 y 384')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(3)
                    .setValue(currentBitrate.toString())
            )
        );

    await interaction.showModal(modal);

    const modalSubmission = await interaction.awaitModalSubmit({
        filter: (i) =>
            i.customId === `jtc_bitrate_modal_${triggerChannel.id}` &&
            i.user.id === interaction.user.id,
        time: 60000
    });

    // Recheck permissions
    if (!hasManageGuildPermission(modalSubmission.member)) {
        await modalSubmission.reply({
            content: '❌ Necesitas el permiso **Administrar servidor** para modificar esta configuración.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const userInput = modalSubmission.fields
        .getTextInputValue('bitrate')
        .trim();

    await updateChannelConfig(client, interaction.guild.id, triggerChannel.id, {
        bitrate: parseInt(userInput) * 1000
    });

    await logConfigurationChange(
        client,
        interaction.guild.id,
        interaction.user.id,
        'Bitrate actualizado',
        {
            channelId: triggerChannel.id,
            bitrate: parseInt(userInput)
        }
    );

    await modalSubmission.reply({
        embeds: [
            successEmbed(
                '✅ Actualizado',
                `El bitrate cambió a ${parseInt(userInput)} kbps`
            )
        ],
        flags: MessageFlags.Ephemeral
    });

} catch (error) {
    if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
        return;
    }
    if (error instanceof TitanBotError) {
        throw error;
    }
    logger.error('Error inesperado en el modal de bitrate:', error);
    throw new TitanBotError(
        `Error del modal: ${error.message}`,
        ErrorTypes.UNKNOWN,
        'Ocurrió un error al actualizar el bitrate.'
    );
}
}
        );
    }
}


async function handleChannelDeletion(interaction, triggerChannel, currentConfig, client) {
    try {
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`jtc_delete_confirm_${triggerChannel.id}`)
                .setLabel('🗑️ Sí, eliminar')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`jtc_delete_cancel_${triggerChannel.id}`)
                .setLabel('❌ Cancelar')
                .setStyle(ButtonStyle.Secondary)
        );

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                errorEmbed(
                    '⚠️ Confirmar eliminación',
                    `¿Estás seguro de que quieres eliminar **${triggerChannel.name}** del sistema Join to Create?\n\nEsta acción no se puede deshacer.`
                )
            ],
            components: [confirmRow],
            flags: MessageFlags.Ephemeral
        });

        const message = await interaction.fetchReply();
        const deleteCollector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) =>
                i.user.id === interaction.user.id &&
                (
                    i.customId === `jtc_delete_confirm_${triggerChannel.id}` ||
                    i.customId === `jtc_delete_cancel_${triggerChannel.id}`
                ),
            time: 600_000,
            max: 1
        });

        deleteCollector.on('collect', async (buttonInteraction) => {
            try {
                // Recheck permissions
                if (!hasManageGuildPermission(buttonInteraction.member)) {
                    await buttonInteraction.reply({
                        content: '❌ Necesitas el permiso **Administrar servidor** para eliminar canales.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (buttonInteraction.customId === `jtc_delete_confirm_${triggerChannel.id}`) {

                    await removeTriggerChannel(client, interaction.guild.id, triggerChannel.id);

                    await logConfigurationChange(
                        client,
                        interaction.guild.id,
                        interaction.user.id,
                        'Eliminado trigger de Join to Create',
                        {
                            channelId: triggerChannel.id,
                            channelName: triggerChannel.name
                        }
                    );

                    try {
                        if (triggerChannel.members.size === 0) {
                            await triggerChannel.delete(
                                'Trigger de Join to Create eliminado por un administrador'
                            );
                        }
                    } catch (deleteError) {
                        logger.warn(
                            `No se pudo eliminar el canal ${triggerChannel.id}: ${deleteError.message}`
                        );
                    }

                    await buttonInteraction.update({
                        embeds: [
                            successEmbed(
                                '✅ Eliminado',
                                `**${triggerChannel.name}** ha sido eliminado del sistema Join to Create.`
                            )
                        ],
                        components: []
                    });

                } else {
                    await buttonInteraction.update({
                        embeds: [
                            successEmbed(
                                '✅ Cancelado',
                                'La eliminación del canal ha sido cancelada.'
                            )
                        ],
                        components: []
                    });
                }
            } catch (collectError) {
                logger.error('Error al confirmar la eliminación:', collectError);
                await buttonInteraction
                    .reply({
                        content: '❌ Ocurrió un error al procesar tu solicitud.',
                        flags: MessageFlags.Ephemeral
                    })
                    .catch(() => {});
            }
        });

        deleteCollector.on('end', (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                message.edit({ components: [] }).catch(() => {});
            }
        });

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Error inesperado en handleChannelDeletion:', error);
        throw new TitanBotError(
            `Error de eliminación: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'Ocurrió un error al eliminar el canal.'
        );
    }
}




