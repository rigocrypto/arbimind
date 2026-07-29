# Audit Exceptions

Accepted high/critical advisories for the `pnpm audit --audit-level=high` gate in
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

The allowlist lives in `pnpm.auditConfig.ignoreGhsas` in the root `package.json`.
Every ID there must have a row below.

## Rules

1. **An ID belongs here only when no parent-scoped fix exists.** If bumping a
   dependency clears the advisory, bump it instead. Do not allowlist something
   Dependabot can already fix.
2. **The gate stays blocking.** Any advisory not listed here still fails CI, so
   newly published high/critical findings surface immediately.
3. **Every row has a review date.** On that date, re-check whether upstream has
   shipped a fix and remove the entry if so.
4. This list is not a substitute for the leaf-override guardrail in
   [`DEPENDENCY_MAINTENANCE_DEFERRED_2026-07-18.md`](./DEPENDENCY_MAINTENANCE_DEFERRED_2026-07-18.md);
   it is the alternative to breaking it. Forcing `tar` or `brace-expansion` via
   overrides remains disallowed.

## Accepted advisories

Baseline: 2026-07-28. Review by: **2026-08-27**.

| Advisory | Sev | Package | Path | Why no fix |
|---|---|---|---|---|
| [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw) | critical | tar | `packages/backend > @tensorflow/tfjs-node > tar` | `tfjs-node` is at its latest release (4.22.0) and still pins `tar ^6`; patch requires `>=7.5.19`. No parent upgrade exists. |
| [GHSA-8x88-c5mf-7j5w](https://github.com/advisories/GHSA-8x88-c5mf-7j5w) | high | tar | `packages/backend > @tensorflow/tfjs-node > tar` | Same `tfjs-node` pin as above. |
| [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | high | brace-expansion | `packages/backend > eslint > @eslint/eslintrc > minimatch`, and via `@typescript-eslint/eslint-plugin` | Reachable only through `eslint@8`. Clearing it needs an eslint 8 -> 10 major upgrade. Dev-only; not in any shipped artifact. |
| [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | high | brace-expansion | `packages/backend > @typescript-eslint/eslint-plugin > ... > minimatch` | Same eslint 8 toolchain as above. Dev-only. |
| [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m) | high | js-yaml | `packages/backend > eslint > js-yaml` | `eslint@8` pins a `js-yaml` below the patched `>=4.3.0`. Dev-only. |
| [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) | high | postcss | `next > postcss` | `next` pins `postcss` to exactly `8.4.31` through 16.2.12; patch requires `>=8.5.12`. Not reachable by bumping our own postcss. |
| [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | high | postcss | `next > postcss` | Same exact pin; patch requires `>=8.5.18`. |
| [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | high | sharp | `next > sharp` | `next` 16.2.12 declares `sharp ^0.34.5`; patch requires `>=0.35.0`. |

## Deliberately not excepted

The four `next` advisories below are **fixable** and are therefore left blocking:

- GHSA-6gpp-xcg3-4w24 (Middleware / Proxy bypass)
- GHSA-m99w-x7hq-7vfj (DoS in App Router Server Actions)
- GHSA-89xv-2m56-2m9x (SSRF in Server Actions)
- GHSA-p9j2-gv94-2wf4 (SSRF in rewrites)

All four are patched in `next >= 16.2.11`. CI will stay red until the framework
bump lands, which is the intended signal.

## Review checklist

At each review date, run:

```sh
pnpm audit --audit-level=high
```

For each row above, check whether the parent has shipped a version that resolves
the path (`pnpm why <package>` shows the current chain). Remove entries that are
fixed, and re-date the ones that are not.
