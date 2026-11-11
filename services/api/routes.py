"""Local-only dispatch API, mounted behind the assistant BFF's origin checks."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/api/dispatch", tags=["local MOCK dispatch"])


class ProposalInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: str = Field(max_length=32)


class Confirmation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmed: Literal[True]
    review_digest: str = Field(pattern=r"^[a-f0-9]{64}$")


class AbandonInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmed: Literal[True]


def runtime(request: Request):
    if getattr(request.app.state, "dispatch_error", False):
        raise HTTPException(
            503, "Local execution pump stopped; inspect audit and reconcile before restarting"
        )
    dispatch = getattr(request.app.state, "dispatch", None)
    if dispatch is None:
        raise HTTPException(503, "Local dispatch runtime is not started")
    return dispatch


@router.get("/health")
def health(request: Request):
    return runtime(request).health()


@router.post("/proposals")
def propose(body: ProposalInput, request: Request):
    try:
        return runtime(request).propose(body.scenario_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None


@router.post("/tasks/{task_id}/confirm")
def confirm(task_id: str, body: Confirmation, request: Request):
    try:
        return runtime(request).confirm(task_id, body.review_digest)
    except KeyError:
        raise HTTPException(404, "Unknown local task") from None
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from None


@router.get("/tasks/{task_id}")
def get_task(task_id: str, request: Request):
    try:
        return runtime(request).get(task_id)
    except KeyError:
        raise HTTPException(404, "Unknown local task") from None
    except ValueError:
        raise HTTPException(422, "Invalid local task ID") from None


@router.post("/tasks/{task_id}/abandon")
def abandon(task_id: str, body: AbandonInput, request: Request):
    try:
        return runtime(request).abandon(task_id)
    except KeyError:
        raise HTTPException(404, "Unknown local task") from None
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from None
