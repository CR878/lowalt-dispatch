"""M3 integration CLI. Defaults remain offline; cloud use is explicit.

python -m agent.integration check
python -m agent.integration demo --scenario S1-01
python -m agent.integration draft --text "送一份药品到救援点"
"""

from __future__ import annotations

import argparse
import json
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from agent.archive import LocalAuditObjects
from agent.intake import propose
from agent.planning import M2Tools
from agent.repository import RunRepository
from agent.service import TaskService
from agent.settings import M3Settings
from core.console import ensure_utf8_stdout
from core.models import PlanAck, RiskSnapshot, Task
from planner.assemble import build_snapshot, build_task
from planner.scene import load_scene, load_suite
from sim.energy import load_vehicle


def run_demo(scenario_id: str, output: Path) -> dict:
    """Real M2 functions, synthetic vehicle parameters, MOCK execution ACK."""
    from validator.__main__ import SYNTHETIC_INITIAL_WH, SYNTHETIC_PROFILE, SYNTHETIC_RESERVE_WH

    suite = {scenario["id"]: scenario for scenario in load_suite()["scenarios"]}
    if scenario_id not in suite:
        raise ValueError("Unknown demo scenario")
    scene, scenario, now = load_scene(), suite[scenario_id], datetime.now(UTC)
    root = output / uuid4().hex
    root.mkdir(parents=True)
    profile = replace(SYNTHETIC_PROFILE, vehicle_key="placeholder")
    task = build_task(
        scenario,
        now,
        vehicle_type=profile.vehicle_key,
        initial_energy_wh=float(scenario.get("initial_energy_wh", SYNTHETIC_INITIAL_WH)),
        reserve_energy_wh=SYNTHETIC_RESERVE_WH,
    )
    snapshot = build_snapshot(scenario, scene, now)
    submissions = []

    def mock_submit(command):
        submissions.append(command.command_id)
        return PlanAck(
            command_id=command.command_id,
            task_id=command.task_id,
            plan_version=command.plan_version,
            received_at=datetime.now(UTC),
            accepted=True,
            fc_mode="MOCK_NO_FLIGHT_CONTROLLER",
        )

    tools = M2Tools(scene, lambda _task: snapshot, mock_submit, profile=profile, is_mock=True)
    repository = RunRepository("sqlite:///" + (root / "ledger.sqlite3").resolve().as_posix())
    try:
        repository.initialize()
        service = TaskService(tools, repository, root / "runs", archive=LocalAuditObjects(root / "archive"))
        record = service.run(task)
        duplicate = service.run(task)
        summary = {
            "warning": "MOCK: real M2 code with SYNTHETIC parameters and MOCK ACK; no flight/safety metrics",
            "scenario": scenario_id,
            "run_mode": "mock",
            "is_simulated": True,
            "result": record.result.model_dump(mode="json"),
            "duplicate_run_id": duplicate.result.run_id,
            "submission_count": len(submissions),
            "sync_errors": service.last_sync_errors,
        }
        summary_path = root / "summary_MOCK.json"
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"summary_path": str(summary_path), **summary}
    finally:
        repository.close()


