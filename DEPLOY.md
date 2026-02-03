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
| `ADMIN_API_KEY` | Your secret admin key | Required for `/api/admin/*` |
| `TREASURY_ADDRESS` | `0x...` | Treasury wallet (admin display) |
| `EXECUTION_ADDRESS` | `0x...` | Execution/hot wallet (admin display) |

**Redeploy** — Railway uses `Dockerfile.backend` at repo root; Railpack is not used.

### Admin Dashboard (`/admin`)

- **UI**: Visit `/admin`, enter `ADMIN_API_KEY` to login. Key is stored in `localStorage`.
- **Backend**: All `/api/admin/*` routes require `X-ADMIN-KEY: <ADMIN_API_KEY>` header.
- **Endpoints**: `GET /api/admin/metrics`, `GET /api/admin/txs`, `GET /api/admin/wallets`, `POST /api/admin/engine/pause`, `POST /api/admin/engine/resume`.
- **Security**: Never expose `ADMIN_API_KEY` in the UI. Use a strong random string (e.g. `openssl rand -hex 32`).

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
