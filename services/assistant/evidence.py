"""Evidence adapters for natural-language task intakes.

Hard rule: never fabricate a value. When an upstream source cannot be reached,
return an explicit ``unavailable`` / ``unresolved`` result with a reason. The
weather values here are FORECASTS, never observations. The real-route adapter
can request the full hourly series; the frozen v0 energy model stays unchanged.
"""

from __future__ import annotations

import json
import math
import re
import time
from datetime import UTC, datetime, timedelta, timezone
from itertools import pairwise
from pathlib import Path

import httpx

from services.assistant import geocode

ROOT = Path(__file__).resolve().parents[2]
OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
LOCAL_TZ = timezone(timedelta(hours=8), "Asia/Shanghai")
HOURLY_FIELDS = (
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "surface_pressure",
    "precipitation",
    "visibility",
    "weather_code",
)
WEEKDAYS = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}


def _clock(text: str) -> tuple[int, int] | None:
    number = r"[零一二三四五六七八九十两\d]{1,3}"
    match = re.search(rf"(凌晨|早上|上午|中午|下午|晚上)?\s*({number})(?:[:：](\d{{2}})|[点时](?:({number})分?)?(半)?)", text)
    if not match:
        return None
    def integer(token):
        if not token:
            return 0
        if token.isdigit():
            return int(token)
        digits = {c: n for n, c in enumerate("零一二三四五六七八九")}
        digits["两"] = 2
        if "十" in token:
            tens, ones = token.split("十", 1)
            return (digits.get(tens, 1) * 10) + digits.get(ones, 0)
        return digits[token]
    hour = integer(match[2])
    minute = 30 if match[5] else integer(match[3] or match[4])
    period = match[1]
    if period:
        if not 0 <= hour <= 12:
            raise ValueError("中文时段的小时应在0到12之间")
        if period in {"下午", "晚上"} and hour < 12:
            hour += 12
        elif period == "中午" and hour < 11:
            hour += 12
        elif period in {"凌晨", "上午", "早上"} and hour == 12:
            hour = 0
    if not (0 <= hour < 24 and 0 <= minute < 60):
        raise ValueError("时刻无效")
    return hour, minute


def parse_schedule(text: str, now: datetime | None = None) -> tuple[str | None, str]:
    """Resolve a coarse Chinese time expression into an ISO instant + its rule.

    The rule is always returned as text so the UI can show *why* a date was
    picked. Nothing is guessed when the expression is absent.
    """
    now = (now or datetime.now(LOCAL_TZ)).astimezone(LOCAL_TZ)
    try:
        clock = _clock(text)
    except (ValueError, KeyError):
        return None, "时刻无效，请确认小时和分钟"
    hour, minute = clock if clock is not None else (9, 0)
    base = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    time_note = f"{hour:02d}:{minute:02d} Asia/Shanghai" + ("（默认时间，待确认）" if clock is None else "")

    date = re.search(r"(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]", text)
    if date:
        month, day = int(date[2]), int(date[3])
        year = int(date[1]) if date[1] else now.year + (month < now.month)
        try:
            target = base.replace(year=year, month=month, day=day)
        except ValueError:
            return None, f"{year}年{month}月{day}日不是有效日期，未采用"
        return target.isoformat(), f"按 {target.date()} {time_note}（年份取 {year}）"

    match = re.search(r"(?:下周|下个星期|下星期)\s*([一二三四五六日天1-7])?", text)
    if match:
        monday = base - timedelta(days=base.weekday()) + timedelta(days=7)
        token = match.group(1)
        if token:
            offset = WEEKDAYS[token] if token in WEEKDAYS else int(token) - 1
            target = monday + timedelta(days=offset)
            note = (
                f"「{match.group(0)}」按下一个自然周一起算（{monday.date()}），"
                f"取第 {offset + 1} 天 {target.date()}，{time_note}"
            )
        else:
            target = monday
            note = f"「下周」未指定具体日，暂按下周一 {target.date()} {time_note} 计"
        return target.isoformat(), note

    for word, days in (("后天", 2), ("明天", 1)):
        if word in text:
            target = base + timedelta(days=days)
            return target.isoformat(), f"「{word}」按 {target.date()} {time_note} 计"

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
        "note": "模式预报值，不是实测；天气不可用时不填默认风速。",
    }


