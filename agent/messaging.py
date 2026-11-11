"""Cloud-side MQTT transport only; does not implement any PX4/edge execution.

One application publish per command ID. MQTT QoS1 may duplicate delivery: the
edge MUST persistently deduplicate command IDs before executing anything.
Broker PUBACK is never interpreted as flight-controller acceptance.
"""

from __future__ import annotations

import re
from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime
from threading import Event, RLock
from typing import Literal

from pydantic import Field

from agent.contracts import Contract
from agent.edge_decisions import ExecutionObservation
from agent.execution import ExecutionStatus
from agent.guards import utc
from core.models import PlanAck, PlanCommand


class MessageEnvelope(Contract):
    schema_version: Literal["m3-message-0.1"] = "m3-message-0.1"
    kind: Literal["command", "ack", "telemetry", "heartbeat", "status"]
    run_mode: Literal["mock", "integration"]
    sent_at: datetime
    body: dict


class Heartbeat(Contract):
    sequence: int = Field(ge=0)


class MqttCommandChannel:
    def __init__(
        self,
        client,
        vehicle_id: str,
        *,
        run_mode: Literal["mock", "integration"],
        ack_timeout_s: float = 3,
        clock: Callable[[], datetime] | None = None,
    ):
        if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", vehicle_id) is None:
            raise ValueError("Vehicle ID must contain only letters, digits, underscore or hyphen")
        if run_mode not in {"mock", "integration"} or not 0 < ack_timeout_s <= 30:
            raise ValueError("Invalid MQTT mode or ACK timeout")
        self.client, self.run_mode, self.ack_timeout_s = client, run_mode, ack_timeout_s
        self.prefix = f"lowalt/v1/{run_mode}/vehicles/{vehicle_id}"
        self.clock = clock or (lambda: datetime.now(UTC))
        self._ready, self._mutex = Event(), RLock()
        self._pending: dict[str, tuple[PlanCommand, Event]] = {}
        self._acks: dict[str, PlanAck] = {}
        self._statuses: dict[str, ExecutionStatus] = {}
        self._events = deque(maxlen=1024)
        self._subscription_mid = None
        self.invalid_messages = 0
        self.client.on_connect = self._on_connect
        self.client.on_subscribe = self._on_subscribe
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

    def start(self, host: str, port: int, *, timeout_s: float = 5):
        """Connection happens only on this explicit call, never on import."""
        try:
            self.client.connect(host, port, keepalive=15)
            self.client.loop_start()
            if not self._ready.wait(timeout_s):
                raise TimeoutError("MQTT subscription not ready")
        except Exception:
            self.close()
            raise ConnectionError("MQTT connection/subscription unavailable") from None

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        self._ready.clear()
        if reason_code != 0:
            return
        status, mid = client.subscribe(
            [(f"{self.prefix}/{suffix}", 1) for suffix in ("acks", "telemetry", "heartbeat", "status")]
        )
        if status == 0:
            self._subscription_mid = mid

    def _on_subscribe(self, client, userdata, mid, reason_codes, properties=None):
        if (
            mid == self._subscription_mid
            and reason_codes
            and all(int(getattr(c, "value", c)) < 128 for c in reason_codes)
        ):
            self._ready.set()

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties=None):
        self._ready.clear()
        with self._mutex:
            for _command, event in self._pending.values():
                event.set()

    def submit_command(self, command: PlanCommand) -> PlanAck | None:
        command = PlanCommand.model_validate_json(command.model_dump_json())
        now = utc(self.clock())
        if not utc(command.issued_at) <= now < utc(command.expires_at):
            raise ValueError("Command is not currently valid")
        if command.payload.get("run_mode") != self.run_mode:
            raise ValueError("Command and MQTT run modes differ")
        with self._mutex:
            if command.command_id in self._pending:
                previous, _event = self._pending[command.command_id]
                if previous != command:
                    raise ValueError("Command ID reused with different content")
                return self.get_ack(command.command_id)
            if not self._ready.is_set():
                raise ConnectionError("MQTT is not connected and subscribed")
            if len(self._pending) >= 1024:
                raise RuntimeError("Pending command capacity reached; reconcile before dispatching")
            event = Event()
            self._pending[command.command_id] = command, event
            envelope = MessageEnvelope(
                kind="command", run_mode=self.run_mode, sent_at=now, body=command.model_dump(mode="json")
            )
            # Register before publishing so an immediate ACK cannot be lost.
            receipt = self.client.publish(
                f"{self.prefix}/commands", envelope.model_dump_json(), qos=1, retain=False
            )
            if receipt.rc != 0:
                # Delivery may be uncertain. Keep command ID, never republish it.
                raise ConnectionError("MQTT publish failed; reconcile this command ID")
        event.wait(min(self.ack_timeout_s, max(0, (utc(command.expires_at) - now).total_seconds())))
        return self.get_ack(command.command_id)

    def watch_command(self, command: PlanCommand) -> None:
        """Restore ACK tracking from a persisted command, without publishing.

        Expired commands may still receive a delayed ACK timestamped within the
        original validity window. No expiry extension or new ID is generated.
        """
        command = PlanCommand.model_validate_json(command.model_dump_json())
        if command.payload.get("run_mode") != self.run_mode:
            raise ValueError("Command and MQTT run modes differ")
        with self._mutex:
            existing = self._pending.get(command.command_id)
            if existing is not None and existing[0] != command:
                raise ValueError("Command ID reused with different content")
            if existing is None:
                if len(self._pending) >= 1024:
                    raise RuntimeError("Pending command capacity reached")
                self._pending[command.command_id] = command, Event()

    def wait_ack(self, command_id: str, timeout_s: float = 3) -> PlanAck | None:
        if not 0 <= timeout_s <= 30:
            raise ValueError("ACK wait must be within 0..30 seconds")
        with self._mutex:
            pending = self._pending.get(command_id)
        if pending is None:
            raise KeyError("Command is not being tracked")
        pending[1].wait(timeout_s)
        return self.get_ack(command_id)

    def _on_message(self, client, userdata, message):
        try:
            if message.retain or len(message.payload) > 1024 * 1024:
                raise ValueError("Retained or oversized message")
            envelope = MessageEnvelope.model_validate_json(message.payload)
            suffix = {
                "ack": "acks",
                "telemetry": "telemetry",
                "heartbeat": "heartbeat",
                "status": "status",
            }.get(envelope.kind)
            received_at = utc(self.clock())
            if (
                suffix is None
                or message.topic != f"{self.prefix}/{suffix}"
                or envelope.run_mode != self.run_mode
                or utc(envelope.sent_at) > received_at
            ):
                raise ValueError("Message topic/mode/time mismatch")
            with self._mutex:
                if envelope.kind == "ack":
                    ack = PlanAck.model_validate(envelope.body)
                    pending = self._pending.get(ack.command_id)
                    if pending is None:
                        raise ValueError("ACK for unknown command")
                    command, event = pending
                    if (ack.task_id, ack.plan_version) != (command.task_id, command.plan_version):
                        raise ValueError("ACK identity mismatch")
                    if not utc(command.issued_at) <= utc(ack.received_at) < utc(command.expires_at):
                        raise ValueError("ACK outside command validity")
                    if utc(ack.received_at) > received_at:
                        raise ValueError("ACK from the future")
                    previous = self._acks.get(ack.command_id)
                    if previous is not None:
                        if previous != ack:
                            raise ValueError("Conflicting duplicate ACK")
                        return
                    self._acks[ack.command_id] = ack
                    event.set()
                    body = ack
                elif envelope.kind == "telemetry":
                    body = ExecutionObservation.model_validate(envelope.body)
                    pending = self._pending.get(body.accepted_command_id)
                    if pending is None or (body.task_id, body.state.executing_plan_version) != (
                        pending[0].task_id,
                        pending[0].plan_version,
                    ):
                        raise ValueError("Telemetry identity mismatch")
                    source = body.state.provenance.source.lower()
                    if (self.run_mode == "mock" and not body.state.provenance.is_simulated) or (
                        self.run_mode == "integration"
                        and (source == "sim:edge.fake_executor" or source.startswith("mock"))
                    ):
                        raise ValueError("Telemetry source and channel mode differ")
                    if (
                        not utc(pending[0].issued_at)
                        <= utc(body.state.ts)
                        <= utc(body.received_at)
                        <= received_at
                    ):
                        raise ValueError("Telemetry timestamp mismatch")
                elif envelope.kind == "status":
                    body = ExecutionStatus.model_validate(envelope.body)
                    pending = self._pending.get(body.command_id)
                    if pending is None or (body.task_id, body.plan_version) != (
                        pending[0].task_id,
                        pending[0].plan_version,
                    ):
                        raise ValueError("Execution status identity mismatch")
                    if not utc(pending[0].issued_at) <= utc(body.updated_at) <= received_at:
                        raise ValueError("Execution status timestamp mismatch")
                    previous = self._statuses.get(body.command_id)
                    if previous is not None:
                        if utc(body.updated_at) < utc(previous.updated_at):
                            raise ValueError("Out-of-order status")
                        if (
                            previous.state in {"completed", "failed", "rejected"}
                            and body.state != previous.state
                        ):
                            raise ValueError("Terminal execution state cannot regress")
                    self._statuses[body.command_id] = body
                else:
                    body = Heartbeat.model_validate(envelope.body)
                # Application consumes events and calls TaskService.recover() or
                # CloudLinkMonitor itself; callback never runs planning/flight code.
                self._events.append((envelope.kind, received_at, body))
        except Exception:
            with self._mutex:
                self.invalid_messages += 1

    def get_ack(self, command_id: str) -> PlanAck | None:
        with self._mutex:
            ack = self._acks.get(command_id)
            return ack.model_copy(deep=True) if ack else None

    def drain_events(self):
        with self._mutex:
            events = [
                (kind, received_at, body.model_copy(deep=True)) for kind, received_at, body in self._events
            ]
            self._events.clear()
            return events

    def close(self):
        self._ready.clear()
        try:
            self.client.disconnect()
        finally:
            self.client.loop_stop()
