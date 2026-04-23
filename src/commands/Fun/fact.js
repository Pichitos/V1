import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

const facts = [
  "Un día en Venus es más largo que un año en Venus.",
  "La guerra más corta de la historia fue entre Gran Bretaña y Zanzíbar el 27 de agosto de 1896. Duró entre 38 y 45 minutos.",
  "La palabra 'Strengths' es la palabra más larga del inglés con solo una vocal.",
  "Los pulpos tienen tres corazones y sangre azul.",
  "Hay más árboles en la Tierra que estrellas en la Vía Láctea.",
  "Se cree que el peso total de todas las hormigas del planeta es aproximadamente igual al de todos los humanos.",
  "La miel nunca se echa a perder; se han encontrado tarros de miel comestible de hace más de 3000 años.",
  "Un rayo puede alcanzar temperaturas cinco veces más calientes que la superficie del Sol.",
  "Los humanos comparten aproximadamente el 60% de su ADN con los plátanos.",
  "El corazón de una ballena azul es tan grande que un humano podría nadar por sus arterias.",
  "Los diamantes pueden formarse dentro de estrellas en explosión conocidas como supernovas.",
  "El Everest crece aproximadamente 4 milímetros cada año.",
  "Los gatos no pueden saborear lo dulce.",
  "La Gran Muralla China no es visible desde la Luna a simple vista.",
  "El océano contiene más del 96% del agua del planeta Tierra.",
  "Un solo rayo puede contener suficiente energía para tostar 100,000 rebanadas de pan.",
  "Las jirafas tienen el mismo número de vértebras en el cuello que los humanos: siete.",
  "Los flamencos son rosados debido a los pigmentos de los camarones que comen.",
  "El espacio tiene olor a metal caliente y carne quemada (según astronautas).",
  "El tiempo pasa más lento en altitudes más altas debido a la relatividad.",
];

export default {
    data: new SlashCommandBuilder()
    .setName("fact")
    .setDescription("Comparte un dato curioso aleatorio."),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      const randomFact = facts[Math.floor(Math.random() * facts.length)];

      const embed = successEmbed("🧠 ¿Sabías esto?", `💡 **${randomFact}**`);

      await InteractionHelper.safeReply(interaction, { embeds: [embed] });
      logger.debug(`Comando fact ejecutado por el usuario ${interaction.user.id} en el servidor ${interaction.guildId}`);
    } catch (error) {
      logger.error('Error en el comando fact:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'fact',
        source: 'fact_command'
      });
    }
  },
};



