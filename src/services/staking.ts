import { ethers } from "ethers";
import { config } from "@/config/config";

// Staking data service
class StakingService {
  private stakingData: Map<string, { tokenCount: number; tokens: string[] }> =
    new Map();
  private lastUpdate: Date = new Date();

  private readonly ABI = [
    {
      inputs: [],
      name: "getStakersSnapshot",
      outputs: [
        {
          internalType: "address[]",
          name: "stakers",
          type: "address[]",
        },
        {
          internalType: "uint256[][]",
          name: "tokenIds",
          type: "uint256[][]",
        },
        {
          internalType: "uint256[][]",
          name: "stakeDurations",
          type: "uint256[][]",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
  ];

  constructor() {
    // Contract adresi varsa staking'i başlat
    if (
      config.STAKING_CONTRACT_ADDRESS &&
      config.STAKING_CONTRACT_ADDRESS !== "undefined"
    ) {
      console.log("🥩 Staking data enabled");
      // Başlangıçta snapshot çek
      this.updateSnapshot();

      // Her 10 dakikada bir güncelle
      setInterval(
        () => {
          this.updateSnapshot();
        },
        10 * 60 * 1000,
      );
    } else {
      console.log("⚠️ STAKING_CONTRACT_ADDRESS not configured");
    }
  }

  async updateSnapshot(): Promise<void> {
    try {
      console.log("📸 Fetching staking snapshot...");

      // Contract address kontrolü
      if (!config.STAKING_CONTRACT_ADDRESS) {
        console.log("⚠️ STAKING_CONTRACT_ADDRESS not configured, skipping");
        return;
      }

      // Spesifik RPC URL kullan
      const RPC_URL =
        "https://convincing-billowing-forest.monad-testnet.quiknode.pro/7baeb1195f9311a73ade67aef1ca56fc6d3011d5";
      const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(
        config.STAKING_CONTRACT_ADDRESS,
        this.ABI,
        provider,
      );

      // Kontrattan snapshot al
      const result = await contract.getStakersSnapshot();
      const stakers = result[0]; // address array
      const tokenIds = result[1]; // token arrays

      // Eski listeyi temizle

      this.stakingData.clear();

      // Sadece token stake etmiş olanları ekle
      for (let i = 0; i < stakers.length; i++) {
        const staker = stakers[i];
        const tokens = tokenIds[i] || [];
        if (tokens.length > 0) {
          this.stakingData.set(staker.toLowerCase(), {
            tokenCount: tokens.length,
            tokens: tokens.map((t) => t.toString()),
          });
        }
      }

      this.lastUpdate = new Date();
      console.log(`Found ${this.stakingData.size} staking wallets`);
    } catch (error: any) {
      console.error("❌ Error fetching staking snapshot:", error.message);

      if (error.message.includes("execution reverted")) {
        console.log("⚠️ Possible reasons:");
        console.log("- Gas limit exceeded");
        console.log("- Contract internal error");
        console.log("- Array size too large");
      }
    }
  }

  // Get detailed staking data for merging with holders
  async getStakingTokenData(): Promise<{
    [address: string]: { tokenCount: number; tokens: string[] };
  }> {
    const result: {
      [address: string]: { tokenCount: number; tokens: string[] };
    } = {};

    for (const [address, data] of this.stakingData.entries()) {
      result[address] = { ...data };
    }

    return result;
  }

  getStats() {
    const totalTokensStaked = Array.from(this.stakingData.values()).reduce(
      (sum, data) => sum + data.tokenCount,
      0,
    );

    return {
      totalStakers: this.stakingData.size,
      totalTokensStaked,
      lastUpdate: this.lastUpdate,
    };
  }
}

export const stakingService = new StakingService();
