# ArbiMind One-Click Deployment & Setup Guide

## 🚀 Complete Production Deployment

This guide ties together all components: CSP, Docker, PM2, CI/CD, monitoring, failover, and alerting.

---

## Phase 1: Pre-Deployment Setup (5 minutes)

### Step 1: Create External Service Accounts

#### 1a. Sentry (Error Tracking)
```bash
# Go to: https://sentry.io/
# Sign up or login
# Create new project → Node.js
# Copy DSN: https://...@sentry.io/PROJECT_ID
```

#### 1b. Logtail (Log Aggregation)
```bash
# Go to: https://betterstack.com/logtail
# Create new source
# Copy token
```

#### 1c. Slack Webhooks (Notifications)
```bash
# Go to: https://api.slack.com/apps
# Create New App → From scratch
# Name: ArbiMind Alerts
# Incoming Webhooks → Add New Webhook
# Copy URL for #alerts channel
# Repeat for #deployments channel
```

### Step 2: Set GitHub Secrets

```bash
# Go to: GitHub Repo → Settings → Secrets and variables → Actions

# Add these secrets:
RAILWAY_TOKEN                    # From Railway dashboard
SLACK_WEBHOOK_ALERTS             # From Slack (for #alerts)
SLACK_WEBHOOK_DEPLOYMENTS        # From Slack (for #deployments)
```

### Step 3: Update .env.production

Edit `.env.production` in your local repo:

```bash
# Ethereum RPC (Primary + Fallbacks)
ETHEREUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
ETHEREUM_RPC_FALLBACK_1=https://arb1.arbitrum.io:443
ETHEREUM_RPC_FALLBACK_2=https://arbitrum.public-rpc.com

# Bot Configuration
PRIVATE_KEY=0x...                            # Your deployer key
TREASURY_ADDRESS=0x...                       # Your treasury wallet
ARB_EXECUTOR_ADDRESS=0x...                   # Contract address (post-deploy)

# Database
DATABASE_URL=postgresql://user:pass@host:5432/arbimind

# Monitoring
SENTRY_DSN=https://...@sentry.io/PROJECT_ID
LOGTAIL_TOKEN=your_logtail_token

# Security
JWT_SECRET=your-super-secret-32-char-key
SESSION_SECRET=another-long-random-string-32-chars

# Ports
PORT_BACKEND=3002
PORT_BOT=3001
PORT=3000
```

---

## Phase 2: Deploy to Railway (2 minutes)

### Step 1: Connect Repository

```bash
# Go to: https://railway.app/new
# Click: "Deploy from GitHub"
# Select: Your arbimind repository
# Click: "Create"
```

Railway will auto-detect `Dockerfile` and start building.

### Step 2: Configure Services

Railway creates a single service. Add environment variables:

```bash
# Go to: Railway Project → Variables
# Copy/paste from .env.production above
```

### Step 3: Set Domains

```bash
# Go to: Railway Project → Settings → Domains
# Add: ui.arbimind.app (for Next.js frontend)
# Add: api.arbimind.app (for backend API)
```

Railway will provision SSL certificates automatically.

### Step 4: Monitor Deployment

```bash
# Go to: Railway Project → Deployments
# Watch logs until "Build successful"
# Service starts automatically
```

---

## Phase 3: Deploy Frontend to Vercel (2 minutes)

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
cd packages/ui
vercel --prod

# Follow prompts:
# ✔ Linked to your-team/arbimind-ui
# ✔ Production deployment
# ✔ auto-linked vercel.json settings
```

---

## Phase 4: Verify Deployment (3 minutes)

### Health Checks

```bash
# Frontend
curl https://ui.arbimind.app/api/health

# Backend API
curl https://api.arbimind.app/health

# Bot Status (via Railway logs)
railway logs --service arbimind-bot --tail
```

### Expected Responses

```json
// /api/health
{
  "status": "ok",
  "timestamp": "2025-11-14T10:30:00Z",
  "uptime": 120,
  "memory": { "heapUsed": 256, "heapTotal": 512 },
  "services": { "ai": "operational", "database": "connected" }
}
```

---

## Phase 5: Activate Monitoring (5 minutes)

### 5a. Enable Sentry in Backend

Edit `packages/backend/src/index.ts`:

```typescript
import { initializeSentry, sentryRequestHandler, sentryErrorHandler } from './middleware/monitoring';