def main(argv=None) -> int:
    ensure_utf8_stdout()
    parser = argparse.ArgumentParser(description="M3 local integration and explicit configured execution")
    parser.add_argument("--env-file", type=Path, help="Explicitly load an ignored local .env file")
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("check", help="Check configuration completeness without contacting any service")
    demo = sub.add_parser("demo", help="Offline synthetic demo; ignores cloud configuration")
    demo.add_argument("--scenario", default="S1-01")
    demo.add_argument("--out", type=Path, default=Path("logs/agent/integration"))
    draft = sub.add_parser("draft", help="Generate a draft; never execute it")
    draft.add_argument("--text", required=True)
    draft.add_argument("--use-maas", action="store_true", help="Explicitly allow a billable MaaS API call")
    run = sub.add_parser("run", help="Execute a confirmed task using explicitly configured adapters")
    run.add_argument("--task-file", type=Path, required=True)
    run.add_argument("--snapshot-file", type=Path, required=True)
    run.add_argument("--profile-file", type=Path, required=True)
    run.add_argument("--vehicle-key", required=True)
    run.add_argument("--allow-dispatch", action="store_true", required=True)
    recover = sub.add_parser("recover", help="Recover the original run without re-executing its tools")
    recover.add_argument("--task-id", required=True)
    recover.add_argument(
        "--ack-file",
        type=Path,
        help="Import a genuine original-command ACK received by the execution adapter",
    )
    recover.add_argument(
        "--wait-mqtt", action="store_true", help="Track the old command and wait for its ACK; never republish"
    )
    args = parser.parse_args(argv)
    repository, channel, archive = None, None, None
    try:
        if args.env_file:
            from dotenv import load_dotenv

            if not args.env_file.is_file():
                raise ValueError("Requested environment file does not exist")
            load_dotenv(args.env_file, override=False)
        if args.action == "demo":
            summary = run_demo(args.scenario, args.out)
            print(
                json.dumps(
                    {
                        "warning": summary["warning"],
                        "scenario": summary["scenario"],
                        "status": summary["result"]["status"],
                        "reason": summary["result"]["reason"],
                        "plan_attempts": summary["result"]["plan_attempts"],
                        "submission_count": summary["submission_count"],
                        "sync_errors": summary["sync_errors"],
                        "summary_path": summary["summary_path"],
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return 0
        settings = M3Settings.from_env()
        if args.action == "check":
            report = {
                "network_contacted": False,
                "run_mode": settings.mode,
                "ledger": settings.ledger_backend,
                "archive": settings.archive_backend,
                "cache": settings.cache_backend,
                "maas_configured": bool(settings.maas_endpoint),
                "missing": settings.missing(),
            }
            print(json.dumps(report, indent=2))
            return 2 if report["missing"] else 0
        if args.action == "draft":
            proposal = propose(args.text, settings.make_extractor() if args.use_maas else None)
            print(
                json.dumps(
                    {
                        **proposal.model_dump(mode="json"),
                        "missing_fields": proposal.missing_fields,
                        "review_digest": proposal.review_digest,
                        "requires_confirmation": True,
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return 0
        if args.action == "recover":
            if args.ack_file and args.wait_mqtt:
                raise ValueError("Choose ACK file or MQTT, not both")
            repository = settings.make_repository()

            class RecoveryOnlyTools:
                is_mock = settings.mode == "mock"

            service = TaskService(RecoveryOnlyTools(), repository, settings.audit_dir)
            ack = (
                PlanAck.model_validate_json(args.ack_file.read_text(encoding="utf-8-sig"))
                if args.ack_file
                else None
            )
            recovered = service.recover(args.task_id, ack)
            if args.wait_mqtt and recovered.result.command is not None and recovered.result.ack is None:
                channel = settings.make_mqtt_channel()
                channel.watch_command(recovered.result.command)
                channel.start(settings.mqtt_host, settings.mqtt_port)
                ack = channel.wait_ack(recovered.result.command.command_id, settings.ack_timeout_s)
                if ack is not None:
                    recovered = service.recover(args.task_id, ack)
            archive = settings.make_archive()
            service.archive, service.projection = archive, settings.make_projection()
            print(
                json.dumps(
                    {
                        "result": recovered.result.model_dump(mode="json"),
                        "sync_errors": service.sync(recovered),
                    },
                    indent=2,
                )
            )
            return 0
        if settings.mode != "integration" or settings.missing():
            raise ValueError("Configured run requires integration mode and complete selected adapters")
        task = Task.model_validate_json(args.task_file.read_text(encoding="utf-8-sig"))
        snapshot = RiskSnapshot.model_validate_json(args.snapshot_file.read_text(encoding="utf-8-sig"))
        profile = load_vehicle(args.profile_file, args.vehicle_key)
        repository = settings.make_repository()
        repository.initialize()
        channel = settings.make_mqtt_channel()
        channel.start(settings.mqtt_host, settings.mqtt_port)
        tools = M2Tools(
            load_scene(), lambda _task: snapshot, channel.submit_command, profile=profile, is_mock=False
        )
        archive = settings.make_archive()
        service = TaskService(
            tools, repository, settings.audit_dir, projection=settings.make_projection(), archive=archive
        )
        record = service.run(task)
        print(
            json.dumps(
                {"result": record.result.model_dump(mode="json"), "sync_errors": service.last_sync_errors},
                indent=2,
            )
        )
        return 0
    except Exception as exc:
        # Never echo SDK exception strings: they can contain connection secrets.
        print(
            json.dumps(
                {
                    "error_type": type(exc).__name__,
                    "message": "M3 operation failed; check configuration and local audit",
                }
            )
        )
        return 2
    finally:
        if channel is not None:
            channel.close()
        if repository is not None:
            repository.close()
        if archive is not None and hasattr(archive, "client"):
            archive.client.close()


if __name__ == "__main__":
    raise SystemExit(main())
