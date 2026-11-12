"""Atomic, typed local storage for PREVALIDATED fallback candidates.

This stores data only. Loading a cache never authorizes execution: the edge
decision agent must still check current telemetry and invoke local validation.
The SHA256 checksum detects accidental edits; it is not authentication.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import Field

from agent.contracts import Contract
from agent.edge_decisions import CachedFallback
from agent.guards import report_failures, utc
from agent.storage import FileLease, atomic_json
from core.models import Task


class FallbackBundle(Contract):
    schema_version: Literal["m3-cache-0.1"] = "m3-cache-0.1"
    task_id: str
    run_mode: Literal["mock", "integration"]
    revision: int = Field(ge=1)
    saved_at: datetime
    candidates: list[CachedFallback]


def bundle_checksum(bundle: FallbackBundle) -> str:
    encoded = json.dumps(
        bundle.model_dump(mode="json"), sort_keys=True, allow_nan=False, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class FallbackCache:
    def __init__(self, path: Path, *, clock: Callable[[], datetime] | None = None):
        self.path = Path(path)
        self.clock = clock or (lambda: datetime.now(UTC))

    def load(self, *, task_id: str, run_mode: Literal["mock", "integration"]) -> FallbackBundle:
        envelope = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(envelope, dict) or set(envelope) != {"bundle", "sha256"}:
            raise ValueError("Invalid fallback cache envelope")
        bundle = FallbackBundle.model_validate(envelope["bundle"])
        if (
            not isinstance(envelope["sha256"], str)
            or re.fullmatch(r"[0-9a-f]{64}", envelope["sha256"]) is None
            or not hmac.compare_digest(envelope["sha256"], bundle_checksum(bundle))
        ):
            raise ValueError("Fallback cache checksum mismatch")
        if bundle.task_id != task_id or bundle.run_mode != run_mode:
            raise ValueError("Cache task or MOCK/integration mode mismatch")
        if utc(bundle.saved_at) > utc(self.clock()):
            raise ValueError("Cache saved_at is in the future")
        self._identities(bundle)
        return bundle

    @staticmethod
    def _identities(bundle: FallbackBundle) -> None:
        ids, versions = set(), set()
        for candidate in bundle.candidates:
            if candidate.task_id != bundle.task_id or candidate.run_mode != bundle.run_mode:
                raise ValueError("Mixed task or mode inside fallback bundle")
            if candidate.route.route_id in ids or candidate.route.plan_version in versions:
                raise ValueError("Duplicate fallback route IDs or plan versions")
            ids.add(candidate.route.route_id)
            versions.add(candidate.route.plan_version)
            utc(candidate.cached_at)

    def save(
        self,
        task: Task,
        candidates: list[CachedFallback],
        *,
        run_mode: Literal["mock", "integration"],
        expected_revision: int | None = None,
    ) -> FallbackBundle:
        now = utc(self.clock())
        with FileLease(self.path.with_name(self.path.name + ".lock")):
            previous = self.load(task_id=task.task_id, run_mode=run_mode) if self.path.exists() else None
            revision = previous.revision if previous else 0
            if expected_revision is not None and expected_revision != revision:
                raise ValueError("Cache revision changed; reload before replacing it")
            bundle = FallbackBundle(
                task_id=task.task_id,
                run_mode=run_mode,
                revision=revision + 1,
                saved_at=now,
                candidates=[c.model_copy(deep=True) for c in candidates],
            )
            self._identities(bundle)
            for candidate in bundle.candidates:
                if utc(candidate.cached_at) > now:
                    raise ValueError("Candidate cache timestamp is in the future")
                failures = report_failures(
                    candidate.validation,
                    task,
                    candidate.route,
                    candidate.snapshot,
                    candidate.cached_at,
                    not_before=candidate.validation.verified_at,
                )
                if failures:
                    raise ValueError(
                        "Only independently prevalidated candidates may be cached: "
                        + "; ".join(f.detail for f in failures)
                    )
            atomic_json(
                self.path, {"bundle": bundle.model_dump(mode="json"), "sha256": bundle_checksum(bundle)}
            )
            return bundle
