FROM node:20-slim

WORKDIR /app

# Install dependencies for Prisma
RUN apt-get update && apt-get install -y openssl

# Copy package files and install dependencies first
COPY package*.json ./
RUN npm install

# Copy Prisma schema
COPY prisma ./prisma/

# Generate Prisma client - using ARG which won't be stored in the final image
ARG DATABASE_URL
ARG MONGODB_URI
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Start the bot
CMD ["npm", "start"] 