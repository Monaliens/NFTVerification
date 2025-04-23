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
      tokenCount: number;
      percentage: string;
      isContract: boolean;
    }>;
    totalHolders: number;
  };
}

export class NFTService {
  private readonly blockvisionUrl = 'https://api.blockvision.org/v2/monad/account/transactions';
  private readonly holdersUrl = 'https://api.monaliens.xyz/api/nft/holders';
  private readonly nftContractAddress = config.NFT_CONTRACT_ADDRESS;
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
      console.log(`Generated new verification amount for ${normalizedAddress}: ${amount} wei (${(Number(amount) / 1e18).toFixed(5)} MON)`);
    } else {
      console.log(`Retrieved existing verification amount for ${normalizedAddress}: ${amount} wei (${(Number(amount) / 1e18).toFixed(5)} MON)`);
    }
    
    return amount;
  }

  // Clear verification amount after successful verification
  clearVerificationAmount(address: string): void {
    const normalizedAddress = address.toLowerCase();
    console.log(`Clearing verification amount for ${normalizedAddress}`);
    this.verificationAmounts.delete(normalizedAddress);
  }

  async updateHoldersCache() {
    if (this.isUpdatingHolders) return;
    
    try {
      this.isUpdatingHolders = true;
      console.log('Fetching holders from API...');
      
      const response = await axios.get<HolderResponse>(`${this.holdersUrl}/${this.nftContractAddress}`);
      
      if (!response.data.success) {
        throw new Error('Failed to fetch holders');
      }

      const holders = response.data.data.holders
        .filter(holder => !holder.isContract)
        .map(holder => ({
          address: holder.address.toLowerCase(),
          tokenCount: Number(holder.tokenCount)
        }));

      console.log(`Found ${holders.length} holders, updating database...`);

      // Clear existing holders and insert new ones in a single transaction
      await db.updateHolders(holders);

      console.log('Holders cache updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating holders cache:', error);
      return false;
    } finally {
      this.isUpdatingHolders = false;
    }
  }

  async getRecentTransactions(address: string): Promise<Transaction[]> {
    try {
      const normalizedAddress = address.toLowerCase();
      console.log(`Fetching recent transactions for ${normalizedAddress}`);
      
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

  async hasReceivedPayment(address: string): Promise<boolean> {
    const normalizedAddress = address.toLowerCase();
    const expectedAmount = this.getVerificationAmount(normalizedAddress);
    const expectedMON = (Number(expectedAmount) / 1e18).toFixed(5);
    
    console.log(`Checking transactions for payment from: ${normalizedAddress}`);
    console.log(`Looking for self-transfer amount: ${expectedAmount} wei (${expectedMON} MON)`);
    
    const transactions = await this.getRecentTransactions(normalizedAddress);
    
    const validTransaction = transactions.some(tx => {
      const isSelfTransfer = tx.from === tx.to && tx.from === normalizedAddress;
      const actualMON = (Number(tx.value) / 1e18).toFixed(5);
      const isCorrectAmount = actualMON === expectedMON;
      const isSuccessful = tx.status === 1;

      console.log('Transaction check:', {
        hash: tx.hash,
        isSelfTransfer,
        isCorrectAmount,
        isSuccessful,
        actualValue: tx.value,
        expectedValue: expectedAmount,
        actualMON,
        expectedMON
      });

      if (isSelfTransfer && isCorrectAmount && isSuccessful) {
        console.log('Found valid verification transaction!');
        return true;
      }
      return false;
    });

    if (validTransaction) {
      this.clearVerificationAmount(normalizedAddress);
    } else {
      console.log('No valid verification transaction found');
    }

    return validTransaction;
  }
}

// Export a singleton instance
export const nftService = new NFTService(); 