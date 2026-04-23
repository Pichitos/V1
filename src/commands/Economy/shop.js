import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import shopBrowse from './modules/shop_browse.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Comandos de la tienda de economía.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('browse')
                .setDescription('Explorar la tienda de economía.'),
        )
        .addSubcommandGroup(group =>
            group
                .setName('config')
                .setDescription('Configurar la tienda. (Se requiere gestionar servidor)')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('setrole')
                        .setDescription('Configura el rol de Discord que se otorga al comprar el ítem de rol premium.')
                        .addRoleOption(option =>
                            option
                                .setName('role')
                                .setDescription('El rol que se otorgará por compras de rol premium.')
                                .setRequired(true),
                        ),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            const subcommandGroup = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'browse') {
                return await shopBrowse.execute(interaction, config, client);
            }

            if (subcommandGroup === 'config' && subcommand === 'setrole') {
                return await shopConfigSetrole.execute(interaction, config, client);
            }

            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Error', 'Subcomando desconocido.')],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('error en comando shop:', error);
            await InteractionHelper.safeReply(interaction, {
                content: '❌ Ocurrió un error al ejecutar el comando de la tienda.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    },
};
