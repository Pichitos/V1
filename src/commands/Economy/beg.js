import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, saveEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// 🔒 ID del rol permitido
const ALLOWED_ROLE_ID = '1495143740703244368';

export default {
    data: new SlashCommandBuilder()
        .setName('add-money')
        .setDescription('Añadir dinero a un usuario')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Usuario al que quieres añadir dinero')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Cantidad de dinero a añadir')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const member = interaction.member;

        // 🔒 Verificación de rol
        if (!member.roles.cache.has(ALLOWED_ROLE_ID)) {
            throw createError(
                "Acceso denegado",
                ErrorTypes.PERMISSION,
                "No tienes el rol necesario para usar este comando."
            );
        }

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const guildId = interaction.guildId;

        logger.debug(`[ECONOMÍA] Añadir dinero a ${targetUser.id}`, { amount, guildId });

        if (targetUser.bot) {
            throw createError(
                "Intento de modificar saldo de un bot",
                ErrorTypes.VALIDATION,
                "No puedes añadir dinero a bots."
            );
        }

        if (amount <= 0) {
            throw createError(
                "Cantidad inválida",
                ErrorTypes.VALIDATION,
                "Debes introducir una cantidad mayor a 0."
            );
        }

        const userData = await getEconomyData(client, guildId, targetUser.id);

        if (!userData) {
            throw createError(
                "Error al cargar datos",
                ErrorTypes.DATABASE,
                "No se pudieron cargar los datos del usuario."
            );
        }

        userData.wallet = (userData.wallet || 0) + amount;

        await saveEconomyData(client, guildId, targetUser.id, userData);

        logger.info(`[ECONOMÍA] Dinero añadido`, { userId: targetUser.id, amount });

        const embed = createEmbed({
            title: "💰 Dinero añadido",
            description: `Se añadieron **$${amount.toLocaleString()}** a ${targetUser.username}.`,
        }).addFields(
            {
                name: "💵 Nuevo efectivo",
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true,
            }
        );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'add-money' })
};


