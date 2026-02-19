FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

# Build from repository sources so workspace dependencies resolve correctly
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --dir packages/bot build

FROM node:20-alpine AS runner
WORKDIR /app
RUN corepack enable

# Copy only built workspace artifacts from builder to avoid stale local files
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/bot ./packages/bot

CMD ["pnpm", "--dir", "packages/bot", "start"]
