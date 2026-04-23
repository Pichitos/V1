import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import { createSelectMenu } from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderation: "🛡️",
    Economy: "💰",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    Reaction_Roles: "🎭",
    Community: "👥",
    Birthday: "🎂",
    Config: "⚙️",
};

async function createInitialHelpMenu(client) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 Todos los comandos",
            description: "Ver todos los comandos disponibles",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName =
                category.charAt(0).toUpperCase() +
                category.slice(1).toLowerCase();

            const icon = CATEGORY_ICONS[categoryName] || "🔍";

            const translatedNames = {
                Moderation: "Moderación",
                Economy: "Economía",
                Fun: "Diversión",
                Leveling: "Niveles",
                Utility: "Utilidades",
                Ticket: "Tickets",
                Welcome: "Bienvenida",
                Giveaway: "Sorteos",
                Counter: "Contador",
                Tools: "Herramientas",
                Search: "Búsqueda",
                Reaction_roles: "Roles por Reacción",
                Community: "Comunidad",
                Birthday: "Cumpleaños",
                Config: "Configuración",
                Core: "General"
            };

            const displayName = translatedNames[categoryName] || categoryName;

            return {
                label: `${icon} ${displayName}`,
                description: `Ver comandos de ${displayName}`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "Bot";

    const embed = createEmbed({
        title: `🤖 Centro de Ayuda de ${botName}`,
        description: "Tu compañero todo-en-uno para moderación, economía, diversión y gestión del servidor.",
        color: 'primary'
    });

    embed.addFields(
        { name: "🛡️ **Moderación**", value: "Herramientas de moderación y gestión de usuarios", inline: true },
        { name: "💰 **Economía**", value: "Sistema de dinero, tiendas y economía virtual", inline: true },
        { name: "🎮 **Diversión**", value: "Juegos y comandos interactivos", inline: true },
        { name: "📊 **Niveles**", value: "Sistema de XP y progresión de usuarios", inline: true },
        { name: "🎫 **Tickets**", value: "Sistema de soporte del servidor", inline: true },
        { name: "🎉 **Sorteos**", value: "Gestión automática de sorteos", inline: true },
        { name: "👋 **Bienvenida**", value: "Mensajes de bienvenida y onboarding", inline: true },
        { name: "🎂 **Cumpleaños**", value: "Seguimiento y celebraciones", inline: true },
        { name: "👥 **Comunidad**", value: "Herramientas de comunidad y participación", inline: true },
        { name: "⚙️ **Configuración**", value: "Ajustes del bot y del servidor", inline: true },
        { name: "🔢 **Contador**", value: "Canales de contador en vivo", inline: true },
        { name: "🎙️ **Canales Dinámicos**", value: "Creación automática de canales de voz", inline: true },
        { name: "🎭 **Roles por Reacción**", value: "Asignación automática de roles", inline: true },
        { name: "✅ **Verificación**", value: "Sistema de verificación de usuarios", inline: true },
        { name: "🔧 **Utilidades**", value: "Herramientas útiles del servidor", inline: true }
    );

    embed.setFooter({ text: "Hecho con cariño por Azmitia <3" });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Reportar error")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("Servidor de soporte")
        .setURL("https://discord.gg/QnWNz2dKCE")
        .setStyle(ButtonStyle.Link);

    const touchpointButton = new ButtonBuilder()
        .setLabel("Aprender con Touchpoint")
        .setURL("https://www.youtube.com/@TouchDisc")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Selecciona para ver los comandos",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        bugReportButton,
        supportButton,
        touchpointButton,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Muestra el menú de ayuda con todos los comandos"),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);

        const { embeds, components } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(interaction, {
            embeds,
            components,
        });

        setTimeout(async () => {
            try {
                const closedEmbed = createEmbed({
                    title: "Menú de ayuda cerrado",
                    description: "El menú se ha cerrado, usa /help nuevamente.",
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {}
        }, HELP_MENU_TIMEOUT_MS);
    },
};
