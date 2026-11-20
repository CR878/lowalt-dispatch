"""Real forecast evidence and conditional fixed-TAS route assessment.

No aircraft values are supplied by this module. A geometric route is never a
flight-feasibility finding; an absent calibrated profile keeps that finding
unavailable even when the public forecast is accessible.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from decimal import ROUND_DOWN, Decimal
from itertools import pairwise
from types import SimpleNamespace

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
    "公开预报是模式网格值，不是航高实测。已请求 10/80/120/180 m 风、云量、露点、CAPE 和冻结高度；接口未返回的字段保持 null，不用邻近高度代替。未提供建筑尾流或阵风控制模型。",
    "天气沿航线仍只取起点、中点、终点三个锚点。independent_cells 只按返回的 model_point 去重，不能证明航路气象完整覆盖。",
    "安全包络取覆盖时段内的阵风最大、降水最大和能见度最小；能耗仍用端点向量平均的 10 m 风。温湿度与气压进入湿空气密度及理想旋翼诱导功率敏感性；总电功率和低温电池容量仍需真实平台标定，未套用经验折减系数。",
)
# 0.1 m matches the existing one-decimal route length. 0.1 s is the wind-triangle
# iteration tolerance in _assess_flight. Truncation is display-only.
PRECISION_NOTE = (
    "报出的 clearance_m、length_m 和 distance_m 截断到 0.1 m，duration_s 截断到 0.1 s；"
    "能耗仍按未截断的距离和时间计算。20 m 物理净空判据未改，grid_clearance_m 仍是未截断的栅格排除半径。"
)


def _distance(a, b):
    lng1, lat1, lng2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371008.8 * 2 * math.asin(math.sqrt(min(1.0, h)))


def _bearing(a, b):
    lng1, lat1, lng2, lat2 = map(math.radians, (*a, *b))
    dl = lng2 - lng1
    return (
        math.degrees(
            math.atan2(
                math.sin(dl) * math.cos(lat2),
                math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dl),
            )
        )
        % 360
    )


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
        rho = moist_air_density_kg_m3(
            values["temperature_2m"], values["relative_humidity_2m"], values["surface_pressure"]
        )
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
    from services.assistant.vehicles import catalog

    if any(v["id"] == vehicle_key for v in catalog()["vehicles"]):
        return None, "已选择厂家规格机型；官网未提供实测 Wh/m 与可用电量，未从标称电池或最大航程反推能耗。"
    try:
        profile = load_vehicle(key=vehicle_key)
        if (
            profile.is_example
            or not profile.source
            or profile.source.lower().startswith(("synthetic", "example"))
            or not profile.calibrated_at
        ):
            raise ValueError("真实天气能耗需要有来源及calibrated_at的非示例机型")
        if not all(
            math.isfinite(v) and v > 0 for v in (profile.cruise_speed_mps, profile.energy_per_meter_wh)
        ):
            raise ValueError("机型的标定空速或能耗无效")
        return profile, ""
    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as exc:
        return None, f"真实机型标定资料不可用：{exc}"


def _mean_wind(values):
    east = north = 0.0
    for item in values:
        speed, direction = item.get("wind_speed_10m"), item.get("wind_direction_10m")
        if (
            speed is None
            or direction is None
            or not math.isfinite(speed)
            or not math.isfinite(direction)
            or speed < 0
            or not 0 <= direction <= 360
        ):
            raise ValueError("预报缺失有效风速或风向；未填默认风")
        east -= speed * math.sin(math.radians(direction)) / len(values)
        north -= speed * math.cos(math.radians(direction)) / len(values)
    return math.hypot(east, north), math.degrees(math.atan2(-east, -north)) % 360


def truncate_reported(value, places: int = 1):
    """Drop digits past the sourced decimal place. Non-numbers pass through."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return value
    quantum = Decimal("1").scaleb(-places)
    truncated = Decimal(format(value, "f")).quantize(quantum, rounding=ROUND_DOWN)
    return float(truncated)


