FROM node:20-alpine

WORKDIR /app

# Install OpenSSL
RUN apk add --no-cache openssl

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Start the bot
CMD ["npm", "start"] 