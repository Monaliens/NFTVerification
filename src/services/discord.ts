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
    } catch (error) {
      console.error('Error fetching guild member:', error);
      return null;
    }
  }

  private async getRole(roleId: string): Promise<Role | null> {
    try {
      const guild = await this.client.guilds.fetch(config.DISCORD_GUILD_ID);
      return await guild.roles.fetch(roleId);
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

    const hasVerifiedWallet = await db.hasVerifiedWallet(discordId);
    const wallets = await db.getUserWallets(discordId);

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

  async updateAllUsersRoles(): Promise<void> {
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
      console.log(`🔄 Role update complete: ${updatedCount} users updated, ${errorCount} errors`);
    } catch (error) {
      console.error('Error updating all users roles:', error);
    }
  }
}

export function createDiscordService(client: Client): DiscordService {
  return new DiscordService(client);
} 