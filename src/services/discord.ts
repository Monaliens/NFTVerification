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
    const holderRole = await this.getRole(config.HOLDER_ROLE_ID);

    if (!verifiedRole || !holderRole) {
      console.error('Required roles not found');
      console.error(verifiedRole?.id, holderRole?.id);
      return;
    }

    const hasVerifiedWallet = await db.hasVerifiedWallet(discordId);
    const wallets = await db.getUserWallets(discordId);
    const isHolder = await Promise.any(
      wallets
        .filter(wallet => wallet.isVerified)
        .map(wallet => nftService.isHolder(wallet.address))
    ).catch(() => false);

    // Update roles
    if (hasVerifiedWallet) {
      if (!member.roles.cache.has(verifiedRole.id)) {
        await member.roles.add(verifiedRole);
      }
    } else {
      if (member.roles.cache.has(verifiedRole.id)) {
        await member.roles.remove(verifiedRole);
      }
    }

    // Update holder role
    if (hasVerifiedWallet && isHolder && !member.roles.cache.has(holderRole.id)) {
      await member.roles.add(holderRole);
    } else if ((!hasVerifiedWallet || !isHolder) && member.roles.cache.has(holderRole.id)) {
      await member.roles.remove(holderRole);
    }
  }

  async updateAllUsersRoles(): Promise<void> {
    try {
      console.log('Updating roles for all users...');
      const users = await db.getAllUsers();
      let updatedCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          await this.updateMemberRoles(user.discordId);
          updatedCount++;
          if (updatedCount % 100 === 0) {
            console.log(`Progress: ${updatedCount}/${users.length} users (${errorCount} errors)`);
          }
        } catch (error) {
          errorCount++;
          console.error(`Error updating roles for user ${user.discordId}:`, error);
        }
      }
      console.log(`Completed role updates: ${updatedCount} successful, ${errorCount} failed`);
    } catch (error) {
      console.error('Error updating all users roles:', error);
    }
  }
}

export function createDiscordService(client: Client): DiscordService {
  return new DiscordService(client);
} 