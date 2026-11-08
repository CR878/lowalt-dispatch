"""规划器接口 + 三个占位实现（MOCK）。

⚠️ 这一版里三个算法的**数值没有任何物理含义**，也没有刻意制造"本方案更好"的假象：
   同一个场景 + 同一个种子，不同 algorithm 只改变随机流，不代表任何工程结论。
   任何拿这里产出的 CSV 去写"任务完成率提升 X%"的材料都是伪造。

真实规划器由学生 B 在 `plan()` 这一层替换：
- `astar_static`    → 静态 A*，相当于基线 1
- `astar_dynamic`   → 动态避障但不含备降约束，相当于基线 2
- `astar_diversion` → 搜索时按备降余量剪枝，本方案

替换后 `is_mock` 必须改成 False，harness 会自动去掉文件名里的 _MOCK 后缀。
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass, asdict
from typing import Any

from core.models import RouteOutcome

# 合成常数：仅用于让 mock 的能耗量级看起来合理，**不是任何机型的真实参数**。
_SYNTHETIC_WH_PER_M = 0.02


@dataclass(frozen=True)
class PlanResult:
    """一次规划/决策在评测层面的结果，字段与 CSV 列一一对应。"""

    task_feasible: bool
    task_result: RouteOutcome
    hard_violations: int
    min_landing_margin: float
    route_length_m: float
    energy_used_wh: float
    replan_latency_ms: float

    def as_row(self) -> dict[str, Any]:
        row = asdict(self)
        row["task_result"] = self.task_result.value
        return row


class MockPlanner:
    """确定性伪随机占位实现。同一 (scenario_id, seed, algorithm) 必然得到相同结果。"""

    is_mock = True

    def __init__(self, name: str) -> None:
        self.name = name

    def _rng(self, scenario_id: str, seed: int) -> random.Random:
        digest = hashlib.sha256(f"{scenario_id}|{seed}|{self.name}".encode()).hexdigest()
        return random.Random(int(digest[:16], 16))

    def plan(self, scenario: dict[str, Any], seed: int) -> PlanResult:
        scenario_id = scenario["id"]
        rng = self._rng(scenario_id, seed)

        # 几何部分是真的：用场景里的 ENU 坐标算直线距离，再乘一个随机绕行系数。
        o, d = scenario["origin"], scenario["destination"]
        straight_m = ((d["x_m"] - o["x_m"]) ** 2 + (d["y_m"] - o["y_m"]) ** 2) ** 0.5
        route_length_m = straight_m * rng.uniform(1.05, 1.45)

        # 以下全是占位数值。
        margin = rng.uniform(-60.0, 220.0)
        feasible = margin >= 0
        violations = 0 if feasible else rng.randint(1, 2)

        return PlanResult(
            task_feasible=feasible,
            task_result=RouteOutcome.DELIVERED if feasible else RouteOutcome.INFEASIBLE,
            hard_violations=violations,
            min_landing_margin=round(margin, 2),
            route_length_m=round(route_length_m, 1),
            energy_used_wh=round(route_length_m * _SYNTHETIC_WH_PER_M, 2),
            replan_latency_ms=round(rng.uniform(40.0, 3000.0), 1),
        )


ALGORITHMS: dict[str, MockPlanner] = {
    "astar_static": MockPlanner("astar_static"),
    "astar_dynamic": MockPlanner("astar_dynamic"),
    "astar_diversion": MockPlanner("astar_diversion"),
}


def get(name: str) -> MockPlanner:
    if name not in ALGORITHMS:
        raise KeyError(f"未知算法 {name!r}，可选：{', '.join(ALGORITHMS)}")
    return ALGORITHMS[name]
