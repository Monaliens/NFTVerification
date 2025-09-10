"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stakingService = void 0;
const ethers_1 = require("ethers");
const config_1 = require("../config/config");
class StakingService {
    constructor() {
        this.stakingAddresses = new Set();
        this.lastUpdate = new Date();
        this.ABI = [
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
        if (config_1.config.STAKING_CONTRACT_ADDRESS && config_1.config.STAKING_CONTRACT_ADDRESS !== 'undefined') {
            console.log('🥩 Staking protection enabled');
            this.updateSnapshot();
            setInterval(() => {
                this.updateSnapshot();
            }, 10 * 60 * 1000);
        }
        else {
            console.log('⚠️ Staking contract address not configured - staking protection disabled');
        }
    }
    async updateSnapshot() {
        try {
            console.log('📸 Fetching staking snapshot...');
            if (!config_1.config.STAKING_CONTRACT_ADDRESS) {
                console.log('⚠️ STAKING_CONTRACT_ADDRESS not configured, skipping staking protection');
                return;
            }
            const RPC_URL = "https://convincing-billowing-forest.monad-testnet.quiknode.pro/7baeb1195f9311a73ade67aef1ca56fc6d3011d5";
            const provider = new ethers_1.ethers.providers.JsonRpcProvider(RPC_URL);
            const contract = new ethers_1.ethers.Contract(config_1.config.STAKING_CONTRACT_ADDRESS, this.ABI, provider);
            const result = await contract.getStakersSnapshot();
            const stakers = result[0];
            const tokenIds = result[1];
            this.stakingAddresses.clear();
            for (let i = 0; i < stakers.length; i++) {
                const staker = stakers[i];
                const tokens = tokenIds[i] || [];
                if (tokens.length > 0) {
                    this.stakingAddresses.add(staker.toLowerCase());
                }
            }
            this.lastUpdate = new Date();
            console.log(`Found ${this.stakingAddresses.size} staking wallets`);
        }
        catch (error) {
            console.error('❌ Error fetching staking snapshot:', error.message);
            if (error.message.includes("execution reverted")) {
                console.log("⚠️ Possible reasons:");
                console.log("- Gas limit exceeded");
                console.log("- Contract internal error");
                console.log("- Array size too large");
            }
        }
    }
    isStaking(address) {
        const isProtected = this.stakingAddresses.has(address.toLowerCase());
        if (isProtected) {
            console.log(` Wallet ${address} is protected (staking)`);
        }
        return isProtected;
    }
    async getStakingAddresses() {
        return Array.from(this.stakingAddresses);
    }
    getStats() {
        return {
            totalStakers: this.stakingAddresses.size,
            lastUpdate: this.lastUpdate
        };
    }
}
exports.stakingService = new StakingService();
//# sourceMappingURL=staking.js.map