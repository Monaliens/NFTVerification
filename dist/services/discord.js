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
            console.error('Error fetching guild member:', error);
            return null;
        }
    }
    async getRole(roleId) {
        try {
            const guild = await this.client.guilds.fetch(config_1.config.DISCORD_GUILD_ID);
            return await guild.roles.fetch(roleId);
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
        const allEligibleRoles = new Set();
        for (const wallet of wallets.filter(w => w.isVerified)) {
            const eligibleRoles = await nft_1.nftService.getEligibleRoles(wallet.address);
            eligibleRoles.forEach(roleId => allEligibleRoles.add(roleId));
        }
        const allCollectionRoleIds = config_1.config.NFT_COLLECTIONS.map(c => c.roleId);
        if (config_1.config.HOLDER_ROLE_ID) {
            allCollectionRoleIds.push(config_1.config.HOLDER_ROLE_ID);
            const isLegacyHolder = await Promise.any(wallets
                .filter(wallet => wallet.isVerified)
                .map(wallet => nft_1.nftService.isHolder(wallet.address))).catch(() => false);
            if (isLegacyHolder) {
                allEligibleRoles.add(config_1.config.HOLDER_ROLE_ID);
            }
        }
        for (const roleId of allCollectionRoleIds) {
            const role = await this.getRole(roleId);
            if (!role) {
                console.error(`Role not found: ${roleId}`);
                continue;
            }
            const hasRole = member.roles.cache.has(roleId);
            const shouldHaveRole = hasVerifiedWallet && allEligibleRoles.has(roleId);
            if (shouldHaveRole && !hasRole) {
                console.log(`Adding role ${role.name} to user ${discordId}`);
                await member.roles.add(role);
            }
            else if (!shouldHaveRole && hasRole) {
                console.log(`Removing role ${role.name} from user ${discordId}`);
                await member.roles.remove(role);
            }
        }
    }
    async updateAllUsersRoles() {
        try {
            console.log('Updating roles for all users...');
            const users = await database_1.db.getAllUsers();
            let updatedCount = 0;
            let errorCount = 0;
            for (const user of users) {
                try {
                    await this.updateMemberRoles(user.discordId);
                    updatedCount++;
                    if (updatedCount % 100 === 0) {
                        console.log(`Progress: ${updatedCount}/${users.length} users (${errorCount} errors)`);
                    }
                }
                catch (error) {
                    errorCount++;
                    console.error(`Error updating roles for user ${user.discordId}:`, error);
                }
            }
            console.log(`Completed role updates: ${updatedCount} successful, ${errorCount} failed`);
        }
        catch (error) {
            console.error('Error updating all users roles:', error);
        }
    }
}
exports.DiscordService = DiscordService;
function createDiscordService(client) {
    return new DiscordService(client);
}
//# sourceMappingURL=discord.js.map