def _finite(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _collect(value_sets, field) -> list[float]:
    found = []
    for values in value_sets:
        if not isinstance(values, dict):
            continue
        item = values.get(field)
        if _finite(item):
            found.append(float(item))
    return found


def safety_envelope(value_sets) -> dict:
    """Worst raw sample in the leg window. Endpoint means are not used.

    Gust and precipitation use the hour's own maximum and accumulation.
    Visibility uses the minimum. No go/no-go threshold is applied.
    """
    gusts = _collect(value_sets, "wind_gusts_10m")
    precip = _collect(value_sets, "precipitation")
    visibility = _collect(value_sets, "visibility")
    probability = _collect(value_sets, "precipitation_probability")
    wind = _collect(value_sets, "wind_speed_10m")
    return {
        "gust_max": max(gusts) if gusts else None,
        "precip_max": max(precip) if precip else None,
        "visibility_min": min(visibility) if visibility else None,
        "precip_probability_max": max(probability) if probability else None,
        "wind_speed_10m_max": max(wind) if wind else None,
        "note": "覆盖时段内逐时样本的最不利值；阵风和降水不取起终点平均。",
    }


def _merge_envelopes(envelopes) -> dict:
    merged = safety_envelope([])
    for key, reducer in (
        ("gust_max", max),
        ("precip_max", max),
        ("visibility_min", min),
        ("precip_probability_max", max),
        ("wind_speed_10m_max", max),
    ):
        values = [item[key] for item in envelopes if _finite(item.get(key))]
        merged[key] = reducer(values) if values else None
    return merged


def _leg_observed(forecasts, start, end) -> list[dict]:
    observed = []
    for forecast in forecasts:
        observed.extend(evidence.raw_values_covering(forecast, start, end))
    return observed


def _assess_flight(points, lengths, forecasts, departure, profile: VehicleProfile):
    """Wind-triangle energy from endpoint-mean 10 m wind; safety from the leg envelope."""
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
        departure_values = arrival_values = None
        for _ in range(12):
            ends = begins + timedelta(seconds=leg_time)
            departure_values = evidence.values_at(forecast, begins)
            arrival_values = evidence.values_at(forecast, ends)
            speed, direction = _mean_wind([departure_values, arrival_values])
            metrics = wind_leg_energy_wh(profile, length, bearing, speed, direction)
            if abs(metrics["duration_s"] - leg_time) < 0.1:
                converged = True
                break
            leg_time = metrics["duration_s"]
        if not converged or departure_values is None or arrival_values is None:
            raise ValueError("航段风场时间迭代未收敛，未给出能耗结果")
        arrival = begins + timedelta(seconds=metrics["duration_s"])
        envelope = safety_envelope(_leg_observed(forecasts, begins, arrival))
        emitted = dict(metrics)
        emitted["duration_s"] = truncate_reported(metrics["duration_s"], 1)
        atmosphere_start = _atmosphere(departure_values)
        atmosphere_end = _atmosphere(arrival_values)
        legs.append(
            {
                "origin": list(a),
                "destination": list(b),
                "distance_m": truncate_reported(length, 1),
                "departure_at": begins.isoformat(),
                "arrival_at": arrival.isoformat(),
                "wind_speed_mps": speed,
                "wind_from_deg": direction,
                "atmosphere_start": atmosphere_start,
                "atmosphere_end": atmosphere_end,
                "safety_envelope": envelope,
                **emitted,
            }
        )
        duration += metrics["duration_s"]
        energy += metrics["energy_wh"]
        distance += length
    magnitude, _ = _mean_wind([forecast["values"] for forecast in forecasts])
    route_envelope = _merge_envelopes([leg["safety_envelope"] for leg in legs])
    return {
        "status": "conditional",
        "model": MODEL,
        "duration_s": truncate_reported(duration, 1),
        "energy_wh": energy,
        "vehicle_source": profile.source,
        "vehicle_calibrated_at": profile.calibrated_at,
        "legs": legs,
        "safety_envelope": route_envelope,
        "precision_note": PRECISION_NOTE,
        "sensitivity": wind_sensitivity(profile, total, magnitude),
        "formula": "Vg=sqrt(Va^2-Wcross^2)+Walong; P=e_calibrated*Va*3600; E_Wh=P_W*t_s/3600",
        "limitation": "单一标定空速的稳态功率点，未编造跨空速功率曲线；未含爬升、转弯、密度对总电功率及温度对可用电量的标定修正。能耗风用端点 10 m 向量平均；阵风只进入安全包络。",
    }


def assess_route_weather(
    waypoints, scheduled_for=None, *, vehicle_key=None, custom_vehicle=None, client=None
):
    """Return public evidence, honest coverage, and conditional energy if possible.

    ``status=ok`` means forecast evidence was obtained. Flight feasibility is
    separately ``unavailable``/``infeasible``/``conditional``; never approved.
    """
    warnings = list(LIMITATIONS)
    base = {"source": SOURCE, "warnings": warnings, "dispatch_enabled": False, "constraints_evaluated": False}
    unavailable = {"status": "unavailable", "reason": "缺少真实标定机型或天气覆盖，未计算实际ETA和能耗。"}
    try:
        points = [tuple(map(float, p)) for p in waypoints]
        if len(points) < 2 or not all(
            len(p) == 2 and all(math.isfinite(v) for v in p) and -180 <= p[0] <= 180 and -90 <= p[1] <= 90
            for p in points
        ):
            raise ValueError("航线坐标无效")
        departure = (
            datetime.fromisoformat(scheduled_for.replace("Z", "+00:00"))
            if scheduled_for
            else datetime.now(UTC)
        )
        departure = departure.replace(tzinfo=evidence.LOCAL_TZ) if departure.tzinfo is None else departure
        departure = departure.astimezone(UTC)
        lengths = [_distance(a, b) for a, b in pairwise(points)]
        if sum(lengths) <= 0:
            raise ValueError("航线长度为零")
    except (ValueError, TypeError, AttributeError, OverflowError) as exc:
        return {
            **base,
            "status": "unavailable",
            "reason": str(exc),
            "samples": [],
            "coverage": {"independent_cells": 0},
            "energy": unavailable,
            "flight_feasibility": unavailable,
        }
    anchors = [points[0], _midpoint(points, lengths), points[-1]]
    try:
        forecasts = evidence.fetch_weather_batch(
            [point[1] for point in anchors],
            [point[0] for point in anchors],
            departure.isoformat(),
            forecast_days=evidence.ROUTE_FORECAST_DAYS,
            client=client,
            include_hourly=True,
        )
    except Exception:
        forecasts = [
            evidence.unavailable_weather("气象服务返回无效，未填任何数值", departure.isoformat())
            for _ in anchors
        ]
    if len(forecasts) != len(anchors):
        forecasts = [
            evidence.unavailable_weather("气象批量结果数量与锚点不一致，未填任何数值", departure.isoformat())
            for _ in anchors
        ]
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
        units = {
            "wind_speed_10m": "m/s",
            "wind_gusts_10m": "m/s",
            "wind_direction_10m": "degree FROM",
            "surface_pressure": "hPa",
            "temperature_2m": "degC",
            "relative_humidity_2m": "%",
        }
        units.update(forecast.get("hourly_units") or {})
        samples.append(
            {
                "at": name,
                "point": list(point),
                "model_point": forecast.get("model_point"),
                "status": forecast.get("status", "unavailable"),
                "valid_for": forecast.get("valid_for"),
                "fetched_at": forecast.get("fetched_at"),
                "source": forecast.get("source", SOURCE),
                "values": values,
                "omitted_fields": forecast.get("omitted_fields") or {},
                "units": units,
                "atmosphere": _atmosphere(values),
                "reason": forecast.get("reason", ""),
            }
        )
    profile, profile_reason = _load_real_profile(vehicle_key)
    if custom_vehicle is not None:
        if custom_vehicle.energy_per_meter_wh is None:
            profile, profile_reason = None, "自定义测试机型未填写巡航 Wh/m；仍可对照载荷和参考航程。"
        else:
            profile = SimpleNamespace(**custom_vehicle.model_dump(), calibrated_at=None)
    result = {
        **base,
        "status": "ok" if weather_ok else "unavailable",
        "scheduled_for": departure.isoformat(),
        "samples": samples,
        "coverage": {"independent_cells": evidence.count_independent_cells(samples)},
        "safety_envelope": safety_envelope([sample.get("values") or {} for sample in samples]),
        "energy": unavailable,
        "flight_feasibility": unavailable,
    }
    if not weather_ok:
        warnings.append("天气不可用或缺少风向/风速；未填默认风速，未执行天气约束判定。")
        result["reason"] = "航线采样位置的预报未完整获取有效风速与风向。"
    if profile is None:
        warnings.append(profile_reason)
        result["energy"] = result["flight_feasibility"] = {"status": "unavailable", "reason": profile_reason}
    elif weather_ok:
        try:
            energy = _assess_flight(points, lengths, forecasts, departure, profile)
            if custom_vehicle is not None:
                energy.update(
                    status="user_test",
                    model="用户输入空速与 Wh/m 的恒功率风三角测试",
                    vehicle_data_status="user_supplied_test",
                    vehicle_calibrated_at=None,
                )
                energy["limitation"] = "用户自定义测试参数，未经系统标定认证；未含起降、转弯、返航与备降。"
                if (
                    custom_vehicle.usable_battery_wh is not None
                    and custom_vehicle.reserve_policy_wh is not None
                ):
                    margin = (
                        custom_vehicle.usable_battery_wh
                        - custom_vehicle.reserve_policy_wh
                        - energy["energy_wh"]
                    )
                    energy["remaining_after_reserve_wh"] = margin
                    energy["budget_status"] = "exceeded" if margin < 0 else "within_test_budget"
            result["energy"] = energy
            result["safety_envelope"] = _merge_envelopes(
                [result["safety_envelope"], energy.get("safety_envelope") or {}]
            )
            result["flight_feasibility"] = {
                "status": "conditional",
                "reason": "只计算10m预报风下稳态时间/能耗；80/120/180 m 风只作为证据，未当作标定航高风。缺少性能包线与完整空域，未判真实飞行可行。",
            }
            result["constraints_evaluated"] = "wind_triangle_only"
        except (ValueError, TypeError, KeyError, OverflowError) as exc:
            reason = str(exc)
            status = "infeasible" if "侧风" in reason or "逆风" in reason else "unavailable"
            result["energy"] = result["flight_feasibility"] = {"status": status, "reason": reason}
            warnings.append(reason)
    return result
