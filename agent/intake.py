"""Untrusted model output -> reviewable draft -> explicitly confirmed Task.

This module never plans or dispatches. Coordinates, vehicle and energy remain
unknown until supplied; a model's complete-looking output still needs review.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Protocol
from uuid import uuid4

from pydantic import Field

from agent.contracts import Contract
from agent.guards import task_problem
from core.models import DataProvenance, Position, Task


class TaskDraft(Contract):
    origin: Position | None = None
    destination: Position | None = None
    payload_kg: float | None = Field(default=None, ge=0)
    vehicle_type: str | None = Field(default=None, min_length=1, max_length=128)
    initial_energy_wh: float | None = Field(default=None, gt=0)
    reserve_energy_wh: float | None = Field(default=None, ge=0)
    time_limit_s: float | None = Field(default=None, gt=0)


class DraftExtractor(Protocol):
    def extract(self, text: str) -> TaskDraft: ...


class TaskProposal(Contract):
    proposal_id: str
    source_text: str = Field(min_length=1, max_length=12000)
    draft: TaskDraft

    @property
    def missing_fields(self) -> list[str]:
        required = set(TaskDraft.model_fields) - {"time_limit_s"}
        return sorted(name for name in required if getattr(self.draft, name) is None)

    @property
    def review_digest(self) -> str:
        data = json.dumps(self.model_dump(mode="json"), sort_keys=True, allow_nan=False)
        return hashlib.sha256(data.encode("utf-8")).hexdigest()


def propose(text: str, extractor: DraftExtractor | None = None) -> TaskProposal:
    if not text.strip() or len(text) > 12000:
        raise ValueError("Task text must contain 1..12000 characters")
    draft = extractor.extract(text) if extractor else TaskDraft()
    # Revalidate even an injected extractor's return value.
    draft = TaskDraft.model_validate_json(draft.model_dump_json())
    return TaskProposal(proposal_id=uuid4().hex, source_text=text, draft=draft)


def revise(proposal: TaskProposal, **fields) -> TaskProposal:
    data = {**proposal.draft.model_dump(mode="json"), **fields}
    return TaskProposal(
        proposal_id=proposal.proposal_id,
        source_text=proposal.source_text,
        draft=TaskDraft.model_validate(data),
    )


def confirm(
    proposal: TaskProposal,
    *,
    reviewed_digest: str,
    task_id: str,
    provenance: DataProvenance,
    now: datetime | None = None,
) -> Task:
    """Call only from an explicit user-confirmation action in the future UI/API.

    The digest binds the exact reviewed proposal. It is a concurrency guard,
    not a signature or user-authentication mechanism.
    """
    proposal = TaskProposal.model_validate_json(proposal.model_dump_json())
    if reviewed_digest != proposal.review_digest:
        raise ValueError("Draft changed after review; review the new values before confirming")
    if proposal.missing_fields:
        raise ValueError("Missing task fields: " + ", ".join(proposal.missing_fields))
    task = Task(task_id=task_id, provenance=provenance, **proposal.draft.model_dump())
    problem = task_problem(task, now or datetime.now(UTC))
    if problem:
        raise ValueError(problem)
    # Shared Position allows nonfinite numbers; never accept them into a draft.
    json.dumps(task.model_dump(mode="json"), allow_nan=False)
    return task
