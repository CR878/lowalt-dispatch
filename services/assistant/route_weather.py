"""Real forecast evidence and conditional fixed-TAS route assessment.

No aircraft values are supplied by this module. A geometric route is never a
flight-feasibility finding; an absent calibrated profile keeps that finding
unavailable even when the public forecast is accessible.
"""

from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from itertools import pairwise

from services.assistant import evidence
from sim.energy import (
    VehicleProfile,
    load_vehicle,
    moist_air_density_kg_m3,
    wind_leg_energy_wh,
    wind_sensitivity,
)

SOURCE = "Open-Meteo / hourly forecast"
MODEL = "fixed calibrated true airspeed; wind triangle + P × time"
LIMITATIONS = (
    "公开预报为模式网格的10m风、2m温湿度和地面气压，不是航高实测；未提供建筑尾流、阵风控制或局地风场。",
    "天气沿航线仅取起点、中点、终点三个模式网格，不能证明航路气象完整覆盖。",
    "温湿度与气压进入湿空气密度及理想旋翼诱导功率敏感性；总电功率和低温电池容量仍需真实平台标定，未套用经验折减系数。",
)


def _distance(a, b):
    lng1, lat1, lng2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371008.8 * 2 * math.asin(math.sqrt(min(1.0, h)))


def _bearing(a, b):
    lng1, lat1, lng2, lat2 = map(math.radians, (*a, *b))
    dl = lng2 - lng1
    return math.degrees(math.atan2(math.sin(dl) * math.cos(lat2), math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dl))) % 360


def _midpoint(points, lengths):
    target = sum(lengths) / 2
    for (a, b), length in zip(pairwise(points), lengths, strict=True):
        if length and target <= length:
            ratio = target / length
            return (a[0] + ratio * (b[0] - a[0]), a[1] + ratio * (b[1] - a[1]))
        target -= length
    return points[-1]


def _atmosphere(values):
    try:
        rho = moist_air_density_kg_m3(values["temperature_2m"], values["relative_humidity_2m"], values["surface_pressure"])
    except (ValueError, TypeError, KeyError):
        return {"status": "unavailable", "reason": "温湿压缺失或超出湿空气公式适用范围；未填标准天气"}
    return {
        "status": "model",
        "density_kg_m3": rho,
        "ideal_induced_power_ratio_to_isa_sea_level": math.sqrt(1.225 / rho),
        "reference_density_kg_m3": 1.225,
        "formula": "rho=(p-e)/(287.05*T)+e/(461.5*T); fixed-thrust ideal rotor Pi proportional to rho^(-1/2)",
        "source": "Buck saturation vapor pressure; ideal gas mixture; actuator disk momentum theory; ICAO ISA sea-level density 1.225 kg/m3",
        "limitation": "只表示同推力下理想诱导功率分量的变化，不能当作实际总电功率或电池折减率。",
    }


def _load_real_profile(vehicle_key):
    if not vehicle_key:
        return None, "未选择有来源且完成标定的真实机型；未填默认空速、功率或电池参数。"
    try:
        profile = load_vehicle(key=vehicle_key)
        if profile.is_example or not profile.source or profile.source.lower().startswith(("synthetic", "example")) or not profile.calibrated_at:
            raise ValueError("真实天气能耗需要有来源及calibrated_at的非示例机型")
        if not all(math.isfinite(v) and v > 0 for v in (profile.cruise_speed_mps, profile.energy_per_meter_wh)):
            raise ValueError("机型的标定空速或能耗无效")
        return profile, ""
    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as exc:
        return None, f"真实机型标定资料不可用：{exc}"


def _mean_wind(values):
    east = north = 0.0
    for item in values:
        speed, direction = item.get("wind_speed_10m"), item.get("wind_direction_10m")
        if speed is None or direction is None or not math.isfinite(speed) or not math.isfinite(direction) or speed < 0 or not 0 <= direction <= 360:
            raise ValueError("预报缺失有效风速或风向；未填默认风")
        east -= speed * math.sin(math.radians(direction)) / len(values)
        north -= speed * math.cos(math.radians(direction)) / len(values)
    return math.hypot(east, north), math.degrees(math.atan2(-east, -north)) % 360


def _assess_flight(points, lengths, forecasts, departure, profile: VehicleProfile):
    """Interpolate each leg at departure/arrival; iterate its wind triangle."""
    duration = energy = distance = 0.0
    legs = []
    total = sum(lengths)
    for (a, b), length in zip(pairwise(points), lengths, strict=True):
        if length == 0:
            continue
        fraction = (distance + length / 2) / total
        forecast = forecasts[min(2, int(fraction * 2 + 0.5))]
        begins = departure + timedelta(seconds=duration)
        leg_time = length / profile.cruise_speed_mps
        bearing = _bearing(a, b)
        converged = False
        for _ in range(12):
            ends = begins + timedelta(seconds=leg_time)
            departure_values = evidence.interpolate_forecast(forecast, begins)
            arrival_values = evidence.interpolate_forecast(forecast, ends)
            speed, direction = _mean_wind([departure_values, arrival_values])
            metrics = wind_leg_energy_wh(profile, length, bearing, speed, direction)
            if abs(metrics["duration_s"] - leg_time) < 0.1:
                converged = True
                break
            leg_time = metrics["duration_s"]
        if not converged:
            raise ValueError("航段风场时间迭代未收敛，未给出能耗结果")
        atmosphere_start = _atmosphere(departure_values)
        atmosphere_end = _atmosphere(arrival_values)
        legs.append({
            "origin": list(a), "destination": list(b), "distance_m": length,
            "departure_at": begins.isoformat(), "arrival_at": (begins + timedelta(seconds=metrics["duration_s"])).isoformat(),
            "wind_speed_mps": speed, "wind_from_deg": direction,
            "atmosphere_start": atmosphere_start, "atmosphere_end": atmosphere_end, **metrics,
        })
        duration += metrics["duration_s"]
        energy += metrics["energy_wh"]
        distance += length
    magnitude, _ = _mean_wind([forecast["values"] for forecast in forecasts])
    return {
        "status": "conditional", "model": MODEL, "duration_s": duration, "energy_wh": energy,
        "vehicle_source": profile.source, "vehicle_calibrated_at": profile.calibrated_at,
        "legs": legs, "sensitivity": wind_sensitivity(profile, total, magnitude),
        "formula": "Vg=sqrt(Va^2-Wcross^2)+Walong; P=e_calibrated*Va*3600; E_Wh=P_W*t_s/3600",
        "limitation": "单一标定空速的稳态功率点，未编造跨空速功率曲线；未含爬升、转弯、密度对总电功率及温度对可用电量的标定修正。",
    }


