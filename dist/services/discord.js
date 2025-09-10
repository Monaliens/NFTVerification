"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordService = void 0;
exports.createDiscordService = createDiscordService;
const config_1 = require("../config/config");
const database_1 = require("./database");
const nft_1 = require("./nft");
class DiscordService {
    constructor(client) {
        this.client = client;
    }
    async getGuildMember(discordId) {
        try {
            const guild = await this.client.guilds.fetch(config_1.config.DISCORD_GUILD_ID);
            return await guild.members.fetch(discordId);
        }
        catch (error) {
            if (error && error.code === 10007) {
                console.log(`User with ID ${discordId} does not exist in the guild anymore.`);
            }
            else {
                console.error('Error fetching guild member:', error);
            }
            return null;
        }
    }
    async getRole(roleId) {
        try {
            const guild = await this.client.guilds.fetch(config_1.config.DISCORD_GUILD_ID);
            const role = await guild.roles.fetch(roleId);
            if (!role) {
                console.error(`Role not found with ID: ${roleId}`);
                const allRoles = await guild.roles.fetch();
                console.log('Available roles in server:');
                allRoles.forEach(r => {
                    if (r.name !== '@everyone') {
                        console.log(`  - ${r.name}: ${r.id}`);
                    }
                });
            }
            return role;
        }
        catch (error) {
            console.error('Error fetching role:', error);
            return null;
        }
    }
    async updateMemberRoles(discordId) {
        const member = await this.getGuildMember(discordId);
        if (!member)
            return;
        const verifiedRole = await this.getRole(config_1.config.VERIFIED_ROLE_ID);
        if (!verifiedRole) {
            console.error('Verified role not found');
            return;
        }
        const hasVerifiedWallet = await database_1.db.hasVerifiedWallet(discordId);
        const wallets = await database_1.db.getUserWallets(discordId);
        if (hasVerifiedWallet && !member.roles.cache.has(verifiedRole.id)) {
            await member.roles.add(verifiedRole);
        }
        const allEligibleTierRoles = new Set();
        for (const wallet of wallets.filter(w => w.isVerified)) {
            const tierRoles = await nft_1.nftService.getEligibleTierRoles(wallet.address);
            tierRoles.forEach(roleId => allEligibleTierRoles.add(roleId));
        }
        const allTierRoleIds = nft_1.nftService.getAllTierRoleIds();
        for (const roleId of allTierRoleIds) {
            const role = await this.getRole(roleId);
            if (!role) {
                console.error(`Tier role not found: ${roleId}`);
                continue;
            }
            const hasRole = member.roles.cache.has(roleId);
            const shouldHaveRole = hasVerifiedWallet && allEligibleTierRoles.has(roleId);
            if (shouldHaveRole && !hasRole) {
                console.log(`🎭 Added ${role.name} role`);
                await member.roles.add(role);
            }
            else if (!shouldHaveRole && hasRole) {
                console.log(`🗑️ Removed ${role.name} role`);
                await member.roles.remove(role);
            }
        }
    }
    async updateAllUsersRoles() {
        try {
            const users = await database_1.db.getAllUsers();
            let updatedCount = 0;
            let errorCount = 0;
            for (const user of users) {
                try {
                    await this.updateMemberRoles(user.discordId);
                    updatedCount++;
                }
                catch (error) {
                    errorCount++;
                    console.error(`❌ Error updating roles for user ${user.discordId}:`, error);
                }
            }
            const result = {
                totalUsers: users.length,
                updatedUsers: updatedCount,
                errors: errorCount
            };
            console.log(`🔄 Role update complete: ${updatedCount} users updated, ${errorCount} errors`);
            return result;
        }
        catch (error) {
            console.error('Error updating all users roles:', error);
            return { totalUsers: 0, updatedUsers: 0, errors: 1 };
        }
    }
    async updateNFTUsersRoles() {
        try {
            const verifiedUserCount = await database_1.db.getVerifiedUserCount();
            const nftStats = await database_1.db.getUsersWithNFTs();
            const usersWithNFTs = await database_1.db.getUsersWithNFTsForRoleUpdate();
            console.log(`📊 DATABASE STATS:`);
            console.log(`   👥 Total verified users: ${verifiedUserCount}`);
            console.log(`   🎨 Users with NFTs: ${nftStats.userCount}`);
            console.log(`   🔢 Total NFTs: ${nftStats.totalNFTs}`);
            console.log(`   🎯 Users to update: ${usersWithNFTs.length}`);
            console.log(`   ✅ Verified-only users preserved: ${verifiedUserCount - usersWithNFTs.length}`);
            let updatedCount = 0;
            let errorCount = 0;
            for (const user of usersWithNFTs) {
                try {
                    await this.updateMemberRoles(user.discordId);
                    updatedCount++;
                }
                catch (error) {
                    errorCount++;
                    console.error(`❌ Error updating roles for NFT user ${user.discordId}:`, error);
                }
            }
            const result = {
                totalUsers: usersWithNFTs.length,
                updatedUsers: updatedCount,
                errors: errorCount,
                skippedVerifiedOnly: verifiedUserCount - usersWithNFTs.length
            };
            console.log(`🎨 NFT role update complete: ${updatedCount} users updated, ${errorCount} errors`);
            console.log(`🛡️ Preserved ${result.skippedVerifiedOnly} verified-only users (no role changes)`);
            return result;
        }
        catch (error) {
            console.error('Error updating NFT users roles:', error);
            return { totalUsers: 0, updatedUsers: 0, errors: 1, skippedVerifiedOnly: 0 };
        }
    }
}
exports.DiscordService = DiscordService;
function createDiscordService(client) {
    return new DiscordService(client);
}
//# sourceMappingURL=discord.js.map