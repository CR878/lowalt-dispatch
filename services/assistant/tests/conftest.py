"""Legacy assistant tests run behind the authenticated local BFF.

The BFF now requires a session for every /api/ route outside the small public
set, and only its lifespan creates ``app.state.identity``.  Building a bare
TestClient therefore raises AttributeError before the route is reached.  This
fixture mirrors tests/test_identity.py: isolated on-disk state, a real lifespan,
and a bootstrapped admin session.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from services.assistant.app import app as bff_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("AERIS_IDENTITY_DIR", str(tmp_path / "identity"))
    monkeypatch.setenv("AERIS_DISPATCH_DIR", str(tmp_path / "dispatch"))
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "planning.sqlite"))
    monkeypatch.setenv("AERIS_REGISTRATION", "invite")
    with TestClient(bff_app, headers={"X-Aeris-Request": "1"}) as test_client:
        response = test_client.post(
            "/api/auth/setup",
            json={"email": "admin@example.com", "name": "管理员", "password": "PilotTest2026"},
        )
        assert response.status_code == 200
        yield test_client
