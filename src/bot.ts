import "./register";
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
  InteractionEditReplyOptions,
} from "discord.js";
import { config } from "@/config/config";
import { db } from "@/services/database";
import { nftService } from "@/services/nft";
import { createDiscordService } from "@/services/discord";

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
    .setColor("#0099ff")
    .setTitle("🔐 Wallet Verification System")
    .setDescription(
      "Welcome to the Lil Monaliens community! To access exclusive holder channels and benefits, please verify your wallet ownership.",
    )
    .addFields(
      {
        name: "📝 How to Verify",
        value:
          "1. Click `Link Your Wallet` and enter your wallet address\n" +
          "2. Send the exact amount of $MON shown to you back to your own wallet\n" +
          "3. Wait for automatic verification or click `Check Payment`",
      },
      {
        name: "🎭 NFT Roles",
        value:
          "After verification, use `Update Holdings` to receive your NFT holder roles automatically.",
      },
      {
        name: "💡 Tips",
        value:
          "• You can link multiple wallets\n" +
          "• Use `Show Linked Wallets` to manage your wallets\n" +
          "• Roles are updated automatically every 10 minutes",
      },
    )
    .setTimestamp()
    .setFooter({
      text: "Lil Monaliens | Secure Wallet Verification",
      iconURL: "https://i.imgur.com/V69kAXL.png", // Buraya Lil Monaliens logosu gelecek
    });

  const linkWalletButton = new ButtonBuilder()
    .setCustomId("add_wallet")
    .setLabel("Link Your Wallet")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("🔗");

  const updateHoldingsButton = new ButtonBuilder()
    .setCustomId("update_holdings")
    .setLabel("Update Holdings")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("🔄");

  const showWalletsButton = new ButtonBuilder()
    .setCustomId("list_wallets")
    .setLabel("Show Linked Wallets")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("📋");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    linkWalletButton,
    updateHoldingsButton,
    showWalletsButton,
  );

  return { embeds: [embed], components: [row] };
};

const createWalletListEmbed = async (wallets: any[]) => {
  const embed = new EmbedBuilder()
    .setColor("#0099ff")
    .setTitle("Your Linked Wallets")
    .setDescription(
      wallets.length
        ? "Select a wallet to perform actions:"
        : "You have no wallets linked yet.",
    );

  if (wallets.length > 0) {
    const walletList = wallets.map((w, index) => {
      const verifiedStatus = w.isVerified ? "✅" : "❌";
      const nftCount = w.tokenCount ? ` | ${w.tokenCount} NFTs` : "";
      return {
        name: `Wallet #${index + 1} ${verifiedStatus}`,
        value: `\`${w.address}\`${nftCount}`,
        inline: false,
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
      .setCustomId("add_wallet")
      .setLabel("Add New Wallet")
      .setStyle(ButtonStyle.Success),
  );

  if (wallets.length > 0) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("select_wallet")
        .setLabel("Delete Wallet")
        .setStyle(ButtonStyle.Danger),
    );
  }

  return row;
};

const sendVerificationInstructions = async (
  interaction: ModalSubmitInteraction,
  address: string,
) => {
  const verificationAmount = await nftService.getVerificationAmount(address);
  const amountInMON = (Number(verificationAmount) / 1e18).toFixed(5);

  const embed = new EmbedBuilder()
    .setColor("#0099ff")
    .setTitle("Wallet Registration Successful")
    .setDescription(
      "To complete verification, please send the exact amount shown below from your registered wallet back to the same wallet (self-transfer):",
    )
    .addFields(
      { name: "From & To", value: `Your wallet: \`${address}\`` },
      { name: "Amount", value: `${amountInMON} $MON (exactly)` },
      {
        name: "Important",
        value:
          "The transfer must be exact and must be sent from and to the same wallet!",
      },
      {
        name: "Note",
        value:
          "Payment will be checked automatically in 1 minute, or you can click Check Payment button to verify immediately.",
      },
    )
    .setTimestamp();

  const checkButton = new ButtonBuilder()
    .setCustomId(`check_payment_${address}`)
    .setLabel("Check Payment")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(checkButton);

  await interaction.editReply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  } as InteractionEditReplyOptions);

  // No longer deleting this verification message to keep it persistent
  // Verification instructions should remain visible to users

  // Start continuous payment monitoring (60s duration, 2s intervals)
  nftService.startPaymentMonitoring(address, async () => {
    try {
      // Verify the wallet and update roles
      await db.verifyWallet(address);
      await discordService.updateMemberRoles(interaction.user.id);

      const successEmbed = new EmbedBuilder()
        .setColor("#00ff00")
        .setTitle("Verification Complete")
        .setDescription("✅ Your wallet has been verified successfully!")
        .setTimestamp();

      // Update the original verification message with success
      if (interaction.isRepliable()) {
        await interaction.editReply({
          embeds: [successEmbed],
          components: [],
          ephemeral: true,
        } as InteractionEditReplyOptions);

        // Delete success message after 2 minutes
        setTimeout(async () => {
          try {
            if (interaction.isRepliable()) {
              await interaction.deleteReply().catch(() => {
                // Ignore errors if message is already deleted
              });
            }
          } catch (error) {
            console.error("Error deleting success message:", error);
          }
        }, 120000); // 2 minutes
      }
    } catch (error) {
      console.error("Error in automatic payment verification:", error);
    }
  });
};

