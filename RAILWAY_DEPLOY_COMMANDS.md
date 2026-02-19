# Railway + Vercel Testnet Deploy Commands

Copy-paste commands for deploying ArbiMind testnet to Railway (backend + bot) and Vercel (UI).

**WARNING:** Replace `<placeholders>` with actual values from `testnet-credentials-NEW.env`. Never commit credentials to git.

---

## Prerequisites
- ✅ Fresh credentials generated (see `testnet-credentials-NEW.env`)
- ✅ Telegram token regenerated via @BotFather
- ✅ Discord webhook recreated in Server Settings
- ✅ Railway CLI installed: `npm i -g @railway/cli`
- ✅ Vercel CLI installed: `npm i -g vercel`

---

## 1. Railway Backend Service

```powershell
# Login and create project
railway login
railway init  # → Create new project → name: arbimind-testnet

# Set environment variables (replace <placeholders> with values from testnet-credentials-NEW.env)
railway variables set `
  NODE_ENV=production `
  PORT=8001 `
  NETWORK=testnet `
  ARBITRUM_RPC_URL=https://sepolia.arbitrum.io/rpc `
  WORLDCHAIN_SEPOLIA_RPC_URL=https://worldchain-sepolia.g.alchemy.com/v2/TZyQGiZt_25CImsRIGAcN `
  SOLANA_RPC_URL=https://api.devnet.solana.com `
  POLYGON_RPC_URL=https://rpc-amoy.polygon.technology `
  DEXSCREENER_CHAIN_ID=polygon `
  ADMIN_KEY=<from-testnet-credentials-NEW.env> `
  AI_SERVICE_KEY=<from-testnet-credentials-NEW.env> `
  FRONTEND_URL=https://arbimind.vercel.app

# Deploy backend
cd packages/backend
railway up

# Get backend URL (save this for bot + Vercel)
railway domain
# Example output: https://backend-production-xxxx.up.railway.app
```

**Verify:**
```powershell
# Health check
Invoke-RestMethod https://backend-production-xxxx.up.railway.app/api/health

# Expected: { ok: true, uptime: <seconds>, ... }
```

---

## 2. Railway Bot Service

```powershell
# Create bot service in same project
railway service create bot

# Set environment variables (replace <placeholders>, ensure AI_SERVICE_KEY matches backend)
railway variables set `
  NODE_ENV=production `
  NETWORK=testnet `
  LOG_ONLY=true `
  EVM_CHAIN=polygon `
  POLYGON_RPC_URL=https://rpc-amoy.polygon.technology `
  WORLDCHAIN_SEPOLIA_RPC_URL=https://worldchain-sepolia.g.alchemy.com/v2/TZyQGiZt_25CImsRIGAcN `
  AI_SERVICE_KEY=<same-as-backend> `
  AI_LOG_URL=https://backend-production-xxxx.up.railway.app/api/admin/ai-dashboard/predictions `
  SOLANA_RPC_URL=https://api.devnet.solana.com `
  SOLANA_WATCHED_POOLS=4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4pT8Az4D `
  SOLANA_SCAN_INTERVAL_SEC=10 `
  ALERT_MIN_CONFIDENCE=0.8 `
  ALERT_TELEGRAM_TOKEN=<from-botfather> `
  ALERT_TELEGRAM_CHAT_ID=<your-chat-id> `
  ALERT_DISCORD_WEBHOOK=<from-discord> `
  --service bot

# Deploy bot
cd ../bot
railway up --service bot

# Watch logs for verification
railway logs --service bot
```

**Expected logs:**
```
Selected chain: polygon (chainId=80002)
LOG_ONLY mode enabled
Scanner started for EVM pools
Scanner started for Solana pools
```

**Critical:** If you see `401 Unauthorized` when posting predictions, check:
- Bot's `AI_SERVICE_KEY` matches backend's `AI_SERVICE_KEY`
- `AI_LOG_URL` points to correct backend URL

---

## 3. Vercel UI Deployment

```powershell
cd ../../packages/ui

# Login and deploy
vercel login
vercel --prod

# Set environment variable (use Railway backend URL from step 1)
vercel env add NEXT_PUBLIC_API_URL production
# Enter: https://backend-production-xxxx.up.railway.app/api

