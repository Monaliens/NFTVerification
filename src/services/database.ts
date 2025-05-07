import { PrismaClient } from '@prisma/client';


interface HolderData {
  address: string;
  tokenCount: number;
}

class DatabaseService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  // User Operations
  async createUser(discordId: string) {
    return this.prisma.user.create({
      data: { discordId },
      include: { wallets: true }
    });
  }

  async getUser(discordId: string) {
    return this.prisma.user.findUnique({
      where: { discordId },
      include: { wallets: true }
    });
  }

  async getAllUsers() {
    return this.prisma.user.findMany({
      include: { wallets: true }
    });
  }

  // Wallet Operations
  async getWalletStatus(address: string): Promise<{ exists: boolean; isVerified: boolean; ownerId: string | null }> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { address: address.toLowerCase() },
      include: { user: true }
    });

    if (!wallet) {
      return { exists: false, isVerified: false, ownerId: null };
    }

    return {
      exists: true,
      isVerified: wallet.isVerified,
      ownerId: wallet.user.discordId
    };
  } 

  async forceDeleteWallet(address: string): Promise<void> {
    await this.prisma.wallet.deleteMany({
      where: { address: address.toLowerCase() }
    });
  }

  async addWallet(discordId: string, address: string): Promise<{ success: boolean; error?: string }> {
    const normalizedAddress = address.toLowerCase();

    try {
      // Check wallet status
      const status = await this.getWalletStatus(normalizedAddress);

      // If wallet exists and is verified by another user
      if (status.exists && status.isVerified && status.ownerId !== discordId) {
        return {
          success: false,
          error: 'This wallet is already verified by another user.'
        };
      }

      // If wallet exists but is not verified (regardless of owner)
      if (status.exists && !status.isVerified) {
        // Delete the existing unverified wallet
        await this.forceDeleteWallet(normalizedAddress);
      }

      // Ensure user exists
      let user = await this.prisma.user.findUnique({
        where: { discordId }
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: { discordId }
        });
      }

      // Create new wallet
      await this.prisma.wallet.create({
        data: {
          address: normalizedAddress,
          isVerified: false,
          userId: user.id
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Error in addWallet:', error);
      return {
        success: false,
        error: 'An error occurred while processing the wallet.'
      };
    }
  }

  async verifyWallet(address: string): Promise<void> {
    const normalizedAddress = address.toLowerCase();
    
    const wallet = await this.prisma.wallet.findUnique({
      where: { address: normalizedAddress }
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    await this.prisma.wallet.update({
      where: { address: normalizedAddress },
      data: { isVerified: true }
    });
  }

  async getUserWallets(discordId: string) {
    const user = await this.getUser(discordId);
    if (!user) {
      return []; // Return empty array instead of throwing error
    }

    return this.prisma.wallet.findMany({
      where: { userId: user.id }
    });
  }

  async deleteWallet(discordId: string, address: string): Promise<void> {
    const user = await this.getUser(discordId);
    if (!user) {
      return; // Do nothing if user doesn't exist
    }

    await this.prisma.wallet.deleteMany({
      where: {
        AND: [
          { address },
          { userId: user.id }
        ]
      }
    });
  }

  async hasVerifiedWallet(discordId: string): Promise<boolean> {
    const user = await this.getUser(discordId);
    if (!user) {
      return false;
    }

    const verifiedWallet = await this.prisma.wallet.findFirst({
      where: {
        AND: [
          { userId: user.id },
          { isVerified: true }
        ]
      }
    });

    return !!verifiedWallet;
  }

  // Helper method to check if a wallet address is already registered
  async isWalletRegistered(address: string): Promise<boolean> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { address }
    });
    return !!wallet;
  }

  // Holder Operations
  async updateHolders(holders: HolderData[]): Promise<void> {
    try {
      // Delete all existing holders first
      await this.prisma.holder.deleteMany({});
      
      // Add new holders with token counts
      if (holders.length > 0) {
        await this.prisma.holder.createMany({
          data: holders.map(holder => ({
            address: holder.address.toLowerCase(),
            tokenCount: holder.tokenCount
          }))
        });
      }

      console.log('Holders update completed successfully');
    } catch (error) {
      console.error('Error updating holders:', error);
      throw error;
    }
  }

  async isHolder(address: string): Promise<boolean> {
    const holder = await this.prisma.holder.findUnique({
      where: { address: address.toLowerCase() }
    });
    return !!holder;
  }

  async getTokenCount(address: string): Promise<number> {
    const holder = await this.prisma.holder.findUnique({
      where: { address: address.toLowerCase() }
    });
    return holder?.tokenCount || 0;
  }

  async getWallets(discordId: string): Promise<{ address: string; isVerified: boolean; tokenCount: number }[]> {
    const user = await this.prisma.user.findUnique({
      where: { discordId },
      include: { wallets: true }
    });

    if (!user) {
      return [];
    }

    const wallets = await Promise.all(
      user.wallets.map(async wallet => {
        const tokenCount = await this.getTokenCount(wallet.address);
        return {
          address: wallet.address,
          isVerified: wallet.isVerified,
          tokenCount
        };
      })
    );

    return wallets;
  }
}

// Export a singleton instance
export const db = new DatabaseService(); 