# Backend Production Baseline

Last updated: 2026-03-09
Purpose: Validate backend production deploy logs quickly and consistently.

## Baseline Signals
Required startup signals in deploy logs:
- `ArbiMind Backend @ http://0.0.0.0:8080`
- `Sentiment Model initialized`
- `Risk Model initialized`
- `[portfolioDb] Schema initialized`

Common optional signal:
- `Arb model not loaded - falling back to heuristic`

## Policy
- Required signals missing => FAIL
- Optional fallback signal:
  - `allow`: record only, do not fail
  - `warn`: record warning, do not fail
  - `fail`: treat as failing condition

## Scripted Validation
```powershell
./scripts/validate-backend-baseline.ps1 -LogPath .\tmp\backend-deploy-log.txt
```

Optional flags:
- `-BaselinePath docs/baselines/backend-production-baseline.json`
- `-FallbackPolicy allow|warn|fail`

## Quick Procedure
1. Export/copy deploy logs to a local file.
2. Run validator script.
3. Check `BACKEND_BASELINE_CHECK: PASS|FAIL` line.
4. If failing, use first failing check detail and snippet to triage.
