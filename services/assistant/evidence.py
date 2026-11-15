"""Evidence adapters for natural-language task intakes.

Hard rule: never fabricate a value. When an upstream source cannot be reached,
return an explicit ``unavailable`` / ``unresolved`` result with a reason. The
weather values here are FORECASTS, never observations, and they do not feed the
planner (wind is not modelled in v0).
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
LOCAL_TZ = timezone(timedelta(hours=8), "Asia/Shanghai")
HOURLY_FIELDS = (
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "wind_gusts_10m",
    "precipitation",
    "visibility",
    "weather_code",
)
WEEKDAYS = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}


def parse_schedule(text: str, now: datetime | None = None) -> tuple[str | None, str]:
    """Resolve a coarse Chinese time expression into an ISO instant + its rule.

    The rule is always returned as text so the UI can show *why* a date was
    picked. Nothing is guessed when the expression is absent.
    """
    now = (now or datetime.now(LOCAL_TZ)).astimezone(LOCAL_TZ)
    base = now.replace(hour=9, minute=0, second=0, microsecond=0)

    match = re.search(r"(?:下周|下个星期|下星期)\s*([一二三四五六日天1-7])?", text)
    if match:
        monday = (base - timedelta(days=base.weekday()) + timedelta(days=7)).replace(hour=9)
        token = match.group(1)
        if token:
            offset = WEEKDAYS[token] if token in WEEKDAYS else int(token) - 1
            target = monday + timedelta(days=offset)
            note = (
                f"「{match.group(0)}」按下一个自然周一起算（{monday.date()}），"
                f"取第 {offset + 1} 天 {target.date()}，默认 09:00 Asia/Shanghai"
            )
        else:
            target = monday
            note = f"「下周」未指定具体日，暂按下周一 {target.date()} 09:00 Asia/Shanghai 计"
        return target.isoformat(), note

    for word, days in (("后天", 2), ("明天", 1)):
        if word in text:
            target = base + timedelta(days=days)
            return target.isoformat(), f"「{word}」按 {target.date()} 09:00 Asia/Shanghai 计"

    match = re.search(r"(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]", text)
    if match:
        month, day = int(match.group(1)), int(match.group(2))
        year = now.year + (1 if month < now.month else 0)
        try:
            target = base.replace(year=year, month=month, day=day)
        except ValueError:
            return None, f"{month}月{day}日不是有效日期，未采用"
        return target.isoformat(), f"按 {target.date()} 09:00 Asia/Shanghai 计（年份取 {year}）"

    return None, "未识别到时间，按未指定处理"


def unavailable_weather(reason: str, scheduled_for: str | None = None) -> dict:
    return {
        "status": "unavailable",
        "kind": "forecast",
        "source": "Open-Meteo / hourly forecast",
        "scheduled_for": scheduled_for,
        "valid_for": None,
        "values": {},
        "reason": reason,
        "note": "模式预报值，不是实测；风速未进入能耗或绕路计算。",
    }


def fetch_weather_forecast(
    latitude: float,
    longitude: float,
    scheduled_for: str | None = None,
    *,
    client: httpx.Client | None = None,
) -> dict:
    """Fetch the hourly forecast nearest to ``scheduled_for`` (16-day horizon)."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ",".join(HOURLY_FIELDS),
        "forecast_days": 16,
        "timezone": "Asia/Shanghai",
    }
    try:
        if client is None:
            with httpx.Client(timeout=8, trust_env=True) as created:
                response = created.get(OPEN_METEO, params=params)
        else:
            response = client.get(OPEN_METEO, params=params)
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return unavailable_weather("气象服务当前不可达，未填任何数值", scheduled_for)

    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    if not times:
        return unavailable_weather("气象服务未返回逐时数据", scheduled_for)

    index = 0
    if scheduled_for:
        wanted = scheduled_for[:13]
        index = next((i for i, value in enumerate(times) if value[:13] >= wanted), -1)
        if index < 0 or times[index][:10] > scheduled_for[:10]:
            return unavailable_weather("预报窗口（最多16天）不覆盖该日期", scheduled_for)

    values = {}
    for field in HOURLY_FIELDS:
        series = hourly.get(field) or []
        values[field] = series[index] if index < len(series) else None
    return {
        "status": "ok",
        "kind": "forecast",
        "source": "Open-Meteo / hourly forecast",
        "scheduled_for": scheduled_for,
        "valid_for": times[index],
        "values": values,
        "reason": "",
        "note": "模式预报值，不是实测；风速未进入能耗或绕路计算。",
    }


