# ArbiMind Ops Snapshot (2026-02-18)

One-file onboarding for current production operations.

## URLs

- Backend: https://backend-production-0932.up.railway.app
- UI: https://arbimind.vercel.app
- Backend health: https://backend-production-0932.up.railway.app/api/health
- RPC health: https://backend-production-0932.up.railway.app/api/rpc/health?chain=evm,worldchain_sepolia,solana

## Secrets Checklist (GitHub Actions)

Repo Settings → Secrets and variables → Actions

- [x] BACKEND_BASE (required)
- [x] UI_BASE (required)
- [x] ADMIN_API_KEY (optional for admin smoke checks)
- [ ] ALERT_WEBHOOK_URL (optional, enables Slack/Discord alert delivery)

## Workflows (Badges)

[![Nightly Smoke](https://github.com/rigocrypto/arbimind/actions/workflows/nightly-smoke.yml/badge.svg)](https://github.com/rigocrypto/arbimind/actions/workflows/nightly-smoke.yml)
[![Post-Deploy Smoke](https://github.com/rigocrypto/arbimind/actions/workflows/post-deploy-smoke.yml/badge.svg)](https://github.com/rigocrypto/arbimind/actions/workflows/post-deploy-smoke.yml)
[![Bot Canary Sanity](https://github.com/rigocrypto/arbimind/actions/workflows/bot-canary-sanity.yml/badge.svg)](https://github.com/rigocrypto/arbimind/actions/workflows/bot-canary-sanity.yml)
[![Deploy UI to Vercel](https://github.com/rigocrypto/arbimind/actions/workflows/deploy-ui.yml/badge.svg)](https://github.com/rigocrypto/arbimind/actions/workflows/deploy-ui.yml)

## Last Commits (Recent Milestones)

- a374ae5: docs link CTA A/B template to README + runbook
- 5678c81: ops runbook parity for nightly smoke secrets
- 1e40c49: README nightly smoke secrets section
- 6d53257: nightly smoke workflow + fail issue alerting
- c8120a2: changelog entry for CTA A/B rollout
- 8d34445: CTA A/B funnel + admin card + smoke validation

## Day-1 Ritual

1. Deploy backend/UI changes.
2. Run full validation:
   - npm run smoke:all -- -BackendBase "https://backend-production-0932.up.railway.app" -UiBase "https://arbimind.vercel.app"
3. Start guarded bot canary:
   - pnpm bot:canary
4. Monitor:
   - Actions → Nightly Smoke
   - Sentry project dashboard
   - Admin dashboard CTA A/B funnel deltas
5. Decide CTA winner on Day 7 using:
   - [CTA A/B Decision Template](CTA_AB_DECISION_TEMPLATE.md)

## Contacts / Alerts

- Incident tag: @ops
- Error observability: Sentry
- Nightly failure path: GitHub issue (auto) + webhook alert (if ALERT_WEBHOOK_URL is set)

## Key Runbooks

- [OPS_DAY1_RUNBOOK.md](OPS_DAY1_RUNBOOK.md)
- [CTA_AB_DECISION_TEMPLATE.md](CTA_AB_DECISION_TEMPLATE.md)
- [README.md](README.md)
