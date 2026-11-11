"""命令准入：纯函数，不碰数据库、不碰执行器。

去重需要持久化，放在 `CommandStore`；这里只判"这条命令本身该不该被执行"。
顺序有讲究：先判时间窗，再判任务绑定，最后判模式与载荷——这样拒绝原因更贴近根因。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from agent.guards import utc
from core.models import PlanCommand
from edge.contracts import CommandVerdict, RunMode


def check_command(
    command: PlanCommand,
    now: datetime,
    *,
    run_mode: RunMode = "mock",
    expected_task_id: str | None = None,
    require_waypoints: bool = True,
) -> CommandVerdict:
    try:
        moment = utc(now)
        issued = utc(command.issued_at)
        expires = utc(command.expires_at)
    except ValueError as exc:
        return CommandVerdict(
            accepted=False, reason=f"时间字段缺少时区：{exc}", reject_code="payload_invalid"
        )

    if expires <= issued:
        return CommandVerdict(
            accepted=False,
            reason="命令有效期不成立（expires_at 不晚于 issued_at）",
            reject_code="payload_invalid",
        )
    if moment < issued:
        return CommandVerdict(
            accepted=False,
            reason=f"命令尚未生效：issued_at={issued.isoformat()}",
            reject_code="not_yet_valid",
        )
    if moment >= expires:
        return CommandVerdict(
            accepted=False,
            reason=f"命令已过期：expires_at={expires.isoformat()}",
            reject_code="expired",
        )
    if expected_task_id is not None and command.task_id != expected_task_id:
        return CommandVerdict(
            accepted=False,
            reason="命令的任务与执行端绑定的任务不一致",
            reject_code="task_mismatch",
        )

    payload_mode = command.payload.get("run_mode")
    if payload_mode is not None and payload_mode != run_mode:
        return CommandVerdict(
            accepted=False,
            reason=f"命令 run_mode={payload_mode} 与执行端 {run_mode} 不一致",
            reject_code="mode_mismatch",
        )

    if require_waypoints:
        problem = _waypoint_problem(command.payload.get("waypoints"))
        if problem is not None:
            return CommandVerdict(accepted=False, reason=problem, reject_code="payload_invalid")

    return CommandVerdict(accepted=True, reason="命令有效")


def _waypoint_problem(waypoints: Any) -> str | None:
    """只校验结构，不校验几何可行性——几何由 M2 规划与独立校验器负责。"""
    if not isinstance(waypoints, list) or len(waypoints) < 2:
        return "payload.waypoints 缺失或少于 2 个点"
    required = {"x_m", "y_m", "alt_m", "alt_ref"}
    for index, point in enumerate(waypoints):
        if not isinstance(point, dict):
            return f"waypoints[{index}] 不是对象"
        missing = sorted(required - point.keys())
        if missing:
            return f"waypoints[{index}] 缺字段：{', '.join(missing)}"
        if point.get("frame", "enu_m") != "enu_m":
            return f"waypoints[{index}] frame 只支持 enu_m（WGS84 转换需先定 ENU 原点）"
        if not all(isinstance(point[key], (int, float)) for key in ("x_m", "y_m", "alt_m")):
            return f"waypoints[{index}] 的 x_m / y_m / alt_m 必须是数字"
    return None