# Redeploy to pick up env var
vercel --prod
```

**Verify:**
1. Open: `https://arbimind.vercel.app/admin`
2. Login with `ADMIN_KEY`: `p4g47OFU1GL4Q6KBFCavVMubhf68xVnN`
3. Navigate to AI Dashboard
4. Confirm predictions table updates every ~10 seconds

---

## 4. Quick Health Checks

```powershell
# Backend health (replace <backend-url> with your Railway URL)
$backend = "https://backend-production-xxxx.up.railway.app"
Invoke-RestMethod "$backend/api/health"
Invoke-RestMethod "$backend/api/rpc/health?chain=evm,worldchain_sepolia,solana"

# One-command smoke test (from repo root)
.\scripts\smoke-post-deploy.ps1 -BackendBase $backend

# One-command smoke test with runtime UI check (uses Playwright when -UiBase is set)
.\scripts\smoke-post-deploy.ps1 -BackendBase $backend -UiBase https://arbimind.vercel.app -EvmAddress 0x... -SolanaAddress <base58>

# Standalone runtime UI smoke
pnpm smoke:ui:runtime

# Backend snapshots health
Invoke-RestMethod "$backend/api/snapshots/health?chain=evm"
Invoke-RestMethod "$backend/api/snapshots/health?chain=solana"

# Bot logs (should show chainId=80002)
railway logs --service bot --tail

# UI admin dashboard
start https://arbimind.vercel.app/admin/ai-dashboard
```

---

## 5. Troubleshooting

### Bot shows 401 errors:
```powershell
# Check if AI_SERVICE_KEY matches between services
railway variables --service backend | Select-String "AI_SERVICE_KEY"
railway variables --service bot | Select-String "AI_SERVICE_KEY"

# Update bot if mismatch (use value from testnet-credentials-NEW.env)
railway variables set AI_SERVICE_KEY=<correct-value> --service bot
railway up --service bot
```

### UI can't connect to backend:
```powershell
# Check CORS configuration
railway variables --service backend | Select-String "FRONTEND_URL"

# Should match your Vercel URL
railway variables set FRONTEND_URL=https://<your-vercel-app>.vercel.app --service backend
railway up --service backend
```

### Backend missing ADMIN_KEY:
```powershell
# Add it (use value from testnet-credentials-NEW.env)
railway variables set ADMIN_KEY=<from-credentials-file> --service backend
railway up --service backend
```

---

## 6. Post-Deployment Cleanup

```powershell
# Delete local credentials file (DO NOT COMMIT)
Remove-Item testnet-credentials-NEW.env

# Tag release
git tag v1.0.0-testnet
git push --tags
```

---

## Environment Variable Reference

### Backend Required:
- `ADMIN_KEY` or `ADMIN_API_KEY` - Admin dashboard auth (from testnet-credentials-NEW.env)
- `AI_SERVICE_KEY` - Bot-to-backend auth (must match bot, from credentials file)
- `POLYGON_RPC_URL` - Polygon Amoy RPC
- `WORLDCHAIN_SEPOLIA_RPC_URL` - World Chain Sepolia RPC (Alchemy)
- `FRONTEND_URL` - Vercel UI URL (for CORS)

### Bot Required:
- `AI_SERVICE_KEY` - Must match backend (from testnet-credentials-NEW.env)
- `AI_LOG_URL` - Backend predictions endpoint (NOT `AI_API_URL`)
- `EVM_CHAIN=polygon` - Use Polygon Amoy
- `NETWORK=testnet` - Enables LOG_ONLY mode
- `POLYGON_RPC_URL` - Polygon Amoy RPC
- `WORLDCHAIN_SEPOLIA_RPC_URL` - World Chain Sepolia RPC (Alchemy)

### UI Required:
- `NEXT_PUBLIC_API_URL` - Railway backend URL + `/api`

---

## Quick Setup Summary

```powershell
# 1. Backend
cd packages/backend
railway init  # Create project
railway variables set <all-backend-vars>
railway up
$backendUrl = railway domain  # Save this

# 2. Bot
railway service create bot
railway variables set AI_LOG_URL=$backendUrl/api/admin/ai-dashboard/predictions <other-bot-vars> --service bot
cd ../bot
railway up --service bot

# 3. UI
cd ../ui
vercel --prod
vercel env add NEXT_PUBLIC_API_URL production  # Enter: $backendUrl/api
vercel --prod
```

Done! Test at: `https://<your-vercel-app>.vercel.app/admin/ai-dashboard`
