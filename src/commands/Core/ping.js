import {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Mide la latencia del bot y la velocidad de la API"),

    async execute(interaction) {
        try {
            // Evita que la interacción expire
            await interaction.deferReply();

            // Mensaje inicial
            const sent = await interaction.editReply({
                content: "Midiendo latencia...",
            });

            // Cálculo de latencias
            const latenciaBot = sent.createdTimestamp - interaction.createdTimestamp;
            const latenciaAPI = Math.round(interaction.client.ws.ping);

            // Embed
            const embed = new EmbedBuilder()
                .setTitle("🏓 ¡Pong!")
                .setColor(0x00ff00)
                .addFields(
                    { name: "🤖 Latencia del Bot", value: `\`${latenciaBot}ms\``, inline: true },
                    { name: "🌐 Latencia de la API", value: `\`${latenciaAPI}ms\``, inline: true },
                )
                .setTimestamp();

            // Respuesta final
            await interaction.editReply({
                content: null,
                embeds: [embed],
            });

        } catch (error) {
            console.error('Error en el comando ping:', error);

            // Manejo de error
            if (!interaction.replied) {
                await interaction.reply({
                    content: "❌ No se pudo medir la latencia en este momento.",
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            } else {
                await interaction.editReply({
                    content: "❌ No se pudo medir la latencia en este momento.",
                }).catch(() => {});
            }
        }
    },
};




