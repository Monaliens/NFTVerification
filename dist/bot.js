"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("./register");
const discord_js_1 = require("discord.js");
const config_1 = require("./config/config");
const database_1 = require("./services/database");
const nft_1 = require("./services/nft");
const discord_1 = require("./services/discord");
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMembers,
        discord_js_1.GatewayIntentBits.GuildMessages,
    ],
});
const discordService = (0, discord_1.createDiscordService)(client);
const createVerificationMessage = () => {
    const embed = new discord_js_1.EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Wallet Verification')
        .setDescription('Link your wallet to join the Lil Monaliens community.')
        .addFields({ name: 'Steps:', value: '1. Click Link Your Wallet to register your wallet.\n' +
            '2. Complete the verification by sending exactly 0.01 $MON.\n' +
            '3. Use Update Holdings to update your roles based on NFTs.'
    })
        .setTimestamp()
        .setFooter({ text: 'Wallet Verification System' });
    const linkWalletButton = new discord_js_1.ButtonBuilder()
        .setCustomId('add_wallet')
        .setLabel('Link Your Wallet')
        .setStyle(discord_js_1.ButtonStyle.Primary);
    const updateHoldingsButton = new discord_js_1.ButtonBuilder()
        .setCustomId('update_holdings')
        .setLabel('Update Holdings')
        .setStyle(discord_js_1.ButtonStyle.Secondary);
    const showWalletsButton = new discord_js_1.ButtonBuilder()
        .setCustomId('list_wallets')
        .setLabel('Show Linked Wallets')
        .setStyle(discord_js_1.ButtonStyle.Secondary);
    const row = new discord_js_1.ActionRowBuilder()
        .addComponents(linkWalletButton, updateHoldingsButton, showWalletsButton);
    return { embeds: [embed], components: [row] };
};
const createWalletListEmbed = async (wallets) => {
    const embed = new discord_js_1.EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Your Linked Wallets')
        .setDescription(wallets.length ? 'Select a wallet to perform actions:' : 'You have no wallets linked yet.');
    if (wallets.length > 0) {
        const walletList = wallets.map((w, index) => {
            const verifiedStatus = w.isVerified ? '✅' : '❌';
            const nftCount = w.tokenCount ? ` | ${w.tokenCount} NFTs` : '';
            return {
                name: `Wallet #${index + 1} ${verifiedStatus}`,
                value: `\`${w.address}\`${nftCount}`,
                inline: false
            };
        });
        embed.addFields(walletList);
    }
    return embed;
};
const createWalletActionRow = (wallets) => {
    const row = new discord_js_1.ActionRowBuilder();
    row.addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId('add_wallet')
        .setLabel('Add New Wallet')
        .setStyle(discord_js_1.ButtonStyle.Success));
    if (wallets.length > 0) {
        row.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId('select_wallet')
            .setLabel('Delete Wallet')
            .setStyle(discord_js_1.ButtonStyle.Danger));
    }
    return row;
};
const sendVerificationInstructions = async (interaction, address) => {
    const verificationAmount = nft_1.nftService.getVerificationAmount(address);
    const amountInMON = (Number(verificationAmount) / 1e18).toFixed(5);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Wallet Registration Successful')
        .setDescription('To complete verification, please send the exact amount shown below from your registered wallet back to the same wallet (self-transfer):')
        .addFields({ name: 'From & To', value: `Your wallet: \`${address}\`` }, { name: 'Amount', value: `${amountInMON} $MON (exactly)` }, { name: 'Important', value: 'The transfer must be exact and must be sent from and to the same wallet!' }, { name: 'Note', value: 'Payment will be checked automatically in 1 minute, or you can click Check Payment button to verify immediately.' })
        .setTimestamp();
    const checkButton = new discord_js_1.ButtonBuilder()
        .setCustomId(`check_payment_${address}`)
        .setLabel('Check Payment')
        .setStyle(discord_js_1.ButtonStyle.Primary);
    const row = new discord_js_1.ActionRowBuilder()
        .addComponents(checkButton);
    await interaction.editReply({
        embeds: [embed],
        components: [row],
        ephemeral: true
    });
    setTimeout(async () => {
        try {
            if (interaction.isRepliable()) {
                await interaction.deleteReply();
            }
        }
        catch (error) {
            console.error('Error deleting verification message:', error);
        }
    }, 120000);
    setTimeout(async () => {
        try {
            const isVerified = await database_1.db.hasVerifiedWallet(interaction.user.id);
            if (isVerified) {
                console.log('Wallet already verified, skipping automatic check');
                return;
            }
            const hasReceived = await nft_1.nftService.hasReceivedPayment(address);
            if (hasReceived) {
                await database_1.db.verifyWallet(address);
                await discordService.updateMemberRoles(interaction.user.id);
                const successEmbed = new discord_js_1.EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('Verification Complete')
                    .setDescription('✅ Your wallet has been verified successfully!')
                    .setTimestamp();
                await interaction.editReply({
                    embeds: [successEmbed],
                    components: [],
                    ephemeral: true
                });
                setTimeout(async () => {
                    try {
                        if (interaction.isRepliable()) {
                            await interaction.deleteReply();
                        }
                    }
                    catch (error) {
                        console.error('Error deleting success message:', error);
                    }
                }, 120000);
            }
        }
        catch (error) {
            console.error('Error in automatic payment check:', error);
        }
    }, 60000);
};
const updateAndDeleteMessage = async (interaction, content, durationSeconds = 120) => {
    const endTime = Date.now() + (durationSeconds * 1000);
    let remainingSeconds = durationSeconds;
    await (content instanceof String || typeof content === 'string'
        ? interaction.editReply({
            content: `${content}\n\n_This message will be deleted in ${remainingSeconds} seconds_`,
            ephemeral: true
        })
        : interaction.editReply({
            ...content,
            content: `_This message will be deleted in ${remainingSeconds} seconds_`,
            ephemeral: true
        }));
    const updateInterval = setInterval(async () => {
        try {
            remainingSeconds = Math.ceil((endTime - Date.now()) / 1000);
            if (remainingSeconds <= 0) {
                clearInterval(updateInterval);
                if (interaction.isRepliable()) {
                    await interaction.deleteReply();
                }
                return;
            }
            if (interaction.isRepliable()) {
                await (content instanceof String || typeof content === 'string'
                    ? interaction.editReply({
                        content: `${content}\n\n_This message will be deleted in ${remainingSeconds} seconds_`,
                        ephemeral: true
                    })
                    : interaction.editReply({
                        ...content,
                        content: `_This message will be deleted in ${remainingSeconds} seconds_`,
                        ephemeral: true
                    }));
            }
        }
        catch (error) {
            clearInterval(updateInterval);
            console.error('Error updating message:', error);
        }
    }, 5000);
};
client.on('ready', async () => {
    console.log(`Logged in as ${client.user?.tag}!`);
    try {
        console.log('Fetching guild...');
        const guild = await client.guilds.fetch(config_1.config.DISCORD_GUILD_ID);
        console.log('Guild found:', guild.name);
        console.log('Fetching channel...');
        const channel = await guild.channels.fetch(config_1.config.WELCOME_CHANNEL_ID);
        console.log('Channel found:', channel.name);
        console.log('Fetching previous messages...');
        const messages = await channel.messages.fetch({ limit: 100 });
        console.log(`Found ${messages.size} messages to delete`);
        await channel.bulkDelete(messages);
        console.log('Sending verification message...');
        const message = await channel.send(createVerificationMessage());
        await message.pin();
        console.log('Message sent and pinned successfully!');
        setInterval(async () => {
            const updated = await nft_1.nftService.updateHoldersCache();
            if (updated) {
                await discordService.updateAllUsersRoles();
            }
        }, 10 * 60 * 1000);
        await discordService.updateAllUsersRoles();
    }
    catch (error) {
        console.error('Error setting up bot:', error);
        if (error instanceof Error) {
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                guildId: config_1.config.DISCORD_GUILD_ID,
                channelId: config_1.config.WELCOME_CHANNEL_ID
            });
        }
    }
});
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isButton()) {
            const buttonInteraction = interaction;
            switch (buttonInteraction.customId) {
                case 'add_wallet': {
                    const modal = new discord_js_1.ModalBuilder()
                        .setCustomId('wallet_input')
                        .setTitle('Link Your Wallet');
                    const walletInput = new discord_js_1.TextInputBuilder()
                        .setCustomId('wallet_address')
                        .setLabel('Enter your wallet address')
                        .setPlaceholder('0x...')
                        .setStyle(discord_js_1.TextInputStyle.Short)
                        .setMinLength(42)
                        .setMaxLength(42)
                        .setRequired(true);
                    const firstActionRow = new discord_js_1.ActionRowBuilder()
                        .addComponents(walletInput);
                    modal.addComponents(firstActionRow);
                    await buttonInteraction.showModal(modal);
                    break;
                }
                case 'update_holdings':
                    await buttonInteraction.deferReply({ ephemeral: true });
                    await discordService.updateMemberRoles(buttonInteraction.user.id);
                    await updateAndDeleteMessage(buttonInteraction, 'Your roles have been updated based on your NFT holdings.', 60);
                    break;
                case 'list_wallets': {
                    const wallets = await database_1.db.getWallets(buttonInteraction.user.id);
                    const embed = await createWalletListEmbed(wallets);
                    const row = createWalletActionRow(wallets);
                    await buttonInteraction.reply({
                        embeds: [embed],
                        components: [row],
                        ephemeral: true
                    });
                    await updateAndDeleteMessage(buttonInteraction, {
                        embeds: [embed],
                        components: [row]
                    }, 60);
                    break;
                }
                case 'select_wallet': {
                    const wallets = await database_1.db.getUserWallets(buttonInteraction.user.id);
                    const modal = new discord_js_1.ModalBuilder()
                        .setCustomId('wallet_selection')
                        .setTitle('Delete Wallet');
                    const walletSelect = new discord_js_1.TextInputBuilder()
                        .setCustomId('wallet_number')
                        .setLabel('Enter wallet number to delete')
                        .setStyle(discord_js_1.TextInputStyle.Short)
                        .setMinLength(1)
                        .setMaxLength(1)
                        .setPlaceholder('Enter a number between 1 and ' + wallets.length)
                        .setRequired(true);
                    const firstActionRow = new discord_js_1.ActionRowBuilder()
                        .addComponents(walletSelect);
                    modal.addComponents(firstActionRow);
                    await buttonInteraction.showModal(modal);
                    break;
                }
                default:
                    if (buttonInteraction.customId.startsWith('check_payment_')) {
                        await buttonInteraction.deferReply({ ephemeral: true });
                        const address = buttonInteraction.customId.split('_')[2];
                        const isVerified = await database_1.db.hasVerifiedWallet(buttonInteraction.user.id);
                        if (isVerified) {
                            const alreadyVerifiedEmbed = new discord_js_1.EmbedBuilder()
                                .setColor('#00ff00')
                                .setTitle('Already Verified')
                                .setDescription('✅ Your wallet is already verified!')
                                .setTimestamp();
                            await buttonInteraction.editReply({
                                embeds: [alreadyVerifiedEmbed],
                                components: [],
                                ephemeral: true
                            });
                            setTimeout(async () => {
                                try {
                                    if (buttonInteraction.isRepliable()) {
                                        await buttonInteraction.deleteReply();
                                    }
                                }
                                catch (error) {
                                    console.error('Error deleting already verified message:', error);
                                }
                            }, 120000);
                            return;
                        }
                        const hasReceived = await nft_1.nftService.hasReceivedPayment(address);
                        if (hasReceived) {
                            await database_1.db.verifyWallet(address);
                            await discordService.updateMemberRoles(buttonInteraction.user.id);
                            const successEmbed = new discord_js_1.EmbedBuilder()
                                .setColor('#00ff00')
                                .setTitle('Verification Complete')
                                .setDescription('✅ Your wallet has been verified successfully!')
                                .setTimestamp();
                            await buttonInteraction.editReply({
                                embeds: [successEmbed],
                                components: [],
                                ephemeral: true
                            });
                            setTimeout(async () => {
                                try {
                                    if (buttonInteraction.isRepliable()) {
                                        await buttonInteraction.deleteReply();
                                    }
                                }
                                catch (error) {
                                    console.error('Error deleting success message:', error);
                                }
                            }, 120000);
                        }
                        else {
                            const verificationAmount = nft_1.nftService.getVerificationAmount(address);
                            const amountInMON = (Number(verificationAmount) / 1e18).toFixed(5);
                            const pendingEmbed = new discord_js_1.EmbedBuilder()
                                .setColor('#ff9900')
                                .setTitle('Payment Not Found')
                                .setDescription('❌ Payment not found yet. Please make sure you:\n' +
                                `1. Sent exactly ${amountInMON} $MON\n` +
                                '2. Sent from your registered wallet\n' +
                                '3. Sent it back to the same wallet (self-transfer)')
                                .setTimestamp();
                            const checkButton = new discord_js_1.ButtonBuilder()
                                .setCustomId(`check_payment_${address}`)
                                .setLabel('Check Again')
                                .setStyle(discord_js_1.ButtonStyle.Primary);
                            const row = new discord_js_1.ActionRowBuilder()
                                .addComponents(checkButton);
                            await buttonInteraction.editReply({
                                embeds: [pendingEmbed],
                                components: [row],
                                ephemeral: true
                            });
                            setTimeout(async () => {
                                try {
                                    if (buttonInteraction.isRepliable()) {
                                        await buttonInteraction.deleteReply();
                                    }
                                }
                                catch (error) {
                                    console.error('Error deleting error message:', error);
                                }
                            }, 120000);
                        }
                    }
                    else if (buttonInteraction.customId.startsWith('delete_')) {
                        const address = buttonInteraction.customId.replace('delete_', '');
                        await buttonInteraction.deferReply({ ephemeral: true });
                        try {
                            await database_1.db.deleteWallet(buttonInteraction.user.id, address);
                            await discordService.updateMemberRoles(buttonInteraction.user.id);
                            await buttonInteraction.editReply({
                                content: `Wallet \`${address}\` has been removed. Your roles have been updated.`
                            });
                        }
                        catch (error) {
                            console.error('Error deleting wallet:', error);
                            await buttonInteraction.editReply({
                                content: 'An error occurred while removing the wallet.'
                            });
                        }
                    }
                    break;
            }
        }
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'wallet_selection') {
                await interaction.deferReply({ ephemeral: true });
                const walletNumber = parseInt(interaction.fields.getTextInputValue('wallet_number'));
                const wallets = await database_1.db.getWallets(interaction.user.id);
                if (walletNumber < 1 || walletNumber > wallets.length) {
                    await updateAndDeleteMessage(interaction, `❌ Invalid wallet number. Please choose between 1 and ${wallets.length}.`, 60);
                    return;
                }
                const selectedWallet = wallets[walletNumber - 1];
                await database_1.db.deleteWallet(interaction.user.id, selectedWallet.address);
                await discordService.updateMemberRoles(interaction.user.id);
                await updateAndDeleteMessage(interaction, `✅ Wallet \`${selectedWallet.address}\` has been removed.`, 60);
            }
            else if (interaction.customId === 'wallet_input') {
                await interaction.deferReply({ ephemeral: true });
                try {
                    const address = interaction.fields.getTextInputValue('wallet_address');
                    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
                        await interaction.editReply({
                            content: '❌ Invalid wallet address format. Please make sure your address starts with "0x" and is 42 characters long.'
                        });
                        return;
                    }
                    const result = await database_1.db.addWallet(interaction.user.id, address);
                    if (!result.success) {
                        await interaction.editReply({
                            content: `❌ ${result.error}`
                        });
                        return;
                    }
                    await sendVerificationInstructions(interaction, address);
                }
                catch (error) {
                    console.error('Error processing wallet submission:', error);
                    await interaction.editReply({
                        content: '❌ An error occurred while processing your request. Please try again later.'
                    });
                }
            }
        }
    }
    catch (error) {
        console.error('Error handling interaction:', error);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }
});
client.login(config_1.config.DISCORD_TOKEN);
//# sourceMappingURL=bot.js.map