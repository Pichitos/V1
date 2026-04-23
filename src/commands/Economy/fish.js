import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const FISH_COOLDOWN = 45 * 60 * 1000; 
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const FISHING_ROD_MULTIPLIER = 1.5;

const FISH_TYPES = [
    { name: 'Lubina', emoji: '🐟', rarity: 'common' },
    { name: 'Salmón', emoji: '🐟', rarity: 'common' },
    { name: 'Trucha', emoji: '🐟', rarity: 'common' },
    { name: 'Atún', emoji: '🐟', rarity: 'uncommon' },
    { name: 'Pez espada', emoji: '🐟', rarity: 'uncommon' },
    { name: 'Pulpo', emoji: '🐙', rarity: 'rare' },
    { name: 'Langosta', emoji: '🦞', rarity: 'rare' },
    { name: 'Tiburón', emoji: '🦈', rarity: 'epic' },
    { name: 'Ballena', emoji: '🐋', rarity: 'legendary' },
];

const CATCH_MESSAGES = [
    "Lanzas tu línea en las aguas cristalinas...",
    "Esperas pacientemente mientras tu boya flota...",
    "Después de unos minutos de espera, sientes un tirón...",
    "El agua se agita mientras algo muerde tu anzuelo...",
    "Recoges tu captura con precisión experta...",
];

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('Ve a pescar para atrapar peces y ganar dinero'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastFish = userData.lastFish || 0;
            const hasFishingRod = userData.inventory["fishing_rod"] || 0;

            if (now < lastFish + FISH_COOLDOWN) {
                const remaining = lastFish + FISH_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                throw createError(
                    "Fishing cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Estás demasiado cansado para pescar ahora. Descansa **${hours}h ${minutes}m** antes de volver a pescar.`,
                    { remaining, cooldownType: 'fish' }
                );
            }

            
            const rand = Math.random();
            let fishCaught;
            
            if (rand < 0.5) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'common')[Math.floor(Math.random() * 3)];
            } else if (rand < 0.75) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'uncommon')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.9) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'rare')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.98) {
                fishCaught = FISH_TYPES.find(f => f.rarity === 'epic');
            } else {
                fishCaught = FISH_TYPES.find(f => f.rarity === 'legendary');
            }

            const baseEarned = Math.floor(
                Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)
            ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            
            if (hasFishingRod > 0) {
                finalEarned = Math.floor(baseEarned * FISHING_ROD_MULTIPLIER);
                multiplierMessage = `\n🎣 **Bonificación de caña de pescar: +50%**`;
            }

            const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

            userData.wallet += finalEarned;
            userData.lastFish = now;

            await setEconomyData(client, guildId, userId, userData);

            const rarityColors = {
                common: '#95A5A6',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F'
            };

            const embed = createEmbed({
                title: '🎣 ¡Pesca exitosa!',
                description: `${catchMessage}\n\n¡Has atrapado un **${fishCaught.emoji} ${fishCaught.name}**! Lo vendiste por **$${finalEarned.toLocaleString()}**!${multiplierMessage}`,
                color: rarityColors[fishCaught.rarity]
            })
                .addFields(
                    {
                        name: "💵 Nuevo saldo en efectivo",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🐟 Rareza",
                        value: fishCaught.rarity.charAt(0).toUpperCase() + fishCaught.rarity.slice(1),
                        inline: true,
                    }
                )
                .setFooter({ text: `Podrás volver a pescar en 45 minutos.` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
};
