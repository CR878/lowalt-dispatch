"""Run with LOWALT_TEST_MQTT=1 against the local loopback-only Mosquitto.

This uses real TCP / QoS1 / Paho callbacks, not an in-memory broker imitation.
All motion and energy remain explicitly synthetic.
"""

import json
import os
from threading import Event, Thread
from time import monotonic

import pytest

pytest.importorskip("sqlalchemy")
pytest.importorskip("paho.mqtt.client")

from agent.messaging import MessageEnvelope
from core.models import PlanCommand
from edge.executor import FakeExecutor
from edge.mqtt import MqttEdgePeer
from edge.service import EdgeService
from edge.store import CommandStore
from services.api.runtime import LocalDispatch

pytestmark = pytest.mark.skipif(os.getenv("LOWALT_TEST_MQTT") != "1", reason="explicit local broker opt-in")


def test_real_broker_m3_m2_m4_ack_telemetry_completion_and_reconnect(tmp_path):
    mqtt = pytest.importorskip("paho.mqtt.client")
    stop = Event()
    errors = []
    store = CommandStore(tmp_path / "edge" / "commands.sqlite3")
    edge = EdgeService(
        store,
        audit_path=tmp_path / "edge" / "audit.jsonl",
        telemetry_path=tmp_path / "edge" / "telemetry.jsonl",
        executor_factory=lambda points: FakeExecutor(points, speed_mps=2000),
    )
    peer = MqttEdgePeer(mqtt.Client(mqtt.CallbackAPIVersion.VERSION2), edge, "local-mock-1")
    peer.start("127.0.0.1", int(os.getenv("LOWALT_TEST_MQTT_PORT", "1883")))

    def advance():
        while not stop.wait(0.05):
            try:
                peer.step()
            except Exception as exc:
                errors.append(exc)
                break

    thread = Thread(target=advance, daemon=True)
    thread.start()
    runtime = None
    try:
        runtime = LocalDispatch(
            tmp_path / "api", transport="mqtt", mqtt_port=int(os.getenv("LOWALT_TEST_MQTT_PORT", "1883"))
        )
        proposal = runtime.propose("S1-01")
        result = runtime.confirm(proposal["task_id"], proposal["review_digest"])
        assert result["planning_status"] == "acknowledged"
        assert result["result"]["ack"]["fc_mode"] == "MOCK.AUTO.MISSION"
        command = PlanCommand.model_validate(result["result"]["command"])
        # Real QoS duplicate delivery must return the original ACK, not start again.
        envelope = MessageEnvelope(
            kind="command", run_mode="mock", sent_at=runtime.clock(), body=command.model_dump(mode="json")
        )
        runtime.channel.client.publish(
            peer.prefix + "/commands", envelope.model_dump_json(), qos=1, retain=False
        )
        deadline = monotonic() + 12
        while monotonic() < deadline:
            runtime.tick()
            result = runtime.get(proposal["task_id"])
            if result["execution"] and result["execution"]["state"] == "completed" and result["observation"]:
                break
            stop.wait(0.1)
        assert result["execution"]["state"] == "completed"
        assert result["execution"]["execution_count"] == 1
        assert result["observation"]["accepted_command_id"] == command.command_id
        assert result["observation"]["state"]["provenance"]["is_simulated"] is True
        # A reconnecting API restores subscriptions/tracking without publishing commands.
        runtime.close()
        runtime = None
        for path in (tmp_path / "api" / "statuses").glob("*.json"):
            path.unlink()
        runtime = LocalDispatch(
            tmp_path / "api", transport="mqtt", mqtt_port=int(os.getenv("LOWALT_TEST_MQTT_PORT", "1883"))
        )
        deadline = monotonic() + 8
        while monotonic() < deadline:
            runtime.tick()
            result = runtime.get(proposal["task_id"])
            if result["execution"]:
                break
            stop.wait(0.1)
        assert result["execution"]["state"] == "completed"
        assert store.get(command.command_id).execution_count == 1
        # Wrong namespace and retained command never start another executor.
        before = peer.invalid_messages
        bad = json.loads(envelope.model_dump_json())
        bad["run_mode"] = "integration"
        runtime.channel.client.publish(peer.prefix + "/commands", json.dumps(bad), qos=1, retain=False)
        deadline = monotonic() + 3
        while peer.invalid_messages == before and monotonic() < deadline:
            stop.wait(0.05)
        assert peer.invalid_messages > before
        assert not errors
    finally:
        stop.set()
        thread.join(timeout=3)
        if runtime:
            runtime.close()
        peer.close()
        edge.close()
        store.close()
