import './register';
import { 
  Client, 
  GatewayIntentBits, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder, 
  EmbedBuilder,
  TextChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  ModalSubmitInteraction,
  InteractionEditReplyOptions
} from 'discord.js';
import { config } from '@/config/config';
import { db } from '@/services/database';
import { nftService } from '@/services/nft';
import { createDiscordService } from '@/services/discord';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const discordService = createDiscordService(client);

// Create verification message with buttons
const createVerificationMessage = () => {
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('🔐 Wallet Verification System')
    .setDescription('Welcome to the Lil Monaliens community! To access exclusive holder channels and benefits, please verify your wallet ownership.')
    .addFields(
      { 
        name: '📝 How to Verify', 
        value: 
          '1. Click `Link Your Wallet` and enter your wallet address\n' +
          '2. Send the exact amount of $MON shown to you back to your own wallet\n' +
          '3. Wait for automatic verification or click `Check Payment`'
      },
      {
        name: '🎭 NFT Roles',
        value: 'After verification, use `Update Holdings` to receive your NFT holder roles automatically.'
      },
      {
        name: '💡 Tips',
        value: '• You can link multiple wallets\n' +
               '• Use `Show Linked Wallets` to manage your wallets\n' +
               '• Roles are updated automatically every 10 minutes'
      }
    )
    .setTimestamp()
    .setFooter({
      text: 'Lil Monaliens | Secure Wallet Verification',
      iconURL: 'https://i.imgur.com/V69kAXL.png' // Buraya Lil Monaliens logosu gelecek
    });

  const linkWalletButton = new ButtonBuilder()
    .setCustomId('add_wallet')
    .setLabel('Link Your Wallet')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('🔗');

  const updateHoldingsButton = new ButtonBuilder()
    .setCustomId('update_holdings')
    .setLabel('Update Holdings')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🔄');

  const showWalletsButton = new ButtonBuilder()
    .setCustomId('list_wallets')
    .setLabel('Show Linked Wallets')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('📋');

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(linkWalletButton, updateHoldingsButton, showWalletsButton);

  return { embeds: [embed], components: [row] };
};

const createWalletListEmbed = async (wallets: any[]) => {
  const embed = new EmbedBuilder()
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

const createWalletActionRow = (wallets: any[]) => {
  const row = new ActionRowBuilder<ButtonBuilder>();

  // Add New Wallet button is always first
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('add_wallet')
      .setLabel('Add New Wallet')
      .setStyle(ButtonStyle.Success)
  );

  if (wallets.length > 0) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('select_wallet')
        .setLabel('Delete Wallet')
        .setStyle(ButtonStyle.Danger)
    );
  }

  return row;
};

const sendVerificationInstructions = async (interaction: ModalSubmitInteraction, address: string) => {
  const verificationAmount = nftService.getVerificationAmount(address);
  const amountInMON = (Number(verificationAmount) / 1e18).toFixed(5);
  
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('Wallet Registration Successful')
    .setDescription('To complete verification, please send the exact amount shown below from your registered wallet back to the same wallet (self-transfer):')
    .addFields(
      { name: 'From & To', value: `Your wallet: \`${address}\`` },
      { name: 'Amount', value: `${amountInMON} $MON (exactly)` },
      { name: 'Important', value: 'The transfer must be exact and must be sent from and to the same wallet!' },
      { name: 'Note', value: 'Payment will be checked automatically in 1 minute, or you can click Check Payment button to verify immediately.' }
    )
    .setTimestamp();

  const checkButton = new ButtonBuilder()
    .setCustomId(`check_payment_${address}`)
    .setLabel('Check Payment')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(checkButton);

  await interaction.editReply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  } as InteractionEditReplyOptions);
  
  // No longer deleting this verification message to keep it persistent
  // Verification instructions should remain visible to users

  // Set up automatic check after 1 minute
  setTimeout(async () => {
    try {
      // First check if the wallet is already verified
      const isVerified = await db.hasVerifiedWallet(interaction.user.id);
      if (isVerified) {
        console.log('Wallet already verified, skipping automatic check');
        return;
      }

      const hasReceived = await nftService.hasReceivedPayment(address);
      if (hasReceived) {
        await db.verifyWallet(address);
        await discordService.updateMemberRoles(interaction.user.id);
        
        const successEmbed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('Verification Complete')
          .setDescription('✅ Your wallet has been verified successfully!')
          .setTimestamp();

        await interaction.editReply({
          embeds: [successEmbed],
          components: [],
          ephemeral: true
        } as InteractionEditReplyOptions);

        // Delete success message after 2 minutes
        setTimeout(async () => {
          try {
            if (interaction.isRepliable()) {
              await interaction.deleteReply();
            }
          } catch (error) {
            console.error('Error deleting success message:', error);
          }
        }, 120000); // 2 minutes
      }
    } catch (error) {
      console.error('Error in automatic payment check:', error);
    }
  }, 60000); // 1 minute
};


