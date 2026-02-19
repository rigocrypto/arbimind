# Day-1 Ops Runbook

A concise runbook for first-day production operations: deploy, verify, canary, monitor, and rollback.

## 1) Deploy

### Backend (Railway)

```powershell
Push-Location packages/backend
railway up --detach
railway domain
Pop-Location
```

### UI (Vercel)

```bash
vercel --prod
```

## 2) Smoke Validation

### Full smoke

```powershell
npm run smoke:all -- -BackendBase "https://backend-production-0932.up.railway.app" -UiBase "https://arbimind.vercel.app"
```

### Analytics-only quick check

```powershell
npm run smoke:analytics -- -BackendBase "https://backend-production-0932.up.railway.app"
```

## 3) Canary Bot

```bash
pnpm bot:canary
```

Suggested conservative thresholds for initial rollout:

- `CANARY_MODE=true`
- `CANARY_MAX_NOTIONAL_ETH=0.01`
- `CANARY_MAX_DAILY_LOSS_ETH=0.005`

Keyless LOG_ONLY option:

- `BOT_LOG_ONLY=true` (or `LOG_ONLY=true`)
- optional `WALLET_ADDRESS=0x...` for identity-only logs when `PRIVATE_KEY` is not provided

## 4) Rollback (Emergency)

### Backend

```powershell
Push-Location packages/backend
railway deployment list
railway service redeploy
Pop-Location
```

### UI

```bash
vercel rollback <deployment-id>
```

## 5) Monitor

### Nightly Smoke Secrets (one-time)

Set these in GitHub: **Repo Settings → Secrets and variables → Actions**.

| Secret | Value | Required |
| --- | --- | --- |
| `BACKEND_BASE` | `https://backend-production-0932.up.railway.app` | Yes |
| `UI_BASE` | `https://arbimind.vercel.app` | Yes |
| `ADMIN_API_KEY` | `your-admin-key` | No |
| `ALERT_WEBHOOK_URL` | `https://hooks.slack.com/...` | No (`@ops` issue still opens) |

### Nightly Smoke

Monitor **Actions → Nightly Smoke** (runs daily at 3:00 AM UTC).

Growth Experiments: [CTA A/B Template](CTA_AB_DECISION_TEMPLATE.md)

- Failure → GitHub issue + alert webhook (if configured)
- Success → ✅ green comment and closure of open nightly failure issues
- Manual trigger → Actions → Nightly Smoke → Run workflow

```powershell
Push-Location packages/backend
railway logs --latest --lines 200
Pop-Location
```

Also monitor:

- Sentry project dashboard
- Uptime provider alerts
- GitHub Actions status for post-deploy smoke and canary sanity

## 6) Fast Incident Checklist

1. Confirm `API health` and `RPC health`
2. Confirm `Analytics ingest + query`
3. Pause/disable canary if guardrails trigger
4. Roll back backend or UI if regression is confirmed
5. Post incident note with timestamp, impact, and mitigation
