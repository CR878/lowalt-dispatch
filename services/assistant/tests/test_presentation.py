from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from services.assistant.engine import Engine, Settings
from services.assistant.presentation import Presentation, build_presentation
from services.assistant.tests.test_assistant import make_turn


def test_snapshot_cards_preserve_zero_unknown_and_evidence_time():
    result = build_presentation(
        "状态卡片",
        {
            "get_flight_status": {
                "source": "server:m4",
                "sampled_at": "2026-11-19T10:00:00Z",
                "stale": True,
                "telemetry": {"battery": 0, "speed": 0, "altitude": None},
            }
        },
    )
    block = result.blocks[0]
    assert block.type == "metrics"
    assert [item.value for item in block.items] == [0, None, 0, None]
    assert block.source == "server:m4"
    assert block.as_of == "2026-11-19T10:00:00Z"
    assert "过期" in block.note


def test_overview_builds_chart_and_table_from_actual_data():
    overview = {
        "count": 2,
        "source": "test records",
        "status_counts": [{"label": "后台计算中", "value": 2}],
        "payloads": [{"label": "A→B", "value": 1.5}],
    }
    blocks = build_presentation("工单看板", {"get_intake_overview": overview}).blocks
    assert [b.type for b in blocks] == ["metrics", "chart", "table"]
    assert blocks[1].chart.data[0].value == 2
    assert blocks[2].rows == [["A→B", 1.5]]
    assert all(b.source == "test records" for b in blocks)


def test_empty_intakes_do_not_create_fake_chart():
    blocks = build_presentation(
        "工单看板",
        {
            "get_intake_overview": {
                "count": 0,
                "status_counts": [{"label": "未生成", "value": 0}],
                "payloads": [],
            }
        },
    ).blocks
    assert not any(b.type == "chart" for b in blocks)
    assert blocks[0].items[0].value == 0


def test_events_and_geometry_remain_evidence_not_execution():
    blocks = build_presentation(
        "事件和路线",
        {
            "list_events": {
                "source": "browser events",
                "events": [
                    {"time": "10:05", "title": "需要核对", "detail": "这是测试事件", "type": "warning"}
                ],
            },
            "plan_task_preview": {
                "status": "geometry_only",
                "source": "planner",
                "route_id": "p1",
                "draft_digest": "d1",
                "length_m": 100,
                "waypoints": [[0, 0], [100, 0]],
            },
        },
    ).blocks
    assert blocks[0].items[0].level == "warning"
    assert blocks[1].type == "route"
    assert blocks[1].waypoints == [(0, 0), (100, 0)]


@pytest.mark.parametrize("kind", ["html", "javascript", "execute_command"])
def test_unregistered_ui_types_are_rejected(kind):
    with pytest.raises(ValidationError):
        Presentation.model_validate(
            {"version": 1, "blocks": [{"type": kind, "title": "x", "source": "test"}]}
        )


def test_regular_status_entry_point_produces_presentation():
    result = Engine(Settings()).run(make_turn("卡片展示当前电量和飞行状态"), lambda _: None)
    assert result["presentation"]["version"] == 1
    assert result["presentation"]["blocks"][0]["type"] == "metrics"
    assert result["presentation"]["blocks"][0]["items"][0]["value"] == 83.4


def test_reusable_json_schema_matches_the_runtime_contract():
    path = Path(__file__).resolve().parents[3] / "docs/agent-presentation.schema.json"
    schema = json.loads(path.read_text(encoding="utf-8"))
    assert schema.pop("$schema") == "https://json-schema.org/draft/2020-12/schema"
    assert schema == Presentation.model_json_schema()
