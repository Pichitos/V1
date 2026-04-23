import { MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getUserBirthday } from '../../../services/birthdayService.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const targetUser = interaction.options.getUser("user") || interaction.user;
            const userId = targetUser.id;
            const guildId = interaction.guildId;

            
            const birthdayData = await getUserBirthday(client, guildId, userId);

            if (!birthdayData) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: '❌ No se encontró cumpleaños',
                        description: targetUser.id === interaction.user.id 
                            ? "Aún no has establecido tu cumpleaños. ¡Usa `/birthday set` para agregarlo!"
                            : `${targetUser.username} aún no ha establecido su cumpleaños.`,
                        color: 'error'
                    })]
                });
            }
            
            const embed = createEmbed({
                title: "🎂 Información de cumpleaños",
                description: `**Fecha:** ${birthdayData.monthName} ${birthdayData.day}\n**Usuario:** ${targetUser.toString()}`,
                color: 'info',
                footer: targetUser.id === interaction.user.id ? "Tu cumpleaños" : `Cumpleaños de ${targetUser.username}`
            });
            
            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            
            logger.info('Información de cumpleaños obtenida correctamente', {
                userId: interaction.user.id,
                targetUserId: targetUser.id,
                guildId,
                commandName: 'birthday_info'
            });
        } catch (error) {
            logger.error("Falló la ejecución del comando de información de cumpleaños", {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'birthday_info'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'birthday_info',
                source: 'birthday_info_module'
            });
        }
    }
};


