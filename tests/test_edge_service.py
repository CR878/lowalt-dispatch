"""端到端：受理、去重、过期、完成、重启恢复。"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest

from core.models import PlanCommand
from edge.executor import FakeExecutor
from edge.service import EdgeService
from edge.store import CommandStore
from edge.telemetry import read_jsonl

NOW = datetime(2026, 11, 11, 8, 0, tzinfo=UTC)


class FakeClock:
    def __init__(self, start: datetime) -> None:
        self.now = start

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += timedelta(seconds=seconds)


def _command(command_id: str = "cmd-1", *, expired: bool = False) -> PlanCommand:
    issued = NOW - timedelta(seconds=120) if expired else NOW - timedelta(seconds=5)
    expires = NOW - timedelta(seconds=60) if expired else NOW + timedelta(seconds=60)
    return PlanCommand(
        command_id=command_id,
        task_id="task-1",
        plan_version="v1",
        issued_at=issued,
        expires_at=expires,
        payload={
            "run_mode": "mock",
            "waypoints": [
                {"frame": "enu_m", "alt_ref": "agl", "x_m": 0.0, "y_m": 0.0, "alt_m": 0.0},
                {"frame": "enu_m", "alt_ref": "agl", "x_m": 100.0, "y_m": 0.0, "alt_m": 30.0},
            ],
        },
    )


def _service(store: CommandStore, tmp_path, clock: FakeClock) -> EdgeService:
    return EdgeService(
        store,
        audit_path=tmp_path / "audit.jsonl",
        telemetry_path=tmp_path / "telemetry.jsonl",
        clock=clock,
        executor_factory=lambda points: FakeExecutor(points, speed_mps=50.0),
    )


def test_submit_and_complete(tmp_path) -> None:
    clock = FakeClock(NOW)
    with CommandStore(tmp_path / "edge.db") as store:
        service = _service(store, tmp_path, clock)
        try:
            command = _command()
            ack = service.submit(command)
            assert ack.accepted
            assert ack.fc_mode == "MOCK.AUTO.MISSION"

            for _ in range(10):
                clock.advance(1)
                service.tick()

            record = store.get(command.command_id)
            assert record is not None
            assert record.state == "completed"
            assert record.execution_count == 1

            samples = read_jsonl(tmp_path / "telemetry.jsonl")
            assert samples
            assert samples[0]["task_id"] == command.task_id
            assert samples[0]["accepted_command_id"] == command.command_id
            assert samples[0]["state"]["provenance"]["is_simulated"] is True
        finally:
            service.close()


def test_duplicate_submit_executes_once(tmp_path) -> None:
    clock = FakeClock(NOW)
    with CommandStore(tmp_path / "edge.db") as store:
        service = _service(store, tmp_path, clock)
        try:
            command = _command()
            first = service.submit(command)
            second = service.submit(command)
            assert first.accepted
            assert second == first
            record = store.get(command.command_id)
            assert record is not None
            assert record.execution_count == 1
        finally:
            service.close()


def test_expired_command_rejected_without_record(tmp_path) -> None:
    clock = FakeClock(NOW)
    with CommandStore(tmp_path / "edge.db") as store:
        service = _service(store, tmp_path, clock)
        try:
            command = _command(expired=True)
            ack = service.submit(command)
            assert not ack.accepted
            assert ack.reject_reason is not None
            assert "过期" in ack.reject_reason
            assert store.get(command.command_id) is None
        finally:
            service.close()


def test_restart_returns_original_ack(tmp_path) -> None:
    path = tmp_path / "edge.db"
    command = _command()
    with CommandStore(path) as store:
        service = _service(store, tmp_path, FakeClock(NOW))
        try:
            original = service.submit(command)
        finally:
            service.close()

    with CommandStore(path) as reopened:
        service = _service(reopened, tmp_path, FakeClock(NOW))
        try:
            again = service.submit(command)
            assert again == original
            record = reopened.get(command.command_id)
            assert record is not None
            assert record.execution_count == 1
        finally:
            service.close()


def test_recover_marks_pending_without_replay(tmp_path) -> None:
    path = tmp_path / "edge.db"
    command = _command()
    with CommandStore(path) as store:
        service = _service(store, tmp_path, FakeClock(NOW))
        try:
            service.submit(command)
        finally:
            service.close()

    with CommandStore(path) as reopened:
        service = _service(reopened, tmp_path, FakeClock(NOW))
        try:
            recovered = service.recover()
            assert recovered == [command.command_id]
            record = reopened.get(command.command_id)
            assert record is not None
            assert record.state == "recovering"
            assert record.execution_count == 1
        finally:
            service.close()


def test_executor_failure_marks_failed(tmp_path) -> None:
    clock = FakeClock(NOW)
    with CommandStore(tmp_path / "edge.db") as store:
        service = EdgeService(
            store,
            audit_path=tmp_path / "audit.jsonl",
            telemetry_path=tmp_path / "telemetry.jsonl",
            clock=clock,
            executor_factory=lambda points: FakeExecutor(points, speed_mps=-1),
        )
        try:
            command = _command()
            ack = service.submit(command)
            assert not ack.accepted
            record = store.get(command.command_id)
            assert record is not None
            assert record.state == "failed"
        finally:
            service.close()


def test_closed_service_rejects_submit(tmp_path) -> None:
    clock = FakeClock(NOW)
    with CommandStore(tmp_path / "edge.db") as store:
        service = _service(store, tmp_path, clock)
        service.close()
        with pytest.raises(RuntimeError, match="已关闭"):
            service.submit(_command())


def test_tick_marks_failed_on_unexpected_error(tmp_path) -> None:
    class ExplodingExecutor:
        name = "boom"

        def start(self, command, now):
            return "MOCK.BOOM"

        def sample(self, now):
            raise ValueError("driver exploded")

        def is_done(self, now):
            return False

        def abort(self, reason):
            pass

    clock = FakeClock(NOW)
    with CommandStore(tmp_path / "edge.db") as store:
        service = EdgeService(
            store,
            audit_path=tmp_path / "audit.jsonl",
            telemetry_path=tmp_path / "telemetry.jsonl",
            clock=clock,
            executor_factory=lambda points: ExplodingExecutor(),
        )
        try:
            command = _command()
            ack = service.submit(command)
            assert ack.accepted
            clock.advance(1)
            service.tick()
            record = store.get(command.command_id)
            assert record is not None
            assert record.state == "failed"
            assert "driver exploded" in (record.last_reason or "")
        finally:
            service.close()


def test_run_to_completion_timeout_marks_failed(tmp_path) -> None:
    class StuckExecutor(FakeExecutor):
        def is_done(self, now):
            return False

    clock = FakeClock(NOW)
    with CommandStore(tmp_path / "edge.db") as store:
        service = EdgeService(
            store,
            audit_path=tmp_path / "audit.jsonl",
            telemetry_path=tmp_path / "telemetry.jsonl",
            clock=clock,
            executor_factory=lambda points: StuckExecutor(points, speed_mps=1.0),
        )
        try:
            command = _command()
            ack, samples = service.run_to_completion(command, step_s=1.0, max_ticks=3)
            assert ack.accepted
            assert len(samples) == 3
            record = store.get(command.command_id)
            assert record is not None
            assert record.state == "failed"
            assert "tick" in (record.last_reason or "")
        finally:
            service.close()


def test_tick_rejects_backwards_clock(tmp_path) -> None:
    clock = FakeClock(NOW)
    with CommandStore(tmp_path / "edge.db") as store:
        service = _service(store, tmp_path, clock)
        try:
            service.submit(_command())
            clock.advance(5)
            service.tick()
            with pytest.raises(ValueError, match="倒退"):
                service.tick(NOW - timedelta(seconds=10))
        finally:
            service.close()


def test_concurrent_submit_starts_executor_once(tmp_path) -> None:
    """8 个线程同时投同一命令：执行器只能启动一次，所有调用都拿到 accepted。"""
    clock = FakeClock(NOW)
    with CommandStore(tmp_path / "edge.db") as store:
        service = _service(store, tmp_path, clock)
        try:
            command = _command()

            with ThreadPoolExecutor(max_workers=8) as pool:
                acks = list(pool.map(lambda _: service.submit(command), range(8)))

            assert all(ack.accepted for ack in acks)
            record = store.get(command.command_id)
            assert record is not None
            assert record.execution_count == 1
        finally:
            service.close()
