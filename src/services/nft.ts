import axios from 'axios';
import { config } from '@/config/config';
import { db } from './database';

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  status: number;
}

interface HolderResponse {
  success: boolean;
  data: {
    holders: Array<{
      address: string;
      tokens: string[];
      tokenCount: number;
    }>;
    totalHolders: number;
  };
}

interface CollectionHolderData {
  address: string;
  contractAddress: string;
  tokenCount: number;
  tokens: string[];
}

export class NFTService {
  private readonly blockvisionUrl = 'https://api.blockvision.org/v2/monad/account/transactions';
  private readonly holdersUrl = `${config.BASE_URL}/api/nft/holders_v2`;
  private readonly nftContractAddress = config.NFT_CONTRACT_ADDRESS;
  private readonly tierRoles = config.NFT_TIER_ROLES;
  private isUpdatingHolders = false;
  private verificationAmounts: Map<string, string> = new Map();

  constructor() {
    // Initialize holders cache on startup
    this.updateHoldersCache();
  }

  // Generate a random verification amount between 0.01 and 0.02 MON
  generateVerificationAmount(): string {
    // Convert MON to wei (1 MON = 10^18 wei)
    const min = BigInt('10000000000000000'); // 0.01 MON in wei
    const max = BigInt('20000000000000000'); // 0.02 MON in wei
    const range = max - min;
    
    // Generate random BigInt between 0 and range
    const random = BigInt(Math.floor(Math.random() * Number(range)));
    const amount = min + random;
    
    return amount.toString();
  }

  // Get or generate verification amount for a wallet
  getVerificationAmount(address: string): string {
    const normalizedAddress = address.toLowerCase();
    let amount = this.verificationAmounts.get(normalizedAddress);
    
    if (!amount) {
      amount = this.generateVerificationAmount();
      this.verificationAmounts.set(normalizedAddress, amount);
    }
    
    return amount;
  }

  // Clear verification amount after successful verification
  clearVerificationAmount(address: string): void {
    const normalizedAddress = address.toLowerCase();
    this.verificationAmounts.delete(normalizedAddress);
  }

  async updateHoldersCache() {
    if (this.isUpdatingHolders) return;
    
    try {
      this.isUpdatingHolders = true;
      
      const response = await axios.get<HolderResponse>(`${this.holdersUrl}/${this.nftContractAddress}`);
      
      if (!response.data.success) {
        throw new Error('Failed to fetch holders');
      }

      const holders = response.data.data.holders.map(holder => ({
        address: holder.address.toLowerCase(),
        tokenCount: holder.tokenCount,
        tokens: holder.tokens
      }));

      console.log(`✅ Updated ${holders.length} NFT holders`);

      // Update database
      await db.updateHolders(holders);

      return true;
    } catch (error) {
      console.error('Error updating holders cache:', error);
      return false;
    } finally {
      this.isUpdatingHolders = false;
    }
  }

  // Consolidate holders from multiple collections into unique addresses
  private consolidateHolders(holders: { address: string; tokenCount: number; tokens: string[] }[]): { address: string; tokenCount: number; tokens: string[] }[] {
    const holderMap = new Map<string, { tokenCount: number; tokens: Set<string> }>();
    
    holders.forEach(holder => {
      const existing = holderMap.get(holder.address);
      if (existing) {
        existing.tokenCount += holder.tokenCount;
        holder.tokens.forEach(token => existing.tokens.add(token));
      } else {
        holderMap.set(holder.address, {
          tokenCount: holder.tokenCount,
          tokens: new Set(holder.tokens)
        });
      }
    });

    return Array.from(holderMap.entries()).map(([address, data]) => ({
      address,
      tokenCount: data.tokenCount,
      tokens: Array.from(data.tokens)
    }));
  }

  async getRecentTransactions(address: string): Promise<Transaction[]> {
    try {
      const normalizedAddress = address.toLowerCase();
      
      const response = await axios.get(this.blockvisionUrl, {
        params: {
          address: normalizedAddress,
          limit: 10
        },
        headers: {
          'accept': 'application/json',
          'x-api-key': config.BLOCKVISION_API_KEY
        }
      });

      // Check if response has data
      if (!response.data || !response.data.result || !response.data.result.data) {
        console.log('No transaction data returned from API');
        return [];
      }

      // Filter for self-transfers
      return response.data.result.data
        .filter((tx: any) => 
          tx.from.toLowerCase() === normalizedAddress && 
          tx.to.toLowerCase() === normalizedAddress
        )
        .map((tx: any) => ({
          hash: tx.hash,
          from: tx.from.toLowerCase(),
          to: tx.to.toLowerCase(),
          value: tx.value,
          status: tx.status
        }));
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }
  }

  async isHolder(address: string): Promise<boolean> {
    return db.isHolder(address);
  }

  async getTokenCount(address: string): Promise<number> {
    return db.getTokenCount(address);
  }

  // Tier-based role methods
  async getEligibleTierRoles(address: string): Promise<string[]> {
    const tokenCount = await this.getTokenCount(address);
    const eligibleRoles: string[] = [];

    // Find the appropriate tier role
    for (const tier of this.tierRoles) {
      if (tokenCount >= tier.minTokens && tokenCount <= tier.maxTokens) {
        eligibleRoles.push(tier.roleId);
        break; // Only one tier role per user
      }
    }

    return eligibleRoles;
  }

  // Get all tier role IDs for management
  getAllTierRoleIds(): string[] {
    return this.tierRoles.map(tier => tier.roleId);
  }

  async hasReceivedPayment(address: string): Promise<boolean> {
    const normalizedAddress = address.toLowerCase();
    const expectedAmount = this.getVerificationAmount(normalizedAddress);
    const expectedMON = (Number(expectedAmount) / 1e18).toFixed(5);
    
    const transactions = await this.getRecentTransactions(normalizedAddress);
    
    const validTransaction = transactions.some(tx => {
      const isSelfTransfer = tx.from === tx.to && tx.from === normalizedAddress;
      const actualMON = (Number(tx.value) / 1e18).toFixed(5);
      const expectedMONFloat = parseFloat(expectedMON);
      const actualMONFloat = parseFloat(actualMON);
      
      // Accept any amount >= expected amount (or 0.02 MON minimum)
      const isCorrectAmount = actualMONFloat >= expectedMONFloat || actualMONFloat >= 0.02;
      const isSuccessful = tx.status === 1;

      if (isSelfTransfer && isCorrectAmount && isSuccessful) {
        return true;
      }
      return false;
    });

    if (validTransaction) {
      this.clearVerificationAmount(normalizedAddress);
      console.log(`✅ Payment verified for ${normalizedAddress}`);
    }

    return validTransaction;
  }
}

// Export a singleton instance
export const nftService = new NFTService(); 