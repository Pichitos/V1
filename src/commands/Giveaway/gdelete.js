import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildGiveaways, deleteGiveaway } from '../../utils/giveaways.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gdelete")
        .setDescription("Elimina un mensaje de giveaway y lo remueve de la base de datos.")
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("El ID del mensaje del giveaway a eliminar.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Giveaway usado fuera del servidor',
                    ErrorTypes.VALIDATION,
                    'Este comando solo puede usarse en un servidor.',
                    { userId: interaction.user.id }
                );
            }

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                throw new TitanBotError(
                    'Sin permisos para giveaway',
                    ErrorTypes.PERMISSION,
                    "Necesitas el permiso de 'Administrar servidor' para eliminar un giveaway.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Giveaway deletion started by ${interaction.user.tag} in guild ${interaction.guildId}`);

            const messageId = interaction.options.getString("messageid");

            if (!messageId || !/^\d+$/.test(messageId)) {
                throw new TitanBotError(
                    'Formato inválido de message ID',
                    ErrorTypes.VALIDATION,
                    'Por favor proporciona un ID de mensaje válido.',
                    { providedId: messageId }
                );
            }

            const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
            const giveaway = giveaways.find(g => g.messageId === messageId);

            if (!giveaway) {
                throw new TitanBotError(
                    `Giveaway no encontrado: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "No se encontró ningún giveaway con ese ID de mensaje.",
                    { messageId, guildId: interaction.guildId }
                );
            }

            let deletedMessage = false;
            let channelName = "Canal desconocido";

            const tryDeleteFromChannel = async (channel) => {
                if (!channel || !channel.isTextBased() || !channel.messages?.fetch) {
                    return false;
                }

                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (!message) return false;

                await message.delete();
                channelName = channel.name || 'unknown-channel';
                deletedMessage = true;
                return true;
            };

            try {
                const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
                if (await tryDeleteFromChannel(channel)) {
                    logger.debug(`Deleted giveaway message ${messageId} from channel ${channelName}`);
                }

                if (!deletedMessage && interaction.guild) {
                    const textChannels = interaction.guild.channels.cache.filter(
                        ch => ch.id !== giveaway.channelId && ch.isTextBased() && ch.messages?.fetch
                    );

                    for (const [, guildChannel] of textChannels) {
                        const foundAndDeleted = await tryDeleteFromChannel(guildChannel).catch(() => false);
                        if (foundAndDeleted) break;
                    }
                }
            } catch (error) {
                logger.warn(`No se pudo eliminar el mensaje del giveaway: ${error.message}`);
            }

            const removedFromDatabase = await deleteGiveaway(
                interaction.client,
                interaction.guildId,
                messageId,
            );

            if (!removedFromDatabase) {
                throw new TitanBotError(
                    `Error eliminando giveaway de la base de datos: ${messageId}`,
                    ErrorTypes.UNKNOWN,
                    'No se pudo eliminar el giveaway de la base de datos.',
                    { messageId, guildId: interaction.guildId }
                );
            }

            const giveawaysAfterDelete = await getGuildGiveaways(interaction.client, interaction.guildId);
            const stillExistsInDatabase = giveawaysAfterDelete.some(g => g.messageId === messageId);

            if (stillExistsInDatabase) {
                throw new TitanBotError(
                    `El giveaway aún existe después de eliminarlo: ${messageId}`,
                    ErrorTypes.UNKNOWN,
                    'La eliminación no se guardó correctamente.',
                    { messageId, guildId: interaction.guildId }
                );
            }

            const statusMsg = deletedMessage
                ? `y el mensaje fue eliminado de #${channelName}`
                : `pero el mensaje ya había sido eliminado o el canal no estaba disponible.`;

            const winnerIds = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
            const hasWinners = winnerIds.length > 0;
            const wasEnded = giveaway.ended === true || giveaway.isEnded === true || hasWinners;

            const winnerStatusMsg = hasWinners
                ? `Este giveaway ya tenía ${winnerIds.length} ganador(es).`
                : wasEnded
                    ? 'Este giveaway terminó sin ganadores válidos.'
                    : 'No se seleccionaron ganadores antes de eliminarlo.';

            logger.info(`Giveaway deleted: ${messageId} in ${channelName}`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_DELETE,
                    data: {
                        description: `Giveaway eliminado: ${giveaway.prize}`,
                        channelId: giveaway.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '🎁 Premio',
                                value: giveaway.prize || 'Desconocido',
                                inline: true
                            },
                            {
                                name: '📊 Entradas',
                                value: (giveaway.participants?.length || 0).toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway deletion:', logError);
            }

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "Giveaway eliminado",
                        `Se eliminó el giveaway de **${giveaway.prize}** ${statusMsg}. ${winnerStatusMsg}`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            logger.error('Error in gdelete command:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'gdelete',
                context: 'giveaway_deletion'
            });
        }
    },
};


