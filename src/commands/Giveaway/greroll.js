import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    selectWinners,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("greroll")
        .setDescription("Vuelve a sortear los ganadores de un sorteo finalizado.")
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("El ID del mensaje del sorteo finalizado.")
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
                    "Necesitas el permiso 'Gestionar servidor' para volver a sortear un giveaway.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Reroll de giveaway iniciado por ${interaction.user.tag} en el servidor ${interaction.guildId}`);

            const messageId = interaction.options.getString("messageid");

            
            if (!messageId || !/^\d+$/.test(messageId)) {
                throw new TitanBotError(
                    'Formato de ID de mensaje inválido',
                    ErrorTypes.VALIDATION,
                    'Por favor proporciona un ID de mensaje válido.',
                    { providedId: messageId }
                );
            }

            const giveaways = await getGuildGiveaways(
                interaction.client,
                interaction.guildId,
            );

            
            const giveaway = giveaways.find(g => g.messageId === messageId);

            if (!giveaway) {
                throw new TitanBotError(
                    `Sorteo no encontrado: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "No se encontró un sorteo con ese ID de mensaje en la base de datos.",
                    { messageId, guildId: interaction.guildId }
                );
            }

            
            if (!giveaway.isEnded && !giveaway.ended) {
                throw new TitanBotError(
                    `Sorteo aún activo: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "Este sorteo aún está activo. Usa `/gend` para finalizarlo primero.",
                    { messageId, status: 'activo' }
                );
            }

            const participants = giveaway.participants || [];
            
            if (participants.length < giveaway.winnerCount) {
                throw new TitanBotError(
                    `Participantes insuficientes para reroll: ${participants.length} < ${giveaway.winnerCount}`,
                    ErrorTypes.VALIDATION,
                    "No hay suficientes participantes para elegir ganadores.",
                    { participantsCount: participants.length, winnersNeeded: giveaway.winnerCount }
                );
            }

            
            const newWinners = selectWinners(
                participants,
                giveaway.winnerCount,
            );

            
            const updatedGiveaway = {
                ...giveaway,
                winnerIds: newWinners,
                rerolledAt: new Date().toISOString(),
                rerolledBy: interaction.user.id
            };

            
            const channel = await interaction.client.channels.fetch(
                giveaway.channelId,
            ).catch(err => {
                logger.warn(`No se pudo obtener el canal ${giveaway.channelId}:`, err.message);
                return null;
            });

            if (!channel || !channel.isTextBased()) {
                
                await saveGiveaway(
                    interaction.client,
                    interaction.guildId,
                    updatedGiveaway,
                );
                
                logger.warn(`No se encontró el canal del sorteo ${messageId}, pero se guardaron los nuevos ganadores en la base de datos`);
                
                return InteractionHelper.safeReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Reroll completado",
                            "Los nuevos ganadores fueron seleccionados y guardados en la base de datos. No se pudo encontrar el canal para anunciar.",
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            
            const message = await channel.messages
                .fetch(messageId)
                .catch(err => {
                    logger.warn(`No se pudo obtener el mensaje ${messageId}:`, err.message);
                    return null;
                });

            if (!message) {
                
                await saveGiveaway(
                    interaction.client,
                    interaction.guildId,
                    updatedGiveaway,
                );

                const winnerMentions = newWinners
                    .map((id) => `<@${id}>`)
                    .join(", ");
                
                const existingPingMsg = giveaway.winnerPingMessageId
                    ? await channel.messages.fetch(giveaway.winnerPingMessageId).catch(() => null)
                    : null;

                if (existingPingMsg) {
                    await existingPingMsg.edit({
                        content: `🔄 **REROLL DEL SORTEO** 🔄 Nuevos ganadores para **${giveaway.prize}**: ${winnerMentions}!`,
                    });
                } else {
                    const newPingMsg = await channel.send({
                        content: `🔄 **REROLL DEL SORTEO** 🔄 Nuevos ganadores para **${giveaway.prize}**: ${winnerMentions}!`,
                    });
                    updatedGiveaway.winnerPingMessageId = newPingMsg.id;
                }

                logger.info(`Reroll de sorteo completado (mensaje no encontrado): ${messageId}`);

                return InteractionHelper.safeReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Reroll completado",
                            `Los nuevos ganadores fueron anunciados en ${channel}. (Mensaje original no encontrado).`,
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            
            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );

            const newEmbed = createGiveawayEmbed(updatedGiveaway, "reroll", newWinners);
            const newRow = createGiveawayButtons(true);

            await message.edit({
                content: "🔄 **SORTEO REROLLEADO** 🔄",
                embeds: [newEmbed],
                components: [newRow],
            });

            const winnerMentions = newWinners
                .map((id) => `<@${id}>`)
                .join(", ");
            
            const existingPingMsg = giveaway.winnerPingMessageId
                ? await channel.messages.fetch(giveaway.winnerPingMessageId).catch(() => null)
                : null;

            if (existingPingMsg) {
                await existingPingMsg.edit({
                    content: `🔄 **NUEVO REROLL** 🔄 ¡FELICIDADES ${winnerMentions}! Ahora son los nuevos ganadores del sorteo **${giveaway.prize}**. Contacta al host <@${giveaway.hostId}> para reclamar tu premio.`,
                });
            } else {
                const newPingMsg = await channel.send({
                    content: `🔄 **NUEVO REROLL** 🔄 ¡FELICIDADES ${winnerMentions}! Ahora son los nuevos ganadores del sorteo **${giveaway.prize}**. Contacta al host <@${giveaway.hostId}> para reclamar tu premio.`,
                });
                updatedGiveaway.winnerPingMessageId = newPingMsg.id;
            }

            logger.info(`Sorteo rerolled correctamente: ${messageId} con ${newWinners.length} nuevos ganadores`);

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "Reroll exitoso ✅",
                        `Se volvió a sortear el giveaway de **${giveaway.prize}** en ${channel}. Se seleccionaron ${newWinners.length} nuevos ganadores.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            logger.error('Error en comando greroll:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'greroll',
                context: 'giveaway_reroll'
            });
        }
    },
};