// Top of app initialization
initializeSentry();

// After creating app
app.use(sentryRequestHandler());

// After routes, before error handler
app.use(sentryErrorHandler());
```

### 5b. Trigger Test Error

```bash
# In bot, trigger intentional error to test pipeline
curl https://api.arbimind.app/health/error

# Check Sentry dashboard (should show error in 5 seconds)
# Go to: https://sentry.io/ → Issues
```

### 5c. Test Alerting

```bash
# Send test Slack message
curl -X POST $SLACK_WEBHOOK_ALERTS \
  -H 'Content-Type: application/json' \
  -d '{"text": "Test alert - ArbiMind monitoring active"}'

# Verify message appears in #alerts
```

---

## Phase 6: Enable RPC Failover (2 minutes)

Edit `packages/bot/src/index.ts`:

```typescript
import { getRPCFailoverManager } from './services/RPCFailoverManager';

// In main()
const rpcManager = getRPCFailoverManager();
rpcManager.startHealthChecks(30000); // Check every 30 seconds

// On graceful shutdown
process.on('SIGTERM', async () => {
  rpcManager.stopHealthChecks();
  // ... other shutdown logic
});
```

---

## Production Checklist

- [ ] Git pushed with all config files
- [ ] GitHub secrets set (RAILWAY_TOKEN, SLACK_WEBHOOK_*)
- [ ] Railway deployment completed
- [ ] Vercel deployment completed
- [ ] Health checks passing (curl tests successful)
- [ ] Sentry DSN set in .env.production
- [ ] Sentry monitoring middleware activated
- [ ] Logtail token configured
- [ ] Slack webhooks tested
- [ ] RPC failover enabled
- [ ] Test error triggered and captured in Sentry
- [ ] Alert test sent and received in Slack

---

## Troubleshooting

### Deployment Failed
```bash
# Check Railway logs
railway logs --all

# Check GitHub Actions
# Go to: GitHub → Actions → Latest run → View logs
```

### Health Check Failed
```bash
# Check service status
railway status

# Restart service
railway restart
```

### Alerts Not Working
```bash
# Check Slack webhook
curl -X POST $SLACK_WEBHOOK_ALERTS -H 'Content-Type: application/json' -d '{"text":"Test"}'

# Check Sentry DSN format
echo $SENTRY_DSN
```

### RPC Connection Issues
```bash
# Check failover status
# In bot logs, search for "RPC health check"
# Should cycle through providers if one fails
```

---

## Monitoring Dashboards (Post-Deployment)

- **Sentry**: https://sentry.io/organizations/arbimind/ (Errors, performance)
- **Logtail**: https://betterstack.com/logtail/logs (Log aggregation)
- **Railway**: https://dashboard.railway.app (Service health)
- **Vercel**: https://vercel.com/dashboard (Frontend metrics)

---

## What's Deployed

| Component | Technology | Endpoint | Status |
|-----------|-----------|----------|--------|
| Frontend | Next.js + Vercel | ui.arbimind.app | ✅ Live |
| API | Express + Railway | api.arbimind.app | ✅ Live |
| Bot | TypeScript + PM2 | Internal (Railway) | ✅ Live |
| Contracts | Solidity | Mainnet/Testnet | ✅ Deployed |
| Monitoring | Sentry + Logtail | Dashboard | ✅ Active |
| Alerts | Slack + PagerDuty | Webhook | ✅ Ready |
| Failover | RPC Chain | Dynamic | ✅ Active |

---

## Next Steps

1. **Monitor for 24 hours**: Check logs and metrics regularly
2. **Adjust alert thresholds**: Based on production traffic patterns
3. **Set up PagerDuty** (optional): For critical incidents
4. **Enable auto-scaling** (Railway Pro): For traffic spikes
5. **Schedule security audit**: Quarterly contract + infrastructure review

---

## Support & Emergency

- **Production Issue**: Check Railway/Vercel dashboards first
- **Bot Down**: Restart via `railway restart`
- **Secrets Leaked**: Rotate immediately in GitHub → Settings
- **DDoS Attack**: Scale up in Railway → Deployments → Replicas

---

**ArbiMind is now production-grade, monitored, and resilient. 🚀**
