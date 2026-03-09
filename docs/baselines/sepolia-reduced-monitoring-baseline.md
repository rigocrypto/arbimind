# Sepolia Reduced Monitoring Baseline

Last updated: 2026-03-09
Purpose: Capture the known-good runtime posture for safe Sepolia quote monitoring (no execution intent).

## Baseline Mode
- Chain: Ethereum Sepolia (`chainId=11155111`)
- Runtime posture: reduced monitoring
- Pair scope: `WETH/USDC` only
- Quote source: Uniswap V2 only (V3 intentionally disabled)
- Expected execution posture: LOG_ONLY monitoring

## Required Railway Variables (Redact Secrets)
- `NETWORK=testnet`
- `EVM_CHAIN=ethereum`
- `ETHEREUM_RPC_URL=<redacted>`
- `SCAN_INTERVAL_MS=5000`
- `SCAN_PAIRS=WETH/USDC`
- `ENABLE_V3_QUOTES=false`
- `SEPOLIA_WETH_ADDRESS=0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9`
- `SEPOLIA_USDC_ADDRESS=0x1c7d4b196cb0c7b01d743fbc6116a902379c7238`
- `SEPOLIA_DAI_ADDRESS=0x68194a729C2450ad26072b3D33ADaCbcef39D574`
- `SEPOLIA_UNISWAP_V2_ROUTER=0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008`
- `SEPOLIA_UNISWAP_V3_QUOTER=0xed1f6473345f45b75833fd55d5adbe1391c3f63d`
- `SEPOLIA_UNISWAP_V3_ROUTER=0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`
- `SANITY_TX_ENABLED=false` (recommended for low-noise monitoring)

## Expected Boot Signatures
Look for these lines in deploy logs after each release:

```text
[PRICE_SERVICE_INIT] { ... v2Router: '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008', v3Enabled: false, mode: 'sepolia' }
[EFFECTIVE_PAIRS] { count: 1, pairs: [ 'WETH/USDC' ], scanPairsEnv: 'WETH/USDC' }
[SCANNER_INIT] { pairsLoaded: 1, pairs: [ 'WETH/USDC' ] }
```

## Expected Steady-State Tick
Representative healthy scan tick:

```text
[SCAN_TICK] {
  pairsChecked: 1,
  quotesOk: 1,
  quotesFailed: 0,
  opportunitiesFound: 0,
  durationMs: 20-80
}
```

## Failure Signals (Regression Checklist)
- `pairsLoaded: 0` or missing `[SCANNER_INIT]`
- `quotesFailed > 0` repeatedly in reduced mode
- Any `bad address checksum` or `Invalid Sepolia config` startup errors
- Any router/quoter values showing known mainnet addresses in Sepolia mode
- `Too Many Requests` loops with repeated `[QUOTE_BACKOFF]`
- Railway `rate limit reached for deployment` log-drop warnings

## Commit Window (Known-Good Progression)
These commits established the current stable posture:
- `740065c` live quote path + diagnostics
- `2b062f9` rate-limit backoff + testnet interval default
- `c69b70b` Sepolia/mainnet mismatch guards
- `0c92bc8` address canonicalization + router format validation
- `65fdb76` malformed optional V3 router no longer fatal
- `e02f3da` `ENABLE_V3_QUOTES` and `SCAN_PAIRS` controls
- `88ae226` exclude V3 DEX when V3 is disabled
- `a5983a2` suppress misleading incomplete-profile warning in intentional reduced mode

## Quick Validation Procedure
1. Trigger deploy from `main`.
2. Confirm build snapshot hash is new.
3. Confirm expected boot signatures appear.
4. Observe 3 consecutive scan ticks.
5. Pass criteria: each tick has `pairsChecked: 1`, `quotesOk: 1`, `quotesFailed: 0`.

## Scripted Validation
Use `scripts/validate-sepolia-baseline.ps1` to validate an exported deploy log against the JSON baseline:

```powershell
./scripts/validate-sepolia-baseline.ps1 -LogPath .\tmp\deploy-log.txt

# Optional: fetch logs live from Railway CLI (requires railway login)
./scripts/validate-sepolia-baseline.ps1 -FromRailway -RailwayService arbimind-bot

# Optional: increase fetched log window to avoid false negatives for higher -MinTicks
./scripts/validate-sepolia-baseline.ps1 -FromRailway -RailwayService arbimind-bot -Lines 400 -MinTicks 10
```

Optional flags:
- `-BaselinePath docs/baselines/sepolia-reduced-monitoring-baseline.json`
- `-MinTicks 3`
- `-IgnoreFirstTick`
- `-Lines 200` (Railway mode only)

## Notes
- Sepolia liquidity is sparse and volatile. For reduced monitoring, keep pair scope narrow.
- If moving toward execution testing, re-enable V3 quotes, broaden pair set, and re-tune scan interval/RPC capacity.
