# Mainnet Live Baseline

Last updated: 2026-03-09
Purpose: Define hard pre-execution checks for mainnet LIVE readiness.

## Baseline Mode
- Chain: Ethereum mainnet (`chainId=1`)
- Runtime posture: LIVE execution mode required
- Pair scope: `WETH/USDC`, `WETH/DAI`, `USDC/DAI`
- Quote sources: Uniswap V2 and Uniswap V3 both required

## Hard Readiness Criteria
- `mode=LIVE` present in runtime logs
- `chainId=1` present in startup/runtime logs
- `v3Enabled: true` present in runtime logs
- `UNISWAP_V2` and `UNISWAP_V3` quote logs present in sampled window
- For each evaluated `SCAN_TICK`:
  - `pairsChecked >= 3`
  - `quotesOk >= 2`
  - `quotesFailed == 0`
  - `opportunitiesFound` field present
- At least `minTicks` healthy ticks in window
- Average interval between `SCAN_TICK` timestamps `<= 1000ms`
- Wallet balance is at or above minimum threshold (`0.05 ETH` default)
- ETH quote sanity range (`500` to `50000`)

## Required Environment For Validation Host
- `ETHEREUM_RPC_URL` must be set where validator runs
- Railway CLI authenticated and linked to the target project for `-FromRailway` mode

## Scripted Validation
```powershell
# Validate exported logs (strict file mode)
./scripts/validate-mainnet-baseline.ps1 -LogPath .\tmp\mainnet-deploy-log.txt

# Validate live logs from Railway service
./scripts/validate-mainnet-baseline.ps1 -FromRailway -RailwayService arbimind -Lines 500 -MinTicks 10
```

Optional flags:
- `-BaselinePath docs/baselines/mainnet-baseline.json`
- `-MinTicks 10`
- `-IgnoreFirstTick`
- `-Lines 500` (Railway mode only)
- `-SkipWalletBalanceCheck` (debug-only, not recommended for go-live)

## Post-Deploy Wrapper
```powershell
# Standard mainnet readiness gate
./scripts/post-deploy-verify-mainnet.ps1

# Custom service and stricter window
./scripts/post-deploy-verify-mainnet.ps1 -RailwayService arbimind -MinTicks 12 -Lines 700
```

## CI/CD Usage
```yaml
- name: Post-deploy mainnet verification
  shell: pwsh
  env:
    RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
    ETHEREUM_RPC_URL: ${{ secrets.ETHEREUM_RPC_URL }}
  run: |
    ./scripts/post-deploy-verify-mainnet.ps1 \
      -StabilizationWait 90 \
      -MinTicks 10 \
      -Lines 500
```

## Failure Handling
Any single hard-check failure means deployment is not ready for LIVE execution. Keep bot in non-live mode and remediate before promoting.
