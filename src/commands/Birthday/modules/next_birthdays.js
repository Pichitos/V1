import { MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getUpcomingBirthdays } from '../../../services/birthdayService.js';
import { deleteBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);
            
            
            const next5 = await getUpcomingBirthdays(client, interaction.guildId, 5);

            if (next5.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: '❌ No se encontraron cumpleaños',
                            description: 'Aún no se han configurado cumpleaños en este servidor. ¡Usa `/birthday set` para agregar uno!',
                            color: 'error'
                        })
                    ]
                });
            }

            const embed = createEmbed({
                title: '🎂 Próximos 5 cumpleaños',
                description: `Aquí están los próximos 5 cumpleaños en ${interaction.guild.name}:`,
                color: 'info'
            });

            let displayIndex = 0;
            for (const birthday of next5) {
                const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);
                if (!member) {
                    deleteBirthday(client, interaction.guildId, birthday.userId).catch(() => null);
                    continue;
                }
                displayIndex++;

                let timeUntil = '';
                if (birthday.daysUntil === 0) {
                    timeUntil = '🎉 **¡Hoy!**';
                } else if (birthday.daysUntil === 1) {
                    timeUntil = '📅 **¡Mañana!**';
                } else {
                    timeUntil = `En ${birthday.daysUntil} día${birthday.daysUntil > 1 ? 's' : ''}`;
                }

                embed.addFields({
                    name: `${displayIndex}. ${member.displayName}`,
                    value: `<@${birthday.userId}>\n📅 **Fecha:** ${birthday.monthName} ${birthday.day}\n⏰ **Tiempo:** ${timeUntil}`,
                    inline: false
                });
            }

            if (displayIndex === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: '❌ No hay próximos cumpleaños',
                            description: 'No se encontraron próximos cumpleaños de miembros actuales del servidor.',
                            color: 'error'
                        })
                    ]
                });
            }

            embed.setFooter({
                text: '¡Usa /birthday set para agregar tu cumpleaños!',
                iconURL: interaction.guild.iconURL()
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            
            logger.info('Próximos cumpleaños obtenidos correctamente', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                upcomingCount: displayIndex,
                commandName: 'next_birthdays'
            });
        } catch (error) {
            logger.error('Falló la ejecución del comando de próximos cumpleaños', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'next_birthdays'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'next_birthdays',
                source: 'next_birthdays_module'
            });
        }
    }
};



