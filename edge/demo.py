"""离线 demo：不连 MQTT、不连飞控，把"收命令 → 去重 → 执行 → ACK → 遥测 → 落库"跑一遍。

航点来自真实的 `planner.astar.plan_scenario`（不是手写直线），高度是按索引线性插值的
占位值——因为机型参数与 ENU 原点都还没定。产物一律带 `_MOCK`，不是飞行结果。
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from core.console import ensure_utf8_stdout
from core.models import PlanCommand
from edge.service import EdgeService
from edge.store import CommandStore
from planner.astar import plan_scenario
from planner.scene import load_scene, load_suite


def build_command(
    scenario: dict,
    waypoints_xy: list[tuple[float, float]],
    *,
    task_id: str,
    plan_version: str = "v1",
    run_mode: str = "mock",
    expired: bool = False,
    valid_for_s: float = 1800.0,
) -> PlanCommand:
    now = datetime.now(UTC)
    issued = now - timedelta(seconds=120) if expired else now
    expires = now - timedelta(seconds=60) if expired else now + timedelta(seconds=valid_for_s)
    cruise_alt = float(scenario["destination"].get("alt_m") or 30.0)
    last = max(1, len(waypoints_xy) - 1)
    payload = {
        "run_mode": run_mode,
        "snapshot_id": "snap_demo_v0",
        "algorithm": "astar_static",
        "waypoints": [
            {
                "frame": "enu_m",
                "alt_ref": "agl",
                "x_m": float(x_m),
                "y_m": float(y_m),
                "alt_m": round(cruise_alt * index / last, 2),
            }
            for index, (x_m, y_m) in enumerate(waypoints_xy)
        ],
        "note": "MOCK demo: A* waypoints, synthetic altitude, no flight controller",
    }
    return PlanCommand(
        command_id=uuid4().hex,
        task_id=task_id,
        plan_version=plan_version,
        issued_at=issued,
        expires_at=expires,
        payload=payload,
    )


def run_demo(
    scenario_id: str,
    *,
    duplicate: bool = False,
    expired: bool = False,
    out_root: Path = Path("logs/edge"),
    step_s: float = 2.0,
) -> dict:
    suite = load_suite()
    scenario = next((item for item in suite["scenarios"] if item["id"] == scenario_id), None)
    if scenario is None:
        raise SystemExit(f"场景不存在：{scenario_id}")

    scene = load_scene()
    path, _grid = plan_scenario(scenario, scene)
    if not path.found:
        raise SystemExit(f"场景 {scenario_id} 无可行路线：{path.reason}")

    batch = out_root / (datetime.now(UTC).strftime("%Y%m%dT%H%M%S") + "_" + uuid4().hex[:8])
    batch.mkdir(parents=True, exist_ok=True)
    db_path = batch / "edge_MOCK.sqlite3"
    telemetry_path = batch / "telemetry_MOCK.jsonl"
    audit_path = batch / "audit_MOCK.jsonl"

    command = build_command(
        scenario,
        path.waypoints,
        task_id=f"MOCK-{scenario_id}-{uuid4().hex[:8]}",
        expired=expired,
    )

    with CommandStore(db_path) as store:
        service = EdgeService(
            store,
            audit_path=audit_path,
            telemetry_path=telemetry_path,
            run_mode="mock",
            task_id=command.task_id,
        )
        try:
            if expired:
                ack, samples = service.run_to_completion(command, step_s=step_s)
                second_ack = None
            elif duplicate:
                ack, samples = service.run_to_completion(command, step_s=step_s)
                second_ack = service.submit(command)
            else:
                ack, samples = service.run_to_completion(command, step_s=step_s)
                second_ack = None
            record = store.get(command.command_id)
            summary = {
                "warning": "MOCK: offline edge demo, synthetic executor, no MQTT, no flight controller",
                "scenario": scenario_id,
                "mode": "expired" if expired else "duplicate" if duplicate else "normal",
                "task_id": command.task_id,
                "command_id": command.command_id,
                "route": {
                    "algorithm": "astar_static",
                    "waypoints": len(path.waypoints),
                    "length_m": round(path.length_m, 2),
                },
                "ack": ack.model_dump(mode="json"),
                "second_ack": second_ack.model_dump(mode="json") if second_ack else None,
                "record": {
                    "state": record.state if record else None,
                    "execution_count": record.execution_count if record else 0,
                    "last_reason": record.last_reason if record else None,
                },
                "telemetry_count": len(samples),
                "artifacts": {
                    "sqlite": str(db_path),
                    "telemetry": str(telemetry_path),
                    "audit": str(audit_path),
                },
            }
        finally:
            service.close()

    summary_path = batch / "summary_MOCK.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    summary["summary_path"] = str(summary_path)
    return summary


def main(argv: list[str] | None = None) -> int:
    ensure_utf8_stdout()
    parser = argparse.ArgumentParser(description="离线执行端 demo（不连 MQTT / 不连飞控）")
    parser.add_argument("--scenario", default="S1-01")
    parser.add_argument("--duplicate", action="store_true", help="同一命令投递两次，验证只执行一次")
    parser.add_argument("--expired", action="store_true", help="投递已过期命令，验证拒绝")
    parser.add_argument("--out", type=Path, default=Path("logs/edge"))
    parser.add_argument("--step-s", type=float, default=2.0)
    args = parser.parse_args(argv)

    summary = run_demo(
        args.scenario,
        duplicate=args.duplicate,
        expired=args.expired,
        out_root=args.out,
        step_s=args.step_s,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print("\nMOCK 演示：证明控制流与契约，不是飞行、安全或性能结果。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