_WEATHER_CACHE: dict[tuple, tuple[float, dict]] = {}
_WEATHER_TTL_S = 120.0


def _fetch_weather_forecast(
    latitude: float,
    longitude: float,
    scheduled_for: str | None = None,
    *,
    client: httpx.Client | None = None,
    include_hourly: bool = False,
) -> dict:
    """Fetch an hourly forecast interpolated at the requested aware instant.

    A naive input is interpreted as Asia/Shanghai for compatibility with intakes.
    The default instant is now, never the API's first (midnight) sample. Wind
    speeds are explicitly requested in m/s. ``include_hourly`` is internal to
    real-route assessment and keeps the existing intake evidence schema intact.
    """
    try:
        target = datetime.fromisoformat(scheduled_for.replace("Z", "+00:00")) if scheduled_for else datetime.now(LOCAL_TZ)
        target = target.replace(tzinfo=LOCAL_TZ) if target.tzinfo is None else target
        if not all(math.isfinite(v) for v in (latitude, longitude)) or not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError("invalid coordinates")
    except (ValueError, TypeError, AttributeError):
        return unavailable_weather("气象查询的坐标或日期无效", scheduled_for)
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ",".join(HOURLY_FIELDS),
        "forecast_days": 16,
        "timezone": "UTC",
        "wind_speed_unit": "ms",
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

    if not isinstance(payload, dict):
        return unavailable_weather("气象服务返回格式无效", scheduled_for)
    hourly = payload.get("hourly") or {}
    if not isinstance(hourly, dict):
        return unavailable_weather("气象服务逐时数据格式无效", scheduled_for)
    times = hourly.get("time") or []
    if not times:
        return unavailable_weather("气象服务未返回逐时数据", scheduled_for)

    forecast = {
        "hourly": hourly,
        "utc_offset_seconds": payload.get("utc_offset_seconds", 0),
    }
    try:
        values = interpolate_forecast(forecast, target)
    except (ValueError, TypeError, OverflowError):
        return unavailable_weather("预报窗口（最多16天）不覆盖该时刻或逐时数据无效", scheduled_for)
    result = {
        "status": "ok",
        "kind": "forecast",
        "source": "Open-Meteo / hourly forecast",
        "scheduled_for": scheduled_for,
        "valid_for": target.astimezone(UTC).isoformat(),
        "requested_point": [longitude, latitude],
        "fetched_at": datetime.now(UTC).isoformat(),
        "values": values,
        "reason": "",
        "note": "Open-Meteo模式预报，非实测；按时刻插值；风速/阵风m/s，风向为气象来向°，气压hPa。10m风不能代表飞行高度风场。",
    }
    if include_hourly:
        result.update(forecast)
        result["hourly_units"] = payload.get("hourly_units", {})
        result["fetched_at"] = datetime.now(UTC).isoformat()
        result["requested_point"] = [longitude, latitude]
        result["model_point"] = [payload.get("longitude"), payload.get("latitude")]
    return result



def fetch_weather_forecast(
    latitude: float,
    longitude: float,
    scheduled_for: str | None = None,
    *,
    client: httpx.Client | None = None,
    include_hourly: bool = False,
) -> dict:
    """Cached wrapper: an unreachable Open-Meteo must not cost 8 s twice.

    The model sometimes asks for the same point twice in one turn. Failures are
    cached for two minutes too, because they are the common case on this
    network and repeating the timeout only burns the tool budget.
    """
    if client is not None:
        return _fetch_weather_forecast(
            latitude,
            longitude,
            scheduled_for,
            client=client,
            include_hourly=include_hourly,
        )
    key = (round(latitude, 4), round(longitude, 4), scheduled_for, include_hourly)
    now = time.monotonic()
    hit = _WEATHER_CACHE.get(key)
    if hit and now - hit[0] < _WEATHER_TTL_S:
        return hit[1]
    result = _fetch_weather_forecast(
        latitude,
        longitude,
        scheduled_for,
        include_hourly=include_hourly,
    )
    _WEATHER_CACHE[key] = (now, result)
    return result


