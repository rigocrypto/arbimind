# Railway Build-Time Secret Safety Checklist

## Canonical Service
- Service name: `arbimind`
- Retired services: `service-production-f428` (decommissioned)

## Pre-Deploy Preflight
- [ ] No sensitive vars in build-time scope (`PRIVATE_KEY`, `ADMIN_API_KEY`, `AI_SERVICE_KEY`)
- [ ] All secrets are runtime-only variables in Railway
- [ ] `PRIVATE_KEY` rotated if ever exposed to build context or logs
- [ ] Only canonical service (`arbimind`) is active

## Variable Scope Rules
| Variable | Build-time | Runtime |
|---|---|---|
| `NODE_ENV` | OK | OK |
| `PRIVATE_KEY` | Never | Only |
| `ADMIN_API_KEY` | Never | Only |
| `AI_SERVICE_KEY` | Never | Only |
| `ETHEREUM_RPC_URL` | Avoid | Only |

## Validation Command
```powershell
./scripts/post-deploy-verify-sepolia.ps1 -StabilizationWait 30 -MinTicks 3 -Lines 300 -RailwayService arbimind
```

## Image Hygiene (Future)
- Target image size: `<150 MB`
- Use multi-stage build when refactoring Dockerfile/Nixpacks flow
- Maintain `.dockerignore` with exclusions for `.git`, markdown/docs, and unrelated workspaces

## Notes
- Nixpacks warning signals about secrets should be treated as production hygiene incidents.
- Build logs from retired services are useful for security review, but should not be used as canonical runtime status.
