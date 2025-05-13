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
        this.blockvisionUrl = 'https://api.blockvision.org/v2/monad/account/transactions';
        this.holdersUrl = `${config_1.config.BASE_URL}/api/nft/holders_v2`;
        this.nftContractAddress = config_1.config.NFT_CONTRACT_ADDRESS;
        this.isUpdatingHolders = false;
        this.verificationAmounts = new Map();
        this.updateHoldersCache();
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
            console.log(`Generated new verification amount for ${normalizedAddress}: ${amount} wei (${(Number(amount) / 1e18).toFixed(5)} MON)`);
        }
        else {
            console.log(`Retrieved existing verification amount for ${normalizedAddress}: ${amount} wei (${(Number(amount) / 1e18).toFixed(5)} MON)`);
        }
        return amount;
    }
    clearVerificationAmount(address) {
        const normalizedAddress = address.toLowerCase();
        console.log(`Clearing verification amount for ${normalizedAddress}`);
        this.verificationAmounts.delete(normalizedAddress);
    }
    async updateHoldersCache() {
        if (this.isUpdatingHolders)
            return;
        try {
            this.isUpdatingHolders = true;
            console.log('Fetching holders from API...');
            const response = await axios_1.default.get(`${this.holdersUrl}/${this.nftContractAddress}`);
            if (!response.data.success) {
                throw new Error('Failed to fetch holders');
            }
            const holders = response.data.data.holders.map(holder => ({
                address: holder.address.toLowerCase(),
                tokenCount: holder.tokenCount,
                tokens: holder.tokens
            }));
            console.log(`Found ${holders.length} holders, updating database...`);
            await database_1.db.updateHolders(holders);
            console.log('Holders cache updated successfully');
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
            console.log(`Fetching recent transactions for ${normalizedAddress}`);
            const response = await axios_1.default.get(this.blockvisionUrl, {
                params: {
                    address: normalizedAddress,
                    limit: 10
                },
                headers: {
                    'accept': 'application/json',
                    'x-api-key': config_1.config.BLOCKVISION_API_KEY
                }
            });
            return response.data.result.data
                .filter((tx) => tx.from.toLowerCase() === normalizedAddress &&
                tx.to.toLowerCase() === normalizedAddress)
                .map((tx) => ({
                hash: tx.hash,
                from: tx.from.toLowerCase(),
                to: tx.to.toLowerCase(),
                value: tx.value,
                status: tx.status
            }));
        }
        catch (error) {
            console.error('Error fetching transactions:', error);
            return [];
        }
    }
    async isHolder(address) {
        return database_1.db.isHolder(address);
    }
    async getTokenCount(address) {
        return database_1.db.getTokenCount(address);
    }
    async hasReceivedPayment(address) {
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
        }
        else {
            console.log('No valid verification transaction found');
        }
        return validTransaction;
    }
}
exports.NFTService = NFTService;
exports.nftService = new NFTService();
//# sourceMappingURL=nft.js.map