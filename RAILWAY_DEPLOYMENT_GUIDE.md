# Railway Deployment Guide

## 1. Connect GitHub Repo
- Go to https://railway.app
- New Project → Deploy from GitHub → Select `arbimind`

## 2. Services

### Service 1: `ui` (Frontend)
- **Build Command**: `cd packages/ui && npm install && npm run build`
- **Start Command**: `cd packages/ui && npm start`
- **Port**: `3000`
- **Domain**: `ui.arbimind.app`

### Service 2: `bot` (Arbitrage Engine)
- **Build Command**: `cd packages/bot && pnpm install && pnpm run build`
- **Start Command**: `cd packages/bot && pm2-runtime dist/index.js`
- **Port**: `3001` (internal)

### Service 3: `backend` (API)
- **Build Command**: `cd packages/backend && pnpm install && pnpm run build`
- **Start Command**: `cd packages/backend && pm2-runtime dist/index.js`
- **Port**: `3002`
- **Domain**: `api.arbimind.app`

## 3. Environment Variables (Railway UI)
Set these in Railway's Environment section for each service (or use a shared environment):

```
NODE_ENV=production
RPC_URL=https://arb-mainnet.g.alchemy.com/v2/...
PRIVATE_KEY=0x...
DATABASE_URL=postgresql://...
```

## 4. Docker (Optional)
Railway detects Dockerfiles automatically; the root `Dockerfile` will build the monorepo and run `pm2-runtime`.

## 5. Domains
- `arbimind.app` → ui service
- `api.arbimind.app` → backend service

---

Notes:
- For the `bot` service, ensure PRIVATE_KEY and RPC_URL are set and restricted to required scopes.
- Railway provides secrets management — use it for `PRIVATE_KEY`, `DATABASE_URL`, and other sensitive values.
