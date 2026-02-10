# 🚀 ArbiMind Deployment Guide

## Quick Deploy Checklist

- [ ] **Backend** (Railway/Render) – Engine API on port 8000
- [ ] **UI** (Vercel) – Next.js frontend
- [ ] **Env vars** – Both platforms configured
- [ ] **Contracts** (optional) – Arb executor on Sepolia/Mainnet
- [ ] **DNS** – Point arbimind.xyz to Vercel

---

## 1. Backend (Railway)

### Recommended: Force Docker (bypasses Railpack)

Use this setup — it avoids Railpack "Error creating build plan" entirely.

**Railway backend service settings:**

| Setting | Value |
|---------|-------|
| **Source** | Repo `rigocrypto/arbimind`, Branch `main` |
| **Root Directory** | **Leave EMPTY** |
| **Variables** | See below |

**Variables (Settings → Variables):**

| Variable | Value |
|----------|-------|
| `RAILWAY_DOCKERFILE_PATH` | `Dockerfile.backend` |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://arbimind.vercel.app` |
| `ADMIN_API_KEY` | Your secret admin key (e.g. `openssl rand -hex 32`) |
| `AI_SERVICE_KEY` | Service-to-service key for AI prediction logging |
| `TREASURY_ADDRESS` | `0x...` | Treasury wallet (admin display) |
| `EXECUTION_ADDRESS` | `0x...` | Execution/hot wallet (admin display) |
| `SOLANA_ARB_ACCOUNT` | Your arb pubkey (base58) |
| `SOLANA_FEE_WALLET` | Fee destination pubkey (base58) |
| `SOLANA_FEE_PCT` | `0.5` | Fee % |
| `SOLANA_FEE_MIN_SOL` | `0.001` | Min fee in SOL |
| `SOLANA_CLUSTER` | `mainnet-beta` | For Jupiter swaps |
| `SOLANA_JUPITER_RPC_URL` | `https://api.mainnet-beta.solana.com` | Or paid RPC |

**Redeploy** — Railway uses `Dockerfile.backend` at repo root; Railpack is not used.

### Admin Dashboard (`/admin`)

- **UI**: Visit `/admin`, enter `ADMIN_API_KEY` to login. Key is stored in `localStorage`.
- **Backend (admin-only)**: Most `/api/admin/*` routes require `X-ADMIN-KEY: <ADMIN_API_KEY>` header.
- **Backend (service key allowed)**: `/api/admin/ai-dashboard/predictions*` accepts `X-SERVICE-KEY: <AI_SERVICE_KEY>` for service-to-service logging and evaluation.
- **Endpoints (admin)**: `GET /api/admin/metrics`, `GET /api/admin/txs`, `GET /api/admin/wallets`, `POST /api/admin/engine/pause`, `POST /api/admin/engine/resume`.
- **Security**: Treat both keys as secrets; rotate if leaked. Store in `.env` locally and in deployment secrets in production.

---

### Alternative: Root Directory mode

If you prefer building from `packages/backend`:

1. **Root Directory** = `packages/backend` (no leading/trailing slashes)
2. **Remove** `RAILWAY_DOCKERFILE_PATH` (or set to `Dockerfile`)
3. `packages/backend/Dockerfile` will be used automatically

**Do not mix** Root Directory with `RAILWAY_DOCKERFILE_PATH=Dockerfile.backend`.

---

### Verify before deploy

```powershell
git fetch origin
git ls-tree -r --name-only origin/main | findstr "packages/backend/src/index.ts"
```

If that prints the path, `main` has the backend code.

---

### Backend URL

After deploy: `https://arbimind-production.up.railway.app` (or your Railway URL)

Test: `curl https://arbimind-production.up.railway.app/api/health`

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
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `mainnet-beta` | For Jupiter swaps |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | (optional) | Custom Solana RPC |
| `NEXT_PUBLIC_SOLANA_ARB_ACCOUNT` | (optional) | Arb pubkey for display |

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

### Post-Deploy Verify

| Check | Expected |
|-------|----------|
| UI loads | No CSP errors, API 200s |
| `/solana-wallet` | Phantom connect → transfer works (mainnet) |
| `/docs` | All links work |
| `/admin` | Admin key auth works |
| Console/Network | No errors |

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
