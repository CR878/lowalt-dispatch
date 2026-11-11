"""执行器：把已准入的 `PlanCommand` 变成飞控动作，并吐出状态采样。

两个实现，边界必须说清：

- `FakeExecutor`：确定性合成轨迹，用于离线 demo 与单测。**不碰任何飞控**，
  能耗参数是合成值，不能当性能结果。
- `MavsdkExecutor`：真实 PX4 接入位。本轮只做**依赖探测与坐标准入**——
  没装 `mavsdk`、没有 SITL、ENU 原点也没定，写一套没跑过的 `upload_mission`
  只会制造"看起来实现了"的假象。真实接入放在 P5/P6（见 `docs/M4_计划与验收.md`）。
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Protocol, runtime_checkable

from core.models import AltitudeReference, DataProvenance, Frame, PlanCommand, Position, VehicleState


class ExecutorError(RuntimeError):
    """执行器无法执行这条命令（不是命令本身的准入问题）。"""


class ExecutorUnavailable(ExecutorError):
    """运行环境不满足（缺依赖、缺设备、缺坐标基准）。"""


@runtime_checkable
class Executor(Protocol):
    name: str

    def start(self, command: PlanCommand, now: datetime) -> str:
        """开始执行并返回飞控模式名。失败抛 `ExecutorError`。"""
        ...

    def sample(self, now: datetime) -> VehicleState:
        """按当前时刻取一个状态采样。"""
        ...

    def is_done(self, now: datetime) -> bool: ...

    def abort(self, reason: str) -> None: ...


def parse_waypoints(payload: dict) -> list[tuple[float, float, float]]:
    """从命令载荷里取出 ENU 航点。结构校验在 `edge.guard`，这里只做类型收敛。"""
    raw = payload.get("waypoints")
    if not isinstance(raw, list) or len(raw) < 2:
        raise ExecutorError("payload.waypoints 缺失或少于 2 个点")
    points: list[tuple[float, float, float]] = []
    for index, item in enumerate(raw):
        try:
            points.append((float(item["x_m"]), float(item["y_m"]), float(item["alt_m"])))
        except (KeyError, TypeError, ValueError) as exc:
            raise ExecutorError(f"waypoints[{index}] 无法解析为 ENU 航点") from exc
    return points


class FakeExecutor:
    """沿折线匀速推进的合成执行器。所有数值都是占位，不带物理意义。"""

    name = "fake"

    def __init__(
        self,
        waypoints: list[tuple[float, float, float]],
        *,
        speed_mps: float = 12.0,
        battery_wh: float = 400.0,
        energy_per_m_wh: float = 0.02,
    ):
        if len(waypoints) < 2:
            raise ValueError("至少需要 2 个航点")
        for index, point in enumerate(waypoints):
            if len(point) != 3 or not all(math.isfinite(value) for value in point):
                raise ValueError(f"waypoints[{index}] 必须是有限的 (x, y, alt)")
        if not math.isfinite(speed_mps) or speed_mps <= 0:
            raise ValueError("speed_mps 必须是有限正数")
        if battery_wh <= 0 or energy_per_m_wh < 0:
            raise ValueError("能量参数不合法")
        self._points = waypoints
        self._speed = speed_mps
        self._battery = battery_wh
        self._energy_per_m = energy_per_m_wh
        self._cumulative = [0.0]
        for start, end in zip(waypoints, waypoints[1:], strict=False):
            self._cumulative.append(self._cumulative[-1] + math.dist(start, end))
        self._total_m = self._cumulative[-1]
        if self._total_m <= 0:
            raise ValueError("航点累计距离为 0")
        self._started_at: datetime | None = None
        self._command: PlanCommand | None = None
        self._abort_reason: str | None = None

    @property
    def total_distance_m(self) -> float:
        return self._total_m

    def start(self, command: PlanCommand, now: datetime) -> str:
        self._command = command
        self._started_at = now
        self._abort_reason = None
        return "MOCK.AUTO.MISSION"

    def sample(self, now: datetime) -> VehicleState:
        if self._started_at is None or self._command is None:
            raise ExecutorError("执行器尚未启动")
        elapsed = max(0.0, (now - self._started_at).total_seconds())
        travelled = min(self._total_m, elapsed * self._speed)
        x_m, y_m, alt_m = self._interpolate(travelled)
        remaining_wh = max(0.0, self._battery - self._energy_per_m * travelled)
        done = travelled >= self._total_m or self._abort_reason is not None
        return VehicleState(
            ts=now,
            position=Position(
                frame=Frame.ENU_M,
                alt_m=alt_m,
                alt_ref=AltitudeReference.AGL,
                x_m=x_m,
                y_m=y_m,
            ),
            groundspeed_mps=0.0 if done else self._speed,
            energy_remaining_wh=remaining_wh,
            flight_mode="MOCK.AUTO.LOITER" if done else "MOCK.AUTO.MISSION",
            gps_fix="mock_3d_fix",
            executing_plan_version=self._command.plan_version,
            provenance=DataProvenance(
                source="sim:edge.fake_executor",
                version="1",
                captured_at=now,
                is_simulated=True,
                uncertainty_note="合成轨迹与线性能耗，无物理意义，不得作为性能结果",
            ),
        )

    def is_done(self, now: datetime) -> bool:
        if self._started_at is None:
            return False
        if self._abort_reason is not None:
            return True
        return (now - self._started_at).total_seconds() * self._speed >= self._total_m

    def abort(self, reason: str) -> None:
        self._abort_reason = reason or "aborted"

    def _interpolate(self, travelled: float) -> tuple[float, float, float]:
        for index in range(1, len(self._cumulative)):
            if travelled <= self._cumulative[index]:
                span = self._cumulative[index] - self._cumulative[index - 1]
                ratio = 0.0 if span <= 0 else (travelled - self._cumulative[index - 1]) / span
                start = self._points[index - 1]
                end = self._points[index]
                return (
                    start[0] + (end[0] - start[0]) * ratio,
                    start[1] + (end[1] - start[1]) * ratio,
                    start[2] + (end[2] - start[2]) * ratio,
                )
        return self._points[-1]


class MavsdkExecutor:
    """真实 PX4 接入位：只做依赖探测与坐标准入，不假装已经能飞。

    本轮不实现 `upload_mission` 的原因写在 `docs/M4_计划与验收.md`：
    本机没有 `mavsdk`、没有 SITL、ENU 原点未定，写了也无法验证。
    坐标一旦从 ENU 换成 WGS84 才允许进入真实上传路径。
    """

    name = "mavsdk"

    def __init__(self, system_address: str = "udpin://0.0.0.0:14540"):
        self.system_address = system_address
        try:  # 只探测，不连接
            import mavsdk  # noqa: F401
        except ImportError as exc:
            raise ExecutorUnavailable(
                "未安装 mavsdk；真实执行需要 `pip install mavsdk` 并起 PX4 SITL"
            ) from exc

    def start(self, command: PlanCommand, now: datetime) -> str:
        raw = command.payload.get("waypoints") or []
        frames = {item.get("frame", "enu_m") for item in raw if isinstance(item, dict)}
        if frames == {"wgs84"}:
            raise NotImplementedError("WGS84 航点上传尚未实现：需要 SITL 环境联调（P5/P6）")
        raise ExecutorUnavailable(
            "ENU 航点不能直接下发给 MAVSDK：ENU 原点与高度基准仍未定"
            "（见 docs/接口契约.md）。请先把航点转成 WGS84，或等 A 提供原点。"
        )

    def sample(self, now: datetime) -> VehicleState:
        raise NotImplementedError("真实遥测读取尚未实现：需要 SITL 环境联调（P5/P6）")

    def is_done(self, now: datetime) -> bool:
        return False

    def abort(self, reason: str) -> None:
        raise NotImplementedError("真实 abort 尚未实现：需要 SITL 环境联调（P5/P6）")

    def describe(self) -> dict[str, str]:
        return {
            "name": self.name,
            "system_address": self.system_address,
            "status": "adapter_present_not_exercised",
            "blocked_by": "no SITL / no WGS84 origin; see docs/M4_计划与验收.md",
        }