// Event handlers
client.on('ready', async () => {
  console.log(`🚀 ${client.user?.tag} is online!`);
  
  try {
    const guild = await client.guilds.fetch(config.DISCORD_GUILD_ID);
    const channel = await guild.channels.fetch(config.WELCOME_CHANNEL_ID) as TextChannel;
    
    const messages = await channel.messages.fetch({ limit: 100 });

    // Delete messages that are less than 14 days old
    const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
    const messagesToDelete = messages.filter(msg => msg.createdTimestamp > twoWeeksAgo);
    
    if (messagesToDelete.size > 0) {
      await channel.bulkDelete(messagesToDelete);
    }
    
    const message = await channel.send(createVerificationMessage());
    await message.pin();
    console.log('📢 Verification system ready!');

    // Start periodic holder updates every 15 minutes
    setInterval(async () => {
      console.log('⏰ Checking NFT holders...');
      const updated = await nftService.updateHoldersCache();
      if (updated) {
        await discordService.updateAllUsersRoles();
      }
    }, 15 * 60 * 1000); // 15 minutes

    // Do initial role update
    await discordService.updateAllUsersRoles();
  } catch (error) {
    console.error('Error setting up bot:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        guildId: config.DISCORD_GUILD_ID,
        channelId: config.WELCOME_CHANNEL_ID
      });
    }
  }
});

