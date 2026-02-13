FROM node:20-alpine

WORKDIR /app
RUN corepack enable

# Copy whole monorepo so pnpm workspace + lockfile are available
COPY . .

RUN pnpm i --frozen-lockfile
RUN pnpm --dir packages/bot build

CMD ["pnpm", "--dir", "packages/bot", "start"]
