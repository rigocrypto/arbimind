# Contributing to ArbiMind

## Railway Deployment Rules

### One Canonical Service
- The only active Railway service is `arbimind`.
- Do not create duplicate Railway services for testing.
- Use Railway preview environments or local `.env` files instead.
- If you spin up a test service, delete it before merging.

### Secret Scope Safety
- Never set `PRIVATE_KEY`, `ADMIN_API_KEY`, or `AI_SERVICE_KEY` as build-time variables.
- Runtime-only: set them in Railway Variables only.
- Full checklist: `docs/ops/railway-build-secret-safety.md`.

### Pre-Deploy Verification
Run after any deployment to the canonical service:

```powershell
./scripts/post-deploy-verify-sepolia.ps1 `
  -StabilizationWait 30 `
  -MinTicks 3 `
  -Lines 300 `
  -RailwayService arbimind
```

## Questions
- Check `docs/ops/` first, then open an issue.
