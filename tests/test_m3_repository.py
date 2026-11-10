from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

import pytest

pytest.importorskip("sqlalchemy")

from agent.archive import LocalAuditObjects, ObsAuditObjects, archive_run
from agent.fixtures import FixtureTools as MockTools
from agent.fixtures import fixture_task as make_task
from agent.repository import PersistenceUnavailable, RunConflict, RunRepository
from agent.service import RecoveryRequired, TaskService

NOW = datetime(2026, 11, 10, tzinfo=UTC)


@pytest.fixture
def repository(tmp_path):
    repo = RunRepository("sqlite:///" + (tmp_path / "m3.sqlite3").as_posix())
    repo.initialize()
    yield repo
    repo.close()


def tools_for(scenario="normal"):
    return MockTools(scenario=scenario, clock=lambda: NOW)


def test_same_task_twice_only_dispatches_once(repository, tmp_path):
    tools = tools_for()
    service = TaskService(tools, repository, tmp_path / "audit", clock=lambda: NOW)
    first = service.run(make_task(NOW))
    second = service.run(make_task(NOW))
    assert first.result == second.result
    assert len(tools.submitted) == 1


def test_task_identity_conflict_cannot_dispatch(repository, tmp_path):
    tools = tools_for()
    service = TaskService(tools, repository, tmp_path, clock=lambda: NOW)
    task = make_task(NOW)
    service.run(task)
    with pytest.raises(RunConflict):
        service.run(task.model_copy(update={"payload_kg": task.payload_kg + 0.1}))
    assert len(tools.submitted) == 1


def test_crashed_reservation_is_never_taken_over(repository, tmp_path):
    task = make_task(NOW)
    repository.claim(task, "mock", str(tmp_path / "original.jsonl"))
    tools = tools_for()
    with pytest.raises(RecoveryRequired):
        TaskService(tools, repository, tmp_path, clock=lambda: NOW).run(task)
    assert len(tools.submitted) == 0


def test_concurrent_process_connections_only_one_claims(repository, tmp_path):
    task = make_task(NOW)

    def claim(index):
        return repository.claim(task, "mock", str(tmp_path / f"run-{index}.jsonl"))[1]

    with ThreadPoolExecutor(max_workers=6) as pool:
        claimed = list(pool.map(claim, range(12)))
    assert sum(claimed) == 1


def test_compare_and_swap_rejects_stale_write(repository, tmp_path):
    service = TaskService(tools_for(), repository, tmp_path, clock=lambda: NOW)
    saved = service.run(make_task(NOW))
    newer = repository.save_result(saved, saved.result)
    assert newer.revision == saved.revision + 1
    with pytest.raises(RunConflict):
        repository.save_result(saved, saved.result)


def test_sync_failure_never_repeats_dispatch(repository, tmp_path):
    class BrokenProjection:
        def publish(self, _):
            raise ConnectionError("password-must-not-leak")

    class BrokenArchive:
        def put(self, *_):
            raise ConnectionError("private-info")

    tools = tools_for()
    service = TaskService(
        tools, repository, tmp_path, projection=BrokenProjection(), archive=BrokenArchive(), clock=lambda: NOW
    )
    saved = service.run(make_task(NOW))
    assert saved.result.status == "acknowledged"
    assert service.last_sync_errors == ["dcs_projection_failed", "audit_archive_failed"]
    service.sync(saved)
    service.run(make_task(NOW))
    assert len(tools.submitted) == 1


def test_recovery_accepts_original_ack_without_republishing(repository, tmp_path):
    tools = tools_for("ack_timeout")
    service = TaskService(tools, repository, tmp_path, clock=lambda: NOW)
    saved = service.run(make_task(NOW))
    assert saved.result.status == "waiting_ack"
    from core.models import PlanAck

    command = saved.result.command
    ack = PlanAck(
        command_id=command.command_id,
        task_id=command.task_id,
        plan_version=command.plan_version,
        received_at=NOW,
        accepted=True,
    )
    updated = service.recover(command.task_id, ack)
    assert updated.result.status == "acknowledged"
    assert len(tools.submitted) == 1


def test_archive_namespaces_modes_and_binds_audit(repository, tmp_path):
    saved = TaskService(tools_for(), repository, tmp_path / "runs", clock=lambda: NOW).run(make_task(NOW))
    objects = LocalAuditObjects(tmp_path / "objects")
    receipt = archive_run(saved, objects)
    assert receipt.key.startswith("m3/mock/")
    assert (objects.root / receipt.key).read_bytes() == Path(saved.audit_path).read_bytes()
    changed = saved.model_copy(update={"run_mode": "integration"})
    with pytest.raises(ValueError, match="does not match"):
        archive_run(changed, objects)


def test_obs_error_keeps_local_audit(repository, tmp_path):
    class Client:
        def putContent(self, *_args, **_kwargs):
            raise RuntimeError("secret-access-key")

    saved = TaskService(tools_for(), repository, tmp_path, clock=lambda: NOW).run(make_task(NOW))
    with pytest.raises(RuntimeError) as error:
        archive_run(saved, ObsAuditObjects(Client(), "test-bucket"))
    assert "secret-access-key" not in str(error.value)
    assert Path(saved.audit_path).exists()


def test_local_archive_rejects_path_escape(tmp_path):
    with pytest.raises(ValueError):
        LocalAuditObjects(tmp_path).put("../escape", b"data")


def test_database_failure_after_dispatch_recovers_audit_without_resending(repository, tmp_path, monkeypatch):
    tools = tools_for()
    service = TaskService(tools, repository, tmp_path, clock=lambda: NOW)
    save = repository.save_result

    def fail(*_):
        raise PersistenceUnavailable("simulated database outage")

    monkeypatch.setattr(repository, "save_result", fail)
    with pytest.raises(PersistenceUnavailable):
        service.run(make_task(NOW))
    assert len(tools.submitted) == 1
    with pytest.raises(RecoveryRequired):
        service.run(make_task(NOW))
    monkeypatch.setattr(repository, "save_result", save)
    record = service.recover(make_task(NOW).task_id)
    assert record.result.status == "acknowledged"
    assert len(tools.submitted) == 1


def test_database_failure_before_claim_never_calls_tools(repository, tmp_path, monkeypatch):
    tools = tools_for()

    def fail(*_):
        raise PersistenceUnavailable("simulated database outage")

    monkeypatch.setattr(repository, "claim", fail)
    with pytest.raises(PersistenceUnavailable):
        TaskService(tools, repository, tmp_path, clock=lambda: NOW).run(make_task(NOW))
    assert not tools.requests and not tools.submitted
