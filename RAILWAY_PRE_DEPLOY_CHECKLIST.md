# Railway Pre-Deployment Checklist

Quick verification before deploying to Railway testnet.

---

## ✅ Security Audit
- [x] No credentials committed to git
- [x] `.gitignore` blocks `*.env`, `*-credentials*.env`
- [x] Fresh credentials in `testnet-credentials-NEW.env` (gitignored)
- [x] Deployment docs use placeholders, not real values

---

## ✅ Backend Configuration
- [x] **Port binding**: Reads `process.env.PORT` (Railway dynamic port)
- [x] **Host binding**: Uses `0.0.0.0` for Railway network
- [x] **Auth keys**: Supports both `ADMIN_KEY` and `ADMIN_API_KEY`
- [x] **Service auth**: `AI_SERVICE_KEY` for bot-to-backend
- [x] **CORS headers**: Allows `X-ADMIN-KEY` and `X-SERVICE-KEY`
- [x] **CORS origins**: Allows Vercel (`*.vercel.app`)

---

## ✅ Bot Configuration
- [x] **Service key**: Uses `X-SERVICE-KEY` header (matches backend)
- [x] **Endpoint**: POSTs to `/api/admin/ai-dashboard/predictions`
- [x] **Chain config**: `EVM_CHAIN=polygon` + `NETWORK=testnet`
- [x] **Safety mode**: `LOG_ONLY=true` auto-enabled for testnet

---

## ✅ Auth Flow Verification

### Service-to-Service (Bot → Backend)
```
Bot sends:
  POST /api/admin/ai-dashboard/predictions
  Header: X-SERVICE-KEY (from AI_SERVICE_KEY env var)

Backend middleware (adminAuth.ts):
  ✓ Checks path startsWith('/ai-dashboard/predictions')
  ✓ Validates X-SERVICE-KEY === AI_SERVICE_KEY
  ✓ Allows request (no ADMIN_KEY required)
```

### Browser → Backend (UI)
```
UI sends:
  GET/POST /api/admin/*
  Header: X-ADMIN-KEY (from ADMIN_KEY env var)

Backend middleware:
  ✓ Checks X-ADMIN-KEY === ADMIN_KEY
  ✓ Allows request if key matches
```

---

## 🚀 Railway Environment Variables

### Backend Service
```env
NODE_ENV=production
PORT=<Railway-dynamic>
NETWORK=testnet

# RPCs
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
ARBITRUM_RPC_URL=https://sepolia.arbitrum.io/rpc
SOLANA_RPC_URL=https://api.devnet.solana.com

# Auth (from testnet-credentials-NEW.env)
ADMIN_KEY=<32-char-from-credentials-file>
AI_SERVICE_KEY=<32-char-from-credentials-file>

# CORS
FRONTEND_URL=https://arbimind.vercel.app

# Optional
DEXSCREENER_CHAIN_ID=polygon
```

### Bot Service
```env
NODE_ENV=production
NETWORK=testnet
LOG_ONLY=true

# Chain
EVM_CHAIN=polygon
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology

# Service auth (must match backend AI_SERVICE_KEY)
AI_SERVICE_KEY=<same-as-backend>
AI_LOG_URL=https://<backend-url>/api/admin/ai-dashboard/predictions

# Optional: Solana testnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_WATCHED_POOLS=4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4pT8Az4D
SOLANA_SCAN_INTERVAL_SEC=10

# Optional: Alerts
ALERT_MIN_CONFIDENCE=0.8
ALERT_TELEGRAM_TOKEN=<from-botfather>
ALERT_TELEGRAM_CHAT_ID=<your-chat-id>
ALERT_DISCORD_WEBHOOK=<from-discord>
```

---

## 📋 Deployment Order

### 1. Deploy Backend First
```powershell
cd packages/backend
railway init  # Create project: arbimind-testnet
railway variables set <see-above-backend-vars>
railway up
$backendUrl = railway domain  # Save this URL
```

**Test:**
```powershell
Invoke-RestMethod "$backendUrl/api/health"
# Expected: { ok: true, uptime: <number>, ... }
```

### 2. Deploy Bot Second
```powershell
railway service create bot
railway variables set AI_LOG_URL=$backendUrl/api/admin/ai-dashboard/predictions <other-vars> --service bot
cd ../bot
railway up --service bot
railway logs --service bot
```

**Expected logs:**
- `Selected chain: polygon (chainId=80002)`
- `LOG_ONLY mode enabled`
- `POST /api/admin/ai-dashboard/predictions` → `201` or `200`

**If you see 401:**
- Check: `AI_SERVICE_KEY` matches between backend and bot
- Check: Bot is posting to `/api/admin/ai-dashboard/predictions` (not other path)

### 3. Deploy UI Third
```powershell
cd ../ui
vercel --prod
vercel env add NEXT_PUBLIC_API_URL production  # Enter: $backendUrl/api
vercel --prod
```

---

## 🔍 Post-Deployment Validation

### Backend Health
```powershell
$backend = "https://<your-backend>.up.railway.app"
Invoke-RestMethod "$backend/api/health"
```

### Bot Logs
```powershell
railway logs --service bot --tail
# Look for:
#   - chainId=80002
#   - LOG_ONLY mode
#   - Successful POST to predictions (status 200/201)
```

### UI Admin Login
```
1. Open: https://<your-vercel>.vercel.app/admin
2. Login with ADMIN_KEY from testnet-credentials-NEW.env
3. Navigate to AI Dashboard
4. Confirm predictions table updates every ~10 seconds
```

---

## ⚠️ Common Issues

### Bot shows 401 when posting predictions
**Cause:** `AI_SERVICE_KEY` mismatch between backend and bot
**Fix:**
```powershell
railway variables --service backend | Select-String "AI_SERVICE_KEY"
railway variables --service bot | Select-String "AI_SERVICE_KEY"
# If different, update bot:
railway variables set AI_SERVICE_KEY=<correct-value> --service bot
railway up --service bot
```

### UI can't connect to backend (CORS errors)
**Cause:** `FRONTEND_URL` doesn't include your Vercel domain
**Fix:**
```powershell
railway variables set FRONTEND_URL=https://<your-vercel>.vercel.app --service backend
railway up --service backend
```

### Backend returns 503 for admin routes
**Cause:** `ADMIN_KEY` not set
**Fix:**
```powershell
railway variables set ADMIN_KEY=<from-credentials-file> --service backend
railway up --service backend
```

---

## 🎯 Success Criteria

- ✅ Backend health endpoint returns 200
- ✅ Bot logs show `chainId=80002` and `LOG_ONLY mode`
- ✅ Bot POSTs predictions without 401 errors
- ✅ UI loads and admin login works
- ✅ AI Dashboard shows live predictions updating
- ✅ No CORS errors in browser console

---

## 📝 What to Share for Verification

After backend deployment:
1. Backend URL (e.g., `https://backend-production-abc.up.railway.app`)
2. Health endpoint response: `Invoke-RestMethod "$backend/api/health" | ConvertTo-Json`

After bot deployment:
1. Bot log excerpt showing:
   - Chain selection: `Selected chain: polygon (chainId=80002)`
   - POST result: `POST ... /predictions` → status code

**Do NOT share:**
- Private keys
- ADMIN_KEY values
- AI_SERVICE_KEY values
- Telegram/Discord tokens
