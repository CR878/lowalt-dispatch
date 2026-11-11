"""Explicit local MQTT execution peer. This daemon supports MOCK only.

Callbacks only validate/enqueue. The calling thread alone advances EdgeService.
No flight controller is contacted; real PX4 telemetry uses its separate feed.
"""

from __future__ import annotations

import argparse
import queue
import re
from pathlib import Path
from threading import Event

from agent.execution import ExecutionStatus
from agent.guards import utc
from agent.messaging import Heartbeat, MessageEnvelope
from agent.storage import FileLease
from core.models import PlanCommand
from edge.service import EdgeService
from edge.store import CommandStore


class MqttEdgePeer:
    def __init__(self, client, service: EdgeService, vehicle_id: str):
        if service.run_mode != "mock" or re.fullmatch(r"[A-Za-z0-9_-]{1,64}", vehicle_id) is None:
            raise ValueError("Local peer requires MOCK mode and a valid vehicle ID")
        self.client, self.service = client, service
        self.prefix = f"lowalt/v1/mock/vehicles/{vehicle_id}"
        self.ready = Event()
        self.commands = queue.Queue(maxsize=128)
        self.invalid_messages = 0
        self._mid = None
        self._sequence = 0
        self._sent: dict[str, str] = {}
        client.on_connect = self._connect
        client.on_subscribe = self._subscribe
        client.on_disconnect = self._disconnect
        client.on_message = self._message

    def _connect(self, client, userdata, flags, reason_code, properties=None):
        self.ready.clear()
        if reason_code == 0:
            rc, self._mid = client.subscribe([(f"{self.prefix}/commands", 1)])
            if rc != 0:
                self._mid = None

    def _subscribe(self, client, userdata, mid, codes, properties=None):
        if mid == self._mid and codes and all(int(getattr(c, "value", c)) < 128 for c in codes):
            self._sent.clear()  # Publish durable states after reconnect; never replay commands.
            self.ready.set()

    def _disconnect(self, *args):
        self.ready.clear()

    def _message(self, client, userdata, message):
        try:
            if message.retain or len(message.payload) > 1024 * 1024:
                raise ValueError("Retained or oversized command")
            envelope = MessageEnvelope.model_validate_json(message.payload)
            if (message.topic, envelope.kind, envelope.run_mode) != (
                f"{self.prefix}/commands",
                "command",
                "mock",
            ):
                raise ValueError("Command namespace mismatch")
            if utc(envelope.sent_at) > utc(self.service.clock()):
                raise ValueError("Future command")
            command = PlanCommand.model_validate(envelope.body)
            if command.payload.get("run_mode") != "mock":
                raise ValueError("Command mode mismatch")
            self.commands.put_nowait(command)
        except (ValueError, TypeError, queue.Full):
            self.invalid_messages += 1

    def publish(self, kind: str, body):
        if not self.ready.is_set():
            return False
        suffix = "acks" if kind == "ack" else kind
        envelope = MessageEnvelope(
            kind=kind, run_mode="mock", sent_at=self.service.clock(), body=body.model_dump(mode="json")
        )
        receipt = self.client.publish(
            f"{self.prefix}/{suffix}", envelope.model_dump_json(), qos=1, retain=False
        )
        return receipt.rc == 0

    def step(self):
        # Continue local execution while the broker is down. Reconnection sends
        # the persisted ACK/status, never starts a second executor.
        for _ in range(128):
            try:
                command = self.commands.get_nowait()
            except queue.Empty:
                break
            self.publish("ack", self.service.submit(command))
        observations = self.service.tick()
        for observation in observations:
            self.publish("telemetry", observation)
        if self._sequence % 10 == 0:
            # A new/restarted subscriber cannot request an MQTT retained ACK.
            # Periodic reconciliation republishes evidence, never commands.
            self._sent.clear()
        for record in self.service.store.all():
            status = ExecutionStatus(
                command_id=record.command_id,
                task_id=record.task_id,
                plan_version=record.plan_version,
                state=record.state,
                updated_at=record.updated_at,
                execution_count=record.execution_count,
                reason=record.last_reason,
            )
            signature = status.model_dump_json()
            if self._sent.get(record.command_id) != signature:
                if record.ack is not None:
                    self.publish("ack", record.ack)
                if self.publish("status", status):
                    self._sent[record.command_id] = signature
        self.publish("heartbeat", Heartbeat(sequence=self._sequence))
        self._sequence += 1
        return observations

    def start(self, host: str, port: int, timeout_s: float = 5):
        try:
            self.client.connect(host, port, keepalive=15)
            self.client.loop_start()
            if not self.ready.wait(timeout_s):
                raise ConnectionError("Local edge MQTT subscription not ready")
        except Exception:
            self.close()
            raise

    def close(self):
        self.ready.clear()
        try:
            self.client.disconnect()
        finally:
            self.client.loop_stop()


def main():
    parser = argparse.ArgumentParser(description="Local MOCK edge daemon; never controls PX4")
    parser.add_argument("--host", choices=["127.0.0.1", "localhost"], default="127.0.0.1")
    parser.add_argument("--port", type=int, default=1883)
    parser.add_argument("--vehicle", default="local-mock-1")
    parser.add_argument("--state-dir", type=Path, default=Path("logs/local-edge"))
    args = parser.parse_args()
    import paho.mqtt.client as mqtt

    root = args.state_dir.resolve()
    with FileLease(root / "process.lock"), CommandStore(root / "commands.sqlite3") as store:
        with EdgeService(
            store, audit_path=root / "audit_MOCK.jsonl", telemetry_path=root / "telemetry_MOCK.jsonl"
        ) as service:
            service.recover()
            peer = MqttEdgePeer(mqtt.Client(mqtt.CallbackAPIVersion.VERSION2), service, args.vehicle)
            try:
                peer.start(args.host, args.port)
                print("MOCK edge ready; no PX4 connection", flush=True)
                stop = Event()
                while not stop.wait(0.5):
                    peer.step()
            except KeyboardInterrupt:
                pass
            finally:
                peer.close()


if __name__ == "__main__":
    main()
