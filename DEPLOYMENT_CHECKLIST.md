# ArbiMind Deployment Checklist (Railway + Vercel)

This checklist verifies the full ArbiMind stack after deployment.

## 1) Railway (Backend)

### Required environment variables
- `ADMIN_API_KEY` (required for `/api/admin/*`)
- `DATABASE_URL` (required for snapshots + snapshot monitoring)
- `EVM_ARB_ACCOUNT` (required for EVM portfolio attribution)
- `SOLANA_ARB_ACCOUNT`
- `SOLANA_FEE_WALLET`
- `SOLANA_FEE_PCT`
- `SOLANA_FEE_MIN_SOL`

### Optional environment variables
- CoinGecko pricing:
  - `COINGECKO_ENABLED=true`
  - `COINGECKO_TTL_SECONDS=600`
  - `COINGECKO_BASE_URL=https://api.coingecko.com/api/v3`
  - `COINGECKO_API_KEY` (optional)
- EVM native ETH deposits:
  - `PORTFOLIO_EVM_SCAN_NATIVE=true`
  - `PORTFOLIO_EVM_NATIVE_LOOKBACK_DAYS=30`
  - (Requires Alchemy RPC/key)

### Verify backend is up
- `GET /api/health` returns 200

## 2) Railway Postgres
- Postgres plugin attached
- `DATABASE_URL` set on backend service

## 3) Railway Cron (Daily Snapshots)
Recommended schedule: **02:05 UTC** (daily)

Call both chains:
- `POST /api/admin/snapshots/run?chain=evm&range=30d`
- `POST /api/admin/snapshots/run?chain=solana&range=30d`

Headers:
- `X-ADMIN-KEY: <ADMIN_API_KEY>`

Expected responses:
- Success run: `200 { ok: true, acquiredLock: true, ... }`
- Already running: `200 { ok: false, reason: "already_running", acquiredLock: false, ... }`

## 4) Snapshot Monitoring
Public health endpoints:
- `GET /api/snapshots/health?chain=evm`
- `GET /api/snapshots/health?chain=solana`

Expected:
- `stale: false`
- `ok: true`
- `lastOkAt` present

Note: `timeseries.method` may remain `estimated_linear_ramp_to_current_equity` until the first daily snapshot cron completes; validator warns but does not fail.

## 5) Vercel (UI)

### Required environment variables
- `NEXT_PUBLIC_API_URL=https://<railway-backend>/api` (must be exactly one URL; no comma/space concatenation)
- `NEXT_PUBLIC_SOLANA_CLUSTER` (devnet/testnet/mainnet-beta)
- `NEXT_PUBLIC_SOLANA_ARB_ACCOUNT` (public display)

### Verify UI
- UI loads without console CSP/CORS errors
- `/docs` works and links resolve
- `/wallet` loads portfolio section
- `/solana-wallet` loads portfolio section and wallet connect

## 6) Post-deploy smoke tests
- Portfolio:
  - `GET /api/portfolio/evm?address=0x...`
  - `GET /api/portfolio/solana?address=<base58>`
  - `GET /api/portfolio/*/timeseries?...`
- Admin (requires header):
  - `GET /api/admin/snapshots/last-run?chain=evm`
  - `GET /api/admin/snapshots/last-run?chain=solana`