// Event handlers
client.on("ready", async () => {
  console.log(`🚀 ${client.user?.tag} is online!`);

  try {
    const guild = await client.guilds.fetch(config.DISCORD_GUILD_ID);
    const channel = (await guild.channels.fetch(
      config.WELCOME_CHANNEL_ID,
    )) as TextChannel;

    const messages = await channel.messages.fetch({ limit: 100 });

    // Delete messages that are less than 14 days old
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const messagesToDelete = messages.filter(
      (msg) => msg.createdTimestamp > twoWeeksAgo,
    );

    if (messagesToDelete.size > 0) {
      await channel.bulkDelete(messagesToDelete);
    }

    const message = await channel.send(createVerificationMessage());
    await message.pin();
    console.log("📢 Verification system ready!");

    // 🔄 AUTOMATIC NFT ROLE UPDATE SYSTEM (NFT HOLDERS ONLY)
    // Start periodic holder updates every 10 minutes for users with NFTs only
    const NFT_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes

    const periodicNFTUpdate = async () => {
      try {
        console.log("\n" + "=".repeat(50));
        console.log("⏰ PERIODIC NFT ROLE UPDATE STARTED (NFT HOLDERS ONLY)");
        console.log(`📅 Time: ${new Date().toISOString()}`);
        console.log("=".repeat(50));

        // Step 1: Update NFT holders cache with retry
        console.log("🔄 Step 1: Updating NFT holders cache...");
        let holdersUpdated = await nftService.updateHoldersCache();

        // Retry once if failed on first attempt
        if (!holdersUpdated) {
          console.log("⚠️ First attempt failed, retrying in 5 seconds...");
          await new Promise((resolve) => setTimeout(resolve, 5000));
          holdersUpdated = await nftService.updateHoldersCache();
        }

        if (holdersUpdated) {
          console.log("✅ NFT holders cache updated successfully");
        } else {
          console.log(
            "⚠️ NFT holders cache update failed after retry, proceeding with existing cache",
          );
        }

        // Step 2: Update Discord roles regardless of cache update success
        console.log("� Step 2: Updating Discord roles for NFT holders...");
        const roleUpdateResult = await discordService.updateNFTUsersRoles();

        console.log("📊 NFT Role update summary:");
        console.log(
          `   - NFT users processed: ${roleUpdateResult?.totalUsers || "N/A"}`,
        );
        console.log(
          `   - Roles updated: ${roleUpdateResult?.updatedUsers || "N/A"}`,
        );
        console.log(`   - Errors: ${roleUpdateResult?.errors || 0}`);
        console.log(
          `   - Verified-only users preserved: ${roleUpdateResult?.skippedVerifiedOnly || 0}`,
        );

        console.log("✅ PERIODIC NFT ROLE UPDATE COMPLETED");
        console.log("=".repeat(50) + "\n");
      } catch (error) {
        console.error("❌ Error in periodic NFT update:", error);
      }
    };

    // Run initial update
    console.log("🚀 Running initial NFT role update...");
    await periodicNFTUpdate();

    // Set up interval for periodic updates
    setInterval(periodicNFTUpdate, NFT_CHECK_INTERVAL);
    console.log(
      `⏱️ Automatic NFT role updates scheduled every ${NFT_CHECK_INTERVAL / 1000 / 60} minutes`,
    );

    // Do initial role update (legacy code for compatibility)
    console.log("🔄 Running legacy role update...");
    const legacyResult = await discordService.updateAllUsersRoles();
    console.log(
      `📊 Legacy update: ${legacyResult.updatedUsers}/${legacyResult.totalUsers} users processed`,
    );
  } catch (error) {
    console.error("Error setting up bot:", error);
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        guildId: config.DISCORD_GUILD_ID,
        channelId: config.WELCOME_CHANNEL_ID,
      });
    }
  }
});