def list_airspace_zones() -> dict:
    """Read the repository's draft restriction zones; never claim real airspace."""
    try:
        raw = json.loads((ROOT / "scenarios/v0/zones.geojson").read_text(encoding="utf-8"))
        zones = []
        for feature in raw["features"]:
            props = feature.get("properties", {})
            zones.append(
                {
                    "id": props.get("id"),
                    "kind": props.get("kind"),
                    "alt_min_m": props.get("alt_min_m"),
                    "alt_max_m": props.get("alt_max_m"),
                    "status": "draft",
                }
            )
    except (OSError, ValueError, KeyError):
        zones = []
    return {
        "status": "draft",
        "source": "scenarios/v0/zones.geojson",
        "crs": "local ENU / m",
        "is_simulated": True,
        "zones": zones,
        "note": "仿真草稿，非实测空域；未接入 NOTAM / 官方空域数据，不能用于安全判定。",
    }


def extract_confirmations(text: str) -> dict:
    """Pull ONLY values the user stated explicitly; never infer a missing one.

    Models do not reliably map a follow-up sentence into a JSON schema. This
    rule-based fallback keeps the multi-turn clarification loop deterministic.
    """
    result: dict = {}
    date = re.search(r"(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]", text)
    clock = re.search(r"(\d{1,2})\s*[:：]\s*(\d{2})", text)
    if date and clock:
        now = datetime.now(LOCAL_TZ)
        month, day = int(date.group(1)), int(date.group(2))
        hour, minute = int(clock.group(1)), int(clock.group(2))
        year = now.year + (1 if month < now.month else 0)
        try:
            result["scheduled_for"] = datetime(year, month, day, hour, minute, tzinfo=LOCAL_TZ).isoformat()
            result["schedule_note"] = f"用户明确给出 {month}月{day}日 {hour:02d}:{minute:02d}"
            result["schedule_confirmed"] = True
        except ValueError:
            pass
    for field, pattern in (
        ("origin_point", r"起点(?:坐标|位置)?\s*[:：]?\s*(-?\d+\.\d+)\s*[,，]\s*(-?\d+\.\d+)"),
        ("destination_point", r"终点(?:坐标|位置)?\s*[:：]?\s*(-?\d+\.\d+)\s*[,，]\s*(-?\d+\.\d+)"),
    ):
        found = re.search(pattern, text)
        if found:
            lng, lat = float(found.group(1)), float(found.group(2))
            if -180 <= lng <= 180 and -85.0511 <= lat <= 85.0511:
                result[field] = [lng, lat]
    payload = re.search(r"载荷\s*(?:重量|是|为)?\s*(\d+(?:\.\d+)?)\s*(?:公斤|千克|kg)", text, re.I)
    if payload:
        result["payload_kg"] = float(payload.group(1))
    if re.search(r"\bP1\b|应急|紧急", text):
        result["priority"] = "P1"
    elif re.search(r"\bP2\b|常规", text):
        result["priority"] = "P2"
    if result.get("origin_point") and result.get("destination_point"):
        result["places_confirmed"] = True
    return result


def resolve_place(
    name: str,
    *,
    local_places: dict | None = None,
    aliases: dict | None = None,
    client: httpx.Client | None = None,
) -> dict:
    """Resolve a place name to coordinates, refusing to invent any."""
    key = (aliases or {}).get(name.strip(), name.strip())
    point = (local_places or {}).get(key)
    if point is not None:
        return {
            "status": "ok",
            "name": name,
            "point": list(point),
            "crs": "local ENU / m",
            "source": "仓库虚拟S1-01场景地点表",
            "is_simulated": True,
        }
    try:
        if client is None:
            with httpx.Client(timeout=8, trust_env=True) as created:
                response = created.get(
                    NOMINATIM,
                    params={"q": name, "format": "jsonv2", "limit": 1, "accept-language": "zh-CN"},
                    headers={"User-Agent": "Lowalt-Aeris-Console/0.2"},
                )
        else:
            response = client.get(
                NOMINATIM,
                params={"q": name, "format": "jsonv2", "limit": 1, "accept-language": "zh-CN"},
                headers={"User-Agent": "Lowalt-Aeris-Console/0.2"},
            )
        response.raise_for_status()
        rows = response.json()
        if isinstance(rows, list) and rows:
            return {
                "status": "ok",
                "name": name,
                "point": [float(rows[0]["lon"]), float(rows[0]["lat"])],
                "crs": "EPSG:4326",
                "source": "OpenStreetMap / Nominatim",
                "is_simulated": False,
            }
    except Exception:
        pass
    return {
        "status": "unresolved",
        "name": name,
        "point": None,
        "crs": "unresolved",
        "source": "未解析；未猜测坐标",
        "is_simulated": True,
    }
