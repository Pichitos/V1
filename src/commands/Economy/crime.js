import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CRIME_COOLDOWN = 60 * 60 * 1000;
const MIN_CRIME_AMOUNT = 100;
const MAX_CRIME_AMOUNT = 2000;
const FAILURE_RATE = 0.4;
const JAIL_TIME = 2 * 60 * 60 * 1000;

const CRIME_TYPES = [
    { name: "Carterismo", min: 100, max: 500, risk: 0.3 },
    { name: "Robo a casa", min: 300, max: 1000, risk: 0.4 },
    { name: "Atraco bancario", min: 1000, max: 5000, risk: 0.6 },
    { name: "Robo de arte", min: 2000, max: 10000, risk: 0.7 },
    { name: "Ciberdelito", min: 5000, max: 20000, risk: 0.8 },
];

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Comete un crimen para ganar dinero (arriesgado)')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Tipo de crimen a cometer')
                .setRequired(true)
                .addChoices(
                    { name: 'Carterismo', value: 'pickpocketing' },
                    { name: 'Robo a casa', value: 'burglary' },
                    { name: 'Atraco bancario', value: 'bank-heist' },
                    { name: 'Robo de arte', value: 'art-theft' },
                    { name: 'Ciberdelito', value: 'cybercrime' },
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);
            
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastCrime = userData.cooldowns?.crime || 0;
        const isJailed = userData.jailedUntil && userData.jailedUntil > now;

        if (isJailed) {
            const timeLeft = Math.ceil((userData.jailedUntil - now) / (1000 * 60));
            throw createError(
                "Usuario en prisión",
                ErrorTypes.RATE_LIMIT,
                `¡Estás en la cárcel por ${timeLeft} minutos más!`,
                { jailTimeRemaining: userData.jailedUntil - now }
            );
        }

        if (now < lastCrime + CRIME_COOLDOWN) {
            const timeLeft = Math.ceil((lastCrime + CRIME_COOLDOWN - now) / (1000 * 60));
            throw createError(
                "Cooldown de crimen activo",
                ErrorTypes.RATE_LIMIT,
                `Debes esperar ${timeLeft} minutos más antes de cometer otro crimen.`,
                { remaining: lastCrime + CRIME_COOLDOWN - now, cooldownType: 'crime' }
            );
        }

        const crimeType = interaction.options.getString("type").toLowerCase();
        const crime = CRIME_TYPES.find(
            c => c.name.toLowerCase().replace(/\s+/g, '-') === crimeType
        );

        if (!crime) {
            throw createError(
                "Tipo de crimen inválido",
                ErrorTypes.VALIDATION,
                "Por favor selecciona un tipo de crimen válido.",
                { crimeType }
            );
        }

        const isSuccess = Math.random() > crime.risk;
        const amountEarned = isSuccess
            ? Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min
            : 0;

        userData.cooldowns = userData.cooldowns || {};
        userData.cooldowns.crime = now;

        if (isSuccess) {
            userData.wallet = (userData.wallet || 0) + amountEarned;
            
            await setEconomyData(client, guildId, userId, userData);
            
            const embed = successEmbed(
                "¡Crimen exitoso!",
                `Has cometido ${crime.name} con éxito y ganaste **${amountEarned}** monedas!`
            );
            
            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        } else {
            const fine = Math.floor(amountEarned * 0.2);
            userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
            userData.jailedUntil = now + JAIL_TIME;
            
            await setEconomyData(client, guildId, userId, userData);
            
            const embed = errorEmbed(
                "¡Crimen fallido!",
                `Fuiste atrapado intentando ${crime.name} y has sido enviado a la cárcel. ` +
                `Pagaste una multa de ${fine} monedas y estarás en prisión por 2 horas.`
            );
            
            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    }, { command: 'crime' })
};
