# NFT Verification Discord Bot

A Discord bot for managing NFT holder verification and role management.

## Features

- Welcome message with interactive buttons
- Wallet management (add, list, delete)
- Automatic verification upon payment
- NFT holder role management
- Multiple wallet support per user

## Setup

1. Clone the repository:
```bash
git clone https://github.com/Monaliens/NFTVerification.git
cd NFTVerification
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with the following variables:
```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_GUILD_ID=your_discord_guild_id
WELCOME_CHANNEL_ID=your_welcome_channel_id

# MongoDB Configuration
DATABASE_URL=your_mongodb_url

# NFT Configuration
VERIFICATION_WALLET_ADDRESS=your_verification_wallet_address
BLOCKVISION_API_KEY=your_blockvision_api_key

# Discord Role IDs
VERIFIED_ROLE_ID=your_verified_role_id
HOLDER_ROLE_ID=your_holder_role_id
WAITING_ROOM_ROLE_ID=your_waiting_room_role_id
```

4. Generate Prisma client:
```bash
npm run prisma:generate
```

5. Build the project:
```bash
npm run build
```

6. Start the bot:
```bash
npm start
```

For development:
```bash
npm run dev
```

## Bot Usage

1. When a new user joins the server:
   - They receive a welcome message with three buttons
   - They start in the waiting room

2. Adding a wallet:
   - Click "Add Wallet" button
   - Enter wallet address
   - Send verification payment
   - Bot automatically verifies payment and updates roles

3. Managing wallets:
   - List wallets: Shows all registered wallets and their verification status
   - Delete wallet: Remove a wallet from your profile

4. Role Management:
   - Verified role: Given after successful payment verification
   - Holder role: Given to users with NFTs
   - Waiting room role: Removed after verification

## Automatic Updates

- The bot checks holder status every 10 minutes
- Automatically updates roles based on NFT ownership
- Removes holder role if NFT is transferred