// Track ongoing interactions to prevent duplicates
const ongoingInteractions = new Set<string>();

// Button and Modal interaction handlers
client.on("interactionCreate", async (interaction) => {
  // Create unique interaction ID
  const interactionId = `${interaction.id}-${interaction.user.id}`;

  // Check if this interaction is already being processed
  if (ongoingInteractions.has(interactionId)) {
    console.log("Duplicate interaction detected, ignoring");
    return;
  }

  // Add to ongoing interactions
  ongoingInteractions.add(interactionId);

  try {
    if (interaction.isButton()) {
      const buttonInteraction = interaction as ButtonInteraction;

      // Check if interaction is already handled by Discord
      if (buttonInteraction.replied || buttonInteraction.deferred) {
        console.log("Interaction already handled by Discord, skipping");
        ongoingInteractions.delete(interactionId);
        return;
      }

      switch (buttonInteraction.customId) {
        case "add_wallet": {
          try {
            // Check if interaction is still valid before showing modal
            if (buttonInteraction.replied || buttonInteraction.deferred) {
              console.log("Cannot show modal - interaction already handled");
              ongoingInteractions.delete(interactionId);
              return;
            }

            // Create the modal
            const modal = new ModalBuilder()
              .setCustomId("wallet_input")
              .setTitle("Link Your Wallet");

            // Add input field for wallet address
            const walletInput = new TextInputBuilder()
              .setCustomId("wallet_address")
              .setLabel("Enter your wallet address")
              .setPlaceholder("0x...")
              .setStyle(TextInputStyle.Short)
              .setMinLength(42)
              .setMaxLength(42)
              .setRequired(true);

            const firstActionRow =
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                walletInput,
              );

            modal.addComponents(firstActionRow);

            await buttonInteraction.showModal(modal);
          } catch (error: any) {
            console.error("Error showing wallet modal:", error);
            ongoingInteractions.delete(interactionId);
            // Don't try to reply after modal error - interaction is consumed
          }
          break;
        }
        case "update_holdings": {
          // Pre-check if interaction is still valid
          if (buttonInteraction.replied || buttonInteraction.deferred) {
            console.log(
              "Update holdings interaction already handled, skipping",
            );
            ongoingInteractions.delete(interactionId);
            return;
          }

          try {
            await buttonInteraction.deferReply({ ephemeral: true });
          } catch (error: any) {
            console.error(
              "Failed to defer update_holdings reply:",
              error.message,
              error.code,
            );
            if (error.code === 40060 || error.code === 10062) {
              console.log(
                "Interaction already acknowledged or unknown, skipping",
              );
            }
            ongoingInteractions.delete(interactionId);
            return;
          }

          try {
            // Update user roles
            await discordService.updateMemberRoles(buttonInteraction.user.id);

            // Get user's verified wallets and NFT information
            const userWallets = await db.getWallets(buttonInteraction.user.id);
            const verifiedWallets = userWallets.filter((w) => w.isVerified);

            let totalNFTs = 0;
            let walletInfos = [];

            for (const wallet of verifiedWallets) {
              const tokenCount = await nftService.getTokenCount(wallet.address);
              const isHolder = await nftService.isHolder(wallet.address);
              totalNFTs += tokenCount;

              walletInfos.push({
                address: wallet.address,
                nfts: tokenCount,
                isHolder,
              });
            }

            // Determine highest tier
            let tierInfo = "";
            if (totalNFTs >= 50) tierInfo = "👑 **VIP Tier** (50+ NFTs)";
            else if (totalNFTs >= 10)
              tierInfo = "💎 **Diamond Tier** (10+ NFTs)";
            else if (totalNFTs >= 5) tierInfo = "🥇 **Gold Tier** (5+ NFTs)";
            else if (totalNFTs >= 3) tierInfo = "🥈 **Silver Tier** (3+ NFTs)";
            else if (totalNFTs >= 1) tierInfo = "🥉 **Bronze Tier** (1+ NFTs)";
            else tierInfo = "❌ **No NFT Tier** (0 NFTs)";

            if (walletInfos.length > 0) {
              // Wallet information for detailed display
            }

            const embedColor = totalNFTs > 0 ? 0x00ff00 : 0xffaa00;

            const embed = new EmbedBuilder()
              .setColor(embedColor)
              .setTitle("🔄 Holdings Updated")
              .setDescription(
                `Your roles have been updated based on current NFT holdings.\n\n` +
                  `🎨 **Total NFTs:** ${totalNFTs}\n` +
                  `🎭 **Current Tier:** ${tierInfo}` +
                  (walletInfos.length > 0
                    ? `\n\n**Verified Wallets:**\n${walletInfos.map((info, index) => `**${index + 1}.** \`${info.address.substring(0, 6)}...${info.address.substring(38)}\` - ${info.nfts} NFT${info.nfts !== 1 ? "s" : ""}`).join("\n")}`
                    : ""),
              )
              .addFields(
                { name: "📊 Total NFTs", value: `${totalNFTs}`, inline: true },
                {
                  name: "Verified Wallets",
                  value: `${verifiedWallets.length}`,
                  inline: true,
                },
              )
              .setTimestamp();

            if (buttonInteraction.isRepliable() && !buttonInteraction.replied) {
              await buttonInteraction.editReply({
                embeds: [embed],
              });
            }
          } catch (error) {
            console.error("Error updating holdings:", error);
            if (buttonInteraction.isRepliable() && !buttonInteraction.replied) {
              await buttonInteraction.editReply({
                content: "An error occurred while updating your holdings.",
              });
            }
          }
          break;
        }

        case "list_wallets": {
          // Pre-check if interaction is still valid
          if (buttonInteraction.replied || buttonInteraction.deferred) {
            console.log("List wallets interaction already handled, skipping");
            ongoingInteractions.delete(interactionId);
            return;
          }

          try {
            await buttonInteraction.deferReply({ ephemeral: true });
          } catch (error: any) {
            console.error(
              "Failed to defer list_wallets reply:",
              error.message,
              error.code,
            );
            if (error.code === 40060 || error.code === 10062) {
              console.log(
                "Interaction already acknowledged or unknown, skipping",
              );
            }
            ongoingInteractions.delete(interactionId);
            return;
          }

          try {
            const wallets = await db.getWallets(buttonInteraction.user.id);
            const embed = await createWalletListEmbed(wallets);
            const row = createWalletActionRow(wallets);

            // Check if the interaction is still valid before replying
            if (buttonInteraction.isRepliable() && !buttonInteraction.replied) {
              await buttonInteraction.editReply({
                embeds: [embed],
                components: [row],
              });

              // Delete message after 60 seconds
              setTimeout(async () => {
                try {
                  // Double-check if the interaction is still repliable before attempting to delete
                  if (buttonInteraction.isRepliable()) {
                    await buttonInteraction.deleteReply().catch((err) => {
                      console.error(
                        "Failed to delete reply (likely expired):",
                        err.code,
                      );
                    });
                  }
                } catch (error) {
                  console.error("Error deleting wallet list message:", error);
                }
              }, 60000); // 60 seconds
            }
          } catch (error) {
            console.error("Error listing wallets:", error);

            // Only try to edit the reply if the interaction is still valid
            if (buttonInteraction.isRepliable() && !buttonInteraction.replied) {
              await buttonInteraction
                .editReply({
                  content:
                    "An error occurred while fetching your wallets. Please try again.",
                })
                .catch((err) => {
                  console.error("Failed to send error message:", err.code);
                });
            }
          }
          break;
        }

        case "select_wallet": {
          // Pre-check if interaction is still valid
          if (buttonInteraction.replied || buttonInteraction.deferred) {
            console.log("Select wallet interaction already handled, skipping");
            ongoingInteractions.delete(interactionId);
            return;
          }

          try {
            const wallets = await db.getUserWallets(buttonInteraction.user.id);

            const modal = new ModalBuilder()
              .setCustomId("wallet_selection")
              .setTitle("Delete Wallet");

            const walletSelect = new TextInputBuilder()
              .setCustomId("wallet_number")
              .setLabel("Enter wallet number to delete")
              .setStyle(TextInputStyle.Short)
              .setMinLength(1)
              .setMaxLength(1)
              .setPlaceholder("Enter a number between 1 and " + wallets.length)
              .setRequired(true);

            const firstActionRow =
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                walletSelect,
              );

            modal.addComponents(firstActionRow);
            await buttonInteraction.showModal(modal);
          } catch (error: any) {
            console.error("Error showing wallet selection modal:", error);
            ongoingInteractions.delete(interactionId);
            // Don't try to reply after modal error - interaction is consumed
          }
          break;
        }

        default:
          if (buttonInteraction.customId.startsWith("check_payment_")) {
            // Strong duplicate prevention
            if (buttonInteraction.replied || buttonInteraction.deferred) {
              console.log(
                "Check payment interaction already handled, skipping",
              );
              ongoingInteractions.delete(interactionId);
              return;
            }

            try {
              // Defer reply with additional error handling
              try {
                await buttonInteraction.deferReply({ ephemeral: true });
              } catch (deferError: any) {
                if (deferError.code === 40060 || deferError.code === 10062) {
                  console.log(
                    "Interaction already acknowledged or unknown, skipping",
                  );
                  ongoingInteractions.delete(interactionId);
                  return;
                }
                throw deferError;
              }

              const address = buttonInteraction.customId.split("_")[2];
              console.log(`🔍 Checking payment for address: ${address}`);

              // Additional safety check
              if (!buttonInteraction.deferred && !buttonInteraction.replied) {
                console.log("Interaction not properly deferred, aborting");
                return;
              }

              // Check if payment was received for this specific address
              const hasReceived = await nftService.hasReceivedPayment(address);

              // Comprehensive validity check before proceeding
              if (
                !buttonInteraction.isRepliable() ||
                buttonInteraction.replied ||
                !buttonInteraction.deferred
              ) {
                console.log(
                  "Interaction no longer valid after payment check, aborting",
                );
                return;
              }

              if (hasReceived) {
                // Check if this specific wallet is already verified
                const isWalletAlreadyVerified =
                  await db.isWalletVerified(address);

                if (isWalletAlreadyVerified) {
                  const alreadyVerifiedEmbed = new EmbedBuilder()
                    .setColor("#00ff00")
                    .setTitle("Already Verified")
                    .setDescription("✅ This wallet is already verified!")
                    .setTimestamp();

                  await buttonInteraction.editReply({
                    embeds: [alreadyVerifiedEmbed],
                    components: [],
                  });
                  return;
                }

                // Verify the wallet and update roles
                await db.verifyWallet(address);
                await discordService.updateMemberRoles(
                  buttonInteraction.user.id,
                );

                const successEmbed = new EmbedBuilder()
                  .setColor("#00ff00")
                  .setTitle("Verification Complete")
                  .setDescription(
                    "✅ Your wallet has been verified successfully!",
                  )
                  .setTimestamp();

                await buttonInteraction
                  .editReply({
                    embeds: [successEmbed],
                    components: [],
                    ephemeral: true,
                  } as InteractionEditReplyOptions)
                  .catch((err) => {
                    console.error("Failed to send success message:", err.code);
                  });

                // Delete success message after 2 minutes
                setTimeout(async () => {
                  try {
                    if (buttonInteraction.isRepliable()) {
                      await buttonInteraction.deleteReply().catch((err) => {
                        console.error(
                          "Failed to delete success message (likely expired):",
                          err.code,
                        );
                      });
                    }
                  } catch (error) {
                    console.error("Error deleting success message:", error);
                  }
                }, 120000); // 2 minutes
              } else {
                // Payment not received - show status with NFT check
                const verificationAmount =
                  await nftService.getVerificationAmount(address);
                const amountInMON = (Number(verificationAmount) / 1e18).toFixed(
                  5,
                );
                const isHolder = await nftService.isHolder(address);
                const tokenCount = await nftService.getTokenCount(address);

                let nftPreviewMessage = "";
                let embedColor: number = 0xff9900; // Default orange

                if (isHolder && tokenCount > 0) {
                  nftPreviewMessage = `\n\n🎨 **Preview - Your NFT Holdings:**\n✅ ${tokenCount} Lil Monalien NFT${tokenCount > 1 ? "s" : ""} detected!\n💎 You'll receive tier-based roles after verification.`;
                  embedColor = 0xffaa00; // Lighter orange for NFT holders
                } else {
                  nftPreviewMessage = `\n\n🎨 **NFT Holdings Check:**\n❌ No Lil Monalien NFTs found in this wallet.\n💡 You can still verify to access holder channels.`;
                }

                const pendingEmbed = new EmbedBuilder()
                  .setColor(embedColor)
                  .setTitle("Payment Not Found")
                  .setDescription(
                    "❌ Payment not found yet. Please make sure you:\n" +
                      `1. Sent exactly ${amountInMON} $MON\n` +
                      "2. Sent from your registered wallet\n" +
                      "3. Sent it back to the same wallet (self-transfer)" +
                      nftPreviewMessage,
                  )
                  .addFields(
                    {
                      name: "🔗 Wallet Address",
                      value: `\`${address}\``,
                      inline: false,
                    },
                    {
                      name: "💰 Required Amount",
                      value: `${amountInMON} MON`,
                      inline: true,
                    },
                    {
                      name: "📊 NFTs Found",
                      value: `${tokenCount}`,
                      inline: true,
                    },
                    {
                      name: "🎯 Status",
                      value: isHolder
                        ? "NFT Holder (Pending Verification)"
                        : "No NFTs (Can Still Verify)",
                      inline: true,
                    },
                  )
                  .setTimestamp();

                const checkButton = new ButtonBuilder()
                  .setCustomId(`check_payment_${address}`)
                  .setLabel("Check Again")
                  .setStyle(ButtonStyle.Primary);

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                  checkButton,
                );

                await buttonInteraction
                  .editReply({
                    embeds: [pendingEmbed],
                    components: [row],
                    ephemeral: true,
                  } as InteractionEditReplyOptions)
                  .catch((err) => {
                    console.error("Failed to send pending message:", err.code);
                  });

                // Delete error message after 2 minutes
                setTimeout(async () => {
                  try {
                    if (buttonInteraction.isRepliable()) {
                      await buttonInteraction.deleteReply().catch((err) => {
                        console.error(
                          "Failed to delete error message (likely expired):",
                          err.code,
                        );
                      });
                    }
                  } catch (error) {
                    console.error("Error deleting error message:", error);
                  }
                }, 120000); // 2 minutes
              }
            } catch (error: any) {
              console.error("Error in check_payment handler:", error);

              // Smart error response handling
              try {
                if (error.code === 40060 || error.code === 10062) {
                  // Interaction already acknowledged or unknown - just log and continue
                  console.log(
                    "Interaction already handled or expired, skipping error response",
                  );
                  return;
                }

                // Only try to edit reply if the interaction is properly deferred
                if (buttonInteraction.deferred && !buttonInteraction.replied) {
                  await buttonInteraction.editReply({
                    content:
                      "An error occurred while processing your payment verification. Please try again.",
                    components: [],
                  });
                } else if (
                  !buttonInteraction.replied &&
                  !buttonInteraction.deferred
                ) {
                  // Try to reply if we haven't done anything yet
                  await buttonInteraction.reply({
                    content: "An error occurred while processing your request.",
                    ephemeral: true,
                  });
                }
              } catch (editError: any) {
                console.error(
                  "Failed to send check_payment error message:",
                  editError.code || editError.message,
                );
              }
            }
          }

          if (buttonInteraction.customId.startsWith("delete_")) {
            // Check if already handled
            if (buttonInteraction.replied || buttonInteraction.deferred) {
              console.log(
                "Delete wallet interaction already handled, skipping",
              );
              ongoingInteractions.delete(interactionId);
              return;
            }

            const address = buttonInteraction.customId.replace("delete_", "");

            try {
              await buttonInteraction.deferReply({ ephemeral: true });
            } catch (deferError: any) {
              if (deferError.code === 40060 || deferError.code === 10062) {
                console.log(
                  "Delete interaction already acknowledged or unknown, skipping",
                );
                ongoingInteractions.delete(interactionId);
                return;
              }
              throw deferError;
            }

            try {
              // Additional validity check after defer
              if (
                !buttonInteraction.isRepliable() ||
                buttonInteraction.replied
              ) {
                console.log(
                  "Interaction invalid after defer, aborting wallet deletion",
                );
                return;
              }

              await db.deleteWallet(buttonInteraction.user.id, address);

              // Update roles after wallet deletion
              await discordService.updateMemberRoles(buttonInteraction.user.id);

              await buttonInteraction.editReply({
                content: `Wallet \`${address}\` has been removed. Your roles have been updated.`,
              });
            } catch (error) {
              console.error("Error deleting wallet:", error);

              // Only edit if interaction is still valid
              if (
                buttonInteraction.isRepliable() &&
                buttonInteraction.deferred &&
                !buttonInteraction.replied
              ) {
                try {
                  await buttonInteraction.editReply({
                    content: "An error occurred while removing the wallet.",
                  });
                } catch (editError) {
                  console.error(
                    "Failed to send delete wallet error message:",
                    editError.code || editError.message,
                  );
                }
              }
            }
          }
          break;
      } // Switch statement kapanışı

      // Remove from ongoing interactions after processing
      ongoingInteractions.delete(interactionId);
    } else if (interaction.isModalSubmit()) {
      // Check if modal interaction is already handled
      if (interaction.replied || interaction.deferred) {
        console.log("Modal interaction already handled by Discord, skipping");
        ongoingInteractions.delete(interactionId);
        return;
      }

      if (interaction.customId === "wallet_selection") {
        try {
          await interaction.deferReply({ ephemeral: true });
        } catch (error: any) {
          console.error(
            "Failed to defer modal reply:",
            error.message,
            error.code,
          );
          if (error.code === 40060 || error.code === 10062) {
            console.log(
              "Interaction already acknowledged or unknown, skipping",
            );
          }
          ongoingInteractions.delete(interactionId);
          return;
        }

        try {
          const walletNumber = parseInt(
            interaction.fields.getTextInputValue("wallet_number"),
          );
          const wallets = await db.getWallets(interaction.user.id);

          if (walletNumber < 1 || walletNumber > wallets.length) {
            if (interaction.isRepliable() && !interaction.replied) {
              await interaction.editReply({
                content: `❌ Invalid wallet number. Please choose between 1 and ${wallets.length}.`,
              });

              // Delete message after 60 seconds
              setTimeout(async () => {
                try {
                  if (interaction.isRepliable()) {
                    await interaction.deleteReply();
                  }
                } catch (error) {
                  console.error(
                    "Error deleting invalid wallet number message:",
                    error,
                  );
                }
              }, 60000); // 60 seconds
            }
            return;
          }

          const selectedWallet = wallets[walletNumber - 1];

          await db.deleteWallet(interaction.user.id, selectedWallet.address);
          await discordService.updateMemberRoles(interaction.user.id);

          if (interaction.isRepliable() && !interaction.replied) {
            await interaction.editReply({
              content: `✅ Wallet \`${selectedWallet.address}\` has been removed.`,
            });

            // Delete message after 60 seconds
            setTimeout(async () => {
              try {
                if (interaction.isRepliable()) {
                  await interaction.deleteReply();
                }
              } catch (error) {
                console.error("Error deleting wallet removed message:", error);
              }
            }, 60000); // 60 seconds
          }
        } catch (error) {
          console.error("Error handling wallet selection:", error);
          if (interaction.isRepliable() && !interaction.replied) {
            try {
              await interaction.editReply({
                content:
                  "An error occurred while processing your request. Please try again.",
              });
            } catch (editError) {
              console.error(
                "Failed to send wallet selection error message:",
                editError.code,
              );
            }
          }
        }
      } else if (interaction.customId === "wallet_input") {
        // Defer the reply immediately to prevent timeout
        try {
          await interaction.deferReply({ ephemeral: true });
        } catch (error: any) {
          console.error(
            "Failed to defer wallet input reply:",
            error.message,
            error.code,
          );
          if (error.code === 40060 || error.code === 10062) {
            console.log(
              "Interaction already acknowledged or unknown, skipping",
            );
          }
          ongoingInteractions.delete(interactionId);
          return;
        }

        try {
          const address =
            interaction.fields.getTextInputValue("wallet_address");

          // Validate address format
          if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            if (interaction.isRepliable() && !interaction.replied) {
              await interaction.editReply({
                content:
                  '❌ Invalid wallet address format. Please make sure your address starts with "0x" and is 42 characters long.',
              });
            }
            return;
          }

          // Add wallet to user with new error handling
          const result = await db.addWallet(interaction.user.id, address);

          if (!result.success) {
            if (interaction.isRepliable() && !interaction.replied) {
              await interaction.editReply({
                content: `❌ ${result.error}`,
              });
            }
            return;
          }

          await sendVerificationInstructions(interaction, address);
        } catch (error) {
          console.error("Error processing wallet submission:", error);
          if (interaction.isRepliable() && !interaction.replied) {
            try {
              await interaction.editReply({
                content:
                  "❌ An error occurred while processing your request. Please try again later.",
              });
            } catch (editError) {
              console.error(
                "Failed to send wallet submission error message:",
                editError.code,
              );
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error handling interaction:", error);

    // Try to respond to the error appropriately
    try {
      if (interaction.isModalSubmit()) {
        // For modal submits, we need to defer first
        if (!interaction.replied && !interaction.deferred) {
          await interaction.deferReply({ ephemeral: true });
          await interaction.editReply({
            content: "❌ An error occurred while processing your request.",
          });
        }
      } else if (interaction.isButton()) {
        // For button interactions, reply directly
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ An error occurred while processing your request.",
            ephemeral: true,
          });
        }
      }
    } catch (replyError) {
      console.error(
        "Could not send error response:",
        replyError?.code || replyError,
      );
    }
  } finally {
    // Cleanup: Remove from ongoing interactions
    ongoingInteractions.delete(interactionId);
  }
});

