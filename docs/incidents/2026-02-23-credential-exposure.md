# Incident Report: Credential Exposure + Chain Migration
**Date:** 2026-02-23  
**Status:** Contained  
**Severity:** High (credentials exposed in chat session)

---

## Timeline
| Time (UTC) | Event |
|------------|-------|
| ~02:00 | Chain migration started: Arbitrum Sepolia -> Ethereum Sepolia |
| ~02:20 | RPC misconfigured (Infura placeholder URL); bot unable to start |
| ~03:20 | Sepolia DEX/token profile vars added; bot started on correct chain |
| ~03:35 | LOG_ONLY gate identified as active; execution blocked |
| ~04:00 | Executor contract verified on Sepolia (non-0x bytecode) |
| ~04:35 | Private key, Infura project ID, Telegram token, Discord webhook exposed in chat |
| ~04:35 | Immediate safe-mode enforced (ALLOW_TESTNET_TRADES=false, LOG_ONLY=true) |
| ~05:00 | New EVM keypair generated; funds swept from compromised wallet |
| ~05:30 | RPC endpoint rotated to non-Infura public endpoint |
| ~06:00 | Signer rotation confirmed via boot logs (Identity: private_key, new address) |
| ~18:06 | LOG_ONLY root cause diagnosed via BOOT_FLAGS diagnostic |
| ~18:10 | Execution enabled; bot confirmed live in mode=LIVE |
| ~18:30 | BOOT_FLAGS diagnostic removed; cleanup deployed |

---

## What Was Exposed
- EVM private key (testnet only; funds swept before external use confirmed)
- Infura Sepolia project ID
- Telegram bot token
- Discord webhook URL
- AI service key

---

## Impact
- Testnet only - no mainnet funds at risk
- Exposed private key controlled a Sepolia testnet wallet (~0.02 SepoliaETH)
- Funds were swept to new wallet before confirmed external exploitation

---

## Root Causes

### 1. Credentials pasted into chat session
Credentials were included in terminal output pasted during debugging.  
**Control gap:** No pre-paste scrubbing of sensitive env var output.

### 2. Build-time secret injection
Railway build warnings (`SecretsUsedInArgOrEnv`) indicate secrets were available  
during Docker build, risking exposure in build logs/image layers.  
**Control gap:** Variables not scoped to runtime-only in Railway.

### 3. No `.env*` gitignore enforcement
Local `.env` files containing credentials were present in the workspace.  
**Control gap:** `.gitignore` did not consistently exclude all credential file patterns.

---

## Containment Actions Taken
- [x] New EVM keypair generated; old key treated as compromised
- [x] Funds swept from compromised wallet
- [x] RPC endpoint rotated off leaked Infura URL
- [x] Safe-mode flags enforced during rotation window
- [x] Execution re-enabled only after full signer/wiring verification

## Remaining External Actions (manual)
- [ ] Revoke/regenerate Infura project credentials in Infura dashboard
- [ ] Rotate Telegram bot token via BotFather
- [ ] Regenerate Discord webhook URL
- [ ] Set Railway sensitive variables to runtime-only (not build-time)

---

## Preventive Controls

### Immediate
- Never paste raw terminal output from `railway variables` or env dumps into chat/logs
- Use `cast wallet address --private-key <key>` locally to verify signer; never print the key
- Add `.env*`, `*credentials*`, `*secret*` patterns to `.gitignore`

### Short-term
- Add a pre-commit hook that blocks commits containing hex strings matching private key patterns
- Scope all Railway secrets to runtime-only variables
- Use Railway secret references or a secrets manager instead of plain env vars where possible

### Long-term
- Consider a dedicated secrets manager (e.g. HashiCorp Vault, AWS Secrets Manager)
- Separate deployer key from bot signer key (principle of least privilege)
- Add automated credential scanning (e.g. GitHub secret scanning, gitleaks) to CI

---

## Lessons Learned
1. Terminal output from `railway variables` contains live secrets - treat it as sensitive
2. Build-time secret injection is a separate risk from runtime exposure
3. Testnet credentials are lower risk but should follow the same rotation discipline
4. A structured pre-flight checklist (EOA check, cast code, balance, boot proof) 
   significantly reduces misconfiguration risk during chain migrations

---

## Closeout Validation Snapshot (2026-03-12)

### Step 1: Provider-side revocations
- Status: **PENDING (manual dashboards)**
- Infura/API and messaging token revocations must be confirmed in provider consoles.

### Step 2: Railway build-scope secret fix
- Status: **FAIL (not yet fixed)**
- Fresh deploy still reports Docker build warnings `SecretsUsedInArgOrEnv` for sensitive keys.
- Action required: set sensitive variables to runtime-only in Railway service Variables UI and disable build availability for those keys.

### Step 3: CI enforcement of secret scanning
- Status: **PASS**
- Confirmed: workflow triggers on PR, and both SARIF + artifact upload steps complete successfully.
- Confirmed: disposable proof PR with synthetic `PRIVATE_KEY=0x...` pattern failed in Secret Scan using repo-specific rules (`.gitleaks.toml`) while still uploading SARIF/artifacts.

### Step 4: Execution posture confirmation
- Status: **PASS (current runtime state)**
- Runtime logs show `Identity: private_key (...) | mode=LIVE`, indicating live Sepolia execution posture at time of check.
