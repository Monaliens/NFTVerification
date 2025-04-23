"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const client_1 = require("@prisma/client");
class DatabaseService {
    constructor() {
        this.prisma = new client_1.PrismaClient();
    }
    async createUser(discordId) {
        return this.prisma.user.create({
            data: { discordId },
            include: { wallets: true }
        });
    }
    async getUser(discordId) {
        return this.prisma.user.findUnique({
            where: { discordId },
            include: { wallets: true }
        });
    }
    async getAllUsers() {
        return this.prisma.user.findMany({
            include: { wallets: true }
        });
    }
    async getWalletStatus(address) {
        const wallet = await this.prisma.wallet.findUnique({
            where: { address: address.toLowerCase() },
            include: { user: true }
        });
        if (!wallet) {
            return { exists: false, isVerified: false, ownerId: null };
        }
        return {
            exists: true,
            isVerified: wallet.isVerified,
            ownerId: wallet.user.discordId
        };
    }
    async forceDeleteWallet(address) {
        await this.prisma.wallet.deleteMany({
            where: { address: address.toLowerCase() }
        });
    }
    async addWallet(discordId, address) {
        const normalizedAddress = address.toLowerCase();
        try {
            const status = await this.getWalletStatus(normalizedAddress);
            if (status.exists && status.isVerified && status.ownerId !== discordId) {
                return {
                    success: false,
                    error: 'This wallet is already verified by another user.'
                };
            }
            if (status.exists && !status.isVerified) {
                await this.forceDeleteWallet(normalizedAddress);
            }
            let user = await this.prisma.user.findUnique({
                where: { discordId }
            });
            if (!user) {
                user = await this.prisma.user.create({
                    data: { discordId }
                });
            }
            await this.prisma.wallet.create({
                data: {
                    address: normalizedAddress,
                    isVerified: false,
                    userId: user.id
                }
            });
            return { success: true };
        }
        catch (error) {
            console.error('Error in addWallet:', error);
            return {
                success: false,
                error: 'An error occurred while processing the wallet.'
            };
        }
    }
    async verifyWallet(address) {
        const normalizedAddress = address.toLowerCase();
        const wallet = await this.prisma.wallet.findUnique({
            where: { address: normalizedAddress }
        });
        if (!wallet) {
            throw new Error('Wallet not found');
        }
        await this.prisma.wallet.update({
            where: { address: normalizedAddress },
            data: { isVerified: true }
        });
    }
    async getUserWallets(discordId) {
        const user = await this.getUser(discordId);
        if (!user) {
            return [];
        }
        return this.prisma.wallet.findMany({
            where: { userId: user.id }
        });
    }
    async deleteWallet(discordId, address) {
        const user = await this.getUser(discordId);
        if (!user) {
            return;
        }
        await this.prisma.wallet.deleteMany({
            where: {
                AND: [
                    { address },
                    { userId: user.id }
                ]
            }
        });
    }
    async hasVerifiedWallet(discordId) {
        const user = await this.getUser(discordId);
        if (!user) {
            return false;
        }
        const verifiedWallet = await this.prisma.wallet.findFirst({
            where: {
                AND: [
                    { userId: user.id },
                    { isVerified: true }
                ]
            }
        });
        return !!verifiedWallet;
    }
    async isWalletRegistered(address) {
        const wallet = await this.prisma.wallet.findUnique({
            where: { address }
        });
        return !!wallet;
    }
    async updateHolders(holders) {
        try {
            await this.prisma.holder.deleteMany({});
            if (holders.length > 0) {
                await this.prisma.holder.createMany({
                    data: holders.map(holder => ({
                        address: holder.address.toLowerCase(),
                        tokenCount: holder.tokenCount
                    }))
                });
            }
            console.log('Holders update completed successfully');
        }
        catch (error) {
            console.error('Error updating holders:', error);
            throw error;
        }
    }
    async isHolder(address) {
        const holder = await this.prisma.holder.findUnique({
            where: { address: address.toLowerCase() }
        });
        return !!holder;
    }
    async getTokenCount(address) {
        const holder = await this.prisma.holder.findUnique({
            where: { address: address.toLowerCase() }
        });
        return holder?.tokenCount || 0;
    }
    async getWallets(discordId) {
        const user = await this.prisma.user.findUnique({
            where: { discordId },
            include: { wallets: true }
        });
        if (!user) {
            return [];
        }
        const wallets = await Promise.all(user.wallets.map(async (wallet) => {
            const tokenCount = await this.getTokenCount(wallet.address);
            return {
                address: wallet.address,
                isVerified: wallet.isVerified,
                tokenCount
            };
        }));
        return wallets;
    }
}
exports.db = new DatabaseService();
//# sourceMappingURL=database.js.map