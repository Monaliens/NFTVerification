import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file

// Try dotenv as fallback
dotenv.config();

// NFT Tier Role Configuration Schema
const nftTierRoleSchema = z.object({
  minTokens: z.number(),
  maxTokens: z.number(),
  roleId: z.string(),
  name: z.string(),
});

const envSchema = z.object({
  // Discord Configuration
  DISCORD_TOKEN: z.string(),
  DISCORD_CLIENT_ID: z.string(),
  DISCORD_GUILD_ID: z.string(),
  WELCOME_CHANNEL_ID: z.string(),

  // MongoDB Configuration
  DATABASE_URL: z.string(),

  // API Configuration
  BASE_URL: z.string().default('https://api.monaliens.xyz'),

  // NFT Configuration
  VERIFICATION_WALLET_ADDRESS: z.string(),
  BLOCKVISION_API_KEY: z.string(),
  
  // Single Collection with Tier Roles
  NFT_CONTRACT_ADDRESS: z.string(),
  NFT_TIER_ROLES: z.string().transform((str) => {
    try {
      const parsed = JSON.parse(str);
      return z.array(nftTierRoleSchema).parse(parsed);
    } catch (error) {
      console.error('Invalid NFT_TIER_ROLES format:', error);
      return [];
    }
  }),
  
  // Discord Role IDs
  VERIFIED_ROLE_ID: z.string(),
});

type Config = z.infer<typeof envSchema>;

const parseEnv = (): Config => {
  const parsed = envSchema.safeParse(process.env);
  
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.errors, null, 2));
    process.exit(1);
  }

  return parsed.data;
};

export const config = parseEnv(); 