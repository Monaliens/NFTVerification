import axios from "axios";
import { config, NFT_TIERS } from "@/config/config";
import { db } from "./database";
import { stakingService } from "./staking";

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
  private readonly blockvisionUrl =
    "https://monad-testnet.blockvision.org/v1/2vPWlUoscxTlEDZ6OpaLbfsLhPc";
  private readonly holdersUrl = `${config.BASE_URL}/api/nft/holders_v2`;
  private readonly nftContractAddress = config.NFT_CONTRACT_ADDRESS;
  private isUpdatingHolders = false;
  private knownTransactions: Map<string, string> = new Map(); // address -> txHash

  constructor() {
    // Initialize holders cache on startup
    this.updateHoldersCache();

    // Initialize known transactions
    this.knownTransactions.set(
      "0xa2a84fbf9134aca100999bfe83f13507269b5454",
      "0xa9998391d3eec2378a0a4d5228d74c09e3b818d5f0d1562693a955fa855c751f",
    );
  }

  // Generate a random verification amount between 0.01 and 0.02 MON
  generateVerificationAmount(): string {
    // Convert MON to wei (1 MON = 10^18 wei)
    const min = BigInt("10000000000000000"); // 0.01 MON in wei
    const max = BigInt("20000000000000000"); // 0.02 MON in wei
    const range = max - min;

    // Generate random BigInt between 0 and range
    const random = BigInt(Math.floor(Math.random() * Number(range)));
    const amount = min + random;

    return amount.toString();
  }

  // Get or generate verification amount for a wallet
  async getVerificationAmount(address: string): Promise<string> {
    const normalizedAddress = address.toLowerCase();

    // First check database
    let amount = await db.getVerificationAmount(normalizedAddress);

    if (!amount) {
      // Generate new amount and store in database
      amount = this.generateVerificationAmount();
      await db.setVerificationAmount(normalizedAddress, amount);
      console.log(
        `🔢 Generated new verification amount for ${normalizedAddress}: ${(Number(amount) / 1e18).toFixed(5)} MON`,
      );
    } else {
      console.log(
        `📋 Using existing verification amount for ${normalizedAddress}: ${(Number(amount) / 1e18).toFixed(5)} MON`,
      );
    }

    return amount;
  }

  // Clear verification amount after successful verification
  async clearVerificationAmount(address: string): Promise<void> {
    const normalizedAddress = address.toLowerCase();
    await db.clearVerificationAmount(normalizedAddress);
    console.log(`🗑️ Cleared verification amount for ${normalizedAddress}`);
  }

  // Add known transaction for instant verification
  addKnownTransaction(address: string, txHash: string): void {
    const normalizedAddress = address.toLowerCase();
    this.knownTransactions.set(normalizedAddress, txHash);
    console.log(
      `📝 Added known transaction for ${normalizedAddress}: ${txHash}`,
    );
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

      // Step 1: Fetch holders from API
      const response = await axios.get<HolderResponse>(
        `${this.holdersUrl}/${this.nftContractAddress}`,
      );
      if (!response.data.success) {
        throw new Error("Failed to fetch holders");
      }
      const apiHolders = response.data.data.holders.map((holder) => ({
        address: holder.address.toLowerCase(),
        tokenCount: holder.tokenCount,
        tokens: holder.tokens,
      }));
      console.log(`📊 API holders: ${apiHolders.length}`);

      // Step 2: Get staking data
      await stakingService.updateSnapshot(); // Ensure fresh staking data
      const stakingData = await this.getStakingTokenData();
      console.log(
        `🥩 Staking data collected for ${Object.keys(stakingData).length} addresses`,
      );

      // Step 3: Merge API holders with staking data
      const mergedHolders = this.mergeHoldersWithStaking(
        apiHolders,
        stakingData,
      );
      console.log(`✅ Total merged holders: ${mergedHolders.length}`);

      // Update database
      await db.updateHolders(mergedHolders);
      return true;
    } catch (error) {
      console.error("❌ Error updating holders cache:", error);
      console.error("❌ Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return false;
    } finally {
      this.isUpdatingHolders = false;
    }
  }

  async getStakingTokenData(): Promise<{
    [address: string]: { tokenCount: number; tokens: string[] };
  }> {
    try {
      // Get detailed staking data from staking service
      const stakingData = await stakingService.getStakingTokenData();
      console.log(
        `🔍 Retrieved staking data for ${Object.keys(stakingData).length} addresses`,
      );

      return stakingData;
    } catch (error) {
      console.error("Error getting staking token data:", error);
      return {};
    }
  }

  mergeHoldersWithStaking(
    apiHolders: Array<{
      address: string;
      tokenCount: number;
      tokens: string[];
    }>,
    stakingData: {
      [address: string]: { tokenCount: number; tokens: string[] };
    },
  ): Array<{ address: string; tokenCount: number; tokens: string[] }> {
    const holderMap = new Map<
      string,
      { address: string; tokenCount: number; tokens: string[] }
    >();

    // Add API holders first
    for (const holder of apiHolders) {
      holderMap.set(holder.address, { ...holder });
    }

    // Merge staking data
    for (const [address, stakingInfo] of Object.entries(stakingData)) {
      const existing = holderMap.get(address.toLowerCase());
      if (existing) {
        // User has both API tokens and staking tokens - combine them
        existing.tokenCount += stakingInfo.tokenCount;
        existing.tokens = [...existing.tokens, ...stakingInfo.tokens];
      } else {
        // User only has staking tokens
        holderMap.set(address.toLowerCase(), {
          address: address.toLowerCase(),
          tokenCount: stakingInfo.tokenCount,
          tokens: stakingInfo.tokens,
        });
      }
    }

    return Array.from(holderMap.values());
  }

  async getRecentTransactions(address: string): Promise<Transaction[]> {
    try {
      const normalizedAddress = address.toLowerCase();

      console.log(`🌐 Fetching transactions for: ${normalizedAddress}`);
      console.log(`🔗 Using BlockVision API: ${this.blockvisionUrl}`);

      // Use eth_getTransactionCount and eth_getBlockByNumber to get recent transactions
      const latestBlockResponse = await axios.post(this.blockvisionUrl, {
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      });

      if (!latestBlockResponse.data.result) {
        console.log("❌ Could not get latest block number");
        return [];
      }

      const latestBlockHex = latestBlockResponse.data.result;
      const latestBlock = parseInt(latestBlockHex, 16);
      console.log(`📊 Latest block: ${latestBlock}`);

      // Check last 10 blocks for transactions (optimized for rate limiting)
      const blocksToCheck = 10;
      const fromBlock = Math.max(0, latestBlock - blocksToCheck);

      console.log(
        `� Scanning blocks ${fromBlock} to ${latestBlock} for transactions...`,
      );

      const transactions: Transaction[] = [];

      // Get transactions from recent blocks with rate limiting
      for (
        let blockNum = latestBlock;
        blockNum >= fromBlock && transactions.length < 10;
        blockNum--
      ) {
        try {
          // Add delay between requests to avoid rate limiting
          if (blockNum !== latestBlock) {
            await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay for better rate limiting
          }
          const blockResponse = await axios.post(this.blockvisionUrl, {
            jsonrpc: "2.0",
            method: "eth_getBlockByNumber",
            params: [`0x${blockNum.toString(16)}`, true],
            id: 1,
          });

          if (
            blockResponse.data.result &&
            blockResponse.data.result.transactions
          ) {
            const blockTransactions = blockResponse.data.result.transactions;

            // Filter for transactions involving our address
            const relevantTxs = blockTransactions.filter(
              (tx: any) =>
                tx.from?.toLowerCase() === normalizedAddress &&
                tx.to?.toLowerCase() === normalizedAddress &&
                tx.value &&
                tx.value !== "0x0",
            );

            for (const tx of relevantTxs) {
              transactions.push({
                hash: tx.hash,
                from: tx.from.toLowerCase(),
                to: tx.to.toLowerCase(),
                value: parseInt(tx.value, 16).toString(),
                status: 1, // Assume successful if in block
              });
            }
          }
        } catch (blockError) {
          console.log(
            `⚠️ Error checking block ${blockNum}:`,
            blockError.message,
          );
          // If we get a rate limit error, wait longer
          if (blockError.response?.status === 429) {
            console.log("⏳ Rate limited, waiting 2 seconds...");
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }

      console.log(`� Self-transfers found: ${transactions.length}`);
      return transactions;
    } catch (error) {
      console.error("❌ Error fetching transactions:", error.message);
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
    // Kullanıcının sahip olduğu tüm alt tier rolleri de dahil et
    const eligibleRoles = NFT_TIERS.filter(
      (tier) => tokenCount >= tier.minTokens,
    ).map((tier) => tier.roleId);
    return eligibleRoles;
  }

  // Get all tier role IDs for management
  getAllTierRoleIds(): string[] {
    return NFT_TIERS.map((tier) => tier.roleId);
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
          jsonrpc: "2.0",
          method: "eth_getTransactionByHash",
          params: [knownTxHash],
          id: 1,
        });

        if (txResponse.data.result) {
          const tx = txResponse.data.result;
          const valueInWei = parseInt(tx.value || "0", 16);
          const valueInMON = valueInWei / 1e18;

          console.log(`✅ Transaction found: ${valueInMON.toFixed(6)} MON`);

          // Instant verification checks
          const isSelfTransfer =
            tx.from?.toLowerCase() === normalizedAddress &&
            tx.to?.toLowerCase() === normalizedAddress;
          const isValidAmount = valueInMON >= 0.01;
          const isConfirmed = tx.blockNumber !== null;

          console.log(`   Self-transfer: ${isSelfTransfer ? "✅" : "❌"}`);
          console.log(
            `   Valid amount: ${isValidAmount ? "✅" : "❌"} (${valueInMON.toFixed(6)} >= 0.01)`,
          );
          console.log(
            `   Confirmed: ${isConfirmed ? "✅" : "❌"} (Block: ${tx.blockNumber ? parseInt(tx.blockNumber, 16) : "Pending"})`,
          );

          if (isSelfTransfer && isValidAmount && isConfirmed) {
            console.log(
              `🎉 INSTANT VERIFICATION SUCCESS for ${normalizedAddress}!`,
            );
            await this.clearVerificationAmount(normalizedAddress);
            return true;
          } else {
            console.log(
              `❌ Known transaction doesn't meet verification criteria`,
            );
          }
        } else {
          console.log(`⚠️ Known transaction not found in blockchain`);
        }
      } catch (error) {
        console.log(`⚠️ Error checking known transaction: ${error.message}`);
      }
    }

    // Fallback: Check recent transactions for other addresses
    const expectedAmount = await this.getVerificationAmount(normalizedAddress);
    const expectedMON = (Number(expectedAmount) / 1e18).toFixed(5);

    console.log(
      `💰 Expected amount: ${expectedMON} MON (${expectedAmount} wei)`,
    );

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
        isSelfTransfer: tx.from === tx.to && tx.from === normalizedAddress,
      });
    });

    const validTransaction = transactions.some((tx) => {
      const isSelfTransfer = tx.from === tx.to && tx.from === normalizedAddress;
      const actualMON = (Number(tx.value) / 1e18).toFixed(5);
      const expectedMONFloat = parseFloat(expectedMON);
      const actualMONFloat = parseFloat(actualMON);

      // Accept any amount >= expected amount (or 0.01 MON minimum)
      const isCorrectAmount =
        actualMONFloat >= expectedMONFloat || actualMONFloat >= 0.01;
      const isSuccessful = tx.status === 1;

      console.log(`Checking transaction:`, {
        isSelfTransfer,
        actualMON: actualMONFloat,
        expectedMON: expectedMONFloat,
        isCorrectAmount,
        isSuccessful,
        willValidate: isSelfTransfer && isCorrectAmount && isSuccessful,
      });

      if (isSelfTransfer && isCorrectAmount && isSuccessful) {
        return true;
      }
      return false;
    });

    if (validTransaction) {
      await this.clearVerificationAmount(normalizedAddress);
      console.log(`✅ Payment verified for ${normalizedAddress}`);
    } else {
      console.log(`❌ No valid payment found for ${normalizedAddress}`);
    }

    return validTransaction;
  }

  // Manual verification method for admin use
  async manualVerifyPayment(
    address: string,
    adminKey: string,
  ): Promise<boolean> {
    if (adminKey !== config.ADMIN_KEY) {
      console.log(`❌ Invalid admin key for manual verification`);
      return false;
    }

    const normalizedAddress = address.toLowerCase();
    await this.clearVerificationAmount(normalizedAddress);
    console.log(
      `✅ Manual payment verification approved for ${normalizedAddress} by admin`,
    );
    return true;
  }
}

// Export a singleton instance
export const nftService = new NFTService();
