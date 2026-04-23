import {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName("uptime")
        .setDescription("Muestra cuánto tiempo lleva el bot encendido"),

    async execute(interaction) {
        try {
            // Evita timeout
            await interaction.deferReply();

            // Tiempo en segundos
            let totalSegundos = interaction.client.uptime / 1000;

            let dias = Math.floor(totalSegundos / 86400);
            totalSegundos %= 86400;

            let horas = Math.floor(totalSegundos / 3600);
            totalSegundos %= 3600;

            let minutos = Math.floor(totalSegundos / 60);
            let segundos = Math.floor(totalSegundos % 60);

            const tiempoActivo = `${dias}d ${horas}h ${minutos}m ${segundos}s`;

            // Embed
            const embed = new EmbedBuilder()
                .setTitle("⏱️ Tiempo Activo del Sistema")
                .setDescription(`\`\`\`${tiempoActivo}\`\`\``)
                .setColor(0x2ecc71)
                .setTimestamp();

            // Respuesta
            await interaction.editReply({
                embeds: [embed],
            });

        } catch (error) {
            console.error('Error en el comando uptime:', error);

            // Manejo de error
            if (!interaction.replied) {
                await interaction.reply({
                    content: "❌ No se pudo calcular el tiempo activo.",
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            } else {
                await interaction.editReply({
                    content: "❌ No se pudo calcular el tiempo activo.",
                }).catch(() => {});
            }
        }
    },
};



