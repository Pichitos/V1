import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';
import { shopItems } from '../../../config/shop/items.js';
import { getColor } from '../../../config/bot.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        try {
            const MAX_PAGINAS_OBJETIVO = 3;
            const ITEMS_POR_PAGINA = Math.max(1, Math.ceil(shopItems.length / MAX_PAGINAS_OBJETIVO));
            const totalPaginas = Math.ceil(shopItems.length / ITEMS_POR_PAGINA);
            let paginaActual = 1;

            const crearEmbedTienda = (pagina) => {
                const inicio = (pagina - 1) * ITEMS_POR_PAGINA;
                const itemsPagina = shopItems.slice(inicio, inicio + ITEMS_POR_PAGINA);

                const embed = new EmbedBuilder()
                    .setTitle('🛒 Tienda')
                    .setColor(getColor('primary'))
                    .setDescription('Usa `/buy item_id:<id> quantity:<cantidad>` para comprar un objeto.');

                itemsPagina.forEach(item => {
                    embed.addFields({
                        name: `${item.name} (${item.id})`,
                        value:
                            `🏷️ **Tipo:** ${item.type}\n` +
                            `💚 **Precio:** $${item.price.toLocaleString()}\n` +
                            `${item.description}`,
                        inline: false,
                    });
                });

                embed.setFooter({ text: `Página ${pagina}/${totalPaginas}` });
                return embed;
            };

            const crearComponentesTienda = (pagina) => {
                if (totalPaginas <= 1) return [];
                return [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('shop_prev')
                            .setLabel('⬅️ Anterior')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(pagina === 1),
                        new ButtonBuilder()
                            .setCustomId('shop_next')
                            .setLabel('Siguiente ➡️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(pagina === totalPaginas),
                    ),
                ];
            };

            const mensaje = await interaction.reply({
                embeds: [crearEmbedTienda(paginaActual)],
                components: crearComponentesTienda(paginaActual),
                flags: 0,
            });

            const collector = mensaje.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000,
            });

            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.reply({
                        content: '❌ No puedes usar estos botones. Ejecuta `/shop browse` para tener tu propia vista de la tienda.',
                        flags: 64,
                    });
                    return;
                }

                const { customId } = buttonInteraction;

                if (customId === 'shop_prev' || customId === 'shop_next') {
                    await buttonInteraction.deferUpdate();

                    if (customId === 'shop_prev' && paginaActual > 1) paginaActual--;
                    else if (customId === 'shop_next' && paginaActual < totalPaginas) paginaActual++;

                    await buttonInteraction.editReply({
                        embeds: [crearEmbedTienda(paginaActual)],
                        components: crearComponentesTienda(paginaActual),
                    });
                }
            });

            collector.on('end', async () => {
                try {
                    const componentesDeshabilitados = crearComponentesTienda(paginaActual);
                    componentesDeshabilitados.forEach(row =>
                        row.components.forEach(btn => btn.setDisabled(true))
                    );

                    await mensaje.edit({ components: componentesDeshabilitados });
                } catch (_) {}
            });

        } catch (error) {
            logger.error('shop_browse error:', error);

            await interaction.reply({
                content: '❌ Ocurrió un error al cargar la tienda.',
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
