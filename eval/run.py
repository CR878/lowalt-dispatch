"""评测 harness 命令行入口。

用法
----
    python -m eval.run --suite eval/scenarios/v0.yaml --seeds 1,2,3 --out results/v0.csv

产物
----
1. CSV：逐条结果，`run_mode` 列标明 mock / real。
2. `.meta.json`：这次运行的数据快照（套件哈希、种子、算法、git commit、Python 版本），
   用于把 CSV 里的每个数字追溯回唯一一次运行。交付计划里要求"数字能定位到证据"，
   这个小文件就是那条链的第一环。

Mock 保护
---------
只要本次运行含 mock 规划器，输出文件名会自动插入 `_MOCK`
（`results/v0.csv` → `results/v0_MOCK.csv`），CSV 每行也带 `run_mode=mock`，
meta 里再写一条 warning。三重标识，防止占位数字被误当结果。
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import yaml

from eval import planners

REQUIRED_SCENARIO_KEYS = ("id", "cls", "origin", "destination", "payload_kg")

CSV_COLUMNS = [
    "scenario_id",
    "cls",
    "seed",
    "algorithm",
    "run_mode",
    "task_feasible",
    "task_result",
    "hard_violations",
    "min_landing_margin",
    "route_length_m",
    "energy_used_wh",
    "replan_latency_ms",
]


# --------------------------------------------------------------------------- #
# 辅助
# --------------------------------------------------------------------------- #
def _git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except Exception:
        return "unknown"


def _sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _parse_seeds(raw: str | None, defaults: Iterable[int]) -> list[int]:
    if not raw:
        return list(defaults)
    seeds: list[int] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        seeds.append(int(part))
    if not seeds:
        raise ValueError("--seeds 解析后为空")
    return seeds


def _mock_suffixed(path: Path) -> Path:
    return path.with_name(f"{path.stem}_MOCK{path.suffix}")


def _load_suite(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"找不到场景集：{path}")
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or "scenarios" not in data:
        raise ValueError(f"{path} 缺少顶层 scenarios 列表")

    problems: list[str] = []
    for idx, sc in enumerate(data["scenarios"]):
        missing = [k for k in REQUIRED_SCENARIO_KEYS if k not in sc]
        if missing:
            problems.append(f"  第 {idx} 条场景缺字段 {missing}")
        for key in ("origin", "destination"):
            if key in sc and not {"x_m", "y_m"} <= set(sc[key]):
                problems.append(f"  场景 {sc.get('id', idx)} 的 {key} 需要 x_m/y_m")
    if problems:
        raise ValueError("场景集校验失败：\n" + "\n".join(problems))
    return data


# --------------------------------------------------------------------------- #
# 主流程
# --------------------------------------------------------------------------- #
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m eval.run",
        description="低空项目评测 harness（v0：mock 跑通管道）",
    )
    parser.add_argument("--suite", required=True, type=Path, help="场景集 yaml 路径")
    parser.add_argument("--seeds", default=None, help="逗号分隔的种子，默认取套件里的 default_seeds")
    parser.add_argument("--out", default=Path("results/v0.csv"), type=Path, help="CSV 输出路径")
    parser.add_argument(
        "--algorithms",
        default=",".join(planners.ALGORITHMS),
        help="逗号分隔的算法名",
    )
    args = parser.parse_args(argv)

    suite = _load_suite(args.suite)
    seeds = _parse_seeds(args.seeds, suite.get("default_seeds", [1]))
    algo_names = [a.strip() for a in args.algorithms.split(",") if a.strip()]
    picked = [planners.get(a) for a in algo_names]

    is_mock = any(p.is_mock for p in picked)
    out_path = _mock_suffixed(args.out) if is_mock else args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, Any]] = []
    for sc in suite["scenarios"]:
        for seed in seeds:
            for planner in picked:
                result = planner.plan(sc, seed)
                row: dict[str, Any] = {
                    "scenario_id": sc["id"],
                    "cls": sc["cls"],
                    "seed": seed,
                    "algorithm": planner.name,
                    "run_mode": "mock" if planner.is_mock else "real",
                }
                row.update(result.as_row())
                rows.append(row)

    with out_path.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    meta = {
        "run_mode": "mock" if is_mock else "real",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "suite_path": str(args.suite).replace("\\", "/"),
        "suite_sha256": _sha256_of(args.suite),
        "scenario_count": len(suite["scenarios"]),
        "seeds": seeds,
        "algorithms": algo_names,
        "row_count": len(rows),
        "git_commit": _git_commit(),
        "python": platform.python_version(),
        "platform": platform.platform(),
    }
    if is_mock:
        meta["warning"] = "MOCK：数值由伪随机数生成，无物理含义，禁止用于任何效果声明。"
    meta_path = out_path.with_suffix(".meta.json")
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    # ---------------- 终端摘要 ----------------
    print("=" * 64)
    if is_mock:
        print("  MOCK 运行 —— 这些数字不是结果，只证明管道能跑通")
        print("  真实评测必须由 B 接上规划器后重跑，并确认 run_mode=real")
    print("=" * 64)
    print(f"场景 {meta['scenario_count']} × 种子 {len(seeds)} × 算法 {len(algo_names)}"
          f" = {len(rows)} 行")
    print(f"CSV  → {out_path}")
    print(f"meta → {meta_path}")

    print("\n按算法汇总：")
    header = f"  {'algorithm':<18}{'n':>5}{'feasible':>10}{'min_margin':>12}{'P50_lat_ms':>12}"
    print(header)
    for name in algo_names:
        subset = [r for r in rows if r["algorithm"] == name]
        feasible = sum(1 for r in subset if r["task_feasible"])
        margins = sorted(r["min_landing_margin"] for r in subset)
        lats = sorted(r["replan_latency_ms"] for r in subset)
        p50 = lats[len(lats) // 2] if lats else float("nan")
        print(f"  {name:<18}{len(subset):>5}{feasible:>10}{margins[0]:>12}{p50:>12}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
