"""Read and check JSONL evidence offline; never re-execute recorded tools."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def summarize(path: Path) -> dict:
    records = [
        json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()
    ]
    if not records:
        raise ValueError("Empty audit trail")
    run_id = records[0]["run_id"]
    task_id = records[0]["task_id"]
    mode = records[0]["run_mode"]
    pending: dict[str, str] = {}
    completed: set[str] = set()
    transitions = []
    last_decision = None
    for sequence, row in enumerate(records, 1):
        if row["sequence"] != sequence or row["run_id"] != run_id or row["task_id"] != task_id:
            raise ValueError("Audit sequence/run/task identity mismatch")
        if row["run_mode"] != mode:
            raise ValueError("Mixed run modes in one audit trail")
        if row["event"] == "tool_started":
            call = row["call_id"]
            if call in pending or call in completed:
                raise ValueError("Duplicate tool call identifier")
            pending[call] = row["tool"]
        elif row["event"] in ("tool_completed", "tool_failed"):
            call = row["call_id"]
            if pending.pop(call, None) != row["tool"]:
                raise ValueError("Tool outcome without a matching start")
            completed.add(call)
        elif row["event"] == "state_changed":
            transitions.append({"from": row["previous"], "to": row["status"], "reason": row["reason"]})
        elif row["event"] in ("fallback_decided", "reconcile_decided"):
            last_decision = row["result"]
    return {
        "run_id": run_id,
        "task_id": task_id,
        "run_mode": mode,
        "records": len(records),
        "transitions": transitions,
        "last_decision": last_decision,
        "incomplete_tool_calls": pending,
        "note": "Structural replay only; does not authenticate logs or prove physical safety",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audit", type=Path)
    args = parser.parse_args(argv)
    print(json.dumps(summarize(args.audit), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
