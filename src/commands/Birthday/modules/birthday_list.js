import { MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getAllBirthdays } from '../../../services/birthdayService.js';
import { deleteBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const guildId = interaction.guildId;
            
            
            const sortedBirthdays = await getAllBirthdays(client, guildId);

            if (sortedBirthdays.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: '❌ No hay cumpleaños',
                        description: 'Aún no se han establecido cumpleaños en este servidor.',
                        color: 'error'
                    })]
                });
            }

            const embed = createEmbed({
                title: "🎂 Cumpleaños del servidor",
                color: 'info'
            });

            // Obtener miembros para verificar quiénes siguen en el servidor
            const userIds = sortedBirthdays.map(b => b.userId);
            const fetchedMembers = await interaction.guild.members.fetch({ user: userIds }).catch(() => null);

            let birthdayList = '';
            let displayIndex = 0;
            const staleUserIds = [];

            for (const birthday of sortedBirthdays) {
                if (fetchedMembers && !fetchedMembers.has(birthday.userId)) {
                    staleUserIds.push(birthday.userId);
                    continue;
                }
                displayIndex++;
                birthdayList += `${displayIndex}. <@${birthday.userId}> - ${birthday.monthName} ${birthday.day}\n`;
            }

            // Eliminar registros de usuarios que ya no están en el servidor
            if (fetchedMembers && staleUserIds.length > 0) {
                for (const userId of staleUserIds) {
                    deleteBirthday(client, guildId, userId).catch(() => null);
                }
            }

            if (displayIndex === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: '❌ No hay cumpleaños',
                        description: 'Ningún miembro actual del servidor ha establecido su cumpleaños.',
                        color: 'error'
                    })]
                });
            }

            birthdayList = `**${displayIndex} cumpleaños${displayIndex !== 1 ? 's' : ''} en ${interaction.guild.name}**\n\n` + birthdayList;

            embed.setDescription(birthdayList);
            embed.setFooter({ text: `Total: ${displayIndex} cumpleaños${displayIndex !== 1 ? 's' : ''}` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            
            logger.info('Lista de cumpleaños obtenida correctamente', {
                userId: interaction.user.id,
                guildId,
                birthdayCount: displayIndex,
                staleRemoved: staleUserIds.length,
                commandName: 'birthday_list'
            });
        } catch (error) {
            logger.error("Falló la ejecución del comando de lista de cumpleaños", {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'birthday_list'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'birthday_list',
                source: 'birthday_list_module'
            });
        }
    }
};


