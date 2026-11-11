"""执行器：合成轨迹、能量、完成判定、坏载荷、MAVSDK 的明确拒绝。"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

import pytest

from core.models import PlanCommand
from edge.executor import (
    ExecutorError,
    ExecutorUnavailable,
    FakeExecutor,
    MavsdkExecutor,
    parse_waypoints,
)

NOW = datetime(2026, 11, 11, 8, 0, tzinfo=UTC)


def _command() -> PlanCommand:
    return PlanCommand(
        command_id="cmd-1",
        task_id="task-1",
        plan_version="v1",
        issued_at=NOW - timedelta(seconds=5),
        expires_at=NOW + timedelta(seconds=60),
        payload={
            "run_mode": "mock",
            "waypoints": [
                {"frame": "enu_m", "alt_ref": "agl", "x_m": 0.0, "y_m": 0.0, "alt_m": 0.0},
                {"frame": "enu_m", "alt_ref": "agl", "x_m": 100.0, "y_m": 0.0, "alt_m": 30.0},
            ],
        },
    )


def _executor() -> FakeExecutor:
    return FakeExecutor(
        [(0.0, 0.0, 0.0), (100.0, 0.0, 30.0)],
        speed_mps=10.0,
        battery_wh=100.0,
        energy_per_m_wh=0.1,
    )


def test_interpolates_along_3d_distance() -> None:
    """航程按三维距离算（爬升也算路），所以 5 s 不是正好走一半水平距离。"""
    executor = _executor()
    executor.start(_command(), NOW)
    state = executor.sample(NOW + timedelta(seconds=5))
    ratio = 50.0 / math.dist((0.0, 0.0, 0.0), (100.0, 0.0, 30.0))
    assert state.position.x_m == pytest.approx(100.0 * ratio)
    assert state.position.y_m == pytest.approx(0.0)
    assert state.position.alt_m == pytest.approx(30.0 * ratio)
    assert state.executing_plan_version == "v1"


def test_energy_decreases_with_distance() -> None:
    executor = _executor()
    executor.start(_command(), NOW)
    early = executor.sample(NOW + timedelta(seconds=2))
    late = executor.sample(NOW + timedelta(seconds=8))
    assert early.energy_remaining_wh > late.energy_remaining_wh
    assert late.energy_remaining_wh >= 0.0


def test_done_after_total_distance() -> None:
    executor = _executor()
    executor.start(_command(), NOW)
    finish_s = math.dist((0.0, 0.0, 0.0), (100.0, 0.0, 30.0)) / 10.0
    assert not executor.is_done(NOW + timedelta(seconds=finish_s - 0.5))
    assert executor.is_done(NOW + timedelta(seconds=finish_s + 0.1))


def test_abort_stops_and_loiters() -> None:
    executor = _executor()
    executor.start(_command(), NOW)
    executor.abort("operator hold")
    assert executor.is_done(NOW + timedelta(seconds=1))
    state = executor.sample(NOW + timedelta(seconds=1))
    assert state.flight_mode == "MOCK.AUTO.LOITER"
    assert state.groundspeed_mps == 0.0


def test_sample_before_start_raises() -> None:
    with pytest.raises(ExecutorError, match="尚未启动"):
        _executor().sample(NOW)


def test_invalid_speed_rejected() -> None:
    with pytest.raises(ValueError):
        FakeExecutor([(0.0, 0.0, 0.0), (1.0, 0.0, 0.0)], speed_mps=0)


def test_parse_waypoints_ok_and_bad() -> None:
    points = parse_waypoints(
        {
            "waypoints": [
                {"x_m": 0, "y_m": 0, "alt_m": 0},
                {"x_m": 10, "y_m": 0, "alt_m": 5},
            ]
        }
    )
    assert points == [(0.0, 0.0, 0.0), (10.0, 0.0, 5.0)]
    with pytest.raises(ExecutorError):
        parse_waypoints({"waypoints": []})
    with pytest.raises(ExecutorError):
        parse_waypoints({"waypoints": [{"x_m": 0}]})


def test_mavsdk_blocks_enu_or_reports_missing_dependency() -> None:
    """没装 mavsdk → 构造即报缺依赖；装了 → ENU 航点必须被拒绝。"""
    try:
        executor = MavsdkExecutor()
    except ExecutorUnavailable as exc:
        assert "mavsdk" in str(exc)
        return
    with pytest.raises((ExecutorUnavailable, NotImplementedError)):
        executor.start(_command(), NOW)
    assert executor.describe()["status"] == "adapter_present_not_exercised"
