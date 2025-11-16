# Dockerfile (root)
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Copy source
COPY . .

# Build contracts
RUN cd packages/contracts && forge build

# Build bot & backend
RUN pnpm install --frozen-lockfile
RUN pnpm run build --filter=@arbimind/bot --filter=@arbimind/backend

# Production image
FROM node:20-alpine
WORKDIR /app
COPY --from=base /app/packages/bot/dist ./packages/bot/dist
COPY --from=base /app/packages/backend/dist ./packages/backend/dist
COPY --from=base /app/ecosystem.config.js ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages

RUN npm install -g pm2

EXPOSE 3000 3001

CMD ["pm2-runtime", "start", "ecosystem.config.js"]
