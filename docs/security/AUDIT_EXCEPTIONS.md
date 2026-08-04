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
| [GHSA-mwp4-54f8-5fhr](https://github.com/advisories/GHSA-mwp4-54f8-5fhr) | high | ip-address | `packages/bot > natural > mongoose > mongodb > socks > ip-address` | Six levels deep under `natural`. No parent in the chain has released a version pinning the patched `ip-address`. Already tracked in the deferred dependency-maintenance note. |
| [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | high | brace-expansion | `packages/backend > eslint > @eslint/eslintrc > minimatch`, and via `@typescript-eslint/eslint-plugin` | A **third** advisory on the same `eslint@8` chain as GHSA-3jxr-9vmj-r5cp and GHSA-mh99-v99m-4gvg. Clearing it needs the same eslint 8 -> 10 major upgrade. Dev-only. |
| [GHSA-2m8v-j782-fhvr](https://github.com/advisories/GHSA-2m8v-j782-fhvr) | high | socket.io-parser | `packages/ui > @solana/wallet-adapter-wallets > @solana/wallet-adapter-torus > @toruslabs/solana-embed > @toruslabs/base-controllers > @toruslabs/broadcast-channel > socket.io-client > socket.io-parser` | **Nominally fixable but not safely** -- see the note below. `socket.io-client@4.8.3` declares `~4.2.4`, which permits the patched `4.2.7`, but reaching it requires a `pnpm.overrides` entry that triggers full lockfile re-resolution. |

### Why `socket.io-parser` is here despite Rule 1

Rule 1 says an advisory belongs here only when no parent-scoped fix exists.
`socket.io-parser` is the only entry bending that, so the reasoning is recorded
in full.

Its parent already permits the patched version -- `socket.io-client@4.8.3`
declares `~4.2.4`. In isolation it is a one-line `pnpm.overrides` fix.

(`undici` was listed here too and has since been **removed**: the underlying bad
lockfile edge was repaired surgically rather than via an override. See the note
below.)

The problem is that adding **any** `pnpm.overrides` key to this repository forces
pnpm to re-resolve the entire tree against the current registry, and this
lockfile is far enough behind that re-resolution pulls in substantially more than
it fixes. Measured on 2026-08-04:

| State | Total | High | Critical |
|---|---|---|---|
| Frozen lockfile (what CI installs) | 35 | 14 (9 ignored) | 1 (1 ignored) |
| With either override added | 56 | 28 (9 ignored) | 2 (1 ignored) |

Net **+21 advisories**, including a new critical in `protobufjs` and new high
findings in `tar`, `adm-zip`, `ws` and `lodash`. The same result occurs with only
`socket.io-parser` overridden, so it is the re-resolution and not the specific
override that causes it.

Fixing two advisories by introducing twenty-one is not a fix. The lockfile
refresh these need is a controlled dependency-maintenance project, not something
to attach to a hotfix -- these exceptions were added to restore CI so a live
credential-leak fix could ship.

### When manual lockfile repair is acceptable

The `undici` repair below is deliberately narrow. It is **not** a precedent for
lockfile surgery in general. All five conditions must hold:

1. The parent's declared range **already permits** the patched version -- you are
   correcting a wrong resolution, not forcing an unsupported one.
2. The replacement package **does not expand the dependency tree** (ideally no
   dependencies of its own). This is the condition that most often fails.
3. The advisory count **does not regress**, measured before and after.
4. `pnpm install --frozen-lockfile`, typecheck, tests and builds all pass.
5. The rationale is documented here, including why it does not generalise.

If any condition fails, document the exception instead. Forcing the issue with
`pnpm.overrides` triggers full re-resolution, which #394 measured at net +21
advisories including a new critical.

### What worked for `undici`, and why it does not generalise

`GHSA-4cwx-7wf7-3272` was removed from this list. The cause was a single
lockfile edge that violated its own parent's declared range:

```
jsdom@30.0.1 declares:  undici ^8.9.0
lockfile recorded:      undici 7.28.0
```

Left behind by the jsdom 29 -> 30 upgrade in #363. `pnpm install --lockfile-only`
and `pnpm install --fix-lockfile` both leave it alone -- pnpm validates manifests
against the lockfile, not each transitive edge's semver satisfaction.

Repairing that one edge by hand cleared the advisory and **reduced** the total:

| | Total | High | Critical |
|---|---|---|---|
| Before | 35 | 14 (14 ignored) | 1 (1 ignored) |
| After | 30 | 13 (13 ignored) | 1 (1 ignored) |

This worked because `undici@8.10.0` has **no dependencies of its own**, so
replacing it could not expand the tree. That is what made a hand edit safe, and
it is exactly why the approach does not generalise -- for a package with its own
subtree, the same edit would pull in transitive resolutions and reintroduce the
broad re-resolution problem.

**Removal trigger for the remaining three:** remove when the dependency-refresh work updates
the stale lockfile safely, or when a parent package in the chain releases a
version that clears the advisory without broad re-resolution. Tracked separately.

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
