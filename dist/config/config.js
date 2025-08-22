"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const nftCollectionSchema = zod_1.z.object({
    contractAddress: zod_1.z.string(),
    name: zod_1.z.string(),
    roleId: zod_1.z.string(),
    minTokens: zod_1.z.number().default(1),
});
const envSchema = zod_1.z.object({
    DISCORD_TOKEN: zod_1.z.string(),
    DISCORD_CLIENT_ID: zod_1.z.string(),
    DISCORD_GUILD_ID: zod_1.z.string(),
    WELCOME_CHANNEL_ID: zod_1.z.string(),
    DATABASE_URL: zod_1.z.string(),
    BASE_URL: zod_1.z.string().default('https://api.monaliens.xyz'),
    VERIFICATION_WALLET_ADDRESS: zod_1.z.string(),
    BLOCKVISION_API_KEY: zod_1.z.string(),
    NFT_COLLECTIONS: zod_1.z.string().transform((str) => {
        try {
            const parsed = JSON.parse(str);
            return zod_1.z.array(nftCollectionSchema).parse(parsed);
        }
        catch (error) {
            console.error('Invalid NFT_COLLECTIONS format:', error);
            return [];
        }
    }),
    NFT_CONTRACT_ADDRESS: zod_1.z.string().optional(),
    HOLDER_ROLE_ID: zod_1.z.string().optional(),
    VERIFIED_ROLE_ID: zod_1.z.string(),
});
const parseEnv = () => {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
        console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.errors, null, 2));
        process.exit(1);
    }
    return parsed.data;
};
exports.config = parseEnv();
//# sourceMappingURL=config.js.map