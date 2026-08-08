#!/usr/bin/env python3
"""Surface-scoped, baseline-differenced audit gate.

Reads `pnpm audit --prod --json` output and fails only on advisories that are
BOTH reachable from a deployed surface that touches keys and funds
(packages/bot, packages/backend) AND absent from the committed baseline.

Why this shape
--------------
The previous gate ran `pnpm audit --audit-level=high` as a required per-PR
check. That queries a live advisory database against a static lockfile, so its
result changes when GitHub's publication schedule changes rather than when the
repository changes. Measured on an unmodified tree: 2 unignored high advisories
across 1 package, then 5 across 3 packages hours later, with a byte-identical
lockfile. A required check that red-lights a dependency-free diff is not a
security signal.

Surface scoping is a *policy* claim, not a graph inference: bot and backend are
the surfaces that touch keys and funds; the ui is a frontend with a different
threat model and does not gate merges. That is true by construction and
reviewable in one line, unlike "package X never ships in a runtime artifact",
which requires defending a dependency-graph walk that shifts under you.

`pnpm audit` cannot do this scoping itself. `--filter` implies `--recursive`,
which `audit` rejects, and cwd does not scope it either -- running from the repo
root, packages/bot and packages/backend all produce byte-identical output. So
the filter is applied here, on the emitted paths.

Path-prefix filtering is sound because pnpm emits one path per workspace root
rather than deduplicating to a canonical one. Verified against this repo: the
`uuid` advisory lists both `packages__backend>...` and `packages__bot>...`. Were
it deduplicated, a backend-reachable advisory could be reported under `ui` alone
and silently dropped -- a false negative in the exact direction this gate exists
to prevent.

Exit codes
----------
0  clean: no unbaselined findings on the gated surfaces
1  findings: at least one unbaselined advisory reachable from a gated surface
2  did-not-run: the audit produced no usable advisory data

2 is deliberately distinct from 1. `pnpm audit` returns exit 1 both when it
finds vulnerabilities and when it cannot reach the registry, and its failure
payload is *valid JSON* (`{"error": {"code": "ECONNREFUSED", ...}}`) -- so
json.load() succeeds, `.get("advisories", {})` yields `{}`, and a naive filter
reports zero findings and exits 0. That is a required security check going green
because it received no data. This script therefore ignores pnpm's exit code
entirely and decides from the payload shape, and a caller can distinguish
"nothing to fix" from "nothing was checked" without parsing log text.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

EXIT_CLEAN = 0
EXIT_FINDINGS = 1
EXIT_DID_NOT_RUN = 2

# Surfaces that touch keys and funds. pnpm encodes workspace roots with the
# package directory path, '/' replaced by '__'.
DEFAULT_SURFACES = ("packages__bot", "packages__backend")

BLOCKING_SEVERITIES = ("high", "critical")


class AuditDidNotRun(Exception):
    """The audit produced no usable advisory data."""


def parse_audit_payload(raw: str) -> dict[str, Any]:
    """Parse audit JSON, refusing anything that is not a real audit result.

    Raises AuditDidNotRun for empty output, non-JSON output, and JSON that
    lacks an `advisories` key. Presence of the key is the test, not the
    truthiness of its contents: `{"advisories": {}}` is a legitimately clean
    audit and must pass, while `{"error": {...}}` must not.
    """
    text = raw.lstrip("﻿").strip()
    if not text:
        raise AuditDidNotRun("audit produced no output")

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AuditDidNotRun(f"audit output was not valid JSON: {exc}") from exc

    if not isinstance(payload, dict):
        raise AuditDidNotRun("audit output was not a JSON object")

    if "advisories" not in payload:
        detail = ""
        error = payload.get("error")
        if isinstance(error, dict):
            code = error.get("code") or "unknown"
            detail = f" (error code: {code})"
        raise AuditDidNotRun(
            f"audit output has no 'advisories' key{detail}; the audit did not run"
        )

    advisories = payload["advisories"]
    if not isinstance(advisories, dict):
        raise AuditDidNotRun("'advisories' was not an object")

    return advisories


def load_baseline(path: Path | None) -> set[str]:
    """Load accepted GHSA ids. A missing file is an empty baseline, not an error."""
    if path is None or not path.exists():
        return set()
    data = json.loads(path.read_text(encoding="utf-8").lstrip("﻿"))
    entries = data.get("advisories", [])
    return {e["ghsa"] for e in entries if isinstance(e, dict) and e.get("ghsa")}


def surface_findings(
    advisories: dict[str, Any],
    surfaces: tuple[str, ...],
    baseline: set[str],
    severities: tuple[str, ...] = BLOCKING_SEVERITIES,
) -> list[dict[str, Any]]:
    """Advisories at a blocking severity, reachable from a gated surface, not baselined."""
    hits: list[dict[str, Any]] = []
    for advisory in advisories.values():
        if not isinstance(advisory, dict):
            continue
        if (advisory.get("severity") or "").lower() not in severities:
            continue

        ghsa = advisory.get("github_advisory_id") or ""
        if ghsa and ghsa in baseline:
            continue

        matched = [
            path
            for finding in advisory.get("findings") or []
            for path in finding.get("paths") or []
            if any(path.startswith(f"{s}>") or path == s for s in surfaces)
        ]
        if matched:
            hits.append(
                {
                    "ghsa": ghsa or "(no GHSA id)",
                    "module": advisory.get("module_name") or "(unknown)",
                    "severity": advisory.get("severity") or "(unknown)",
                    "patched": advisory.get("patched_versions") or "(unknown)",
                    "paths": matched,
                }
            )
    return hits


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audit_json", help="path to `pnpm audit --prod --json` output, or - for stdin")
    parser.add_argument("--baseline", type=Path, default=None)
    parser.add_argument(
        "--surface",
        action="append",
        default=None,
        help="workspace root prefix to gate on (repeatable). Defaults to bot + backend.",
    )
    parser.add_argument(
        "--severity",
        action="append",
        default=None,
        help="severity to treat as blocking (repeatable). Defaults to high + critical.",
    )
    args = parser.parse_args()

    surfaces = tuple(args.surface) if args.surface else DEFAULT_SURFACES
    severities = tuple(s.lower() for s in args.severity) if args.severity else BLOCKING_SEVERITIES

    raw = sys.stdin.read() if args.audit_json == "-" else Path(args.audit_json).read_text(encoding="utf-8")

    try:
        advisories = parse_audit_payload(raw)
    except AuditDidNotRun as exc:
        # Never conflate this with a clean result. A required security check
        # must not go green because it received no data.
        print(f"AUDIT DID NOT RUN: {exc}", file=sys.stderr)
        print("Refusing to report a clean audit from a failed one.", file=sys.stderr)
        return EXIT_DID_NOT_RUN

    baseline = load_baseline(args.baseline)
    hits = surface_findings(advisories, surfaces, baseline, severities)

    gated = ", ".join(surfaces)
    if not hits:
        print(f"Audit gate clean: no unbaselined {'/'.join(severities)} advisories on [{gated}].")
        print(f"  advisories scanned: {len(advisories)}   baseline entries: {len(baseline)}")
        return EXIT_CLEAN

    print(f"Audit gate FAILED: {len(hits)} unbaselined advisory(ies) on [{gated}].\n")
    for hit in hits:
        print(f"  {hit['severity'].upper()}  {hit['module']}  {hit['ghsa']}")
        print(f"    patched versions: {hit['patched']}")
        for path in hit["paths"][:3]:
            print(f"    via {path}")
        if len(hit["paths"]) > 3:
            print(f"    ... and {len(hit['paths']) - 3} more path(s)")
        print()
    print("Fix the dependency, or add the GHSA to the baseline with a rationale and reviewBy date.")
    return EXIT_FINDINGS


if __name__ == "__main__":
    sys.exit(main())
