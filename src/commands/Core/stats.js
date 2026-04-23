import {
    SlashCommandBuilder,
    EmbedBuilder,
    version,
    MessageFlags,
} from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName("stats")
        .setDescription("Ver estadísticas del bot"),

    async execute(interaction) {
        try {
            // Evita que la interacción expire
            await interaction.deferReply();

            // Datos del bot
            const totalServidores = interaction.client.guilds.cache.size;
            const totalUsuarios = interaction.client.guilds.cache.reduce(
                (acc, guild) => acc + guild.memberCount,
                0,
            );
            const versionNode = process.version;
            const usoMemoria = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

            // Embed
            const embed = new EmbedBuilder()
                .setTitle("📊 Estadísticas del Sistema")
                .setDescription("Métricas en tiempo real del bot.")
                .setColor(0x3498db)
                .addFields(
                    { name: "🌐 Servidores", value: `\`${totalServidores}\``, inline: true },
                    { name: "👥 Usuarios", value: `\`${totalUsuarios}\``, inline: true },
                    { name: "🟢 Node.js", value: `\`${versionNode}\``, inline: true },
                    { name: "📦 Discord.js", value: `\`v${version}\``, inline: true },
                    { name: "💾 Uso de Memoria", value: `\`${usoMemoria} MB\``, inline: true },
                )
                .setTimestamp();

            // Respuesta
            await interaction.editReply({
                embeds: [embed],
            });

        } catch (error) {
            console.error('Error en el comando stats:', error);

            // Manejo de error
            if (!interaction.replied) {
                await interaction.reply({
                    content: "❌ No se pudieron obtener las estadísticas.",
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            } else {
                await interaction.editReply({
                    content: "❌ No se pudieron obtener las estadísticas.",
                }).catch(() => {});
            }
        }
    },
};



