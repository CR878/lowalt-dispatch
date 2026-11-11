"""命令准入：放行 + 6 类拒绝。纯函数，不碰数据库、不碰执行器。"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from core.models import PlanCommand
from edge.guard import check_command

NOW = datetime(2026, 11, 11, 8, 0, tzinfo=UTC)


def _waypoints() -> list[dict]:
    return [
        {"frame": "enu_m", "alt_ref": "agl", "x_m": 0.0, "y_m": 0.0, "alt_m": 0.0},
        {"frame": "enu_m", "alt_ref": "agl", "x_m": 120.0, "y_m": 80.0, "alt_m": 30.0},
    ]


def _command(**overrides: object) -> PlanCommand:
    base: dict = {
        "command_id": "cmd-1",
        "task_id": "task-1",
        "plan_version": "v1",
        "issued_at": NOW - timedelta(seconds=5),
        "expires_at": NOW + timedelta(seconds=60),
        "payload": {"run_mode": "mock", "waypoints": _waypoints()},
    }
    base.update(overrides)
    return PlanCommand(**base)


def test_valid_command_accepted() -> None:
    verdict = check_command(_command(), NOW)
    assert verdict.accepted
    assert verdict.reject_code is None


def test_expired_command_rejected() -> None:
    command = _command(issued_at=NOW - timedelta(seconds=120), expires_at=NOW - timedelta(seconds=60))
    verdict = check_command(command, NOW)
    assert not verdict.accepted
    assert verdict.reject_code == "expired"


def test_not_yet_valid_rejected() -> None:
    command = _command(issued_at=NOW + timedelta(seconds=30), expires_at=NOW + timedelta(seconds=90))
    verdict = check_command(command, NOW)
    assert not verdict.accepted
    assert verdict.reject_code == "not_yet_valid"


def test_invalid_validity_window_rejected() -> None:
    command = _command(issued_at=NOW, expires_at=NOW)
    verdict = check_command(command, NOW)
    assert not verdict.accepted
    assert verdict.reject_code == "payload_invalid"


def test_task_mismatch_rejected() -> None:
    verdict = check_command(_command(), NOW, expected_task_id="another-task")
    assert not verdict.accepted
    assert verdict.reject_code == "task_mismatch"


def test_mode_mismatch_rejected() -> None:
    command = _command(payload={"run_mode": "integration", "waypoints": _waypoints()})
    verdict = check_command(command, NOW, run_mode="mock")
    assert not verdict.accepted
    assert verdict.reject_code == "mode_mismatch"


def test_missing_waypoints_rejected() -> None:
    command = _command(payload={"run_mode": "mock"})
    verdict = check_command(command, NOW)
    assert not verdict.accepted
    assert verdict.reject_code == "payload_invalid"


def test_bad_waypoint_structure_rejected() -> None:
    command = _command(
        payload={
            "run_mode": "mock",
            "waypoints": [
                {"x_m": 0, "y_m": 0, "alt_m": 0, "alt_ref": "agl"},
                {"x_m": 10, "y_m": 0},
            ],
        }
    )
    verdict = check_command(command, NOW)
    assert not verdict.accepted
    assert verdict.reject_code == "payload_invalid"
    assert "缺字段" in verdict.reason


def test_wgs84_waypoint_rejected() -> None:
    points = [dict(point) for point in _waypoints()]
    points[0]["frame"] = "wgs84"
    command = _command(payload={"run_mode": "mock", "waypoints": points})
    verdict = check_command(command, NOW)
    assert not verdict.accepted
    assert verdict.reject_code == "payload_invalid"
    assert "enu_m" in verdict.reason


def test_naive_datetime_rejected() -> None:
    command = _command(issued_at=datetime(2026, 11, 11, 8, 0), expires_at=datetime(2026, 11, 11, 9, 0))
    verdict = check_command(command, NOW)
    assert not verdict.accepted
    assert verdict.reject_code == "payload_invalid"
    assert "时区" in verdict.reason


def test_waypoints_can_be_optional_when_disabled() -> None:
    command = _command(payload={"run_mode": "mock"})
    assert check_command(command, NOW, require_waypoints=False).accepted
