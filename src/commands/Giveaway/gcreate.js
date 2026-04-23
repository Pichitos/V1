import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { saveGiveaway } from '../../utils/giveaways.js';
import { 
    parseDuration, 
    validatePrize, 
    validateWinnerCount,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gcreate")
        .setDescription("Inicia un nuevo sorteo en un canal especificado.")
        .addStringOption((option) =>
            option
                .setName("duration")
                .setDescription("Duración del sorteo (ej: 1h, 30m, 5d).")
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("winners")
                .setDescription("Número de ganadores.")
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("prize")
                .setDescription("Premio del sorteo.")
                .setRequired(true),
        )
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("Canal donde se enviará el sorteo (por defecto: este canal).")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Giveaway usado fuera de servidor',
                    ErrorTypes.VALIDATION,
                    'Este comando solo puede usarse en un servidor.',
                    { userId: interaction.user.id }
                );
            }

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                throw new TitanBotError(
                    'Sin permisos para giveaway',
                    ErrorTypes.PERMISSION,
                    "Necesitas el permiso de 'Administrar servidor' para crear sorteos.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Giveaway creation started by ${interaction.user.tag} in guild ${interaction.guildId}`);

            const durationString = interaction.options.getString("duration");
            const winnerCount = interaction.options.getInteger("winners");
            const prize = interaction.options.getString("prize");
            const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

            const durationMs = parseDuration(durationString);
            validateWinnerCount(winnerCount);
            const prizeName = validatePrize(prize);

            if (!targetChannel.isTextBased()) {
                throw new TitanBotError(
                    'Canal no válido para giveaway',
                    ErrorTypes.VALIDATION,
                    'El canal debe ser un canal de texto.',
                    { channelId: targetChannel.id, channelType: targetChannel.type }
                );
            }

            const endTime = Date.now() + durationMs;

            const initialGiveawayData = {
                messageId: "placeholder",
                channelId: targetChannel.id,
                guildId: interaction.guildId,
                prize: prizeName,
                hostId: interaction.user.id,
                endTime: endTime,
                endsAt: endTime,
                winnerCount: winnerCount,
                participants: [],
                isEnded: false,
                ended: false,
                createdAt: new Date().toISOString()
            };

            const embed = createGiveawayEmbed(initialGiveawayData, "active");
            const row = createGiveawayButtons(false);

            const giveawayMessage = await targetChannel.send({
                content: "🎉 **NUEVO SORTEO** 🎉",
                embeds: [embed],
                components: [row],
            });

            initialGiveawayData.messageId = giveawayMessage.id;

            const saved = await saveGiveaway(
                interaction.client,
                interaction.guildId,
                initialGiveawayData,
            );

            if (!saved) {
                logger.warn(`Failed to save giveaway to database: ${giveawayMessage.id}`);
            }

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_CREATE,
                    data: {
                        description: `Giveaway creado: ${prizeName}`,
                        channelId: targetChannel.id,
                        userId: interaction.user.id,
                        fields: [
                            { name: '🎁 Premio', value: prizeName, inline: true },
                            { name: '🏆 Ganadores', value: winnerCount.toString(), inline: true },
                            { name: '⏰ Duración', value: durationString, inline: true },
                            { name: '📍 Canal', value: targetChannel.toString(), inline: true }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway creation event:', logError);
            }

            logger.info(`Giveaway created successfully: ${giveawayMessage.id} in ${targetChannel.name}`);

            await InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        `¡Sorteo iniciado! 🎉`,
                        `El sorteo de **${prizeName}** fue iniciado en ${targetChannel} y terminará en **${durationString}**.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'gcreate',
                context: 'giveaway_creation'
            });
        }
    },
};


