import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sanitizeInput } from '../../utils/sanitization.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

function stringToHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export default {
  data: new SlashCommandBuilder()
    .setName("ship")
    .setDescription("Calcula la compatibilidad entre dos personas.")
    .addStringOption((option) =>
      option
        .setName("name1")
        .setDescription("El primer nombre o usuario.")
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName("name2")
        .setDescription("El segundo nombre o usuario.")
        .setRequired(true)
        .setMaxLength(100),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const name1Raw = interaction.options.getString("name1");
      const name2Raw = interaction.options.getString("name2");

      if (!name1Raw || name1Raw.trim().length === 0 || !name2Raw || name2Raw.trim().length === 0) {
        throw new TitanBotError(
          'Nombres vacíos en el comando ship',
          ErrorTypes.USER_INPUT,
          '¡Por favor proporciona dos nombres válidos!'
        );
      }

      const name1 = sanitizeInput(name1Raw.trim(), 100);
      const name2 = sanitizeInput(name2Raw.trim(), 100);

      if (name1.toLowerCase() === name2.toLowerCase()) {
        const embed = warningEmbed(
          "💖 Ship Score",
          `**${name1}** no puede ser emparejado consigo mismo. Elige dos personas diferentes.`
        );
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      const sortedNames = [name1, name2].sort();
      const combination = sortedNames.join("-").toLowerCase();
      const score = stringToHash(combination) % 101;

      let description;
      if (score === 100) {
        description = "¡Almas gemelas! El destino los unió.";
      } else if (score >= 80) {
        description = "¡Pareja perfecta! Esto es amor real.";
      } else if (score >= 60) {
        description = "Buena química. Algo interesante puede surgir.";
      } else if (score >= 40) {
        description = "Más amistad que romance, pero hay potencial.";
      } else if (score >= 20) {
        description = "Compatibilidad baja, podría ser complicado.";
      } else {
        description = "No hay mucha conexión entre ellos.";
      }

      const progressBar =
        "█".repeat(Math.floor(score / 10)) +
        "░".repeat(10 - Math.floor(score / 10));

      const embed = successEmbed(
        `💖 Ship Score: ${name1} vs ${name2}`,
        `Compatibilidad: **${score}%**\n\n\`${progressBar}\`\n\n*${description}*`,
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

      logger.debug(
        `Ship command executed by user ${interaction.user.id} in guild ${interaction.guildId}`
      );
    } catch (error) {
      logger.error('Ship command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'ship',
        source: 'ship_command'
      });
    }
  },
};




