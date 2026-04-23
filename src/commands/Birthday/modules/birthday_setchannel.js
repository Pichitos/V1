import { PermissionsBitField, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Permiso denegado', 'Necesitas permisos de **Administrar servidor** para configurar el canal de cumpleaños.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const channel = interaction.options.getChannel('channel');
            const guildId = interaction.guildId;
            const guildConfig = await getGuildConfig(client, guildId);

            if (channel) {
                guildConfig.birthdayChannelId = channel.id;
                await setGuildConfig(client, guildId, guildConfig);
                return InteractionHelper.safeReply(interaction, {
                    embeds: [successEmbed('🎂 Anuncios de cumpleaños activados', `Los anuncios de cumpleaños ahora se enviarán en ${channel}.`)],
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                guildConfig.birthdayChannelId = null;
                await setGuildConfig(client, guildId, guildConfig);
                return InteractionHelper.safeReply(interaction, {
                    embeds: [successEmbed('🎂 Anuncios de cumpleaños desactivados', 'No se proporcionó un canal — los anuncios de cumpleaños han sido desactivados.')],
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch (error) {
            logger.error('Error en birthday_setchannel:', error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Error de configuración', 'No se pudo guardar la configuración del canal de cumpleaños.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
