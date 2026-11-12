"""Opt-in real PostgreSQL/Redis/MQTT tests, run against disposable CI services.

No Huawei credentials or real flight controller are used. MQTT's peer is an
explicit MOCK executor; a successful wire test is not a PX4 acceptance test.
"""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Event
from uuid import uuid4

import pytest

pytest.importorskip("sqlalchemy")

from agent.contracts import AgentResult
from agent.fixtures import fixture_task
from agent.messaging import MessageEnvelope, MqttCommandChannel
from agent.projection import RedisProjection
from agent.repository import RunRecord, RunRepository
from core.models import PlanAck, PlanCommand


def test_real_postgresql_claim_and_revision(tmp_path):
    dsn = os.environ.get("M3_TEST_POSTGRES_DSN")
    if not dsn:
        pytest.skip("M3_TEST_POSTGRES_DSN not set")
    repository = RunRepository(dsn)
    repository.initialize()
    task = fixture_task(datetime.now(UTC)).model_copy(update={"task_id": "MOCK-PG-" + uuid4().hex})
    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            claims = list(
                pool.map(lambda i: repository.claim(task, "mock", str(tmp_path / f"{i}.jsonl")), range(8))
            )
        assert sum(owned for _record, owned in claims) == 1
        reserved = repository.get(task.task_id, "mock")
        result = AgentResult(
            run_id=uuid4().hex,
            task_id=task.task_id,
            run_mode="mock",
            is_simulated=True,
            audit_path=reserved.audit_path,
        )
        saved = repository.save_result(reserved, result)
        assert saved.revision == 1
        assert repository.get(task.task_id, "mock").result == result
    finally:
        with repository.engine.begin() as connection:
            connection.execute(repository.runs.delete().where(repository.runs.c.task_id == task.task_id))
        repository.close()


def test_real_redis_lua_revision_and_expiry():
    url = os.environ.get("M3_TEST_REDIS_URL")
    if not url:
        pytest.skip("M3_TEST_REDIS_URL not set")
    import redis

    client = redis.Redis.from_url(url, socket_timeout=3)
    projection = RedisProjection(client, ttl_s=60)
    task = fixture_task(datetime.now(UTC)).model_copy(update={"task_id": "MOCK-REDIS-" + uuid4().hex})
    result = AgentResult(
        run_id=uuid4().hex, task_id=task.task_id, run_mode="mock", is_simulated=True, audit_path="MOCK.jsonl"
    )
    record = RunRecord(task=task, run_mode="mock", audit_path="MOCK.jsonl", revision=2, result=result)
    key = projection.key(task.task_id, "mock")
    try:
        assert projection.publish(record)
        assert not projection.publish(record.model_copy(update={"revision": 1}))
        assert projection.get(task.task_id, "mock").revision == 2
        assert 0 < client.ttl(key) <= 60
        client.set(key, "corrupt")
        with pytest.raises(ValueError, match="Malformed"):
            projection.publish(record)
    finally:
        client.delete(key)
        client.close()


def test_real_mqtt_roundtrip_with_explicit_mock_executor():
    host = os.environ.get("M3_TEST_MQTT_HOST")
    if not host:
        pytest.skip("M3_TEST_MQTT_HOST not set")
    import paho.mqtt.client as mqtt

    port = int(os.environ.get("M3_TEST_MQTT_PORT", "1883"))
    vehicle_id = "test-" + uuid4().hex
    cloud_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="cloud-" + uuid4().hex)
    channel = MqttCommandChannel(cloud_client, vehicle_id, run_mode="mock", ack_timeout_s=3)
    peer = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="MOCK-peer-" + uuid4().hex)
    ready, received = Event(), []

    def on_connect(client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            client.subscribe(channel.prefix + "/commands", qos=1)

    def on_message(client, userdata, message):
        envelope = MessageEnvelope.model_validate_json(message.payload)
        command = PlanCommand.model_validate(envelope.body)
        received.append(command.command_id)
        ack = PlanAck(
            command_id=command.command_id,
            task_id=command.task_id,
            plan_version=command.plan_version,
            received_at=datetime.now(UTC),
            accepted=True,
            fc_mode="MOCK_WIRE_TEST_NO_FC",
        )
        reply = MessageEnvelope(
            kind="ack", run_mode="mock", sent_at=datetime.now(UTC), body=ack.model_dump(mode="json")
        )
        client.publish(channel.prefix + "/acks", reply.model_dump_json(), qos=1, retain=False)

    peer.on_connect = on_connect
    peer.on_message = on_message
    peer.on_subscribe = lambda *_: ready.set()
    try:
        peer.connect(host, port)
        peer.loop_start()
        assert ready.wait(5)
        channel.start(host, port)
        now = datetime.now(UTC)
        command = PlanCommand(
            command_id=uuid4().hex,
            task_id="MOCK-wire-task",
            plan_version="v1",
            issued_at=now,
            expires_at=now + timedelta(seconds=20),
            payload={"run_mode": "mock"},
        )
        ack = channel.submit_command(command)
        assert ack is not None and ack.accepted and ack.fc_mode.startswith("MOCK_")
        assert channel.submit_command(command) == ack
        assert received == [command.command_id]
        assert channel.drain_events()[0][0] == "ack"
    finally:
        channel.close()
        peer.disconnect()
        peer.loop_stop()
