# ArbiMind Testnet Deployment Guide (Railway + Vercel)

## 🔐 SECURITY: Rotate Credentials FIRST

**Before any deployment, replace these compromised values:**

### 1. Generate New Testnet Private Key
```bash
# Create new MetaMask account (testnet-only)
# OR generate with Node.js:
node -e "console.log('0x' + require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Rotate Telegram Bot Token
1. Open Telegram → @BotFather
2. `/mybots` → Select your bot → `API Token` → `Regenerate`
3. Copy new token

### 3. Regenerate Discord Webhook
1. Discord Server Settings → Integrations → Webhooks
2. Delete old webhook → Create New Webhook
3. Copy webhook URL

---

## 🚂 Railway Deployment

### Step 1: Install Railway CLI
```powershell
npm install -g @railway/cli
railway login
```

### Step 2: Create Project & Services
```powershell
cd c:\Users\servi\RigoCrypto\ArbiMind

# Create Railway project
railway init

# This creates one service. We'll add a second one next.
```

### Step 3: Deploy Backend Service
```powershell
# Make sure you're in the project
railway link

# Set service root to backend package
cd packages\backend

# Set environment variables (use new rotated credentials!)
railway variables set NODE_ENV=production
railway variables set PORT=8001
railway variables set NETWORK=testnet
railway variables set EVM_CHAIN=polygon
railway variables set POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
railway variables set ETHEREUM_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/demo
railway variables set ARBITRUM_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Admin keys (generate new ones!)
railway variables set ADMIN_API_KEY=<generate-new-random-key>
railway variables set AI_SERVICE_KEY=<generate-new-random-key>

# Alerts (use NEW rotated credentials)
railway variables set ALERT_TELEGRAM_TOKEN=<NEW-TOKEN>
railway variables set ALERT_TELEGRAM_CHAT_ID=<YOUR-CHAT-ID>
railway variables set ALERT_DISCORD_WEBHOOK=<NEW-WEBHOOK-URL>
railway variables set ALERT_MIN_CONFIDENCE=0.8

# Solana testnet
railway variables set SOLANA_RPC_URL=https://api.devnet.solana.com
railway variables set DEXSCREENER_CHAIN_ID=polygon

# Deploy backend
railway up

# Get the backend URL
railway domain
```

### Step 4: Add Bot Service (Same Project)
```powershell
# Create second service in same project
railway service create bot

# Switch to bot service
cd ..\bot

# Set bot environment variables (use NEW rotated credentials!)
railway variables set NODE_ENV=production --service bot
railway variables set NETWORK=testnet --service bot
railway variables set EVM_CHAIN=polygon --service bot
railway variables set LOG_ONLY=true --service bot

# RPC URLs
railway variables set POLYGON_RPC_URL=https://rpc-amoy.polygon.technology --service bot
railway variables set ETHEREUM_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/demo --service bot
railway variables set ARBITRUM_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc --service bot

# NEW Testnet wallet (from rotated key above)
railway variables set PRIVATE_KEY=<NEW-TESTNET-KEY> --service bot
railway variables set TREASURY_ADDRESS=<YOUR-TESTNET-ADDRESS> --service bot
railway variables set ARB_EXECUTOR_ADDRESS=<YOUR-CONTRACT-ADDRESS> --service bot

# Backend integration (use Railway backend URL from step 3)
railway variables set AI_SERVICE_KEY=<SAME-AS-BACKEND> --service bot
railway variables set AI_LOG_URL=https://<backend-url>.railway.app/api/admin/ai-dashboard/predictions --service bot

# Alerts (NEW rotated credentials)
railway variables set ALERT_MIN_CONFIDENCE=0.8 --service bot
railway variables set ALERT_TELEGRAM_TOKEN=<NEW-TOKEN> --service bot
railway variables set ALERT_TELEGRAM_CHAT_ID=<YOUR-CHAT-ID> --service bot
railway variables set ALERT_DISCORD_WEBHOOK=<NEW-WEBHOOK-URL> --service bot

