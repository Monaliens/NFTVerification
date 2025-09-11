"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nftService = exports.NFTService = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config/config");
const database_1 = require("./database");
const staking_1 = require("./staking");
class NFTService {
    constructor() {
        this.blockvisionV2Url = "https://api.blockvision.org/v2/monad/account/internal/transactions";
        this.blockvisionApiKey = "2vPWlUoscxTlEDZ6OpaLbfsLhPc";
        this.holdersUrl = `${config_1.config.BASE_URL}/api/nft/holders_v2`;
        this.nftContractAddress = config_1.config.NFT_CONTRACT_ADDRESS;
        this.isUpdatingHolders = false;
        this.knownTransactions = new Map();
        this.paymentMonitors = new Map();
        this.updateHoldersCache();
        this.knownTransactions.set("0xa2a84fbf9134aca100999bfe83f13507269b5454", "0xa9998391d3eec2378a0a4d5228d74c09e3b818d5f0d1562693a955fa855c751f");
    }
    generateVerificationAmount() {
        const min = BigInt("10000000000000000");
        const max = BigInt("20000000000000000");
        const range = max - min;
        const random = BigInt(Math.floor(Math.random() * Number(range)));
        const amount = min + random;
        return amount.toString();
    }
    async getVerificationAmount(address) {
        const normalizedAddress = address.toLowerCase();
        let amount = await database_1.db.getVerificationAmount(normalizedAddress);
        if (!amount) {
            amount = this.generateVerificationAmount();
            await database_1.db.setVerificationAmount(normalizedAddress, amount);
            console.log(`🔢 Generated new verification amount for ${normalizedAddress}: ${(Number(amount) / 1e18).toFixed(5)} MON`);
        }
        else {
            console.log(`📋 Using existing verification amount for ${normalizedAddress}: ${(Number(amount) / 1e18).toFixed(5)} MON`);
        }
        return amount;
    }
    async clearVerificationAmount(address) {
        const normalizedAddress = address.toLowerCase();
        await database_1.db.clearVerificationAmount(normalizedAddress);
        console.log(`🗑️ Cleared verification amount for ${normalizedAddress}`);
    }
    startPaymentMonitoring(address, onPaymentFound) {
        const normalizedAddress = address.toLowerCase();
        this.stopPaymentMonitoring(normalizedAddress);
        console.log(`🔄 Starting payment monitoring for ${normalizedAddress} (60s duration, 2s intervals)`);
        let checksCount = 0;
        const maxChecks = 30;
        const checkPayment = async () => {
            checksCount++;
            console.log(`🔍 Payment check ${checksCount}/${maxChecks} for ${normalizedAddress}`);
            try {
                const hasPayment = await this.hasReceivedPayment(normalizedAddress);
                if (hasPayment) {
                    console.log(`🎉 Payment found during monitoring for ${normalizedAddress}!`);
                    this.stopPaymentMonitoring(normalizedAddress);
                    onPaymentFound();
                    return;
                }
                if (checksCount >= maxChecks) {
                    console.log(`⏰ Payment monitoring completed for ${normalizedAddress} (${checksCount} checks)`);
                    this.stopPaymentMonitoring(normalizedAddress);
                    return;
                }
                const timeout = setTimeout(checkPayment, 2000);
                this.paymentMonitors.set(normalizedAddress, timeout);
            }
            catch (error) {
                console.error(`❌ Error during payment monitoring for ${normalizedAddress}:`, error.message);
                if (checksCount >= maxChecks) {
                    this.stopPaymentMonitoring(normalizedAddress);
                }
                else {
                    const timeout = setTimeout(checkPayment, 2000);
                    this.paymentMonitors.set(normalizedAddress, timeout);
                }
            }
        };
        checkPayment();
    }
    stopPaymentMonitoring(address) {
        const normalizedAddress = address.toLowerCase();
        const existingTimeout = this.paymentMonitors.get(normalizedAddress);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
            this.paymentMonitors.delete(normalizedAddress);
            console.log(`⏹️ Stopped payment monitoring for ${normalizedAddress}`);
        }
    }
    stopAllPaymentMonitoring() {
        console.log(`🛑 Stopping all payment monitoring (${this.paymentMonitors.size} active monitors)`);
        for (const [address, timeout] of this.paymentMonitors.entries()) {
            clearTimeout(timeout);
            console.log(`   ⏹️ Stopped monitoring for ${address}`);
        }
        this.paymentMonitors.clear();
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
                throw new Error("Failed to fetch holders");
            }
            const apiHolders = response.data.data.holders.map((holder) => ({
                address: holder.address.toLowerCase(),
                tokenCount: holder.tokenCount,
                tokens: holder.tokens,
            }));
            console.log(`📊 API holders: ${apiHolders.length}`);
            await staking_1.stakingService.updateSnapshot();
            const stakingData = await this.getStakingTokenData();
            console.log(`🥩 Staking data collected for ${Object.keys(stakingData).length} addresses`);
            const mergedHolders = this.mergeHoldersWithStaking(apiHolders, stakingData);
            console.log(`✅ Total merged holders: ${mergedHolders.length}`);
            await database_1.db.updateHolders(mergedHolders);
            return true;
        }
        catch (error) {
            console.error("❌ Error updating holders cache:", error);
            console.error("❌ Error details:", {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            return false;
        }
        finally {
            this.isUpdatingHolders = false;
        }
    }
    async getStakingTokenData() {
        try {
            const stakingData = await staking_1.stakingService.getStakingTokenData();
            console.log(`🔍 Retrieved staking data for ${Object.keys(stakingData).length} addresses`);
            return stakingData;
        }
        catch (error) {
            console.error("Error getting staking token data:", error);
            return {};
        }
    }
    mergeHoldersWithStaking(apiHolders, stakingData) {
        const holderMap = new Map();
        for (const holder of apiHolders) {
            holderMap.set(holder.address, { ...holder });
        }
        for (const [address, stakingInfo] of Object.entries(stakingData)) {
            const existing = holderMap.get(address.toLowerCase());
            if (existing) {
                existing.tokenCount += stakingInfo.tokenCount;
                existing.tokens = [...existing.tokens, ...stakingInfo.tokens];
            }
            else {
                holderMap.set(address.toLowerCase(), {
                    address: address.toLowerCase(),
                    tokenCount: stakingInfo.tokenCount,
                    tokens: stakingInfo.tokens,
                });
            }
        }
        return Array.from(holderMap.values());
    }
    async getRecentTransactions(address) {
        try {
            const normalizedAddress = address.toLowerCase();
            console.log(`🌐 Fetching transactions with BlockVision V2 API for: ${normalizedAddress}`);
            const response = await axios_1.default.get(this.blockvisionV2Url, {
                params: {
                    address: normalizedAddress,
                    filter: "all",
                    limit: 20,
                    ascendingOrder: false,
                },
                headers: {
                    accept: "application/json",
                    "x-api-key": this.blockvisionApiKey,
                },
            });
            if (response.data.code !== 0) {
                console.log(`❌ API Error: ${response.data.reason}`);
                return [];
            }
            const transactions = [];
            const selfTransfers = response.data.result.data.filter((tx) => tx.from.toLowerCase() === normalizedAddress &&
                tx.to.toLowerCase() === normalizedAddress &&
                tx.value &&
                tx.value !== "0" &&
                tx.status === 1 &&
                !tx.error);
            for (const tx of selfTransfers) {
                transactions.push({
                    hash: tx.hash,
                    from: tx.from.toLowerCase(),
                    to: tx.to.toLowerCase(),
                    value: tx.value,
                    status: tx.status,
                });
            }
            console.log(`✅ Self-transfers found: ${transactions.length}`);
            transactions.forEach((tx, index) => {
                const amountInMON = (Number(tx.value) / 1e18).toFixed(6);
                console.log(`   ${index + 1}. ${tx.hash} - ${amountInMON} MON`);
            });
            return transactions;
        }
        catch (error) {
            console.error("❌ Error fetching transactions with V2 API:", error?.response?.data || error.message);
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
        const eligibleRoles = config_1.NFT_TIERS.filter((tier) => tokenCount >= tier.minTokens).map((tier) => tier.roleId);
        return eligibleRoles;
    }
    getAllTierRoleIds() {
        return config_1.NFT_TIERS.map((tier) => tier.roleId);
    }
    async hasReceivedPayment(address) {
        const normalizedAddress = address.toLowerCase();
        console.log(`🔍 Checking payment for address: ${normalizedAddress}`);
        const knownTxHash = this.knownTransactions.get(normalizedAddress);
        if (knownTxHash) {
            console.log(`🚀 INSTANT: Checking known transaction ${knownTxHash}`);
            try {
                const recentTransactions = await this.getRecentTransactions(normalizedAddress);
                const knownTx = recentTransactions.find((tx) => tx.hash.toLowerCase() === knownTxHash.toLowerCase());
                if (knownTx) {
                    const valueInWei = Number(knownTx.value);
                    const valueInMON = valueInWei / 1e18;
                    console.log(`✅ Known transaction found: ${valueInMON.toFixed(6)} MON`);
                    const isSelfTransfer = knownTx.from === normalizedAddress &&
                        knownTx.to === normalizedAddress;
                    const isValidAmount = valueInMON >= 0.01;
                    const isSuccessful = knownTx.status === 1;
                    console.log(`   Self-transfer: ${isSelfTransfer ? "✅" : "❌"}`);
                    console.log(`   Valid amount: ${isValidAmount ? "✅" : "❌"} (${valueInMON.toFixed(6)} >= 0.01)`);
                    console.log(`   Successful: ${isSuccessful ? "✅" : "❌"}`);
                    if (isSelfTransfer && isValidAmount && isSuccessful) {
                        console.log(`🎉 INSTANT VERIFICATION SUCCESS for ${normalizedAddress}!`);
                        await this.clearVerificationAmount(normalizedAddress);
                        return true;
                    }
                    else {
                        console.log(`❌ Known transaction doesn't meet verification criteria`);
                    }
                }
                else {
                    console.log(`⚠️ Known transaction not found in recent transactions`);
                }
            }
            catch (error) {
                console.log(`⚠️ Error checking known transaction: ${error.message}`);
            }
        }
        const expectedAmount = await this.getVerificationAmount(normalizedAddress);
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
                isSelfTransfer: tx.from === tx.to && tx.from === normalizedAddress,
            });
        });
        const validTransaction = transactions.some((tx) => {
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
        await this.clearVerificationAmount(normalizedAddress);
        console.log(`✅ Manual payment verification approved for ${normalizedAddress} by admin`);
        return true;
    }
}
exports.NFTService = NFTService;
exports.nftService = new NFTService();
//# sourceMappingURL=nft.js.map