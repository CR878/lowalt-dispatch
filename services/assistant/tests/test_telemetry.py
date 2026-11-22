import json
from datetime import UTC, datetime, timedelta

from services.assistant.telemetry import read_latest


def test_live_feed_rejects_fake_execution_and_preserves_zero_values(tmp_path):
    path = tmp_path / "feed.ndjson"
    live = {
        "source": "px4:sitl",
        "is_simulated": True,
        "captured_at": datetime.now(UTC).isoformat(),
        "battery": 0,
        "speed": 0,
        "position": {"frame": "NED", "x_m": 1, "y_m": 2, "z_m": -3},
    }
    fake = {**live, "source": "sim:edge.fake_executor", "battery": 99}
    path.write_text(json.dumps(live) + "\n" + json.dumps(fake) + "\n" + '{"partial":', encoding="utf-8")
    latest = read_latest(path)
    assert latest.source == "px4:sitl"
    assert latest.battery == 0
    assert latest.speed == 0
    assert latest.position.frame == "NED"
    path.write_text(
        json.dumps({**live, "captured_at": (datetime.now(UTC) + timedelta(minutes=1)).isoformat()}) + "\n",
        encoding="utf-8",
    )
    assert read_latest(path) is None
