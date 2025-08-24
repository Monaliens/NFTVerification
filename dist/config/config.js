"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NFT_TIERS = exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
    WELCOME_CHANNEL_ID: process.env.WELCOME_CHANNEL_ID,
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: process.env.BASE_URL,
    VERIFICATION_WALLET_ADDRESS: process.env.VERIFICATION_WALLET_ADDRESS,
    BLOCKVISION_API_KEY: process.env.BLOCKVISION_API_KEY,
    NFT_CONTRACT_ADDRESS: process.env.NFT_CONTRACT_ADDRESS,
    MONAD_RPC_URL: process.env.MONAD_RPC_URL,
    VERIFIED_ROLE_ID: process.env.VERIFIED_ROLE_ID,
    HOLDER_ROLE_ID: process.env.HOLDER_ROLE_ID,
    WAITING_ROOM_ROLE_ID: process.env.WAITING_ROOM_ROLE_ID,
    ADMIN_KEY: process.env.ADMIN_KEY,
    NFT_1_ROLE_ID: process.env.NFT_1_ROLE_ID,
    NFT_3_ROLE_ID: process.env.NFT_3_ROLE_ID,
    NFT_5_ROLE_ID: process.env.NFT_5_ROLE_ID,
    NFT_10_ROLE_ID: process.env.NFT_10_ROLE_ID,
    NFT_50_ROLE_ID: process.env.NFT_50_ROLE_ID,
};
exports.NFT_TIERS = [
    { minTokens: 50, roleId: process.env.NFT_50_ROLE_ID, name: '50+ NFTs' },
    { minTokens: 10, roleId: process.env.NFT_10_ROLE_ID, name: '10+ NFTs' },
    { minTokens: 5, roleId: process.env.NFT_5_ROLE_ID, name: '5+ NFTs' },
    { minTokens: 3, roleId: process.env.NFT_3_ROLE_ID, name: '3+ NFTs' },
    { minTokens: 1, roleId: process.env.NFT_1_ROLE_ID, name: '1+ NFTs' },
];
//# sourceMappingURL=config.js.map