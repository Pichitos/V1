import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    endGiveaway as endGiveawayService,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gend")
        .setDescription(
            "Finaliza inmediatamente un sorteo activo y selecciona el/los ganador(es).",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("El ID del mensaje del sorteo que se desea finalizar.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Comando de sorteo usado fuera del servidor',
                    ErrorTypes.VALIDATION,
                    'Este comando solo puede usarse en un servidor.',
                    { userId: interaction.user.id }
                );
            }

            
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                throw new TitanBotError(
                    'El usuario no tiene permiso ManageGuild',
                    ErrorTypes.PERMISSION,
                    "Necesitas el permiso 'Administrar servidor' para finalizar un sorteo.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Finalización de sorteo iniciada por ${interaction.user.tag} en el servidor ${interaction.guildId}`);

            const messageId = interaction.options.getString("messageid");

            
            if (!messageId || !/^\d+$/.test(messageId)) {
                throw new TitanBotError(
                    'Formato de ID de mensaje inválido',
                    ErrorTypes.VALIDATION,
                    'Por favor proporciona un ID de mensaje válido.',
                    { providedId: messageId }
                );
            }

            const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
            const giveaway = giveaways.find(g => g.messageId === messageId);

            if (!giveaway) {
                throw new TitanBotError(
                    `Sorteo no encontrado: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "No se encontró ningún sorteo con ese ID de mensaje en la base de datos.",
                    { messageId, guildId: interaction.guildId }
                );
            }

            
            const endResult = await endGiveawayService(
                interaction.client,
                giveaway,
                interaction.guildId,
                interaction.user.id
            );

            const updatedGiveaway = endResult.giveaway;
            const winners = endResult.winners;

            
            const channel = await interaction.client.channels.fetch(
                updatedGiveaway.channelId,
            ).catch(err => {
                logger.warn(`No se pudo obtener el canal ${updatedGiveaway.channelId}:`, err.message);
                return null;
            });

            if (!channel || !channel.isTextBased()) {
                throw new TitanBotError(
                    `Canal no encontrado: ${updatedGiveaway.channelId}`,
                    ErrorTypes.VALIDATION,
                    "No se pudo encontrar el canal donde se realizó el sorteo. El estado del sorteo ha sido actualizado.",
                    { channelId: updatedGiveaway.channelId, messageId }
                );
            }

            const message = await channel.messages
                .fetch(messageId)
                .catch(err => {
                    logger.warn(`No se pudo obtener el mensaje ${messageId}:`, err.message);
                    return null;
                });

            if (!message) {
                throw new TitanBotError(
                    `Mensaje no encontrado: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "No se pudo encontrar el mensaje del sorteo. El estado del sorteo ha sido actualizado.",
                    { messageId, channelId: updatedGiveaway.channelId }
                );
            }

            
            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );

            
            const newEmbed = createGiveawayEmbed(updatedGiveaway, "ended", winners);
            const newRow = createGiveawayButtons(true);

            await message.edit({
                content: "🎉 **SORTEO FINALIZADO** 🎉",
                embeds: [newEmbed],
                components: [newRow],
            });

            
            if (winners.length > 0) {
                const winnerMentions = winners
                    .map((id) => `<@${id}>`)
                    .join(", ");

                const winnerPingMsg = await channel.send({
                    content: `🎉 ¡FELICIDADES ${winnerMentions}! Has ganado el sorteo de **${updatedGiveaway.prize}**. Por favor contacta al anfitrión <@${updatedGiveaway.hostId}> para reclamar tu premio.`,
                });

                updatedGiveaway.winnerPingMessageId = winnerPingMsg.id;
                await saveGiveaway(interaction.client, interaction.guildId, updatedGiveaway);

                logger.info(`Sorteo finalizado con ${winners.length} ganador(es): ${messageId}`);

                
                try {
                    await logEvent({
                        client: interaction.client,
                        guildId: interaction.guildId,
                        eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                        data: {
                            description: `Sorteo finalizado con ${winners.length} ganador(es)`,
                            channelId: channel.id,
                            userId: interaction.user.id,
                            fields: [
                                {
                                    name: '🎁 Premio',
                                    value: updatedGiveaway.prize || 'Premio misterioso',
                                    inline: true
                                },
                                {
                                    name: '🏆 Ganadores',
                                    value: winnerMentions,
                                    inline: false
                                },
                                {
                                    name: '👥 Participantes',
                                    value: endResult.participantCount.toString(),
                                    inline: true
                                }
                            ]
                        }
                    });
                } catch (logError) {
                    logger.debug('Error al registrar evento de ganador del sorteo:', logError);
                }
            } else {
                await channel.send({
                    content: `El sorteo de **${updatedGiveaway.prize}** ha finalizado sin entradas válidas.`,
                });

                logger.info(`Sorteo finalizado sin ganadores: ${messageId}`);
            }

            logger.info(`Sorteo finalizado correctamente por ${interaction.user.tag}: ${messageId}`);

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "Sorteo Finalizado ✅",
                        `Se finalizó correctamente el sorteo de **${updatedGiveaway.prize}** en ${channel}. Se seleccionaron ${winners.length} ganador(es) de ${endResult.participantCount} participantes.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'gend',
                context: 'giveaway_end'
            });
        }
    },
};


