import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Discord Configuration
  DISCORD_TOKEN: z.string(),
  DISCORD_CLIENT_ID: z.string(),
  DISCORD_GUILD_ID: z.string(),
  WELCOME_CHANNEL_ID: z.string(),

  // MongoDB Configuration
  DATABASE_URL: z.string(),

  // NFT Configuration
  VERIFICATION_WALLET_ADDRESS: z.string(),
  BLOCKVISION_API_KEY: z.string(),
  NFT_CONTRACT_ADDRESS: z.string(),
  // Discord Role IDs
  VERIFIED_ROLE_ID: z.string(),
  HOLDER_ROLE_ID: z.string(),
  WAITING_ROOM_ROLE_ID: z.string(),
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