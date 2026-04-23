import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { 
    getJoinToCreateConfig, 
    updateJoinToCreateConfig,
    removeJoinToCreateTrigger,
    addJoinToCreateTrigger
} from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
        try {
            const triggerChannel = interaction.options.getChannel('trigger_channel');
            const guildId = interaction.guild.id;

            const currentConfig = await getJoinToCreateConfig(client, guildId);

            if (!currentConfig.triggerChannels.includes(triggerChannel.id)) {
                throw new TitanBotError(
                    `El canal ${triggerChannel.id} no es un disparador de Join to Create`,
                    ErrorTypes.VALIDATION,
                    `${triggerChannel} no está configurado como canal disparador de Join to Create.`
                );
            }

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Configuración de Join to Create')
                .setDescription(`Configurar ajustes para ${triggerChannel}`)
                .setColor(getColor('info'))
                .addFields(
                    {
                        name: '📝 Plantilla actual del nombre del canal',
                        value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                        inline: false
                    },
                    {
                        name: '👥 Límite actual de usuarios',
                        value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'Sin límite' : currentConfig.userLimit + ' usuarios'}`,
                        inline: true
                    },
                    {
                        name: '🎵 Bitrate actual',
                        value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                        inline: true
                    }
                )
                .setFooter({ text: 'Selecciona una opción para configurar abajo' })
                .setTimestamp();

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`jointocreate_config_${triggerChannel.id}`)
                .setPlaceholder('Selecciona una opción de configuración')
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Cambiar plantilla del nombre del canal')
                        .setDescription('Modificar la plantilla para los nombres de canales temporales')
                        .setValue('name_template'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Cambiar límite de usuarios')
                        .setDescription('Establecer el máximo de usuarios por canal temporal')
                        .setValue('user_limit'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Cambiar bitrate')
                        .setDescription('Ajustar la calidad de audio para canales temporales')
                        .setValue('bitrate'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Eliminar este canal disparador')
                        .setDescription('Eliminar este canal del sistema Join to Create')
                        .setValue('remove_trigger'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Ver configuración actual')
                        .setDescription('Mostrar todos los detalles de configuración actuales')
                        .setValue('view_settings')
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                components: [row],
            }).catch(error => {
                logger.error('Error al editar la respuesta en config_setup:', error);
            });

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: (i) => i.user.id === interaction.user.id && i.customId === `jointocreate_config_${triggerChannel.id}`,
                time: 60000
            });

            collector.on('collect', async (selectInteraction) => {
                await selectInteraction.deferUpdate();

                const selectedOption = selectInteraction.values[0];

                try {
                    switch (selectedOption) {
                        case 'name_template':
                            await handleNameTemplateChange(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'user_limit':
                            await handleUserLimitChange(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'bitrate':
                            await handleBitrateChange(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'remove_trigger':
                            await handleRemoveTrigger(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'view_settings':
                            await handleViewSettings(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                    }
                } catch (error) {
                    if (error instanceof TitanBotError) {
                        logger.debug(`Error de validación de configuración: ${error.message}`, error.context || {});
                    } else {
                        logger.error('Error inesperado en el menú de configuración:', error);
                    }
                    
                    const errorMessage = error instanceof TitanBotError 
                        ? error.userMessage || 'Ocurrió un error al procesar tu selección.'
                        : 'Ocurrió un error al procesar tu selección.';
                        
                    await selectInteraction.followUp({
                        embeds: [errorEmbed('Error de configuración', errorMessage)],
                        flags: MessageFlags.Ephemeral,
                    }).catch(() => {});
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        selectMenu.setDisabled(true)
                    );
                    
                    await InteractionHelper.safeEditReply(interaction, {
                        components: [disabledRow],
                    }).catch(() => {});
                }
            });

        } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }
            logger.error('Error inesperado en config_setup:', error);
            throw new TitanBotError(
                `Falló la configuración: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'No se pudo configurar el sistema Join to Create.'
            );
        }
    }
};

