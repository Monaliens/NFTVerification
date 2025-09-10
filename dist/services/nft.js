"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nftService = exports.NFTService = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config/config");
const database_1 = require("./database");
class NFTService {
    constructor() {
        this.blockvisionUrl = 'https://monad-testnet.blockvision.org/v1/31jkZ3LmBlY1zcUdjPgXPISH0F5';
        this.holdersUrl = `${config_1.config.BASE_URL}/api/nft/holders_v2`;
        this.nftContractAddress = config_1.config.NFT_CONTRACT_ADDRESS;
        this.isUpdatingHolders = false;
        this.verificationAmounts = new Map();
        this.knownTransactions = new Map();
        this.updateHoldersCache();
        this.knownTransactions.set('0xa2a84fbf9134aca100999bfe83f13507269b5454', '0xa9998391d3eec2378a0a4d5228d74c09e3b818d5f0d1562693a955fa855c751f');
    }
    generateVerificationAmount() {
        const min = BigInt('10000000000000000');
        const max = BigInt('20000000000000000');
        const range = max - min;
        const random = BigInt(Math.floor(Math.random() * Number(range)));
        const amount = min + random;
        return amount.toString();
    }
    getVerificationAmount(address) {
        const normalizedAddress = address.toLowerCase();
        let amount = this.verificationAmounts.get(normalizedAddress);
        if (!amount) {
            amount = this.generateVerificationAmount();
            this.verificationAmounts.set(normalizedAddress, amount);
        }
        return amount;
    }
    clearVerificationAmount(address) {
        const normalizedAddress = address.toLowerCase();
        this.verificationAmounts.delete(normalizedAddress);
    }
    addKnownTransaction(address, txHash) {
        const normalizedAddress = address.toLowerCase();
        this.knownTransactions.set(normalizedAddress, txHash);
        console.log(`📝 Added known transaction for ${normalizedAddress}: ${txHash}`);
    }
    clearKnownTransaction(address) {
        const normalizedAddress = address.toLowerCase();
        this.knownTransactions.delete(normalizedAddress);
        console.log(`🗑️ Cleared known transaction for ${normalizedAddress}`);
    }
    async updateHoldersCache() {
        if (this.isUpdatingHolders)
            return;
        try {
            this.isUpdatingHolders = true;
            const response = await axios_1.default.get(`${this.holdersUrl}/${this.nftContractAddress}`);
            if (!response.data.success) {
                throw new Error('Failed to fetch holders');
            }
            const holders = response.data.data.holders.map(holder => ({
                address: holder.address.toLowerCase(),
                tokenCount: holder.tokenCount,
                tokens: holder.tokens
            }));
            console.log(`✅ Updated ${holders.length} NFT holders`);
            await database_1.db.updateHolders(holders);
            return true;
        }
        catch (error) {
            console.error('Error updating holders cache:', error);
            return false;
        }
        finally {
            this.isUpdatingHolders = false;
        }
    }
    async getRecentTransactions(address) {
        try {
            const normalizedAddress = address.toLowerCase();
            console.log(`🌐 Fetching transactions for: ${normalizedAddress}`);
            console.log(`🔗 Using BlockVision API: ${this.blockvisionUrl}`);
            const latestBlockResponse = await axios_1.default.post(this.blockvisionUrl, {
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
            const blocksToCheck = 10;
            const fromBlock = Math.max(0, latestBlock - blocksToCheck);
            console.log(`� Scanning blocks ${fromBlock} to ${latestBlock} for transactions...`);
            const transactions = [];
            for (let blockNum = latestBlock; blockNum >= fromBlock && transactions.length < 10; blockNum--) {
                try {
                    if (blockNum !== latestBlock) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                    const blockResponse = await axios_1.default.post(this.blockvisionUrl, {
                        jsonrpc: '2.0',
                        method: 'eth_getBlockByNumber',
                        params: [`0x${blockNum.toString(16)}`, true],
                        id: 1
                    });
                    if (blockResponse.data.result && blockResponse.data.result.transactions) {
                        const blockTransactions = blockResponse.data.result.transactions;
                        const relevantTxs = blockTransactions.filter((tx) => tx.from?.toLowerCase() === normalizedAddress &&
                            tx.to?.toLowerCase() === normalizedAddress &&
                            tx.value && tx.value !== '0x0');
                        for (const tx of relevantTxs) {
                            transactions.push({
                                hash: tx.hash,
                                from: tx.from.toLowerCase(),
                                to: tx.to.toLowerCase(),
                                value: parseInt(tx.value, 16).toString(),
                                status: 1
                            });
                        }
                    }
                }
                catch (blockError) {
                    console.log(`⚠️ Error checking block ${blockNum}:`, blockError.message);
                    if (blockError.response?.status === 429) {
                        console.log('⏳ Rate limited, waiting 2 seconds...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }
            console.log(`� Self-transfers found: ${transactions.length}`);
            return transactions;
        }
        catch (error) {
            console.error('❌ Error fetching transactions:', error.message);
            return [];
        }
    }
    async isHolder(address) {
        return database_1.db.isHolder(address);
    }
    async getTokenCount(address) {
        return database_1.db.getTokenCount(address);
    }
    async getEligibleTierRoles(address) {
        const tokenCount = await this.getTokenCount(address);
        const eligibleRoles = config_1.NFT_TIERS.filter(tier => tokenCount >= tier.minTokens)
            .map(tier => tier.roleId);
        return eligibleRoles;
    }
    getAllTierRoleIds() {
        return config_1.NFT_TIERS.map(tier => tier.roleId);
    }
    async hasReceivedPayment(address) {
        const normalizedAddress = address.toLowerCase();
        console.log(`🔍 Checking payment for address: ${normalizedAddress}`);
        const knownTxHash = this.knownTransactions.get(normalizedAddress);
        if (knownTxHash) {
            console.log(`🚀 INSTANT: Checking known transaction ${knownTxHash}`);
            try {
                const txResponse = await axios_1.default.post(this.blockvisionUrl, {
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
                    }
                    else {
                        console.log(`❌ Known transaction doesn't meet verification criteria`);
                    }
                }
                else {
                    console.log(`⚠️ Known transaction not found in blockchain`);
                }
            }
            catch (error) {
                console.log(`⚠️ Error checking known transaction: ${error.message}`);
            }
        }
        const expectedAmount = this.getVerificationAmount(normalizedAddress);
        const expectedMON = (Number(expectedAmount) / 1e18).toFixed(5);
        console.log(`💰 Expected amount: ${expectedMON} MON (${expectedAmount} wei)`);
        const transactions = await this.getRecentTransactions(normalizedAddress);
        console.log(`📊 Found ${transactions.length} recent transactions`);
        if (transactions.length === 0) {
            console.log(`❌ No recent transactions found for ${normalizedAddress}`);
            return false;
        }
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
        }
        else {
            console.log(`❌ No valid payment found for ${normalizedAddress}`);
        }
        return validTransaction;
    }
    async manualVerifyPayment(address, adminKey) {
        if (adminKey !== config_1.config.ADMIN_KEY) {
            console.log(`❌ Invalid admin key for manual verification`);
            return false;
        }
        const normalizedAddress = address.toLowerCase();
        this.clearVerificationAmount(normalizedAddress);
        console.log(`✅ Manual payment verification approved for ${normalizedAddress} by admin`);
        return true;
    }
}
exports.NFTService = NFTService;
exports.nftService = new NFTService();
//# sourceMappingURL=nft.js.map