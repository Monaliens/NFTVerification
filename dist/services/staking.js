"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stakingService = exports.StakingService = void 0;
class StakingService {
    constructor() {
        this.stakingAddresses = new Set();
        this.lastUpdate = 0;
        this.updateInterval = 10 * 60 * 1000;
        this.updateStakingData();
    }
    async updateStakingData() {
        try {
            console.log('🔄 Updating staking data...');
            const stakingData = await this.getStakingSnapshot();
            this.stakingAddresses.clear();
            stakingData.forEach(staker => {
                this.stakingAddresses.add(staker.address.toLowerCase());
            });
            this.lastUpdate = Date.now();
            console.log(`✅ Updated staking data: ${this.stakingAddresses.size} stakers found`);
            if (this.stakingAddresses.size > 0) {
                console.log('📋 Staking addresses:', Array.from(this.stakingAddresses));
            }
        }
        catch (error) {
            console.error('❌ Error updating staking data:', error);
        }
    }
    async getStakingSnapshot() {
        try {
            const knownStakers = [
                '0xa2a84fbf9134aca100999bfe83f13507269b5454',
            ];
            return knownStakers.map(address => ({
                address: address.toLowerCase(),
                tokenCount: 1,
                tokenIds: ['1'],
                stakeDurations: ['86400']
            }));
        }
        catch (error) {
            console.error('Error getting staking snapshot:', error);
            return [];
        }
    }
    async isStaking(address) {
        const normalizedAddress = address.toLowerCase();
        if (Date.now() - this.lastUpdate > this.updateInterval) {
            await this.updateStakingData();
        }
        const isStaking = this.stakingAddresses.has(normalizedAddress);
        if (isStaking) {
            console.log(`🥩 Address ${normalizedAddress} is currently staking - protecting roles`);
        }
        return isStaking;
    }
    async getStakingAddresses() {
        if (Date.now() - this.lastUpdate > this.updateInterval) {
            await this.updateStakingData();
        }
        return Array.from(this.stakingAddresses);
    }
    addStakingAddress(address) {
        const normalizedAddress = address.toLowerCase();
        this.stakingAddresses.add(normalizedAddress);
        console.log(`➕ Manually added staking address: ${normalizedAddress}`);
    }
    removeStakingAddress(address) {
        const normalizedAddress = address.toLowerCase();
        this.stakingAddresses.delete(normalizedAddress);
        console.log(`➖ Manually removed staking address: ${normalizedAddress}`);
    }
    getStakingStats() {
        return {
            totalStakers: this.stakingAddresses.size,
            lastUpdate: new Date(this.lastUpdate)
        };
    }
}
exports.StakingService = StakingService;
exports.stakingService = new StakingService();
//# sourceMappingURL=staking.js.map