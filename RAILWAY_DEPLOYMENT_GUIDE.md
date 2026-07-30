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
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

### 3.1 `DATABASE_URL` (backend service)

Set `DATABASE_URL` as a Railway **reference variable**, not a pasted connection string:

```env
# ✅ Correct — reference variable, resolved by Railway at deploy time
DATABASE_URL=${{Postgres.DATABASE_URL}}

# ❌ Wrong — a literal URL wrapped in reference syntax. This is not a reference
#    and does not resolve; Railway yields an empty value.
DATABASE_URL=${{postgresql://postgres:password@postgres.railway.internal:5432/railway}}

# ⚠️ Literal — acceptable only as a temporary connectivity test, never as the
#    committed production configuration. See the drift warning below.
DATABASE_URL=postgresql://postgres:password@postgres.railway.internal:5432/railway
```

**Why a reference and not a literal.** Private Railway hostnames such as
`postgres.railway.internal` are derived from the service name. A pasted literal
silently goes stale whenever the Postgres service is renamed or recreated — the
backend then fails with `getaddrinfo ENOTFOUND postgres.railway.internal` while
Postgres itself is perfectly healthy. A reference variable tracks the service and
survives both renames and password rotations.

Operational notes:

- Prefer Railway's **reference picker** over typing the expression by hand. The
  picker inserts the exact service name and correct syntax.
- The service name in the reference must match the Railway Postgres service name
  **exactly**, including case. An unresolvable reference produces an *empty*
  value rather than an error.
- Backend and Postgres must be in the **same project and environment**. Private
  `*.railway.internal` hostnames do not resolve across environments.
- **After changing backend variables, redeploy the backend service.** Containers
  receive their environment at start; restarting Postgres alone does not update
  a running backend container.
- Never commit a real `DATABASE_URL` or any credential to the repository.

### 3.2 Verifying a `DATABASE_URL` change

Do not assume a variable edit took effect — confirm it against the running service:

```bash
# 1. Confirm the container actually restarted. A large uptime means your
#    redeploy never happened and every other result is meaningless.
curl -s https://<backend-domain>/api/health

# 2. Confirm the database is genuinely reachable (returns rows, not just 200).
curl -i https://<backend-domain>/api/analytics/events?limit=1

# 3. Confirm the DB-backed report endpoint builds.
curl -i "https://<backend-domain>/api/analytics/ab-cta?window=7d"
```

Troubleshooting:

| Symptom | Meaning |
| --- | --- |
| `503 DATABASE_URL not set` | The variable is absent or resolved to empty. The reference name is wrong, or the edit was never deployed. |
| `500` + `ENOTFOUND postgres.railway.internal` | The variable exists but points at an unresolvable host — typically a stale literal after a service rename. |
| `500` + SQL/table error | Connectivity works; the remaining problem is schema or query related. |
| `/api/health` uptime in the thousands of seconds | The container predates your change. Redeploy before interpreting anything else. |

## 4. Docker (Optional)
Railway detects Dockerfiles automatically; the root `Dockerfile` will build the monorepo and run `pm2-runtime`.

## 5. Domains
- `arbimind.app` → ui service
- `api.arbimind.app` → backend service

---

Notes:
- For the `bot` service, ensure PRIVATE_KEY and RPC_URL are set and restricted to required scopes.
- Railway provides secrets management — use it for `PRIVATE_KEY` and other sensitive values. For
  `DATABASE_URL`, prefer a reference variable (see §3.1) so the backend follows the Postgres service
  through renames and password rotations automatically.
