import { ethers } from 'ethers';
import { config } from '@/config/config';

// Basit staking protection sistemi
class StakingService {
  private stakingAddresses: Set<string> = new Set();
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
    if (config.STAKING_CONTRACT_ADDRESS && config.STAKING_CONTRACT_ADDRESS !== 'undefined') {
      console.log('🥩 Staking protection enabled');
      // Başlangıçta snapshot çek
      this.updateSnapshot();
      
      // Her 10 dakikada bir güncelle
      setInterval(() => {
        this.updateSnapshot();
      }, 10 * 60 * 1000);
    } else {
      console.log('⚠️ Staking contract address not configured - staking protection disabled');
    }
  }

  async updateSnapshot(): Promise<void> {
    try {
      console.log('📸 Fetching staking snapshot...');
      
      // Contract address kontrolü
      if (!config.STAKING_CONTRACT_ADDRESS) {
        console.log('⚠️ STAKING_CONTRACT_ADDRESS not configured, skipping staking protection');
        return;
      }
      
      // Spesifik RPC URL kullan
      const RPC_URL = "https://convincing-billowing-forest.monad-testnet.quiknode.pro/7baeb1195f9311a73ade67aef1ca56fc6d3011d5";
      const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(config.STAKING_CONTRACT_ADDRESS, this.ABI, provider);
      
      // Kontrattan snapshot al
      const result = await contract.getStakersSnapshot();
      const stakers = result[0]; // address array
      const tokenIds = result[1]; // token arrays
      
      // Eski listeyi temizle
      this.stakingAddresses.clear();
      
      // Sadece token stake etmiş olanları ekle  
      for (let i = 0; i < stakers.length; i++) {
        const staker = stakers[i];
        const tokens = tokenIds[i] || [];
        if (tokens.length > 0) {
          this.stakingAddresses.add(staker.toLowerCase());
        }
      }
      
      this.lastUpdate = new Date();
      console.log(`Found ${this.stakingAddresses.size} staking wallets`);
      
    } catch (error: any) {
      console.error('❌ Error fetching staking snapshot:', error.message);
      
      if (error.message.includes("execution reverted")) {
        console.log("⚠️ Possible reasons:");
        console.log("- Gas limit exceeded");
        console.log("- Contract internal error"); 
        console.log("- Array size too large");
      }
    }
  }

  // Basit kontrol - staking yapıyorsa koruma altında
  isStaking(address: string): boolean {
    const isProtected = this.stakingAddresses.has(address.toLowerCase());
    
    if (isProtected) {
      console.log(` Wallet ${address} is protected (staking)`);
    }
    
    return isProtected;
  }

  // Staking adreslerini dön
  async getStakingAddresses(): Promise<string[]> {
    return Array.from(this.stakingAddresses);
  }

  getStats() {
    return {
      totalStakers: this.stakingAddresses.size,
      lastUpdate: this.lastUpdate
    };
  }
}

export const stakingService = new StakingService();
