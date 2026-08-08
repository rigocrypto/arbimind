#!/usr/bin/env python3
"""Tests for the surface-scoped audit gate.

Run directly: `python3 tests/test_audit_surface_gate.py`

No pytest: this repo runs Python in CI by invoking scripts directly
(`python3 scripts/assert_required_checks.py`), and adding a test framework to
land a CI fix is scope that belongs in its own change.

Every case runs against a committed fixture, never the live advisory database.
That is deliberate. A live-DB assertion inherits exactly the non-determinism
this gate exists to remove: backend's moderate findings get patched upstream one
quiet Tuesday, the assertion goes red on a PR that touches nothing, and whoever
is on the hook deletes it -- correctly, because by then it *is* flaky.

The things under test are the filter's path-matching and its parse boundary.
Those are our code and can break. The advisory database is not.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "audit_surface_gate.py"
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "audit"

EXIT_CLEAN = 0
EXIT_FINDINGS = 1
EXIT_DID_NOT_RUN = 2

_failures: list[str] = []
_passes = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global _passes
    if condition:
        _passes += 1
        print(f"  PASS  {name}")
    else:
        _failures.append(f"{name}\n        {detail}".rstrip())
        print(f"  FAIL  {name}")
        if detail:
            print(f"        {detail}")


def run_gate(fixture: str, *extra: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(FIXTURES / fixture), *extra],
        capture_output=True,
        text=True,
        check=False,
    )


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


# --- Fixture A: real output, gated surfaces clean -------------------------

def test_real_output_passes() -> None:
    r = run_gate("clean-surfaces.json")
    check(
        "real audit output passes (bot/backend carry no high advisories)",
        r.returncode == EXIT_CLEAN,
        f"exit={r.returncode} {r.stdout}{r.stderr}",
    )


def test_fixture_is_not_vacuous() -> None:
    """The pass must come from surface scoping, not from an empty fixture."""
    payload = load_fixture("clean-surfaces.json")
    ui_high = [
        a
        for a in payload["advisories"].values()
        if (a.get("severity") or "").lower() in ("high", "critical")
        and any(
            p.startswith("packages__ui>")
            for f in a.get("findings", [])
            for p in f.get("paths", [])
        )
    ]
    check(
        "fixture contains ui high advisories (so the pass is not vacuous)",
        bool(ui_high),
        "fixture has no ui high advisories; fixture A would prove nothing",
    )


def test_gating_ui_fails_the_same_input() -> None:
    """The complement: same bytes, different surface, must fail."""
    r = run_gate("clean-surfaces.json", "--surface", "packages__ui")
    check(
        "same input FAILS when gated on ui (clean result is a scoping property)",
        r.returncode == EXIT_FINDINGS,
        f"exit={r.returncode}",
    )


# --- Fixture B: the failure path, otherwise never executed ----------------

def test_synthetic_high_under_bot_fails() -> None:
    r = run_gate("bot-high-finding.json")
    check(
        "synthetic high under packages__bot fails and names the package",
        r.returncode == EXIT_FINDINGS
        and "synthetic-vulnerable-pkg" in r.stdout
        and "GHSA-test-synthetic-high" in r.stdout,
        f"exit={r.returncode} stdout={r.stdout[:200]}",
    )


def test_baseline_suppresses_known_finding() -> None:
    baseline = FIXTURES / "tmp-baseline.json"
    baseline.write_text(
        json.dumps(
            {
                "advisories": [
                    {
                        "ghsa": "GHSA-test-synthetic-high",
                        "rationale": "test fixture",
                        "reviewBy": "2099-01-01",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    try:
        r = run_gate("bot-high-finding.json", "--baseline", str(baseline))
        check(
            "a baselined GHSA is suppressed",
            r.returncode == EXIT_CLEAN,
            f"exit={r.returncode} {r.stdout}",
        )
    finally:
        baseline.unlink(missing_ok=True)


# --- Fixture C: multi-root emission makes prefix filtering sound ----------

def test_multi_root_advisory_lists_every_root() -> None:
    """pnpm emits one path per workspace root, not a single canonical one.

    If it deduplicated, a backend-reachable advisory could be reported under ui
    alone and silently dropped -- a false negative in the one direction this
    gate exists to prevent. `uuid` is the live proof.
    """
    payload = load_fixture("clean-surfaces.json")
    uuid_adv = next(
        (a for a in payload["advisories"].values() if a.get("module_name") == "uuid"),
        None,
    )
    roots = (
        {
            p.split(">")[0]
            for f in uuid_adv.get("findings", [])
            for p in f.get("paths", [])
        }
        if uuid_adv
        else set()
    )
    check(
        "multi-root advisory (uuid) is emitted under BOTH backend and bot",
        {"packages__backend", "packages__bot"} <= roots,
        f"roots={sorted(roots)}",
    )


def test_multi_root_is_caught_at_its_severity() -> None:
    r = run_gate("clean-surfaces.json", "--severity", "moderate", "--surface", "packages__bot")
    check(
        "uuid surfaces on bot when gated at moderate",
        r.returncode == EXIT_FINDINGS and "uuid" in r.stdout,
        f"exit={r.returncode} stdout={r.stdout[:200]}",
    )


# --- Fixtures D/E: the parse boundary, below path matching ----------------

def test_did_not_run_cases_exit_2() -> None:
    """`pnpm audit` exits 1 for findings AND for an unreachable registry, and
    its failure payload is valid JSON -- so a naive `.get("advisories", {})`
    yields {}, reports zero findings, and exits 0. That is a required security
    check going green because it received no data.

    Exit 2 must be distinct from 1: a message is for a human reading logs, an
    exit code is what the workflow and `set -e` branch on.
    """
    for fixture, reason in [
        ("registry-unreachable.json", "valid JSON error payload"),
        ("empty-output.json", "empty stdout"),
        ("non-json-output.json", "non-JSON output"),
    ]:
        r = run_gate(fixture)
        check(
            f"did-not-run exits 2, not 0 ({reason})",
            r.returncode == EXIT_DID_NOT_RUN and "DID NOT RUN" in r.stderr,
            f"exit={r.returncode} stderr={r.stderr[:200]}",
        )


def test_genuinely_empty_advisories_passes() -> None:
    """`{"advisories": {}}` is legitimately clean and must not be confused with
    a failed audit. Presence of the key is the test, not truthiness."""
    tmp = FIXTURES / "tmp-genuinely-clean.json"
    tmp.write_text(json.dumps({"advisories": {}}), encoding="utf-8")
    try:
        r = run_gate("tmp-genuinely-clean.json")
        check(
            "genuinely empty advisories passes (clean, not did-not-run)",
            r.returncode == EXIT_CLEAN,
            f"exit={r.returncode} {r.stdout}{r.stderr}",
        )
    finally:
        tmp.unlink(missing_ok=True)


def main() -> int:
    print("audit_surface_gate tests\n")
    for fn in [
        test_real_output_passes,
        test_fixture_is_not_vacuous,
        test_gating_ui_fails_the_same_input,
        test_synthetic_high_under_bot_fails,
        test_baseline_suppresses_known_finding,
        test_multi_root_advisory_lists_every_root,
        test_multi_root_is_caught_at_its_severity,
        test_did_not_run_cases_exit_2,
        test_genuinely_empty_advisories_passes,
    ]:
        fn()

    print(f"\n{_passes} passed, {len(_failures)} failed")
    if _failures:
        print("\nFailures:")
        for f in _failures:
            print(f"  - {f}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
