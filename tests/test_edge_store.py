"""命令持久化：去重、冲突、并发、重启恢复。"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest

from core.models import PlanAck, PlanCommand
from edge.store import CommandStore

NOW = datetime(2026, 11, 11, 8, 0, tzinfo=UTC)


def _command(command_id: str = "cmd-1", task_id: str = "task-1") -> PlanCommand:
    return PlanCommand(
        command_id=command_id,
        task_id=task_id,
        plan_version="v1",
        issued_at=NOW - timedelta(seconds=5),
        expires_at=NOW + timedelta(seconds=60),
        payload={
            "run_mode": "mock",
            "waypoints": [
                {"frame": "enu_m", "alt_ref": "agl", "x_m": 0.0, "y_m": 0.0, "alt_m": 0.0},
                {"frame": "enu_m", "alt_ref": "agl", "x_m": 100.0, "y_m": 0.0, "alt_m": 20.0},
            ],
        },
    )


def test_claim_then_duplicate_same(tmp_path) -> None:
    with CommandStore(tmp_path / "edge.db") as store:
        command = _command()
        first, record = store.claim(command, NOW, "mock")
        assert first.accepted
        assert record.state == "accepted"

        second, same = store.claim(command, NOW, "mock")
        assert not second.accepted
        assert second.reject_code == "duplicate_same"
        assert same.command_id == command.command_id
        assert store.count() == 1


def test_duplicate_conflict_does_not_overwrite(tmp_path) -> None:
    with CommandStore(tmp_path / "edge.db") as store:
        assert store.claim(_command(), NOW, "mock")[0].accepted
        conflict, existing = store.claim(_command(task_id="task-2"), NOW, "mock")
        assert not conflict.accepted
        assert conflict.reject_code == "duplicate_conflict"
        assert existing.task_id == "task-1"
        assert store.get("cmd-1").task_id == "task-1"


def test_concurrent_claim_only_one_wins(tmp_path) -> None:
    with CommandStore(tmp_path / "edge.db") as store:
        command = _command()

        def worker(index: int) -> bool:
            return store.claim(command, NOW, "mock")[0].accepted

        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(worker, range(8)))
        assert sum(results) == 1
        assert store.count() == 1


def test_restart_keeps_record(tmp_path) -> None:
    path = tmp_path / "edge.db"
    with CommandStore(path) as store:
        store.claim(_command(), NOW, "mock")
        store.mark_executing("cmd-1", NOW)
    with CommandStore(path) as reopened:
        record = reopened.get("cmd-1")
        assert record is not None
        assert record.execution_count == 1
        assert record.state == "executing"


def test_finish_writes_ack_and_state(tmp_path) -> None:
    with CommandStore(tmp_path / "edge.db") as store:
        command = _command()
        store.claim(command, NOW, "mock")
        ack = PlanAck(
            command_id=command.command_id,
            task_id=command.task_id,
            plan_version=command.plan_version,
            received_at=NOW,
            accepted=True,
            fc_mode="MOCK.AUTO.MISSION",
        )
        store.finish("cmd-1", "completed", NOW, ack=ack, reason="mission finished")
        record = store.get("cmd-1")
        assert record is not None
        assert record.state == "completed"
        assert record.ack is not None
        assert record.ack.fc_mode == "MOCK.AUTO.MISSION"
        assert record.last_reason == "mission finished"


def test_pending_only_returns_unfinished(tmp_path) -> None:
    with CommandStore(tmp_path / "edge.db") as store:
        store.claim(_command("cmd-1"), NOW, "mock")
        store.claim(_command("cmd-2"), NOW, "mock")
        store.finish("cmd-2", "completed", NOW, reason="done")
        pending = store.pending()
        assert [record.command_id for record in pending] == ["cmd-1"]


def test_mark_recovering(tmp_path) -> None:
    with CommandStore(tmp_path / "edge.db") as store:
        store.claim(_command(), NOW, "mock")
        store.mark_recovering("cmd-1", NOW, "进程重启")
        record = store.get("cmd-1")
        assert record is not None
        assert record.state == "recovering"
        assert record.last_reason == "进程重启"


def test_finish_unknown_command_raises(tmp_path) -> None:
    with CommandStore(tmp_path / "edge.db") as store:
        with pytest.raises(KeyError):
            store.finish("missing", "completed", NOW, reason="x")


def test_close_is_idempotent(tmp_path) -> None:
    store = CommandStore(tmp_path / "edge.db")
    store.close()
    store.close()
