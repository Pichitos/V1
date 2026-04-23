import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("bug")
        .setDescription("Reporta un error o problema del bot"),

    async execute(interaction) {
        const githubButton = new ButtonBuilder()
            .setLabel('🐛 Reportar error en GitHub')
            .setStyle(ButtonStyle.Link)
            .setURL('https://github.com/codebymitch/TitanBot/issues');

        const row = new ActionRowBuilder().addComponents(githubButton);

        const bugReportEmbed = createEmbed({
            title: '🐛 Reporte de errores',
            description: '¿Encontraste un error? ¡Repórtalo en nuestra página de GitHub!\n\n' +
            '**Al reportar un error, incluye:**\n' +
            '• 📝 Descripción detallada del problema\n' +
            '• 🔁 Pasos para reproducirlo\n' +
            '• 📸 Capturas de pantalla (si aplica)\n' +
            '• ⚙️ Versión del bot y entorno\n\n' +
            '¡Esto nos ayuda a solucionar los problemas más rápido!',
            color: 'error'
        })
            .setTimestamp();

        await InteractionHelper.safeReply(interaction, {
            embeds: [bugReportEmbed],
            components: [row],
        });
    },
};


