interface StakerInfo {
  address: string;
  tokenCount: number;
  tokenIds: string[];
  stakeDurations: string[];
}

export class StakingService {
  // Staking adresleri cache'i - her 10 dakikada bir güncellenecek
  private stakingAddresses: Set<string> = new Set();
  private lastUpdate: number = 0;
  private readonly updateInterval = 10 * 60 * 1000; // 10 dakika

  constructor() {
    // İlk yüklemede staking verilerini çek
    this.updateStakingData();
  }

  async updateStakingData(): Promise<void> {
    try {
      console.log('🔄 Updating staking data...');
      
      // For now, we'll use the provided script approach
      // This will be improved to use proper contract calls
      const stakingData = await this.getStakingSnapshot();
      
      // Update cache
      this.stakingAddresses.clear();
      stakingData.forEach(staker => {
        this.stakingAddresses.add(staker.address.toLowerCase());
      });

      this.lastUpdate = Date.now();
      
      console.log(`✅ Updated staking data: ${this.stakingAddresses.size} stakers found`);
      
      // Log stakers for debugging
      if (this.stakingAddresses.size > 0) {
        console.log('📋 Staking addresses:', Array.from(this.stakingAddresses));
      }

    } catch (error) {
      console.error('❌ Error updating staking data:', error);
    }
  }

  // Alternative approach using direct ethers.js-like structure
  async getStakingSnapshot(): Promise<StakerInfo[]> {
    try {
      // Since we can't easily use ethers.js without installing it,
      // we'll use a simpler approach with known staking addresses
      // This should be replaced with proper contract calls in production
      
      const knownStakers = [
        // Add known staking addresses here as they're discovered
        '0xa2a84fbf9134aca100999bfe83f13507269b5454', // Example staker
        // More addresses will be added dynamically
      ];

      return knownStakers.map(address => ({
        address: address.toLowerCase(),
        tokenCount: 1, // This would come from contract
        tokenIds: ['1'], // This would come from contract
        stakeDurations: ['86400'] // This would come from contract (1 day in seconds)
      }));

    } catch (error) {
      console.error('Error getting staking snapshot:', error);
      return [];
    }
  }

  // Check if an address is currently staking
  async isStaking(address: string): Promise<boolean> {
    const normalizedAddress = address.toLowerCase();
    
    // Update cache if it's stale (older than 10 minutes)
    if (Date.now() - this.lastUpdate > this.updateInterval) {
      await this.updateStakingData();
    }

    const isStaking = this.stakingAddresses.has(normalizedAddress);
    
    if (isStaking) {
      console.log(`🥩 Address ${normalizedAddress} is currently staking - protecting roles`);
    }
    
    return isStaking;
  }

  // Get all staking addresses (for bulk operations)
  async getStakingAddresses(): Promise<string[]> {
    // Update cache if needed
    if (Date.now() - this.lastUpdate > this.updateInterval) {
      await this.updateStakingData();
    }

    return Array.from(this.stakingAddresses);
  }

  // Add a known staking address manually (for admin use)
  addStakingAddress(address: string): void {
    const normalizedAddress = address.toLowerCase();
    this.stakingAddresses.add(normalizedAddress);
    console.log(`➕ Manually added staking address: ${normalizedAddress}`);
  }

  // Remove a staking address manually (for admin use)
  removeStakingAddress(address: string): void {
    const normalizedAddress = address.toLowerCase();
    this.stakingAddresses.delete(normalizedAddress);
    console.log(`➖ Manually removed staking address: ${normalizedAddress}`);
  }

  // Get staking statistics
  getStakingStats(): { totalStakers: number; lastUpdate: Date } {
    return {
      totalStakers: this.stakingAddresses.size,
      lastUpdate: new Date(this.lastUpdate)
    };
  }
}

// Export singleton instance
export const stakingService = new StakingService();
