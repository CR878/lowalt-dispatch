"""Local identity integration: enforce permissions at the real BFF boundary."""

import json
import time

import pytest
from fastapi.testclient import TestClient

from services.identity.store import totp


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("AERIS_IDENTITY_DIR", str(tmp_path / "identity"))
    monkeypatch.setenv("AERIS_DISPATCH_DIR", str(tmp_path / "dispatch"))
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "planning.sqlite"))
    monkeypatch.setenv("AERIS_REGISTRATION", "invite")
    from services.assistant.app import app

    with TestClient(app, headers={"X-Aeris-Request": "1"}) as c:
        yield c


def setup(client):
    response = client.post(
        "/api/auth/setup", json={"email": "admin@example.com", "name": "管理员", "password": "PilotTest2026"}
    )
    assert response.status_code == 200
    return response.json()["user"]


def outbox(client, kind, email):
    records = [
        json.loads(path.read_text(encoding="utf-8"))
        for path in client.app.state.identity.root.joinpath("outbox").glob("*.json")
    ]
    matching = [record for record in records if record["kind"] == kind and record["to"] == email]
    return max(matching, key=lambda record: record["created_at"])["token"]


def verify(client):
    token = outbox(client, "verify", "admin@example.com")
    assert client.post("/api/auth/email/verify", json={"token": token}).status_code == 200


def invite(client, role="observer", email="guest@example.com"):
    assert client.post("/api/auth/invitations", json={"email": email, "role": role}).status_code == 200
    return outbox(client, "invite", email)


def test_anonymous_and_csrf_protection(client):
    assert client.get("/api/auth/policy").json()["setup_required"]
    for url in (
        "/api/workspace/summary",
        "/api/dispatch/health",
        "/api/planning/tasks",
        "/api/telemetry/stream",
        "/api/auth/users",
    ):
        assert client.get(url).status_code == 401
    assert client.post("/api/auth/setup", json={}).status_code == 422
    client.headers.pop("X-Aeris-Request")
    assert client.post("/api/auth/setup", json={}).status_code == 403


def test_bootstrap_cookie_and_session_revocation(client):
    setup(client)
    assert client.cookies.get("aeris_session")
    assert not client.get("/api/auth/policy").json()["setup_required"]
    assert (
        client.post(
            "/api/auth/setup",
            json={"email": "second@example.com", "name": "Second", "password": "PilotTest2026"},
        ).status_code
        == 409
    )
    assert client.get("/api/workspace/summary").status_code == 200
    assert client.get("/api/planning/health").status_code == 200
    response = client.post(
        "/api/auth/login", json={"email": "admin@example.com", "password": "PilotTest2026"}
    )
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]
    assert client.post("/api/auth/logout", json={}).status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_invitation_is_bound_single_use_and_observer_cannot_mutate(client):
    setup(client)
    assert (
        client.post(
            "/api/auth/invitations", json={"email": "guest@example.com", "role": "observer"}
        ).status_code
        == 403
    )
    verify(client)
    token = invite(client)
    data = {"email": "wrong@example.com", "name": "Guest", "password": "PilotTest2026", "invite": token}
    assert client.post("/api/auth/register", json=data).status_code == 422
    data["email"] = "guest@example.com"
    assert client.post("/api/auth/register", json=data).status_code == 200
    assert client.get("/api/auth/me").json()["user"]["role"] == "observer"
    assert client.post("/api/auth/register", json=data).status_code == 422
    assert client.get("/api/dispatch/health").status_code == 200
    assert client.get("/api/auth/users").status_code == 403
    for path, body in [
        ("/api/dispatch/proposals", {"scenario_id": "S1-01"}),
        ("/api/planning/tasks", {}),
        ("/api/assistant/turn", {}),
        ("/api/dispatch/tasks/test/confirm", {}),
    ]:
        assert client.post(path, json=body).status_code == 403


def test_role_change_revokes_sessions_and_last_admin_is_retained(client):
    admin = setup(client)
    verify(client)
    token = invite(client)
    client.post(
        "/api/auth/register",
        json={"email": "guest@example.com", "name": "Guest", "password": "PilotTest2026", "invite": token},
    )
    guest_cookie = client.cookies.get("aeris_session")
    guest = client.get("/api/auth/me").json()["user"]
    client.post("/api/auth/login", json={"email": "admin@example.com", "password": "PilotTest2026"})
    assert (
        client.patch("/api/auth/users/" + admin["id"], json={"role": "observer", "active": True}).status_code
        == 409
    )
    assert (
        client.patch(
            "/api/auth/users/" + guest["id"], json={"role": "dispatcher", "active": True}
        ).status_code
        == 200
    )
    assert client.app.state.identity.user(guest_cookie) is None
    assert client.get("/api/auth/events").json()[0]["action"] == "member_updated"


def test_totp_challenge_real_codes_and_replay_protection(client, monkeypatch):
    setup(client)
    response = client.post("/api/auth/mfa/setup", json={"password": "PilotTest2026"})
    secret = response.json()["secret"]
    base = int(time.time() / 30)
    assert client.post("/api/auth/mfa/confirm", json={"code": totp(secret, base)}).status_code == 200
    client.post("/api/auth/logout", json={})
    result = client.post(
        "/api/auth/login", json={"email": "admin@example.com", "password": "PilotTest2026"}
    ).json()
    assert result["mfa_required"]
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.post(
            "/api/auth/mfa/login", json={"challenge": result["challenge"], "code": totp(secret, base)}
        ).status_code
        == 401
    )
    monkeypatch.setattr("services.identity.store.time.time", lambda: (base + 1) * 30 + 2)
    body = {"challenge": result["challenge"], "code": totp(secret, base + 1)}
    assert client.post("/api/auth/mfa/login", json=body).status_code == 200
    assert client.post("/api/auth/mfa/login", json=body).status_code == 401


def test_authenticated_full_module_chain_uses_same_task_id(client):
    setup(client)
    proposal = client.post("/api/dispatch/proposals", json={"scenario_id": "S1-01"}).json()
    task_id = proposal["task_id"]
    result = client.post(
        f"/api/dispatch/tasks/{task_id}/confirm",
        json={"confirmed": True, "review_digest": proposal["review_digest"]},
    )
    assert result.status_code == 200
    assert result.json()["result"]["ack"]["accepted"]
    assert result.json()["execution"]["execution_count"] == 1
    assert client.get("/api/workspace/summary").json()["tasks"][0]["task_id"] == task_id


def test_open_registration_cannot_choose_elevated_role(client, monkeypatch):
    setup(client)
    monkeypatch.setenv("AERIS_REGISTRATION", "open")
    data = {"email": "open@example.com", "name": "Open", "password": "PilotTest2026"}
    assert client.post("/api/auth/register", json={**data, "role": "admin"}).status_code == 422
    assert client.post("/api/auth/register", json=data).json()["user"]["role"] == "observer"
