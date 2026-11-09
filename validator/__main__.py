"""校验器命令行演示。

    python -m validator                 # 跑全部 20 个场景，列出每条的校验结论
    python -m validator S2-01           # 只看一个场景的五项明细

## 关于合成参数

构造 `Task` 需要初始能量与保留能量，`VehicleProfile` 需要机型参数——这两样都要等
学生 A 按真实平台填写。**本演示为了让能量与备降两项能算，注入一组明确标注的合成参数。**

它们只用来验证检查逻辑跑得通，**任何数值都没有物理意义，不能出现在材料里**。
真参数到位后，`build_task()` / `load_vehicle()` 会从 `scenarios/vehicles/` 读，
这个演示里的 `SYNTHETIC_*` 常量必须删掉。
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime

from core.console import ensure_utf8_stdout
from planner.assemble import build_snapshot, build_task, route_from_path
from planner.astar import plan_scenario
from planner.scene import load_scene, load_suite
from sim.energy import VehicleProfile
from validator.checks import UNAVAILABLE, summarize, validate_route

# ---- 合成参数：仅为让检查逻辑可运行，非任何真实机型 ----
SYNTHETIC_PROFILE = VehicleProfile(
    vehicle_key="__synthetic_demo__",
    max_payload_kg=2.0,
    cruise_speed_mps=15.0,
    climb_rate_mps=3.0,
    energy_per_meter_wh=0.02,
    energy_per_second_hover_wh=0.6,
    usable_battery_wh=400.0,
    reserve_policy_wh=80.0,
    source="SYNTHETIC — 演示用，非真实机型",
    uncertainty_note="无任何标定依据",
)
SYNTHETIC_INITIAL_WH = 400.0
SYNTHETIC_RESERVE_WH = 80.0

T0 = datetime(2026, 11, 9, 12, 0, 0, tzinfo=UTC)


def _run(scenario: dict, scene, profile: VehicleProfile | None):
    path, _grid = plan_scenario(scenario, scene)
    if not path.found:
        return None, None, path.reason
    task = build_task(
        scenario,
        T0,
        vehicle_type="placeholder",
        initial_energy_wh=float(scenario.get("initial_energy_wh", SYNTHETIC_INITIAL_WH)),
        reserve_energy_wh=SYNTHETIC_RESERVE_WH,
    )
    snapshot = build_snapshot(scenario, scene, T0)
    route = route_from_path(
        path,
        task,
        snapshot,
        algorithm="astar_static",
        plan_version="v1",
        energy_budget_wh=SYNTHETIC_INITIAL_WH - SYNTHETIC_RESERVE_WH if profile else 0.1,
    )
    return task, validate_route(route, task, snapshot, scene, profile=profile, now=T0), None


def main(argv: list[str] | None = None) -> int:
    ensure_utf8_stdout()
    args = argv if argv is not None else sys.argv[1:]
    wanted = set(args)

    scene = load_scene()
    suite = load_suite()

    print("=" * 78)
    print("  独立校验器 · A* 基线航线 × 五项检查")
    print("  ⚠ 能量与备降两项使用【合成参数】（cruise 15 m/s, 0.02 Wh/m, 400 Wh）")
    print("    仅用于验证检查逻辑可运行，数值无物理意义，不得写入任何材料。")
    print("=" * 78)

    rows = []
    for sc in suite["scenarios"]:
        if wanted and sc["id"] not in wanted:
            continue
        _task, report, reason = _run(sc, scene, SYNTHETIC_PROFILE)
        if report is None:
            rows.append((sc["id"], "无航线", reason or "", report))
            continue
        ok, msg = summarize(report)
        rows.append((sc["id"], "通过" if ok else "拒绝", msg, report))

    print(f"\n{'场景':<8}{'结论':<8}说明")
    print("-" * 78)
    for sid, verdict, msg, _report in rows:
        print(f"{sid:<8}{verdict:<8}{msg}")

    n_ok = sum(1 for r in rows if r[1] == "通过")
    n_bad = sum(1 for r in rows if r[1] == "拒绝")
    n_none = sum(1 for r in rows if r[1] == "无航线")
    print("-" * 78)
    print(f"通过 {n_ok} · 拒绝 {n_bad} · 无航线 {n_none}")

    rejected = [r for r in rows if r[1] == "拒绝"]
    if rejected:
        sid, _v, _m, report = rejected[0]
        print(f"\n{'=' * 78}\n明细：{sid}（第一条被拒的）\n{'=' * 78}")
        print(f"route_digest = {report.route_digest[:16]}…  （校验报告绑定到航线内容）")
        for c in report.checks:
            mark = "PASS" if c.passed else ("无法" if c.detail.startswith(UNAVAILABLE) else "FAIL")
            print(f"  {c.name:<24}{mark:<6}{c.detail}")

    print("\n说明：基线只避开起飞时已知的限制区；后续才生效的区域它并不知道。")
    print("      校验器按生效时刻逐点比对，所以能抓到基线看不见的违规——这正是它的价值。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
