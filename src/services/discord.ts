import { Client, GuildMember, Role } from 'discord.js';
import { config } from '@/config/config';
import { db } from './database';
import { nftService } from './nft';

export class DiscordService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  private async getGuildMember(discordId: string): Promise<GuildMember | null> {
    try {
      const guild = await this.client.guilds.fetch(config.DISCORD_GUILD_ID);
      return await guild.members.fetch(discordId);
    } catch (error: any) {
      // DiscordAPIError[10007]: Unknown Member
      if (error && error.code === 10007) {
        console.log(`User with ID ${discordId} does not exist in the guild anymore.`);
      } else {
        console.error('Error fetching guild member:', error);
      }
      return null;
    }
  }

  private async getRole(roleId: string): Promise<Role | null> {
    try {
      const guild = await this.client.guilds.fetch(config.DISCORD_GUILD_ID);
      const role = await guild.roles.fetch(roleId);
      if (!role) {
        console.error(`Role not found with ID: ${roleId}`);
        // Let's also list all available roles to debug
        const allRoles = await guild.roles.fetch();
        console.log('Available roles in server:');
        allRoles.forEach(r => {
          if (r.name !== '@everyone') {
            console.log(`  - ${r.name}: ${r.id}`);
          }
        });
      }
      return role;
    } catch (error) {
      console.error('Error fetching role:', error);
      return null;
    }
  }

  async updateMemberRoles(discordId: string): Promise<void> {
    const member = await this.getGuildMember(discordId);
    if (!member) return;

    const verifiedRole = await this.getRole(config.VERIFIED_ROLE_ID);
    if (!verifiedRole) {
      console.error('Verified role not found');
      return;
    }

    // Defensive sync: ensure user exists in DB if they already have the verified role
    // (e.g. role granted manually before bot introduced or transient DB issue earlier)
    let wallets = await db.getUserWallets(discordId);
    if (wallets.length === 0) {
      const hasRoleAlready = member.roles.cache.has(verifiedRole.id);
      if (hasRoleAlready) {
        console.log(`🛠️ Backfilling missing DB user for ${discordId} (has Verified role but no DB record)`);
        await db.ensureUser(discordId);
        wallets = await db.getUserWallets(discordId); // re-fetch after ensure
      }
    }

    const hasVerifiedWallet = await db.hasVerifiedWallet(discordId);

    // Update verified role - Only add, never remove
    if (hasVerifiedWallet && !member.roles.cache.has(verifiedRole.id)) {
      await member.roles.add(verifiedRole);
    }

    // Get eligible tier roles for all verified wallets
    const allEligibleTierRoles = new Set<string>();
    
    for (const wallet of wallets.filter(w => w.isVerified)) {
      const tierRoles = await nftService.getEligibleTierRoles(wallet.address);
      tierRoles.forEach(roleId => allEligibleTierRoles.add(roleId));
    }

    // Get all tier role IDs to manage
    const allTierRoleIds = nftService.getAllTierRoleIds();

    // Update tier-based roles
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
      } else if (!shouldHaveRole && hasRole) {
        console.log(`🗑️ Removed ${role.name} role`);
        await member.roles.remove(role);
      }
    }
  }

  async updateAllUsersRoles(): Promise<{ totalUsers: number; updatedUsers: number; errors: number }> {
    try {
      const users = await db.getAllUsers();
      let updatedCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          await this.updateMemberRoles(user.discordId);
          updatedCount++;
        } catch (error) {
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
    } catch (error) {
      console.error('Error updating all users roles:', error);
      return { totalUsers: 0, updatedUsers: 0, errors: 1 };
    }
  }

  // NEW: Update only users with NFTs (preserves verified-only users)
  async updateNFTUsersRoles(): Promise<{ totalUsers: number; updatedUsers: number; errors: number; skippedVerifiedOnly: number }> {
    try {
      // Get statistics for logging
      const verifiedUserCount = await db.getVerifiedUserCount();
      const nftStats = await db.getUsersWithNFTs();
      const usersWithNFTs = await db.getUsersWithNFTsForRoleUpdate();
      
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
        } catch (error) {
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
    } catch (error) {
      console.error('Error updating NFT users roles:', error);
      return { totalUsers: 0, updatedUsers: 0, errors: 1, skippedVerifiedOnly: 0 };
    }
  }
}

export function createDiscordService(client: Client): DiscordService {
  return new DiscordService(client);
} 