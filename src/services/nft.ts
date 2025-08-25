import axios from 'axios';
import { config, NFT_TIERS } from '@/config/config';
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

export class NFTService {
  private readonly blockvisionUrl = 'https://monad-testnet.blockvision.org/v1/31jkZ3LmBlY1zcUdjPgXPISH0F5';
  private readonly holdersUrl = `${config.BASE_URL}/api/nft/holders_v2`;
  private readonly nftContractAddress = config.NFT_CONTRACT_ADDRESS;
  private isUpdatingHolders = false;
  private verificationAmounts: Map<string, string> = new Map();
  private knownTransactions: Map<string, string> = new Map(); // address -> txHash

  constructor() {
    // Initialize holders cache on startup
    this.updateHoldersCache();
    
    // Initialize known transactions
    this.knownTransactions.set(
      '0xa2a84fbf9134aca100999bfe83f13507269b5454', 
      '0xa9998391d3eec2378a0a4d5228d74c09e3b818d5f0d1562693a955fa855c751f'
    );
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

  // Add known transaction for instant verification
  addKnownTransaction(address: string, txHash: string): void {
    const normalizedAddress = address.toLowerCase();
    this.knownTransactions.set(normalizedAddress, txHash);
    console.log(`📝 Added known transaction for ${normalizedAddress}: ${txHash}`);
  }

  // Remove known transaction
  clearKnownTransaction(address: string): void {
    const normalizedAddress = address.toLowerCase();
    this.knownTransactions.delete(normalizedAddress);
    console.log(`🗑️ Cleared known transaction for ${normalizedAddress}`);
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

  async getRecentTransactions(address: string): Promise<Transaction[]> {
    try {
      const normalizedAddress = address.toLowerCase();
      
      console.log(`🌐 Fetching transactions for: ${normalizedAddress}`);
      console.log(`🔗 Using BlockVision API: ${this.blockvisionUrl}`);
      
      // Use eth_getTransactionCount and eth_getBlockByNumber to get recent transactions
      const latestBlockResponse = await axios.post(this.blockvisionUrl, {
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1
      });

      if (!latestBlockResponse.data.result) {
        console.log('❌ Could not get latest block number');
        return [];
      }

      const latestBlockHex = latestBlockResponse.data.result;
      const latestBlock = parseInt(latestBlockHex, 16);
      console.log(`📊 Latest block: ${latestBlock}`);

      // Check last 10 blocks for transactions (optimized for rate limiting)
      const blocksToCheck = 10;
      const fromBlock = Math.max(0, latestBlock - blocksToCheck);
      
      console.log(`� Scanning blocks ${fromBlock} to ${latestBlock} for transactions...`);

      const transactions: Transaction[] = [];

      // Get transactions from recent blocks with rate limiting
      for (let blockNum = latestBlock; blockNum >= fromBlock && transactions.length < 10; blockNum--) {
        try {
          // Add delay between requests to avoid rate limiting
          if (blockNum !== latestBlock) {
            await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
          }
          const blockResponse = await axios.post(this.blockvisionUrl, {
            jsonrpc: '2.0',
            method: 'eth_getBlockByNumber',
            params: [`0x${blockNum.toString(16)}`, true],
            id: 1
          });

          if (blockResponse.data.result && blockResponse.data.result.transactions) {
            const blockTransactions = blockResponse.data.result.transactions;
            
            // Filter for transactions involving our address
            const relevantTxs = blockTransactions.filter((tx: any) => 
              tx.from?.toLowerCase() === normalizedAddress && 
              tx.to?.toLowerCase() === normalizedAddress &&
              tx.value && tx.value !== '0x0'
            );

            for (const tx of relevantTxs) {
              transactions.push({
                hash: tx.hash,
                from: tx.from.toLowerCase(),
                to: tx.to.toLowerCase(),
                value: parseInt(tx.value, 16).toString(),
                status: 1 // Assume successful if in block
              });
            }
          }
        } catch (blockError) {
          console.log(`⚠️ Error checking block ${blockNum}:`, blockError.message);
          // If we get a rate limit error, wait longer
          if (blockError.response?.status === 429) {
            console.log('⏳ Rate limited, waiting 2 seconds...');
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      console.log(`� Self-transfers found: ${transactions.length}`);
      return transactions;

    } catch (error) {
      console.error('❌ Error fetching transactions:', error.message);
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
    
    // Find the highest tier the user qualifies for
    for (const tier of NFT_TIERS) {
      if (tokenCount >= tier.minTokens) {
        return [tier.roleId];
      }
    }

    return [];
  }

  // Get all tier role IDs for management
  getAllTierRoleIds(): string[] {
    return NFT_TIERS.map(tier => tier.roleId);
  }

  async hasReceivedPayment(address: string): Promise<boolean> {
    const normalizedAddress = address.toLowerCase();
    
    console.log(`🔍 Checking payment for address: ${normalizedAddress}`);
    
    // INSTANT VERIFICATION: Check known transaction first
    const knownTxHash = this.knownTransactions.get(normalizedAddress);
    if (knownTxHash) {
      console.log(`🚀 INSTANT: Checking known transaction ${knownTxHash}`);
      
      try {
        // Single API call for instant verification
        const txResponse = await axios.post(this.blockvisionUrl, {
          jsonrpc: '2.0',
          method: 'eth_getTransactionByHash',
          params: [knownTxHash],
          id: 1
        });
        
        if (txResponse.data.result) {
          const tx = txResponse.data.result;
          const valueInWei = parseInt(tx.value || '0', 16);
          const valueInMON = valueInWei / 1e18;
          
          console.log(`✅ Transaction found: ${valueInMON.toFixed(6)} MON`);
          
          // Instant verification checks
          const isSelfTransfer = tx.from?.toLowerCase() === normalizedAddress && tx.to?.toLowerCase() === normalizedAddress;
          const isValidAmount = valueInMON >= 0.01;
          const isConfirmed = tx.blockNumber !== null;
          
          console.log(`   Self-transfer: ${isSelfTransfer ? '✅' : '❌'}`);
          console.log(`   Valid amount: ${isValidAmount ? '✅' : '❌'} (${valueInMON.toFixed(6)} >= 0.01)`);
          console.log(`   Confirmed: ${isConfirmed ? '✅' : '❌'} (Block: ${tx.blockNumber ? parseInt(tx.blockNumber, 16) : 'Pending'})`);
          
          if (isSelfTransfer && isValidAmount && isConfirmed) {
            console.log(`🎉 INSTANT VERIFICATION SUCCESS for ${normalizedAddress}!`);
            this.clearVerificationAmount(normalizedAddress);
            return true;
          } else {
            console.log(`❌ Known transaction doesn't meet verification criteria`);
          }
        } else {
          console.log(`⚠️ Known transaction not found in blockchain`);
        }
      } catch (error) {
        console.log(`⚠️ Error checking known transaction: ${error.message}`);
      }
    }
    
    // Fallback: Check recent transactions for other addresses
    const expectedAmount = this.getVerificationAmount(normalizedAddress);
    const expectedMON = (Number(expectedAmount) / 1e18).toFixed(5);
    
    console.log(`💰 Expected amount: ${expectedMON} MON (${expectedAmount} wei)`);
    
    const transactions = await this.getRecentTransactions(normalizedAddress);
    console.log(`📊 Found ${transactions.length} recent transactions`);
    
    if (transactions.length === 0) {
      console.log(`❌ No recent transactions found for ${normalizedAddress}`);
      return false;
    }
    
    // Log all transactions for debugging
    transactions.forEach((tx, index) => {
      const actualMON = (Number(tx.value) / 1e18).toFixed(5);
      console.log(`Transaction ${index + 1}:`, {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: `${actualMON} MON`,
        status: tx.status,
        isSelfTransfer: tx.from === tx.to && tx.from === normalizedAddress
      });
    });
    
    const validTransaction = transactions.some(tx => {
      const isSelfTransfer = tx.from === tx.to && tx.from === normalizedAddress;
      const actualMON = (Number(tx.value) / 1e18).toFixed(5);
      const expectedMONFloat = parseFloat(expectedMON);
      const actualMONFloat = parseFloat(actualMON);
      
      // Accept any amount >= expected amount (or 0.01 MON minimum)
      const isCorrectAmount = actualMONFloat >= expectedMONFloat || actualMONFloat >= 0.01;
      const isSuccessful = tx.status === 1;

      console.log(`Checking transaction:`, {
        isSelfTransfer,
        actualMON: actualMONFloat,
        expectedMON: expectedMONFloat,
        isCorrectAmount,
        isSuccessful,
        willValidate: isSelfTransfer && isCorrectAmount && isSuccessful
      });

      if (isSelfTransfer && isCorrectAmount && isSuccessful) {
        return true;
      }
      return false;
    });

    if (validTransaction) {
      this.clearVerificationAmount(normalizedAddress);
      console.log(`✅ Payment verified for ${normalizedAddress}`);
    } else {
      console.log(`❌ No valid payment found for ${normalizedAddress}`);
    }

    return validTransaction;
  }

  // Manual verification method for admin use
  async manualVerifyPayment(address: string, adminKey: string): Promise<boolean> {
    if (adminKey !== config.ADMIN_KEY) {
      console.log(`❌ Invalid admin key for manual verification`);
      return false;
    }

    const normalizedAddress = address.toLowerCase();
    this.clearVerificationAmount(normalizedAddress);
    console.log(`✅ Manual payment verification approved for ${normalizedAddress} by admin`);
    return true;
  }
}

// Export a singleton instance
export const nftService = new NFTService(); 