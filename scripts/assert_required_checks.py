#!/usr/bin/env python3
"""Fail closed when an expected check-run is missing, stale, or unsuccessful.

A workflow that fails to START produces no check-run at all. ``gh pr checks``
and ``mergeStateStatus`` then report the pull request as clean, because they can
only summarise checks that exist -- absence of signal is indistinguishable from
success.

That happened on #383, the pull request that *added* secret-scanning rules: the
Secret Scan workflow had a startup failure (conclusion=failure, jobs=[]), no
check-run was created, and the PR reported CLEAN. It was one command away from
merging with its secret scanner never having executed.

The same shape appeared in #377/#379, where post-deploy smoke passed against a
backend that had never received the commit. Health was verified; deployment was
not.

Three assertions, in this order, because they fail differently:

1. the check-run EXISTS for the head SHA -- catches "never ran"
2. it belongs to THIS head SHA           -- catches "stale run on an older commit"
3. its conclusion is success             -- catches "ran and failed"

Existence is checked first because a conclusion assertion over a nonexistent run
is vacuously satisfied, which is exactly how #383 read as green.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time

# Conclusions that do not indicate a problem. `neutral` and `skipped` cover
# aggregate checks (e.g. CodeQL) that legitimately do not run on every change.
OK_CONCLUSIONS = {"success", "neutral", "skipped"}

DEFAULT_REQUIRED = ["Gitleaks Scan", "test", "powershell-smoke-tests"]


def fetch_check_runs(repo: str, sha: str) -> list[dict]:
    """Check-runs attached to this exact SHA.

    Querying by SHA rather than by branch is what prevents a run on an earlier
    commit from satisfying the assertion.
    """
    try:
        out = subprocess.run(
            ["gh", "api", f"repos/{repo}/commits/{sha}/check-runs", "--paginate"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"WARNING: could not query check-runs: {exc}", file=sys.stderr)
        return []

    runs: list[dict] = []
    # --paginate can emit several JSON documents back to back.
    decoder = json.JSONDecoder()
    idx = 0
    while idx < len(out):
        while idx < len(out) and out[idx].isspace():
            idx += 1
        if idx >= len(out):
            break
        obj, end = decoder.raw_decode(out, idx)
        runs.extend(obj.get("check_runs", []))
        idx = end
    return runs


def classify(runs: list[dict], name: str) -> str:
    """MISSING | PENDING | <conclusion> for the newest run with this name."""
    matches = [r for r in runs if r.get("name") == name]
    if not matches:
        return "MISSING"
    newest = sorted(matches, key=lambda r: r.get("completed_at") or "")[-1]
    if newest.get("status") != "completed":
        return "PENDING"
    return newest.get("conclusion") or "none"


def evaluate(runs: list[dict], required: list[str]) -> tuple[list, list, list]:
    missing, pending, failed = [], [], []
    for name in required:
        status = classify(runs, name)
        if status == "MISSING":
            missing.append(name)
        elif status == "PENDING":
            pending.append(name)
        elif status not in OK_CONCLUSIONS:
            failed.append(f"{name} ({status})")
    return missing, pending, failed


def report_failure(sha, missing, pending, failed, runs, timeout_minutes) -> None:
    print("FAILED: required check-runs are missing, stale, or unsuccessful.")
    print()
    print(f"PR head SHA: {sha}")
    if missing:
        print()
        print("Missing entirely (a workflow that fails to START produces NO")
        print("check-run, which reads as green rather than red):")
        for m in missing:
            print(f"  - {m}")
    if pending:
        print()
        print(f"Never concluded within {timeout_minutes}m:")
        for p in pending:
            print(f"  - {p}")
    if failed:
        print()
        print("Concluded unsuccessfully:")
        for f in failed:
            print(f"  - {f}")
    print()
    print("Observed check-runs on this SHA:")
    if not runs:
        print("  (none)")
    for line in sorted({f"  - {r.get('name')}: {r.get('status')}/{r.get('conclusion') or '-'}" for r in runs}):
        print(line)


def main() -> int:
    repo = os.environ.get("REPO") or os.environ.get("GITHUB_REPOSITORY", "")
    sha = os.environ.get("HEAD_SHA", "")
    timeout_minutes = float(os.environ.get("TIMEOUT_MINUTES", "20"))
    poll_seconds = float(os.environ.get("POLL_SECONDS", "20"))
    required = [
        line.strip()
        for line in os.environ.get("REQUIRED_CHECKS", "\n".join(DEFAULT_REQUIRED)).splitlines()
        if line.strip()
    ]

    if not repo or not sha:
        print("ERROR: REPO and HEAD_SHA must be set.")
        return 1

    print(f"Asserting required check-runs on {repo}@{sha}")
    print("Required:")
    for r in required:
        print(f"  - {r}")
    print()

    deadline = time.time() + timeout_minutes * 60
    while True:
        runs = fetch_check_runs(repo, sha)
        missing, pending, failed = evaluate(runs, required)

        if not missing and not pending and not failed:
            print("OK: every required check-run exists on this head SHA and concluded successfully.")
            return 0

        # A definite failure need not wait for the timeout.
        if failed:
            report_failure(sha, missing, pending, failed, runs, timeout_minutes)
            return 1

        if time.time() >= deadline:
            report_failure(sha, missing, pending, failed, runs, timeout_minutes)
            return 1

        print(f"waiting {poll_seconds:.0f}s - pending={pending or '[]'} missing={missing or '[]'}")
        time.sleep(poll_seconds)


if __name__ == "__main__":
    sys.exit(main())
