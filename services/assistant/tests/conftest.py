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


@pytest.fixture(autouse=True)
def _stub_real_route(monkeypatch):
    """Never touch Overpass during unit tests.

    Intake creation computes one real-geometry route by default; tests must be
    offline and deterministic, so the module-level provider is replaced unless a
    test injects its own. Tests that need a failure pass their own provider.
    """
    from services.assistant import tools as tools_module

    def stub(origin, destination, scheduled_for):
        return {
            "status": "ok",
            "frame": "WGS84",
            "route_id": "real-test",
            "waypoints": [
                {"x": origin[0], "y": origin[1], "lng": origin[0], "lat": origin[1]},
                {"x": destination[0], "y": destination[1], "lng": destination[0], "lat": destination[1]},
            ],
            "length_m": 1000.0,
            "resolution_requested_m": 10,
            "resolution_used_m": 10,
            "clearance_m": 20.0,
            "continuous_clearance_verified": True,
            "obstacle_source": "test-stub",
            "reason": None,
            "attempts": [],
            "warnings": ["测试桩：非真实数据"],
            "computed_at": "2026-11-17T00:00:00+00:00",
            "note": "测试桩",
        }

    monkeypatch.setattr(tools_module, "real_route_for_intake", stub)

    # Production fills the route on a background thread; tests must be
    # deterministic, so default every Toolset to the synchronous path unless a
    # test explicitly asks for background behaviour.
    original_init = tools_module.Toolset.__init__

    def init(self, *args, **kwargs):
        kwargs.setdefault("route_background", False)
        original_init(self, *args, **kwargs)

    monkeypatch.setattr(tools_module.Toolset, "__init__", init)


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