def assess_route_weather(waypoints, scheduled_for=None, *, vehicle_key=None, client=None):
    """Return public evidence, honest coverage, and conditional energy if possible.

    ``status=ok`` means forecast evidence was obtained. Flight feasibility is
    separately ``unavailable``/``infeasible``/``conditional``; never approved.
    """
    warnings = list(LIMITATIONS)
    base = {"source": SOURCE, "warnings": warnings, "dispatch_enabled": False, "constraints_evaluated": False}
    unavailable = {"status": "unavailable", "reason": "缺少真实标定机型或天气覆盖，未计算实际ETA和能耗。"}
    try:
        points = [tuple(map(float, p)) for p in waypoints]
        if len(points) < 2 or not all(len(p) == 2 and all(math.isfinite(v) for v in p) and -180 <= p[0] <= 180 and -90 <= p[1] <= 90 for p in points):
            raise ValueError("航线坐标无效")
        departure = datetime.fromisoformat(scheduled_for.replace("Z", "+00:00")) if scheduled_for else datetime.now(UTC)
        departure = departure.replace(tzinfo=evidence.LOCAL_TZ) if departure.tzinfo is None else departure
        departure = departure.astimezone(UTC)
        lengths = [_distance(a, b) for a, b in pairwise(points)]
        if sum(lengths) <= 0:
            raise ValueError("航线长度为零")
    except (ValueError, TypeError, AttributeError, OverflowError) as exc:
        return {**base, "status": "unavailable", "reason": str(exc), "samples": [], "energy": unavailable, "flight_feasibility": unavailable}
    anchors = [points[0], _midpoint(points, lengths), points[-1]]

    def fetch(point):
        try:
            return evidence.fetch_weather_forecast(point[1], point[0], departure.isoformat(), client=client, include_hourly=True)
        except Exception:
            return evidence.unavailable_weather("气象服务返回无效，未填任何数值", departure.isoformat())

    with ThreadPoolExecutor(max_workers=3) as pool:
        forecasts = list(pool.map(fetch, anchors))
    samples = []
    weather_ok = True
    for name, point, forecast in zip(("origin", "midpoint", "destination"), anchors, forecasts, strict=True):
        values = forecast.get("values") or {}
        try:
            if forecast.get("status") != "ok":
                raise ValueError(forecast.get("reason") or "气象不可用")
            _mean_wind([values])
        except (ValueError, TypeError):
            weather_ok = False
        samples.append({"at": name, "point": list(point), "status": forecast.get("status", "unavailable"), "valid_for": forecast.get("valid_for"), "fetched_at": forecast.get("fetched_at"), "source": forecast.get("source", SOURCE), "values": values, "units": {"wind_speed_10m": "m/s", "wind_gusts_10m": "m/s", "wind_direction_10m": "degree FROM", "surface_pressure": "hPa", "temperature_2m": "degC", "relative_humidity_2m": "%"}, "atmosphere": _atmosphere(values), "reason": forecast.get("reason", "")})
    profile, profile_reason = _load_real_profile(vehicle_key)
    result = {**base, "status": "ok" if weather_ok else "unavailable", "scheduled_for": departure.isoformat(), "samples": samples, "energy": unavailable, "flight_feasibility": unavailable}
    if not weather_ok:
        warnings.append("天气不可用或缺少风向/风速；未填默认风速，未执行天气约束判定。")
        result["reason"] = "航线采样位置的预报未完整获取有效风速与风向。"
    if profile is None:
        warnings.append(profile_reason)
        result["energy"] = result["flight_feasibility"] = {"status": "unavailable", "reason": profile_reason}
    elif weather_ok:
        try:
            energy = _assess_flight(points, lengths, forecasts, departure, profile)
            result["energy"] = energy
            result["flight_feasibility"] = {"status": "conditional", "reason": "只计算10m预报风下稳态时间/能耗；缺少航高风、性能包线与完整空域，未判真实飞行可行。"}
            result["constraints_evaluated"] = "wind_triangle_only"
        except (ValueError, TypeError, KeyError, OverflowError) as exc:
            reason = str(exc)
            status = "infeasible" if "侧风" in reason or "逆风" in reason else "unavailable"
            result["energy"] = result["flight_feasibility"] = {"status": status, "reason": reason}
            warnings.append(reason)
    return result
