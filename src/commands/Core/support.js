import {
    SlashCommandBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';

const ENLACE_SOPORTE = "https://discord.gg/QnWNz2dKCE";

export default {
    data: new SlashCommandBuilder()
        .setName("support")
        .setDescription("Obtén el enlace al servidor de soporte"),

    async execute(interaction) {
        try {
            // Botón
            const botonSoporte = new ButtonBuilder()
                .setLabel("Unirse al servidor de soporte")
                .setStyle(ButtonStyle.Link)
                .setURL(ENLACE_SOPORTE);

            const fila = new ActionRowBuilder().addComponents(botonSoporte);

            // Embed
            const embed = new EmbedBuilder()
                .setTitle("🚑 ¿Necesitas ayuda?")
                .setDescription(
                    "Únete a nuestro servidor oficial de soporte para recibir ayuda, reportar errores o sugerir nuevas funciones.\n\n" +
                    "⚠️ Si estás personalizando este bot, recuerda cambiar el enlace en el código."
                )
                .setColor(0x3498db)
                .setTimestamp();

            // Respuesta
            await interaction.reply({
                embeds: [embed],
                components: [fila],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            console.error('Error en el comando support:', error);

            // Manejo de error
            if (!interaction.replied) {
                await interaction.reply({
                    content: "❌ No se pudo mostrar la información de soporte.",
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            } else {
                await interaction.editReply({
                    content: "❌ No se pudo mostrar la información de soporte.",
                }).catch(() => {});
            }
        }
    },
};