// Message command handler for admin commands
client.on("messageCreate", async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check for admin verification command
  const adminVerifyPattern = /^!verify\s+(0x[a-fA-F0-9]{40})\s+(\w+)$/;
  const match = message.content.match(adminVerifyPattern);

  if (match) {
    const [, address, adminKey] = match;

    try {
      // Verify admin key and process manual verification
      const isValidated = await nftService.manualVerifyPayment(
        address,
        adminKey,
      );

      if (isValidated) {
        await db.verifyWallet(address.toLowerCase());
        await discordService.updateMemberRoles(message.author.id);

        await message.reply({
          content: `✅ Wallet \`${address}\` has been manually verified by admin.`,
          allowedMentions: { repliedUser: false },
        });
      } else {
        await message.reply({
          content: `❌ Invalid admin key or verification failed.`,
          allowedMentions: { repliedUser: false },
        });
      }
    } catch (error) {
      console.error("Error in admin verify command:", error);
      await message.reply({
        content: `❌ An error occurred during admin verification.`,
        allowedMentions: { repliedUser: false },
      });
    }
  }
});

// Start the bot
console.log(
  "Starting bot with token:",
  config.DISCORD_TOKEN.substring(0, 50) + "...",
);
console.log("Client ID:", config.DISCORD_CLIENT_ID);
console.log("Guild ID:", config.DISCORD_GUILD_ID);

client.login(config.DISCORD_TOKEN);
