"""Task understanding is untrusted input; confirmation cannot authorize flight."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import pytest
from pydantic import SecretStr

from agent.fixtures import fixture_task as make_task
from agent.intake import TaskDraft, confirm, propose, revise
from agent.maas import MaasTaskExtractor, ModelResponseError

NOW = datetime(2026, 11, 10, tzinfo=UTC)


def complete_proposal():
    task = make_task(NOW)
    data = task.model_dump(mode="json", exclude={"task_id", "provenance"})
    return revise(propose("Explicit synthetic task for testing"), **data), task


def test_unknown_inputs_stay_missing_and_cannot_confirm():
    proposal = propose("把药品送到医院，电池80%")
    assert proposal.draft.initial_energy_wh is None
    assert proposal.draft.destination is None
    with pytest.raises(ValueError, match="Missing task fields"):
        confirm(
            proposal,
            reviewed_digest=proposal.review_digest,
            task_id="T1",
            provenance=make_task(NOW).provenance,
            now=NOW,
        )


def test_confirmation_binds_exact_reviewed_values():
    proposal, task = complete_proposal()
    digest = proposal.review_digest
    revised = revise(proposal, payload_kg=0.5)
    with pytest.raises(ValueError, match="changed after review"):
        confirm(revised, reviewed_digest=digest, task_id=task.task_id, provenance=task.provenance, now=NOW)
    confirmed = confirm(
        proposal, reviewed_digest=digest, task_id=task.task_id, provenance=task.provenance, now=NOW
    )
    assert confirmed == task


def test_confirm_rejects_unsafe_energy_and_coordinate_references():
    proposal, task = complete_proposal()
    revised = revise(proposal, reserve_energy_wh=task.initial_energy_wh)
    with pytest.raises(ValueError, match="does not exceed"):
        confirm(
            revised, reviewed_digest=revised.review_digest, task_id="T1", provenance=task.provenance, now=NOW
        )
    position = {"frame": "wgs84", "alt_ref": "amsl", "alt_m": 10, "lat_deg": 30, "lon_deg": 120}
    revised = revise(proposal, destination=position)
    with pytest.raises(ValueError, match="different coordinate"):
        confirm(
            revised, reviewed_digest=revised.review_digest, task_id="T1", provenance=task.provenance, now=NOW
        )


def test_extra_authorization_fields_are_not_accepted():
    with pytest.raises(ValueError):
        TaskDraft.model_validate({"approved": True, "command": "takeoff"})


@pytest.fixture
def model_server():
    state = {"status": 200, "content": '{"payload_kg":1.0}', "finish": "stop", "requests": []}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            state["requests"].append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
            self.send_response(state["status"])
            self.end_headers()
            response = {
                "choices": [{"finish_reason": state["finish"], "message": {"content": state["content"]}}]
            }
            self.wfile.write(json.dumps(response).encode())

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}/chat/completions", state
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)


def test_maas_real_http_request_yields_only_draft(model_server):
    endpoint, state = model_server
    extractor = MaasTaskExtractor(endpoint, SecretStr("test-key"), "test-model")
    proposal = propose("运送1千克药品，不知道电池Wh", extractor)
    assert proposal.draft.payload_kg == 1
    assert proposal.draft.initial_energy_wh is None
    assert "tools" not in state["requests"][0]
    assert state["requests"][0]["model"] == "test-model"


@pytest.mark.parametrize(
    "content,finish",
    [
        ('{"payload_kg":NaN}', "stop"),
        ('{"payload_kg":1,"payload_kg":2}', "stop"),
        ('{"command":"takeoff"}', "stop"),
        ("```json\n{}\n```", "stop"),
        ("{}", "length"),
    ],
)
def test_maas_invalid_output_fails_closed(model_server, content, finish):
    endpoint, state = model_server
    state.update(content=content, finish=finish)
    with pytest.raises(ModelResponseError):
        MaasTaskExtractor(endpoint, SecretStr("test-key"), "test-model").extract("test")


def test_maas_http_failure_does_not_expose_secrets(model_server):
    endpoint, state = model_server
    state["status"] = 401
    with pytest.raises(ModelResponseError) as error:
        MaasTaskExtractor(endpoint, SecretStr("do-not-echo-this-key"), "model").extract("test")
    assert "do-not-echo" not in str(error.value)
    assert "401" in str(error.value)


def test_maas_refuses_unencrypted_remote_endpoint():
    with pytest.raises(ValueError):
        MaasTaskExtractor("http://example.org/chat/completions", SecretStr("key"), "model")
