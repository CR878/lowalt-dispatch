"""Run MOCK decision scenarios: python -m agent.demo --scenario all."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from agent.edge_decisions import EdgeDecisionAgent
from agent.engine import TaskAgent
from agent.fixtures import FixtureTools, fixture_task
from core.models import PlanCommand

SCENARIOS = (
    "normal",
    "replan",
    "stale",
    "no_route",
    "missing_check",
    "ack_timeout",
    "mismatched_ack",
    "fallback",
    "reconnect",
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="M3 MOCK decisions only; no flight or safety performance claims"
    )
    parser.add_argument("--scenario", choices=(*SCENARIOS, "all"), default="all")
    parser.add_argument("--out-dir", type=Path, default=Path("logs/agent"))
    args = parser.parse_args(argv)
    selected = SCENARIOS if args.scenario == "all" else (args.scenario,)
    batch = datetime.now(UTC).strftime("%Y%m%dT%H%M%S") + "_" + uuid4().hex[:8]
    output = args.out_dir / batch
    output.mkdir(parents=True, exist_ok=False)
    rows = []
    for scenario in selected:
        tools = FixtureTools(scenario)
        log = output / f"{scenario}_MOCK.jsonl"
        if scenario in ("fallback", "reconnect"):
            task, observation, candidate = tools.fallback_fixture()
            # Fixture construction is not an orchestration planning call.
            tools.requests.clear()
            tools.verifications.clear()
            edge = EdgeDecisionAgent(tools, log)
            if scenario == "fallback":
                result = edge.choose_fallback(task, observation, [candidate])
            else:
                now = datetime.now(UTC)
                command = PlanCommand(
                    command_id="MOCK-CMD-v2",
                    task_id=task.task_id,
                    plan_version="v2",
                    issued_at=now,
                    expires_at=now + timedelta(seconds=30),
                )
                result = edge.reconcile(task.task_id, command, observation)
            status, reason = result.action, result.reason
        else:
            result = TaskAgent(tools, log).run(fixture_task(datetime.now(UTC)))
            status, reason = result.status.value, result.reason
        row = {
            "scenario": scenario,
            "run_mode": "mock",
            "status": status,
            "plan_calls": len(tools.requests),
            "submit_calls": len(tools.submitted),
            "reason": reason,
            "audit_path": str(log),
        }
        rows.append(row)
        print(f"[MOCK] {scenario:16} -> {status:20} plans={row['plan_calls']} submits={row['submit_calls']}")
    summary = output / "summary_MOCK.json"
    summary.write_text(
        json.dumps(
            {
                "run_mode": "mock",
                "warning": "Control-flow fixtures only: no real planner/validator/PX4/cloud/LLM.",
                "scenarios": rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\nMOCK summary: {summary}\nThese outputs are NOT flight/safety/energy performance results.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
