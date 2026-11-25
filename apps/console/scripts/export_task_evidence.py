"""Freeze two real planner/independent-validator runs with example vehicle inputs."""
# ruff: noqa: E402 -- direct script invocation needs the repository on sys.path.

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from core.geometry import sample_polyline
from planner.assemble import build_snapshot, build_task, route_from_path
from planner.astar import PathResult
from planner.diversion import (
    SAMPLE_STEP_M,
    plan_baseline_annotated,
    plan_scenario_with_diversion,
    resolve_energy,
)
from planner.scene import load_scene, load_suite
from services.assistant.task_evidence import ARTIFACT, TaskEvidence, source_digest
from sim.energy import load_vehicle
from validator.checks import validate_route


def export():
    now = datetime.now(UTC)
    scene = load_scene()
    vehicle_path = ROOT / "scenarios/vehicles/example_not_real.yaml"
    vehicle = load_vehicle(vehicle_path)
    bundle = {
        "version": 1,
        "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "source_worktree_dirty": bool(
            subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip()
        ),
        "source_hashes": {},
        "inputs": {},
        "reports": {},
        "cases": {},
    }
    paths = [
        *ROOT.glob("planner/*.py"),
        *ROOT.glob("validator/*.py"),
        *ROOT.glob("core/*.py"),
        *ROOT.glob("sim/*.py"),
        *ROOT.glob("scenarios/v0/*"),
        ROOT / "eval/scenarios/v0.yaml",
        vehicle_path,
        Path(__file__),
        ROOT / "apps/console/scripts/export_scene.py",
    ]
    for path in sorted(paths):
        if path.is_file():
            bundle["source_hashes"][path.relative_to(ROOT).as_posix()] = source_digest(path)
    for case, scenario_id in (("main", "S1-02"), ("contrast", "S1-01")):
        scenario = next(s for s in load_suite()["scenarios"] if s["id"] == scenario_id)
        baseline = plan_baseline_annotated(scenario, scene, vehicle)
        constrained = plan_scenario_with_diversion(scenario, scene, vehicle)
        selected = constrained if case == "main" else baseline
        if not selected.found or selected.profile is None:
            raise RuntimeError(f"{scenario_id} 缺少可校验路线")
        initial, reserve = resolve_energy(scenario, vehicle)
        task = build_task(
            scenario, now, vehicle_type="placeholder", initial_energy_wh=initial, reserve_energy_wh=reserve
        )
        snapshot = build_snapshot(scenario, scene, now)
        route = route_from_path(
            PathResult(found=True, waypoints=selected.waypoints, length_m=selected.length_m),
            task,
            snapshot,
            algorithm=selected.algorithm,
            plan_version="evidence-v1",
            energy_budget_wh=initial - reserve,
        )
        report = validate_route(route, task, snapshot, scene, profile=vehicle, now=now)
        checks = [c.model_dump() for c in report.checks]
        passed = all(c.passed for c in report.checks)
        if passed != (case == "main"):
            raise RuntimeError(f"{scenario_id} 的独立校验结论变化，停止导出")
        positions = sample_polyline(selected.waypoints, SAMPLE_STEP_M)
        if positions[-1][0] < selected.length_m - 1e-6:
            positions.append((selected.length_m, selected.waypoints[-1]))
        if len(positions) != len(selected.profile.samples):
            raise RuntimeError("剖面与路线采样数量不一致")
        samples = []
        for (distance, point), sample in zip(positions, selected.profile.samples, strict=True):
            if abs(distance - sample.s_m) > 1e-6:
                raise RuntimeError("剖面与路线采样距离不一致")
            samples.append(
                {
                    "point": point,
                    "s_m": sample.s_m,
                    "margin_wh": sample.margin_wh,
                    "nearest_site_id": sample.nearest_site_id,
                }
            )
        raw = {
            "case": case,
            "task_id": task.task_id,
            "scenario_id": scenario_id,
            "source": f"planner/diversion.py ({selected.algorithm}) + validator/checks.py / scenarios/v0",
            "generated_at": now.isoformat(),
            "origin": "中心物资站",
            "destination": "河东救援点",
            "payload_kg": task.payload_kg,
            "vehicle_label": "示例能耗机型（未标定；CR30 仅外观展示）",
            "algorithm": selected.algorithm,
            "verdict": "passed" if passed else "rejected",
            "route_id": route.route_id,
            "route_digest": report.route_digest,
            "length_m": selected.length_m,
            "waypoints": selected.waypoints,
            "samples": samples,
            "checks": checks,
            "candidates": [
                {"algorithm": p.algorithm, "found": p.found, "length_m": p.length_m, "reason": p.reason}
                for p in (baseline, constrained)
            ],
            "gaps": [
                "示例机型参数未标定，数值不是 CR30 性能或实测能耗。",
                "真实空域、天气、线缆与动态障碍未校验。",
                "当前结论仅对应冻结输入；通信退化为情景提示，未验证途中备降或实飞。",
            ],
            "buildings": scene.obstacles,
            "sites": [{"id": key, "point": [s.x, s.y]} for key, s in scene.sites.items()],
            "dispatch_enabled": False,
            "is_simulated": True,
        }
        # Normalize tuples/numbers before hashing the exact serialized contract.
        normalized = TaskEvidence.model_validate({**raw, "revision": "0" * 64}).model_dump(mode="json")
        normalized.pop("revision")
        normalized["revision"] = hashlib.sha256(
            json.dumps(normalized, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()
        bundle["cases"][case] = normalized
        bundle["inputs"][case] = {
            "scenario": scenario,
            "task": task.model_dump(mode="json"),
            "snapshot": snapshot.model_dump(mode="json"),
            "route": route.model_dump(mode="json"),
        }
        bundle["reports"][case] = report.model_dump(mode="json")
    ARTIFACT.write_text(
        json.dumps(bundle, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )
    print(f"Exported {ARTIFACT}: main=passed, contrast=rejected; example parameters only")


if __name__ == "__main__":
    export()
