import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sanitizeInput } from '../../utils/sanitization.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName("wanted")
    .setDescription("Crea un cartel de SE BUSCA para un usuario.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("El usuario que es buscado.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("crime")
        .setDescription("El crimen que cometió.")
        .setRequired(false)
        .setMaxLength(100),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const targetUser = interaction.options.getUser("user");
      const crimeRaw = interaction.options.getString("crime");

      let crime = "Demasiado adorable para este servidor.";
      if (crimeRaw) {
        const sanitizedCrime = sanitizeInput(crimeRaw.trim(), 100);
        if (sanitizedCrime.length > 0) {
          crime = sanitizedCrime;
        }
      }

      if (!targetUser) {
        throw new TitanBotError(
          'Usuario objetivo no encontrado en wanted',
          ErrorTypes.USER_INPUT,
          'No se pudo encontrar al usuario especificado.'
        );
      }

      const bountyAmount = Math.floor(
        Math.random() * (100000000 - 1000000) + 1000000,
      );
      const bounty = `$${bountyAmount.toLocaleString()} USD`;

      const embed = createEmbed({
        color: 'primary',
        title: '💥 GRAN RECOMPENSA: SE BUSCA 💥',
        description: `**CRIMINAL:** ${targetUser.tag}\n**CRIMEN:** ${crime}`,
        fields: [
          {
            name: "VIVO O MUERTO",
            value: `**RECOMPENSA:** ${bounty}`,
            inline: false,
          },
        ],
        image: {
          url: targetUser.displayAvatarURL({ size: 1024, extension: 'png' }),
        },
        footer: {
          text: `Última vez visto en ${interaction.guild.name}`,
        },
      });

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

      logger.debug(
        `Wanted command executed by user ${interaction.user.id} for ${targetUser.id} in guild ${interaction.guildId}`
      );
    } catch (error) {
      logger.error('Wanted command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'wanted',
        source: 'wanted_command'
      });
    }
  },
};



