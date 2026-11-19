"""Versioned UI blocks built from tool evidence. No model-generated executable UI."""

from __future__ import annotations

import math
from typing import Annotated, Literal

from pydantic import Field

from services.assistant.models import Contract


class Block(Contract):
    title: str = Field(max_length=80)
    source: str = Field(max_length=240)
    as_of: str | None = Field(default=None, max_length=80)
    note: str = Field(default="", max_length=600)


class Metric(Contract):
    label: str = Field(max_length=60)
    value: float | None
    unit: str = Field(default="", max_length=24)


class MetricsBlock(Block):
    type: Literal["metrics"] = "metrics"
    items: list[Metric] = Field(min_length=1, max_length=8)


class Datum(Contract):
    label: str = Field(max_length=80)
    value: float


class ChartSpec(Contract):
    type: Literal["bar", "pie", "line"]
    title: str = Field(max_length=80)
    unit: str = Field(default="", max_length=24)
    data: list[Datum] = Field(min_length=1, max_length=12)


class ChartBlock(Block):
    type: Literal["chart"] = "chart"
    chart: ChartSpec


class TableBlock(Block):
    type: Literal["table"] = "table"
    columns: list[str] = Field(min_length=1, max_length=6)
    rows: list[list[str | float | None]] = Field(max_length=20)


class TimelineItem(Contract):
    time: str = Field(max_length=80)
    title: str = Field(max_length=200)
    detail: str = Field(default="", max_length=1000)
    level: Literal["info", "warning", "success"] = "info"


class TimelineBlock(Block):
    type: Literal["timeline"] = "timeline"
    items: list[TimelineItem] = Field(max_length=30)


class RouteBlock(Block):
    type: Literal["route"] = "route"
    route_id: str = Field(max_length=160)
    draft_digest: str = Field(max_length=160)
    length_m: float = Field(ge=0)
    waypoints: list[tuple[float, float]] = Field(min_length=2, max_length=5000)


UIBlock = Annotated[
    MetricsBlock | ChartBlock | TableBlock | TimelineBlock | RouteBlock, Field(discriminator="type")
]


class Presentation(Contract):
    version: Literal[1] = 1
    blocks: list[UIBlock] = Field(max_length=6)


def number(value) -> float | None:
    return (
        float(value)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
        else None
    )


def build_presentation(question: str, results: dict[str, dict]) -> Presentation:
    blocks: list[UIBlock] = []
    flight = results.get("get_flight_status")
    if flight:
        sample = flight.get("telemetry") or {}
        blocks.append(
            MetricsBlock(
                title="飞行状态",
                source=flight["source"],
                as_of=flight.get("sampled_at"),
                note="快照已过期，请核对最新遥测。" if flight.get("stale") else "",
                items=[
                    Metric(label=label, value=number(sample.get(key)), unit=unit)
                    for key, label, unit in (
                        ("battery", "电量", "%"),
                        ("altitude", "高度", "m"),
                        ("speed", "速度", "m/s"),
                        ("energyWh", "剩余电量", "Wh"),
                    )
                ],
            )
        )
    weather = results.get("get_weather_forecast")
    if weather and weather.get("status") == "ok":
        values = weather.get("values") or {}
        blocks.append(
            MetricsBlock(
                title="时段天气",
                source=weather["source"],
                as_of=weather.get("valid_for"),
                note="离地 10 米模型预报，航高风况需另外核验。",
                items=[
                    Metric(label=label, value=number(values.get(key)), unit=unit)
                    for key, label, unit in (
                        ("temperature_2m", "气温", "°C"),
                        ("wind_speed_10m", "风速", "m/s"),
                        ("wind_gusts_10m", "阵风", "m/s"),
                        ("precipitation", "降水", "mm"),
                    )
                ],
            )
        )
    overview = results.get("get_intake_overview")
    if overview:
        source = overview.get("source", "logs/intakes 本机工单文件")
        counts = overview.get("status_counts", [])
        blocks.append(
            MetricsBlock(
                title="工单概览",
                source=source,
                note=f"最近 {overview['count']} 张工单，按航线生成状态统计。",
                items=[
                    Metric(label="本次统计", value=overview["count"], unit="单"),
                    *[Metric(label=row["label"], value=row["value"], unit="单") for row in counts[:3]],
                ],
            )
        )
        if "折线图" in question:
            data = (overview.get("latest_route") or {}).get("profile", [])
            kind, title, unit = "line", "航线累计距离", "km"
        elif "柱状图" in question:
            data = overview.get("payloads", [])
            kind, title, unit = "bar", "工单载荷", "kg"
        else:
            data = counts if any(row["value"] > 0 for row in counts) else []
            kind, title, unit = "pie", "航线状态分布", "单"
        if data and "表格" not in question:
            blocks.append(
                ChartBlock(
                    title=title,
                    source=source,
                    note=f"来自最近 {overview['count']} 张工单。",
                    chart=ChartSpec(type=kind, title=title, unit=unit, data=data[:12]),
                )
            )
        if "饼图" not in question and "柱状图" not in question and "折线图" not in question:
            blocks.append(
                TableBlock(
                    title="工单载荷",
                    source=source,
                    columns=["任务", "载荷 / kg"],
                    rows=[[row["label"], row["value"]] for row in overview.get("payloads", [])[:12]],
                    note="当前没有载荷记录。" if not overview.get("payloads") else "",
                )
            )
    events = results.get("list_events")
    if events:
        blocks.append(
            TimelineBlock(
                title="最近事件",
                source=events["source"],
                items=[
                    TimelineItem(
                        time=item["time"],
                        title=item["title"],
                        detail=item.get("detail", ""),
                        level=item.get("type", "info"),
                    )
                    for item in events.get("events", [])[:30]
                ],
                note="当前没有事件记录。" if not events.get("events") else "",
            )
        )
    route = results.get("plan_task_preview")
    if route and route.get("status") == "geometry_only":
        blocks.append(
            RouteBlock(
                title="路线预览",
                source=route["source"],
                route_id=route["route_id"],
                draft_digest=route["draft_digest"],
                length_m=route["length_m"],
                waypoints=route["waypoints"],
                note="本地 ENU 坐标下的几何预览，完整校验见任务流程。",
            )
        )
    return Presentation(blocks=blocks[:6])
