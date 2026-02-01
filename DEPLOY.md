# 🚀 ArbiMind Deployment Guide

## Quick Deploy Checklist

- [ ] **Backend** (Railway/Render) – Engine API on port 8000
- [ ] **UI** (Vercel) – Next.js frontend
- [ ] **Env vars** – Both platforms configured
- [ ] **Contracts** (optional) – Arb executor on Sepolia/Mainnet
- [ ] **DNS** – Point arbimind.xyz to Vercel

---

## 1. Backend (Railway)

### Railway Settings (important)

1. **Root Directory**: Set to `packages/backend` (Settings → Root Directory)
2. Railway will use `nixpacks.toml` in that folder for build/start

### Deploy

```bash
# From repo root
cd packages/backend
npm i -g @railway/cli
railway login
railway init
railway up
```

Or: Connect GitHub → New Service → Set Root Directory = `packages/backend` → Deploy

### Railway Env Vars

| Variable | Value | Required |
|----------|-------|----------|
| `PORT` | `8000` | Yes |
| `FRONTEND_URL` | `https://arbimind.vercel.app` or your domain | Yes (CORS) |
| `NODE_ENV` | `production` | Yes |

### Backend URL

After deploy: `https://your-app-name.up.railway.app`

Test: `curl https://your-app-name.up.railway.app/api/health`

---

## 2. UI (Vercel)

### Deploy

```bash
# From repo root – vercel.json points to packages/ui
vercel --prod
# or: connect GitHub repo in Vercel dashboard
```

### Vercel Env Vars

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_API_URL` | `https://your-backend.up.railway.app/api` | **Must end with /api** |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Your WC project ID | [cloud.walletconnect.com](https://cloud.walletconnect.com) |
| `NEXT_PUBLIC_ENABLE_API` | `true` | Enable real API calls (optional) |

### URL Verification

- `useArbiApi.ts` uses `NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'`
- Engine calls: `POST ${API_BASE}/engine/start` → `https://backend.../api/engine/start`
- Ensure **no trailing slash** on base: `https://backend.../api` ✅

---

## 3. Env / URL Verification Script

Run locally to verify env:

```powershell
# Backend
cd packages/backend
$url = $env:FRONTEND_URL ?? "http://localhost:3000"
Write-Host "Backend expects FRONTEND_URL: $url"

# UI
cd ../ui
$api = $env:NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"
Write-Host "UI API base: $api"
# Test: Invoke-RestMethod "$api/health"
```

### Railway → Vercel connectivity

1. Backend: set `FRONTEND_URL` = your Vercel URL
2. UI: set `NEXT_PUBLIC_API_URL` = `https://YOUR_RAILWAY_APP.up.railway.app/api`
3. Rebuild both after env changes

---

## 4. Local Prod Test

```powershell
# Terminal 1: Backend
cd packages/backend
pnpm build && pnpm start

# Terminal 2: UI (prod build)
cd packages/ui
pnpm build && pnpm start

# Browser: localhost:3000
# Toggle engine → Backend logs "Engine STARTED"
```

---

## 5. Contracts (Optional)

```bash
cd packages/contracts
forge build
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
```

---

## 6. Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS errors | Set `FRONTEND_URL` on backend to exact UI origin |
| Engine 404 | Ensure `NEXT_PUBLIC_API_URL` ends with `/api` |
| WalletConnect 403 | Use real Project ID from cloud.walletconnect.com |
| Build fails | `pnpm install --frozen-lockfile` at root |
