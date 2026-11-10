from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from agent.messaging import MessageEnvelope, MqttCommandChannel
from core.models import PlanAck, PlanCommand

NOW = datetime(2026, 11, 10, tzinfo=UTC)


class Client:
    def __init__(self):
        self.published = []
        self.immediate = None

    def subscribe(self, topics):
        self.topics = topics
        return 0, 7

    def publish(self, topic, payload, qos, retain):
        self.published.append((topic, payload, qos, retain))
        if self.immediate:
            self.immediate()
        return SimpleNamespace(rc=0)


def command():
    return PlanCommand(
        command_id="cmd1",
        task_id="task1",
        plan_version="v1",
        issued_at=NOW,
        expires_at=NOW + timedelta(seconds=30),
        payload={"run_mode": "mock"},
    )


def make_channel():
    client = Client()
    channel = MqttCommandChannel(client, "px4-test", run_mode="mock", ack_timeout_s=0.01, clock=lambda: NOW)
    channel._on_connect(client, None, None, 0)
    channel._on_subscribe(client, None, 7, [1, 1, 1])
    return channel, client


def send_ack(channel, *, version="v1", retained=False, mode="mock", accepted=True):
    ack = PlanAck(
        command_id="cmd1", task_id="task1", plan_version=version, received_at=NOW, accepted=accepted
    )
    envelope = MessageEnvelope(kind="ack", run_mode=mode, sent_at=NOW, body=ack.model_dump(mode="json"))
    message = SimpleNamespace(
        topic=channel.prefix + "/acks", payload=envelope.model_dump_json().encode(), retain=retained
    )
    channel._on_message(channel.client, None, message)
    return ack


def test_immediate_ack_not_lost_and_duplicate_never_republished():
    channel, client = make_channel()
    client.immediate = lambda: send_ack(channel)
    ack = channel.submit_command(command())
    assert ack.accepted
    assert channel.submit_command(command()) == ack
    assert len(client.published) == 1
    assert client.published[0][2:] == (1, False)


def test_broker_publish_is_not_execution_ack_and_late_ack_is_available():
    channel, client = make_channel()
    assert channel.submit_command(command()) is None
    assert channel.get_ack("cmd1") is None
    ack = send_ack(channel)
    assert channel.get_ack("cmd1") == ack
    assert channel.drain_events()[0][0] == "ack"
    assert len(client.published) == 1


@pytest.mark.parametrize("kwargs", [{"version": "v2"}, {"retained": True}, {"mode": "integration"}])
def test_invalid_ack_never_changes_command_outcome(kwargs):
    channel, _client = make_channel()
    channel.submit_command(command())
    send_ack(channel, **kwargs)
    assert channel.get_ack("cmd1") is None
    assert channel.invalid_messages == 1


def test_conflicting_duplicate_ack_is_ignored():
    channel, _client = make_channel()
    channel.submit_command(command())
    first = send_ack(channel)
    send_ack(channel, accepted=False)
    assert channel.get_ack("cmd1") == first
    assert channel.invalid_messages == 1


def test_disconnected_and_expired_commands_are_not_published():
    channel, client = make_channel()
    channel._on_disconnect(client, None, None, 0)
    with pytest.raises(ConnectionError):
        channel.submit_command(command())
    channel, client = make_channel()
    expired = command().model_copy(update={"expires_at": NOW})
    with pytest.raises(ValueError):
        channel.submit_command(expired)
    assert client.published == []


def test_waits_for_subscription_before_allowing_publish():
    client = Client()
    channel = MqttCommandChannel(client, "px4", run_mode="mock", clock=lambda: NOW)
    channel._on_connect(client, None, None, 0)
    with pytest.raises(ConnectionError):
        channel.submit_command(command())
    channel._on_subscribe(client, None, 7, [128])
    assert not channel._ready.is_set()


def test_vehicle_id_cannot_inject_mqtt_wildcard():
    with pytest.raises(ValueError):
        MqttCommandChannel(Client(), "px4/#", run_mode="mock")


def test_restarted_transport_can_watch_original_command_without_sending():
    channel, client = make_channel()
    channel.watch_command(command())
    send_ack(channel)
    assert channel.wait_ack("cmd1", timeout_s=0).accepted
    assert client.published == []


def test_consumer_cannot_mutate_cached_ack():
    channel, client = make_channel()
    client.immediate = lambda: send_ack(channel)
    channel.submit_command(command())
    returned = channel.submit_command(command())
    returned.accepted = False
    channel.drain_events()[0][2].accepted = False
    assert channel.get_ack("cmd1").accepted
