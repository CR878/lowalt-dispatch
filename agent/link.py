"""Heartbeat-based cloud-link policy, independent from the PX4 connection.

The transport supplies REAL receipt/RTT/loss measurements. This module does not
create a connection or prove that an actual network outage occurred. Defaults
are example policy values, not thresholds calibrated for a particular network.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Literal

from pydantic import Field

from agent.contracts import Contract
from agent.guards import utc


class LinkPolicy(Contract):
    heartbeat_timeout_s: float = Field(default=5, gt=0)
    degraded_rtt_ms: float = Field(default=300, gt=0)
    degraded_loss_pct: float = Field(default=10, gt=0, le=100)
    healthy_samples_to_recover: int = Field(default=2, ge=1)


class LinkSample(Contract):
    received_at: datetime
    round_trip_ms: float | None = Field(default=None, ge=0)
    loss_pct: float | None = Field(default=None, ge=0, le=100)


class LinkDecision(Contract):
    status: Literal["unknown", "healthy", "degraded", "disconnected"]
    reason: str
    requires_reconciliation: bool
    consider_cached_fallback: bool


class CloudLinkMonitor:
    def __init__(self, *, policy: LinkPolicy | None = None, clock: Callable[[], datetime] | None = None):
        self.policy = policy or LinkPolicy()
        self.clock = clock or (lambda: datetime.now(UTC))
        self.started_at = utc(self.clock())
        self.last_received: datetime | None = None
        self.status: Literal["unknown", "healthy", "degraded", "disconnected"] = "unknown"
        self.reason = "No cloud heartbeat observed"
        self._healthy_samples = 0
        self._requires_reconciliation = False

    def poll(self) -> LinkDecision:
        now = utc(self.clock())
        previous = self.last_received or self.started_at
        if now < previous:
            raise ValueError("Clock moved backwards")
        if (now - previous).total_seconds() >= self.policy.heartbeat_timeout_s:
            self.status, self.reason = "disconnected", "Cloud heartbeat timed out"
            self._healthy_samples = 0
            self._requires_reconciliation = True
        return self._decision()

    def observe(self, sample: LinkSample) -> LinkDecision:
        now = utc(self.clock())
        received = utc(sample.received_at)
        if received > now or received < self.started_at:
            raise ValueError("Heartbeat receipt timestamp is outside the observation window")
        if self.last_received is not None and received < self.last_received:
            raise ValueError("Out-of-order heartbeat")
        self.poll()
        if received == self.last_received:
            return self._decision()  # duplicates cannot satisfy recovery hysteresis
        self.last_received = received
        if (now - received).total_seconds() >= self.policy.heartbeat_timeout_s:
            return self.poll()
        quality_known = sample.round_trip_ms is not None or sample.loss_pct is not None
        poor = (sample.round_trip_ms is not None and sample.round_trip_ms >= self.policy.degraded_rtt_ms) or (
            sample.loss_pct is not None and sample.loss_pct >= self.policy.degraded_loss_pct
        )
        if poor or not quality_known:
            self.status = "degraded"
            self.reason = (
                "Cloud quality threshold exceeded" if poor else "Heartbeat received; quality unknown"
            )
            self._healthy_samples = 0
        else:
            self._healthy_samples += 1
            ready = self._healthy_samples >= self.policy.healthy_samples_to_recover
            self.status = "healthy" if ready else "degraded"
            self.reason = "Cloud quality recovered" if ready else "Waiting for consecutive healthy samples"
        return self._decision()

    def mark_reconciled(self) -> LinkDecision:
        """Integration calls this ONLY after EdgeDecisionAgent.reconcile == synced."""
        if self.poll().status != "healthy":
            raise RuntimeError("Cannot clear reconciliation before link recovery")
        self._requires_reconciliation = False
        return self._decision()

    def _decision(self) -> LinkDecision:
        return LinkDecision(
            status=self.status,
            reason=self.reason,
            requires_reconciliation=self._requires_reconciliation,
            consider_cached_fallback=self.status == "disconnected",
        )