def interpolate_forecast(forecast: dict, when: datetime) -> dict[str, float | None]:
    """Interpolate an hourly series; wind uses vectors across the 0/360 seam.

    Missing values stay None. No extrapolation beyond the returned time range.
    API timestamps are interpreted with its UTC offset, never host timezone.
    """
    if when.tzinfo is None:
        raise ValueError("interpolation instant must have a timezone")
    hourly = forecast.get("hourly") or {}
    if not isinstance(hourly, dict):
        raise ValueError("hourly must be an object")
    offset = timezone(timedelta(seconds=float(forecast.get("utc_offset_seconds", 0))))
    raw_times = hourly.get("time")
    if not isinstance(raw_times, list) or not raw_times or not all(isinstance(item, str) for item in raw_times):
        raise ValueError("hourly timestamps must be a nonempty list of ISO strings")
    times = []
    for raw in raw_times:
        item = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        times.append(item.replace(tzinfo=offset) if item.tzinfo is None else item)
    if not times or any(b <= a for a, b in pairwise(times)) or not times[0] <= when <= times[-1]:
        raise ValueError("forecast does not cover instant")
    right = next(i for i, value in enumerate(times) if value >= when)
    left = max(0, right - 1) if times[right] != when else right
    ratio = 0.0 if left == right else (when - times[left]).total_seconds() / (times[right] - times[left]).total_seconds()

    def at(field, index):
        series = hourly.get(field) or []
        if not isinstance(series, list):
            raise ValueError("hourly weather fields must be arrays")
        value = series[index] if index < len(series) else None
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
            return None
        if field in {"wind_speed_10m", "wind_gusts_10m"} and value < 0:
            return None
        if field == "wind_direction_10m" and not 0 <= value <= 360:
            return None
        return float(value)

    values = {}
    for field in HOURLY_FIELDS:
        a, b = at(field, left), at(field, right)
        values[field] = None if a is None or b is None else (a if field == "weather_code" else a + ratio * (b - a))
    speeds = [at("wind_speed_10m", i) for i in (left, right)]
    directions = [at("wind_direction_10m", i) for i in (left, right)]
    if all(v is not None for v in speeds + directions):
        east, north = [], []
        for speed, direction in zip(speeds, directions, strict=True):
            east.append(-speed * math.sin(math.radians(direction)))
            north.append(-speed * math.cos(math.radians(direction)))
        u = east[0] + ratio * (east[1] - east[0])
        v = north[0] + ratio * (north[1] - north[0])
        values["wind_speed_10m"] = math.hypot(u, v)
        values["wind_direction_10m"] = math.degrees(math.atan2(-u, -v)) % 360
    return values


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
    try:
        clock = _clock(text)
    except (ValueError, KeyError):
        clock = None
    parsed, note = parse_schedule(text)
    if clock is not None and parsed is not None:
        result.update(scheduled_for=parsed, schedule_note=note, schedule_confirmed=True)
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
            "address": "场景登记地点（仿真，非真实地址）",
            "is_simulated": True,
        }
    try:
        rows, provider = geocode.lookup(name, 1)
        if rows:
            first = rows[0]
            return {
                "status": "ok",
                "name": first["name"],
                "point": list(first["point"]),
                "crs": "EPSG:4326",
                "source": provider,
                "address": first.get("address", ""),
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
        "address": "",
        "is_simulated": True,
    }
