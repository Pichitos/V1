import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const EMBED_DESCRIPTION_LIMIT = 4096;

export default {
    data: new SlashCommandBuilder()
    .setName("fight")
    .setDescription("Inicia una batalla 1v1 simulada basada en texto.")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("El usuario contra el que quieres pelear.")
        .setRequired(true),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const challenger = interaction.user;
      const opponent = interaction.options.getUser("opponent");

      
      if (challenger.id === opponent.id) {
        const embed = warningEmbed(
          `**${challenger.username}**, ¡no puedes pelear contigo mismo! Eso ya es un empate antes de empezar.`,
          "⚔️ Desafío inválido"
        );
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      
      if (opponent.bot) {
        const embed = warningEmbed(
          "¡No puedes pelear contra bots! Desafía a una persona real.",
          "⚔️ Oponente inválido"
        );
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      const winner = rand(0, 1) === 0 ? challenger : opponent;
      const loser = winner.id === challenger.id ? opponent : challenger;
      const rounds = rand(3, 7);
      const damage = rand(10, 50);

      const log = [];
      log.push(
        `💥 **${challenger.username}** desafía a **${opponent.username}** a un duelo! (Mejor de ${rounds} rondas)`,
      );

      for (let i = 1; i <= rounds; i++) {
        const attacker = rand(0, 1) === 0 ? challenger : opponent;
        const target = attacker.id === challenger.id ? opponent : challenger;
        const action = [
          "lanza un puñetazo salvaje",
          "conecta un golpe crítico",
          "usa un hechizo débil",
          "bloquea y contraataca",
        ][rand(0, 3)];
        log.push(
          `\n**Ronda ${i}:** ${attacker.username} ${action} contra ${target.username} causando ${rand(1, damage)} de daño!`,
        );
      }

      const outcomeText = log.join("\n");
      const winnerText = `👑 **${winner.username}** ha derrotado a ${loser.username} y se lleva la victoria!`;
      const fullDescription = `${outcomeText}\n\n${winnerText}`;

      const description = fullDescription.length <= EMBED_DESCRIPTION_LIMIT
        ? fullDescription
        : `${fullDescription.slice(0, EMBED_DESCRIPTION_LIMIT - 15)}\n\n...`;

      const embed = successEmbed(
        "🏆 Duelo completado!",
        description
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      logger.debug(`Comando fight ejecutado entre ${challenger.id} y ${opponent.id} en el servidor ${interaction.guildId}`);
    } catch (error) {
      logger.error('Error en el comando fight:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'fight',
        source: 'fight_command'
      });
    }
  },
};