# Solana
railway variables set SOLANA_RPC_URL=https://api.devnet.solana.com --service bot
railway variables set SOLANA_WATCHED_POOLS=4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4pT8Az4D --service bot
railway variables set SOLANA_PUMP_FUN_PROGRAM=6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P --service bot

# Deploy bot
railway up --service bot
```

### Step 5: Verify Railway Services
```powershell
# Check backend health
curl https://<backend-url>.railway.app/api/health

# Check Railway logs for bot
railway logs --service bot

# Should see:
# ✅ Selected chain: polygon (chainId=80002)
# ✅ Running in LOG_ONLY mode
```

---

## ▲ Vercel Deployment

### Step 1: Install Vercel CLI
```powershell
npm install -g vercel
vercel login
```

### Step 2: Deploy UI
```powershell
cd c:\Users\servi\RigoCrypto\ArbiMind\packages\ui

# Deploy to Vercel
vercel --prod

# When prompted:
# - Set up and deploy? Yes
# - Which scope? (select your team/personal)
# - Link to existing project? No
# - Project name? arbimind-ui
# - Directory? ./
# - Override settings? No
```

### Step 3: Set Vercel Environment Variables
```powershell
# Set backend API URL (use Railway backend URL)
vercel env add NEXT_PUBLIC_API_URL

# When prompted, enter:
https://<backend-url>.railway.app/api

# Select environment: Production
```

### Step 4: Redeploy with Env Vars
```powershell
vercel --prod
```

### Step 5: Verify UI
Open browser: `https://arbimind-ui.vercel.app`
- Check Admin Dashboard loads
- Check AI predictions appear
- Verify backend connection (no CORS errors)

---

## ✅ Testnet Validation Checklist

### Backend
- [ ] Health: `https://<backend>.railway.app/api/health` returns 200
- [ ] Prediction works: Test with curl/Postman
- [ ] Logs show no errors in Railway dashboard

### Bot
- [ ] Logs show `chainId=80002` (Polygon Amoy)
- [ ] Logs show `Running in LOG_ONLY mode`
- [ ] No error traces in Railway logs
- [ ] Predictions POST to backend (check backend logs)

### UI
- [ ] Homepage loads
- [ ] Admin dashboard accessible
- [ ] Charts render
- [ ] No console errors (browser DevTools)

### Alerts (Optional - if rotated credentials)
- [ ] Send test prediction with high confidence
- [ ] Telegram receives notification
- [ ] Discord receives notification

---

## 🔧 Troubleshooting

### Railway Build Fails
**Issue:** `pnpm: command not found`
**Fix:** Railway should auto-detect pnpm from `packageManager` in package.json. If not, add to railway.json:
```json
{
  "build": {
    "builder": "NIXPACKS"
  }
}
```

### Bot Env Vars Not Loading
**Issue:** `Missing required configuration: privateKey`
**Fix:** Verify service name when setting vars:
```powershell
railway variables --service bot
```

### UI Can't Connect to Backend
**Issue:** CORS error in browser
**Fix:** Add FRONTEND_URL to backend Railway env:
```powershell
railway variables set FRONTEND_URL=https://arbimind-ui.vercel.app
```

Then update backend CORS middleware to allow that origin.

---

## 📊 Monitoring

### Railway Logs
```powershell
# Backend logs
railway logs

# Bot logs
railway logs --service bot

# Follow live
railway logs --service bot --follow
```

### Vercel Logs
```powershell
vercel logs arbimind-ui --follow
```

---

## 🚀 After Testnet Validates

Once testnet is stable:
1. Create production env files with NEW keys (never reuse testnet)
2. Deploy mainnet with `NETWORK=mainnet`, `LOG_ONLY=false`
3. Set up monitoring (Sentry, Datadog, etc.)
4. Configure auto-scaling in Railway
5. Set up backup/rollback strategy

---

**Estimated Time:**
- Railway setup: 15 min
- Vercel setup: 5 min  
- Credential rotation: 10 min
- **Total: ~30 minutes**
