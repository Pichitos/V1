import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
    .setName("flip")
    .setDescription("Lanza una moneda (Cara o Cruz)."),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      const result = Math.random() < 0.5 ? "Cara" : "Cruz";
      const emoji = result === "Cara" ? "🪙" : "🔮";

      const embed = successEmbed(
        "¿Cara o Cruz?",
        `La moneda cayó en... **${result}** ${emoji}!`,
      );

      await InteractionHelper.safeReply(interaction, { embeds: [embed] });
      logger.debug(`Comando flip ejecutado por el usuario ${interaction.user.id} en el servidor ${interaction.guildId}`);
    } catch (error) {
      logger.error('Error en el comando flip:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'flip',
        source: 'flip_command'
      });
    }
  },
};


