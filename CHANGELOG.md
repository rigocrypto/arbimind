# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] / 8d34445 (2026-02-18)

### Added
- **CTA A/B Funnel**: End-to-end analytics (landing → connect).
  - UI tracks `landing_view`, `wallet_connect_click`, `wallet_connected`, `first_opportunity_view` with persistent variant assignment.
  - Backend exposes `/api/analytics/ab-cta` with per-variant metrics and winner delta.
  - Admin includes a dedicated funnel dashboard card.
- **Smoke Production Validation**: Analytics ingest/query plus A/B report checks added to smoke flows (`smoke:all` and CI workflow).

Non-breaking; metrics-only. Verified with production smoke checks.
