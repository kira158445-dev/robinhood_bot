FROM node:20-alpine

WORKDIR /app

# Copy package descriptors and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code and config files
COPY . .

# Run bot process continuously
CMD ["npm", "start"]