// Button and Modal interaction handlers
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) {
      const buttonInteraction = interaction as ButtonInteraction;
      
      // Check if interaction is already handled
      if (buttonInteraction.replied || buttonInteraction.deferred) {
        return;
      }

      switch (buttonInteraction.customId) {
        case 'add_wallet': {
          // Create the modal
          const modal = new ModalBuilder()
            .setCustomId('wallet_input')
            .setTitle('Link Your Wallet');

          // Add input field for wallet address
          const walletInput = new TextInputBuilder()
            .setCustomId('wallet_address')
            .setLabel('Enter your wallet address')
            .setPlaceholder('0x...')
            .setStyle(TextInputStyle.Short)
            .setMinLength(42)
            .setMaxLength(42)
            .setRequired(true);

          const firstActionRow = new ActionRowBuilder<TextInputBuilder>()
            .addComponents(walletInput);

          modal.addComponents(firstActionRow);

          await buttonInteraction.showModal(modal);
          break;
        }

        case 'update_holdings':
          await buttonInteraction.deferReply({ ephemeral: true });
          
          try {
            await discordService.updateMemberRoles(buttonInteraction.user.id);
            
            // Check if the interaction is still valid
            if (!buttonInteraction.isRepliable() || buttonInteraction.replied) {
              console.log('Interaction no longer valid after role update, aborting');
              return;
            }
            
            await buttonInteraction.editReply({
              content: 'Your roles have been updated based on your NFT holdings.'
            }).catch(err => {
              console.error('Failed to send role update message:', err.code);
            });
            
            // Delete message after 60 seconds
            setTimeout(async () => {
              try {
                if (buttonInteraction.isRepliable()) {
                  await buttonInteraction.deleteReply().catch(err => {
                    console.error('Failed to delete roles update message (likely expired):', err.code);
                  });
                }
              } catch (error) {
                console.error('Error deleting roles update message:', error);
              }
            }, 60000); // 60 seconds
          } catch (error) {
            console.error('Error updating roles:', error);
            
            // Only attempt to edit if the interaction is still valid
            if (buttonInteraction.isRepliable() && !buttonInteraction.replied) {
              await buttonInteraction.editReply({
                content: 'An error occurred while updating your roles. Please try again.'
              }).catch(err => {
                console.error('Failed to send role update error message:', err.code);
              });
            }
          }
          break;

        case 'list_wallets': {
          await buttonInteraction.deferReply({ ephemeral: true });
          
          try {
            const wallets = await db.getWallets(buttonInteraction.user.id);
            const embed = await createWalletListEmbed(wallets);
            const row = createWalletActionRow(wallets);
            
            // Check if the interaction is still valid before replying
            if (buttonInteraction.isRepliable() && !buttonInteraction.replied) {
              await buttonInteraction.editReply({
                embeds: [embed],
                components: [row]
              });
              
              // Delete message after 60 seconds
              setTimeout(async () => {
                try {
                  // Double-check if the interaction is still repliable before attempting to delete
                  if (buttonInteraction.isRepliable()) {
                    await buttonInteraction.deleteReply().catch(err => {
                      console.error('Failed to delete reply (likely expired):', err.code);
                    });
                  }
                } catch (error) {
                  console.error('Error deleting wallet list message:', error);
                }
              }, 60000); // 60 seconds
            }
          } catch (error) {
            console.error('Error listing wallets:', error);
            
            // Only try to edit the reply if the interaction is still valid
            if (buttonInteraction.isRepliable() && !buttonInteraction.replied) {
              await buttonInteraction.editReply({
                content: 'An error occurred while fetching your wallets. Please try again.'
              }).catch(err => {
                console.error('Failed to send error message:', err.code);
              });
            }
          }
          break;
        }

        case 'select_wallet': {
          const wallets = await db.getUserWallets(buttonInteraction.user.id);
          
          const modal = new ModalBuilder()
            .setCustomId('wallet_selection')
            .setTitle('Delete Wallet');

          const walletSelect = new TextInputBuilder()
            .setCustomId('wallet_number')
            .setLabel('Enter wallet number to delete')
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(1)
            .setPlaceholder('Enter a number between 1 and ' + wallets.length)
            .setRequired(true);

          const firstActionRow = new ActionRowBuilder<TextInputBuilder>()
            .addComponents(walletSelect);

          modal.addComponents(firstActionRow);
          await buttonInteraction.showModal(modal);
          break;
        }

        default:
          if (buttonInteraction.customId.startsWith('check_payment_')) {
            await buttonInteraction.deferReply({ ephemeral: true });
            const address = buttonInteraction.customId.split('_')[2];
            
            try {
              // First check if the wallet is already verified
              const isVerified = await db.hasVerifiedWallet(buttonInteraction.user.id);
              
              // Check if interaction is still valid
              if (!buttonInteraction.isRepliable() || buttonInteraction.replied) {
                console.log('Interaction no longer valid, aborting check_payment handler');
                return;
              }
              
              if (isVerified) {
                const alreadyVerifiedEmbed = new EmbedBuilder()
                  .setColor('#00ff00')
                  .setTitle('Already Verified')
                  .setDescription('✅ Your wallet is already verified!')
                  .setTimestamp();

                await buttonInteraction.editReply({
                  embeds: [alreadyVerifiedEmbed],
                  components: [],
                  ephemeral: true
                } as InteractionEditReplyOptions);

                // Delete message after 2 minutes
                setTimeout(async () => {
                  try {
                    if (buttonInteraction.isRepliable()) {
                      await buttonInteraction.deleteReply().catch(err => {
                        console.error('Failed to delete already verified message (likely expired):', err.code);
                      });
                    }
                  } catch (error) {
                    console.error('Error deleting already verified message:', error);
                  }
                }, 120000);
                return;
              }

              const hasReceived = await nftService.hasReceivedPayment(address);
              
              // Check again if interaction is still valid
              if (!buttonInteraction.isRepliable() || buttonInteraction.replied) {
                console.log('Interaction no longer valid after payment check, aborting');
                return;
              }
              
              if (hasReceived) {
                await db.verifyWallet(address);
                await discordService.updateMemberRoles(buttonInteraction.user.id);
                
                const successEmbed = new EmbedBuilder()
                  .setColor('#00ff00')
                  .setTitle('Verification Complete')
                  .setDescription('✅ Your wallet has been verified successfully!')
                  .setTimestamp();

                await buttonInteraction.editReply({
                  embeds: [successEmbed],
                  components: [],
                  ephemeral: true
                } as InteractionEditReplyOptions).catch(err => {
                  console.error('Failed to send success message:', err.code);
                });

                // Delete success message after 2 minutes
                setTimeout(async () => {
                  try {
                    if (buttonInteraction.isRepliable()) {
                      await buttonInteraction.deleteReply().catch(err => {
                        console.error('Failed to delete success message (likely expired):', err.code);
                      });
                    }
                  } catch (error) {
                    console.error('Error deleting success message:', error);
                  }
                }, 120000); // 2 minutes
              } else {
                const verificationAmount = nftService.getVerificationAmount(address);
                const amountInMON = (Number(verificationAmount) / 1e18).toFixed(5);

                const pendingEmbed = new EmbedBuilder()
                  .setColor('#ff9900')
                  .setTitle('Payment Not Found')
                  .setDescription('❌ Payment not found yet. Please make sure you:\n' +
                    `1. Sent exactly ${amountInMON} $MON\n` +
                    '2. Sent from your registered wallet\n' +
                    '3. Sent it back to the same wallet (self-transfer)')
                  .setTimestamp();

                const checkButton = new ButtonBuilder()
                  .setCustomId(`check_payment_${address}`)
                  .setLabel('Check Again')
                  .setStyle(ButtonStyle.Primary);

                const row = new ActionRowBuilder<ButtonBuilder>()
                  .addComponents(checkButton);

                await buttonInteraction.editReply({
                  embeds: [pendingEmbed],
                  components: [row],
                  ephemeral: true
                } as InteractionEditReplyOptions).catch(err => {
                  console.error('Failed to send pending message:', err.code);
                });

                // Delete error message after 2 minutes
                setTimeout(async () => {
                  try {
                    if (buttonInteraction.isRepliable()) {
                      await buttonInteraction.deleteReply().catch(err => {
                        console.error('Failed to delete error message (likely expired):', err.code);
                      });
                    }
                  } catch (error) {
                    console.error('Error deleting error message:', error);
                  }
                }, 120000); // 2 minutes
              }
            } catch (error) {
              console.error('Error in check_payment handler:', error);
              
              // Only try to edit reply if the interaction is still valid
              if (buttonInteraction.isRepliable() && !buttonInteraction.replied) {
                await buttonInteraction.editReply({
                  content: 'An error occurred while processing your payment verification. Please try again.'
                }).catch(err => {
                  console.error('Failed to send check_payment error message:', err.code);
                });
              }
            }
          } else if (buttonInteraction.customId.startsWith('delete_')) {
            const address = buttonInteraction.customId.replace('delete_', '');
            await buttonInteraction.deferReply({ ephemeral: true });
            
            try {
              await db.deleteWallet(buttonInteraction.user.id, address);
              
              // Update roles after wallet deletion
              await discordService.updateMemberRoles(buttonInteraction.user.id);
              
              await buttonInteraction.editReply({
                content: `Wallet \`${address}\` has been removed. Your roles have been updated.`
              });
            } catch (error) {
              console.error('Error deleting wallet:', error);
              await buttonInteraction.editReply({
                content: 'An error occurred while removing the wallet.'
              });
            }
          }
          break;
      }
    } else if (interaction.isModalSubmit()) {
      if (interaction.customId === 'wallet_selection') {
        await interaction.deferReply({ ephemeral: true });
        
        try {
          const walletNumber = parseInt(interaction.fields.getTextInputValue('wallet_number'));
          const wallets = await db.getWallets(interaction.user.id);
          
          if (walletNumber < 1 || walletNumber > wallets.length) {
            await interaction.editReply({
              content: `❌ Invalid wallet number. Please choose between 1 and ${wallets.length}.`
            });
            
            // Delete message after 60 seconds
            setTimeout(async () => {
              try {
                if (interaction.isRepliable()) {
                  await interaction.deleteReply();
                }
              } catch (error) {
                console.error('Error deleting invalid wallet number message:', error);
              }
            }, 60000); // 60 seconds
            return;
          }

          const selectedWallet = wallets[walletNumber - 1];

          await db.deleteWallet(interaction.user.id, selectedWallet.address);
          await discordService.updateMemberRoles(interaction.user.id);
          
          await interaction.editReply({
            content: `✅ Wallet \`${selectedWallet.address}\` has been removed.`
          });
          
          // Delete message after 60 seconds
          setTimeout(async () => {
            try {
              if (interaction.isRepliable()) {
                await interaction.deleteReply();
              }
            } catch (error) {
              console.error('Error deleting wallet removed message:', error);
            }
          }, 60000); // 60 seconds
        } catch (error) {
          console.error('Error handling wallet selection:', error);
          await interaction.editReply({
            content: 'An error occurred while processing your request. Please try again.'
          });
        }
      } else if (interaction.customId === 'wallet_input') {
        // Defer the reply immediately to prevent timeout
        await interaction.deferReply({ ephemeral: true });

        try {
          const address = interaction.fields.getTextInputValue('wallet_address');

          // Validate address format
          if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            await interaction.editReply({
              content: '❌ Invalid wallet address format. Please make sure your address starts with "0x" and is 42 characters long.'
            });
            return;
          }

          // Add wallet to user with new error handling
          const result = await db.addWallet(interaction.user.id, address);
          
          if (!result.success) {
            await interaction.editReply({
              content: `❌ ${result.error}`
            });
            return;
          }
          
          await sendVerificationInstructions(interaction, address);
        } catch (error) {
          console.error('Error processing wallet submission:', error);
          await interaction.editReply({
            content: '❌ An error occurred while processing your request. Please try again later.'
          });
        }
      }
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    
    // Improved error handling - check more carefully whether we can respond
    try {
      if (
        interaction.isRepliable() && 
        !interaction.replied && 
        !interaction.deferred &&
        interaction.constructor.name !== 'ModalSubmitInteraction' // Don't attempt to reply to modal submits in error handler
      ) {
        await interaction.reply({
          content: 'An error occurred while processing your request.',
          ephemeral: true
        });
      } else if (
        interaction.isRepliable() && 
        (interaction.deferred && !interaction.replied)
      ) {
        // If interaction was deferred but not replied to yet
        await interaction.editReply({
          content: 'An error occurred while processing your request.'
        });
      }
    } catch (replyError) {
      console.error('Error sending error response:', replyError);
      // Don't attempt any further responses
    }
  }
});

// Start the bot
client.login(config.DISCORD_TOKEN); 