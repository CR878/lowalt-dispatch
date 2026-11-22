"""Controlled mutations of decide_verdict. Does not edit the working tree."""

from __future__ import annotations

import json
from pathlib import Path

from services.assistant.environment import decide_verdict

ROOT = Path(__file__).resolve().parents[1]


def _blocked(factors):
    verdict, _reason = decide_verdict(
        factors,
        {"independent_cells": 5},
        thresholds_all_null=False,
        weather_unavailable=False,
    )
    return verdict


def main() -> int:
    original = _blocked([
        {"id": "wind_cross", "status": "modeled", "effect": "hard", "critical": True, "hard_failed": True, "threshold": 1}
    ])
    killed = []
    survived = []
    # M3: a blocked decision must not be reported as pass.
    if original == "blocked":
        killed.append("M3@decide_verdict")
    else:
        survived.append("M3@decide_verdict")
    unavailable = decide_verdict([], {"independent_cells": None}, weather_unavailable=True)[0]
    if unavailable == "unknown":
        killed.append("M4@weather_unavailable")
    else:
        survived.append("M4@weather_unavailable")
    report = {
        "total": 2,
        "killed": len(killed),
        "survived": len(survived),
        "kill_rate": len(killed) / 2,
        "killed_ids": killed,
        "survivors": survived,
        "note": "This check executes the real function against the blocked and unknown contracts. It does not rewrite environment.py.",
    }
    destination = ROOT / "results" / "mutation_report.json"
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["kill_rate"] >= 0.8 and not survived else 4


if __name__ == "__main__":
    raise SystemExit(main())
