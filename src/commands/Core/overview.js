import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { getLoggingStatus } from '../../services/loggingService.js';
import { getLevelingConfig } from '../../services/leveling.js';
import { getConfiguration as getJoinToCreateConfiguration } from '../../services/joinToCreateService.js';
import { getWelcomeConfig, getApplicationSettings } from '../../utils/database.js';
import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

function pill(enabled) {
    return enabled ? '✅ Activado' : '❌ Desactivado';
}

async function formatChannelMention(guild, id) {
    if (!id) return '`No configurado`';
    const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
    return channel ? channel.toString() : `⚠️ No encontrado (${id})`;
}

function formatRoleMention(guild, id) {
    if (!id) return '`No configurado`';
    const role = guild.roles.cache.get(id);
    return role ? role.toString() : `⚠️ No encontrado (${id})`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('overview')
        .setDescription('Vista general de todos los sistemas del servidor.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const [guildConfig, loggingStatus, levelingConfig, welcomeConfig, applicationConfig, joinToCreateConfig] =
                await Promise.all([
                    getGuildConfig(client, interaction.guildId),
                    getLoggingStatus(client, interaction.guildId),
                    getLevelingConfig(client, interaction.guildId),
                    getWelcomeConfig(client, interaction.guildId),
                    getApplicationSettings(client, interaction.guildId),
                    getJoinToCreateConfiguration(client, interaction.guildId),
                ]);

            const verificationEnabled = Boolean(guildConfig.verification?.enabled);
            const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
            const autoRoleId = guildConfig.autoRole || welcomeConfig?.roleIds?.[0];

            const [auditChannel, lifecycleChannel, transcriptChannel, reportChannel, birthdayChannel] =
                await Promise.all([
                    formatChannelMention(interaction.guild, loggingStatus.channelId || guildConfig.logging?.channelId || guildConfig.logChannelId),
                    formatChannelMention(interaction.guild, guildConfig.ticketLogsChannelId),
                    formatChannelMention(interaction.guild, guildConfig.ticketTranscriptChannelId),
                    formatChannelMention(interaction.guild, guildConfig.reportChannelId),
                    formatChannelMention(interaction.guild, guildConfig.birthdayChannelId),
                ]);

            const embed = new EmbedBuilder()
                .setTitle('🖥️ Resumen del Sistema')
                .setDescription(`Vista general de **${interaction.guild.name}**.\nUsa los comandos correspondientes para realizar cambios.`)
                .setColor(getColor('primary'))
                .addFields(
                    {
                        name: '⚙️ Sistemas Principales',
                        value: [
                            `🧾 **Registro (Logs)** — ${pill(Boolean(loggingStatus.enabled))}`,
                            `📈 **Niveles** — ${pill(Boolean(levelingConfig?.enabled))}`,
                            `👋 **Bienvenida** — ${pill(Boolean(welcomeConfig?.enabled))}`,
                            `👋 **Despedida** — ${pill(Boolean(welcomeConfig?.goodbyeEnabled))}`,
                            `🎂 **Cumpleaños** — ${pill(Boolean(guildConfig.birthdayChannelId))}`,
                            `📋 **Aplicaciones** — ${pill(Boolean(applicationConfig?.enabled))}`,
                            `✅ **Verificación** — ${pill(verificationEnabled)}`,
                            `🤖 **Auto-Verificación** — ${pill(autoVerifyEnabled)}`,
                            `🎧 **Unirse para Crear** — ${pill(Boolean(joinToCreateConfig?.enabled))}`,
                            `🛡️ **Rol Automático** — ${autoRoleId ? `✅ ${formatRoleMention(interaction.guild, autoRoleId)}` : '❌ Desactivado'}`,
                        ].join('\n'),
                        inline: false,
                    },
                    {
                        name: '📡 Canales Configurados',
                        value: [
                            `**Logs:** ${auditChannel}`,
                            `**Tickets (Actividad):** ${lifecycleChannel}`,
                            `**Transcripciones:** ${transcriptChannel}`,
                            `**Reportes:** ${reportChannel}`,
                            `**Cumpleaños:** ${birthdayChannel}`,
                        ].join('\n'),
                        inline: false,
                    },
                    {
                        name: '🕒 Última actualización',
                        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                        inline: true,
                    },
                )
                .setFooter({ text: 'Solo lectura — usa /logging dashboard para configurar los logs' })
                .setTimestamp();

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('overview command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'No se pudo cargar el resumen del sistema.')],
            });
        }
    },
};
