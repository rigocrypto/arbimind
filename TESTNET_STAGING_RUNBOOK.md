# Testnet Staging Runbook

**Objective**: Run backend + bot locally in dry-run mode against Arbitrum/Ethereum Sepolia testnet, verify health, and collect logs.

---

## Prerequisites

1. `.env.testnet` created (see `.env.testnet` file in repo root)
2. Fill in RPC_URL, PRIVATE_KEY, TREASURY_ADDRESS, ARB_EXECUTOR_ADDRESS
3. Backend and bot already built (see: `packages/backend/dist/` and `packages/bot/dist/`)

---

## Step 1: Set Up Environment

In PowerShell, load `.env.testnet` into the current session:

```powershell
$envfile = "C:\Users\servi\RigoCrypto\ArbiMind\.env.testnet"
Get-Content $envfile | Where-Object { $_ -notmatch '^\s*#' -and $_ -match '=' } | ForEach-Object {
    $name = ($_ -split '=')[0].Trim()
    $value = ($_ -split '=', 2)[1].Trim()
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
}
Write-Host "Loaded .env.testnet" -ForegroundColor Green
```

Verify:
```powershell
$env:RPC_URL
$env:PRIVATE_KEY
```

---

## Step 2: Start Backend

In a **new PowerShell terminal**:

```powershell
cd C:\Users\servi\RigoCrypto\ArbiMind\packages\backend
npm run dev
```

Expected output:
```
Backend listening on port 3002
```

Keep this window open. Do **not** close it during testing.

---

## Step 3: Health Check (Backend)

In a **separate PowerShell terminal**:

```powershell
Invoke-RestMethod 'http://localhost:3002/health' | ConvertTo-Json -Depth 5
```

Expected:
```json
{
  "status": "ok",
  "timestamp": "2025-11-14T...",
  "uptime": 5.123
}
```

If you get a connection error, backend didn't start. Check the backend terminal for errors.

---

## Step 4: Start Bot (DRY-RUN Mode)

In **another new PowerShell terminal**:

```powershell
cd C:\Users\servi\RigoCrypto\ArbiMind\packages\bot
$env:DRY_RUN = "true"
npm run dev 2>&1 | Tee-Object -FilePath "bot.log"
```

This runs the bot and saves all output to `bot.log` in the bot directory.

Expected output (within 10-15 seconds):
```
[timestamp] Connected to provider (chain: 421614)
[timestamp] PriceService initialized
[timestamp] Starting arbitrage scan...
[timestamp] Fetching price quotes...
[timestamp] Quote: WETH/USDC on Uniswap V2 → ...
```

Let it run for at least 1-2 minutes to capture multiple price scans and logs.

---

## Step 5: Capture Logs

After 2 minutes, stop the bot (Ctrl+C in the bot terminal).

### Collect Health JSON:
```powershell
$health = Invoke-RestMethod 'http://localhost:3002/health'
$health | ConvertTo-Json -Depth 5 | Out-File -FilePath "health.json"
Write-Host (Get-Content "health.json" -Raw)
```

### Collect First 50 Bot Log Lines:
```powershell
Get-Content -Path "C:\Users\servi\RigoCrypto\ArbiMind\packages\bot\bot.log" -TotalCount 50
```

### Collect Last 50 Bot Log Lines (most recent):
```powershell
Get-Content -Path "C:\Users\servi\RigoCrypto\ArbiMind\packages\bot\bot.log" -Tail 50
```

---

## Step 6: Verify Contract Interaction (Optional)

If you deployed `ArbExecutor` to testnet, verify it's reachable:

```powershell
# Check if ABI exists
Test-Path "C:\Users\servi\RigoCrypto\ArbiMind\packages\bot\src\abi\ArbExecutor.json"

# Verify contract address in logs
Get-Content "C:\Users\servi\RigoCrypto\ArbiMind\packages\bot\bot.log" | Select-String -Pattern "Contract|Executor|0x[a-fA-F0-9]{40}"
```

---

## Step 7: Verify PriceService Hardening

Search bot logs for hardening checks:

```powershell
Get-Content "C:\Users\servi\RigoCrypto\ArbiMind\packages\bot\bot.log" | Select-String -Pattern "stale|slippage|coingecko|deviation|Rejected"
```

Expected lines (may appear):
```
PriceService: Quote stale (15s+) — rejecting
PriceService: Slippage > 0.5% — rejecting quote
PriceService: Coingecko price deviation > 2% — warning
```

---

## Cleanup & Next Steps

1. **Stop services**: Close backend and bot terminal windows.

2. **Collect final artifacts** (paste in your next reply):
   - Health JSON (from health.json)
   - First 50 bot log lines
   - Last 50 bot log lines
   - Any error/warning lines from bot logs

3. **Reply with**:
   ```
   Testnet staging verified — contract: 0x..., health: OK, logs attached
   ```

   Then paste the three items above.

4. **I will validate** and mark testnet complete → give you mainnet go-live commands.

---

## Troubleshooting

### Backend won't start
- Check `packages/backend/src/index.ts` for PORT config (should be 3002)
- Verify no other process is using port 3002:
  ```powershell
  netstat -ano | Select-String ":3002"
  ```
- Check `.env.testnet` is properly loaded:
  ```powershell
  echo $env:PORT
  ```

### Bot won't connect to RPC
- Verify RPC_URL is correct and accessible:
  ```powershell
  curl -X POST $env:RPC_URL -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
  ```
- Check that ETHEREUM_RPC_URL is set (bot uses this):
  ```powershell
  echo $env:ETHEREUM_RPC_URL
  ```

### No logs in bot.log
- Bot may be logging to console instead. Copy the console output directly from the bot terminal window.
- Or check if bot is using a different logger path:
  ```powershell
  Get-ChildItem "C:\Users\servi\RigoCrypto\ArbiMind\packages\bot" -Filter "*.log" -Recurse
  ```

### Health check timeout
- Backend may still be starting. Wait 5-10 seconds and retry.
- Or check backend console for startup errors.

---

**Ready?** Go to Step 1 and run each step. Paste the collected logs/JSON here when done.