async function handleNameTemplateChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('📝 Configuración de plantilla del nombre del canal')
        .setDescription('Por favor ingresa la nueva plantilla del nombre del canal.')
        .addFields(
            {
                name: 'Variables disponibles',
                value: '• `{username}` - Nombre de usuario\n• `{display_name}` - Nombre visible\n• `{user_tag}` - Etiqueta del usuario (User#1234)\n• `{guild_name}` - Nombre del servidor',
                inline: false
            },
            {
                name: 'Plantilla actual',
                value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Escribe tu nueva plantilla en el chat de abajo' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newTemplate = message.content.trim();
            
            if (!newTemplate || newTemplate.length > 100) {
                await interaction.followUp({
                    embeds: [errorEmbed('Plantilla inválida', 'La plantilla debe tener entre 1 y 100 caracteres.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                name: new
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('✅ Plantilla actualizada', `Plantilla del nombre del canal cambiada a \`${newTemplate}\``)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Error de validación de plantilla: ${error.message}`);
            } else {
                logger.error('Error al actualizar la plantilla:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'No se pudo actualizar la plantilla del nombre del canal.'
                : 'No se pudo actualizar la plantilla del nombre del canal.';
                
            await interaction.followUp({
                embeds: [errorEmbed('Actualización fallida', errorMessage)],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('Tiempo agotado', 'No se recibió respuesta. Se canceló la actualización de la plantilla.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleUserLimitChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('👥 Configuración de límite de usuarios')
        .setDescription('Por favor ingresa el nuevo límite de usuarios (0-99, donde 0 = sin límite).')
        .addFields(
            {
                name: 'Límite actual',
                value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'Sin límite' : currentConfig.userLimit + ' usuarios'}`,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Escribe el nuevo límite en el chat' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newLimit = parseInt(message.content.trim());
            
            if (newLimit < 0 || newLimit > 99) {
                await interaction.followUp({
                    embeds: [errorEmbed('Límite inválido', 'El límite debe estar entre 0 y 99.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                userLimit: newLimit
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('✅ Límite actualizado', `Límite cambiado a ${newLimit === 0 ? 'Sin límite' : newLimit + ' usuarios'}`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Error de validación de límite de usuarios: ${error.message}`);
            } else {
                logger.error('Error al actualizar el límite de usuarios:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'No se pudo actualizar el límite de usuarios.'
                : 'No se pudo actualizar el límite de usuarios.';
                
            await interaction.followUp({
                embeds: [errorEmbed('Actualización fallida', errorMessage)],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('Tiempo agotado', 'No se recibió una respuesta válida. Actualización cancelada.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleBitrateChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('🎵 Configuración de bitrate')
        .setDescription('Por favor ingresa el nuevo bitrate en kbps (8-384).')
        .addFields(
            {
                name: 'Bitrate actual',
                value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: false
            },
            {
                name: 'Valores comunes',
                value: '• 64 kbps - Calidad normal\n• 96 kbps - Buena calidad\n• 128 kbps - Alta calidad\n• 256 kbps - Muy alta calidad',
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Escribe el nuevo bitrate en el chat' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newBitrate = parseInt(message.content.trim());
            
            if (newBitrate < 8 || newBitrate > 384) {
                await interaction.followUp({
                    embeds: [errorEmbed('Bitrate inválido', 'El bitrate debe estar entre 8 y 384 kbps.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                bitrate: newBitrate * 1000
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('✅ Bitrate actualizado', `Bitrate cambiado a ${newBitrate} kbps`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Error de validación de bitrate: ${error.message}`);
            } else {
                logger.error('Error al actualizar el bitrate:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'No se pudo actualizar el bitrate.'
                : 'No se pudo actualizar el bitrate.';
                
            await interaction.followUp({
                embeds: [errorEmbed('Actualización fallida', errorMessage)],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('Tiempo agotado', 'No se recibió respuesta válida. Actualización cancelada.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleRemoveTrigger(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('⚠️ Eliminar canal disparador')
        .setDescription(`¿Estás seguro de que quieres eliminar ${triggerChannel} del sistema Join to Create?`)
        .setColor('#ff6600')
        .setFooter({ text: 'Esta acción no se puede deshacer' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_remove_${triggerChannel.id}`)
            .setLabel('Eliminar canal')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`cancel_remove_${triggerChannel.id}`)
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Secondary)
    );
    
   await interaction.followUp({ 
    embeds: [embed], 
    components: [row],
    flags: MessageFlags.Ephemeral 
});

const collector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === interaction.user.id && 
                 (i.customId === `confirm_remove_${triggerChannel.id}` || i.customId === `cancel_remove_${triggerChannel.id}`),
    time: 600_000,
    max: 1
});

collector.on('collect', async (buttonInteraction) => {
    await buttonInteraction.deferUpdate();

    if (buttonInteraction.customId === `confirm_remove_${triggerChannel.id}`) {
        try {
            const success = await removeJoinToCreateTrigger(client, interaction.guild.id, triggerChannel.id);
            
            if (success) {
                await buttonInteraction.followUp({
                    embeds: [successEmbed('✅ Canal eliminado', `${triggerChannel} ha sido eliminado del sistema Join to Create.`)],
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                await buttonInteraction.followUp({
                    embeds: [errorEmbed('Error al eliminar', 'No se pudo eliminar el canal disparador.')],
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Error de validación al eliminar el disparador: ${error.message}`);
            } else {
                logger.error('Error al eliminar el disparador:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'Ocurrió un error al eliminar el canal disparador.'
                : 'Ocurrió un error al eliminar el canal disparador.';
                
            await buttonInteraction.followUp({
                embeds: [errorEmbed('Error al eliminar', errorMessage)],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    } else {
        await buttonInteraction.followUp({
            embeds: [successEmbed('✅ Cancelado', 'La eliminación del canal ha sido cancelada.')],
            flags: MessageFlags.Ephemeral,
        });
    }
});

collector.on('end', (collected, reason) => {
    if (reason === 'time') {
        interaction.followUp({
            embeds: [errorEmbed('Tiempo agotado', 'No se recibió respuesta. Eliminación cancelada.')],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
    }
});
}

async function handleViewSettings(interaction, triggerChannel, currentConfig, client) {
    const channelConfig = currentConfig.channelOptions?.[triggerChannel.id] || {};
    
    const embed = new EmbedBuilder()
        .setTitle('📋 Configuración actual')
        .setDescription(`Configuración para ${triggerChannel}`)
        .setColor(getColor('info'))
        .addFields(
            {
                name: '🎯 Canal disparador',
                value: `${triggerChannel} (${triggerChannel.id})`,
                inline: false
            },
            {
                name: '📝 Plantilla del nombre del canal',
                value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            },
            {
                name: '👥 Límite de usuarios',
                value: `${channelConfig.userLimit || currentConfig.userLimit === 0 ? 'Sin límite' : (channelConfig.userLimit || currentConfig.userLimit) + ' usuarios'}`,
                inline: true
            },
            {
                name: '🎵 Bitrate',
                value: `${(channelConfig.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: true
            },
            {
                name: '📁 Categoría',
                value: currentConfig.categoryId ? `<#${currentConfig.categoryId}>` : 'No establecida',
                inline: true
            },
            {
                name: '📊 Estado del sistema',
                value: currentConfig.enabled ? '✅ Activado' : '❌ Desactivado',
                inline: true
            },
            {
                name: '🔢 Canales temporales activos',
                value: Object.keys(currentConfig.temporaryChannels || {}).length.toString(),
                inline: true
            }
        )
        .setTimestamp();

    await interaction.followUp({ 
        embeds: [embed], 
        flags: MessageFlags.Ephemeral 
    });
}



