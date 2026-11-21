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
    ground_speed_mps,
    load_vehicle,
    moist_air_density_kg_m3,
    wind_leg_energy_wh,
    wind_sensitivity,
)

SOURCE = "Open-Meteo / hourly forecast"
MODEL = "fixed calibrated true airspeed; wind triangle + P × time"
LIMITATIONS = (
    "公开预报是模式网格值，不是航高实测。已请求 10/80/120/180 m 风、云量、露点、CAPE 和冻结高度；接口未返回的字段保持 null，不用邻近高度代替。未提供建筑尾流或阵风控制模型。",
    "采样沿球面弧长等距展开，点数由 step_m=min(2000, max(500, L/20)) 与 count=max(8, ceil(L/step_m))+1 决定，再把这 count 个点均匀铺在总弧长上。independent_cells 只按返回的 model_point 去重；没有 model_point 时为 null，不用请求坐标代替。",
    "安全包络取覆盖时段内的阵风最大、降水最大和能见度最小；效率风优先用同时具备风速和风向的 120 m，缺测时才退回 10 m 并标明 surface_10m。温湿度与气压进入湿空气密度及理想旋翼诱导功率敏感性；总电功率和低温电池容量仍需真实平台标定，未套用经验折减系数。",
)
# 0.1 m matches the existing one-decimal route length. Displayed duration keeps
# one decimal; the ETA loop itself stops only when the correction is strictly
# under 5 s, so that decimal is not a convergence claim.
PRECISION_NOTE = (
    "报出的 clearance_m、length_m、distance_m 和 s_m 截断到 0.1 m，duration_s 截断到 0.1 s。"
    "0.1 s 只是输出位数。到达时刻迭代最多 5 轮，收敛判据是严格小于 5 s。"
    "能耗仍按未截断的距离和时间计算。20 m 物理净空判据未改，grid_clearance_m 仍是未截断的栅格排除半径。"
)
MAX_ETA_ITERATIONS = 5
ETA_CONVERGENCE_S = 5.0
SENSITIVITY_NOTE = "wind_sensitivity 固定航向 90° 只是演示假设，不是本航线各段真实 bearing，不作为航线判定输入。"


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


def auto_step_m(length_m: float) -> float:
    """Interpret the unspecified clamp(2000, 500, L/20) as a bounded step.

    The recovered text does not define argument order. The written bounds are
    2000 m, 500 m, and L/20. step_m = min(2000, max(500, L/20)) stays inside
    those bounds. It is not a clearance or weather threshold.
    """
    return min(2000.0, max(500.0, length_m / 20.0))


def sample_count_for(length_m: float, step_m: float) -> int:
    return max(8, math.ceil(length_m / step_m)) + 1


def _point_at_distance(points, cumulative, target):
    if target <= 0:
        return points[0]
    if target >= cumulative[-1]:
        return points[-1]
    for index in range(1, len(points)):
        start_s = cumulative[index - 1]
        end_s = cumulative[index]
        if target > end_s:
            continue
        span = end_s - start_s
        if span <= 0:
            return points[index]
        ratio = (target - start_s) / span
        start, end = points[index - 1], points[index]
        return (start[0] + ratio * (end[0] - start[0]), start[1] + ratio * (end[1] - start[1]))
    return points[-1]


def sample_by_arc_length(points, step_m: float | None = None):
    """Place count points uniformly along spherical arc length.

    count = max(8, ceil(L/step_m))+1, then the points are spaced by L/(count-1).
    That uniform count is how the conflicting "round step_m" wording is resolved:
    a rounded step would leave a remainder, while the count formula asks for equal
    spacing. Endpoints stay exact. Zero-length repeats add no arc and are kept
    in the polyline.
    """
    if len(points) < 2:
        raise ValueError("航线过短，无法采样")
    cumulative = [0.0]
    for start, end in pairwise(points):
        cumulative.append(cumulative[-1] + _distance(start, end))
    total = cumulative[-1]
    if total <= 0:
        raise ValueError("航线长度为零")
    step = auto_step_m(total) if step_m is None else float(step_m)
    if not math.isfinite(step) or step <= 0:
        raise ValueError("采样步长无效")
    count = sample_count_for(total, step)
    samples = []
    for index in range(count):
        if index == 0:
            distance = 0.0
            point = points[0]
        elif index == count - 1:
            distance = total
            point = points[-1]
        else:
            distance = total * index / (count - 1)
            point = _point_at_distance(points, cumulative, distance)
        samples.append({"index": index, "s_m": distance, "point": point})
    return samples, step, total


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


def _valid_wind_pair(speed, direction) -> bool:
    return (
        isinstance(speed, (int, float))
        and not isinstance(speed, bool)
        and isinstance(direction, (int, float))
        and not isinstance(direction, bool)
        and math.isfinite(speed)
        and math.isfinite(direction)
        and speed >= 0
        and 0 <= direction <= 360
    )


def _select_wind(values):
    """Prefer sourced 120 m wind. 10 m is a labeled fallback and does not fill 120 m."""
    if not isinstance(values, dict):
        return None
    if _valid_wind_pair(values.get("wind_speed_120m"), values.get("wind_direction_120m")):
        return float(values["wind_speed_120m"]), float(values["wind_direction_120m"]), "wind_speed_120m", False
    if _valid_wind_pair(values.get("wind_speed_10m"), values.get("wind_direction_10m")):
        return float(values["wind_speed_10m"]), float(values["wind_direction_10m"]), "surface_10m", True
    return None


def _mean_components(pairs):
    east = north = 0.0
    for speed, direction in pairs:
        east -= speed * math.sin(math.radians(direction)) / len(pairs)
        north -= speed * math.cos(math.radians(direction)) / len(pairs)
    return math.hypot(east, north), math.degrees(math.atan2(-east, -north)) % 360


def _crosswind_mps(speed, direction, bearing):
    angle = math.radians(direction + 180.0 - bearing)
    return abs(speed * math.sin(angle))


def _manufacturer_reference(vehicle_key):
    """Catalog reference speed only when that field points at a source URL."""
    if not vehicle_key:
        return None
    from services.assistant.vehicles import catalog

    for vehicle in catalog()["vehicles"]:
        if vehicle.get("id") != vehicle_key:
            continue
        speed = vehicle.get("reference_speed_mps")
        sources = vehicle.get("sources") or []
        index = (vehicle.get("field_sources") or {}).get("reference_speed_mps")
        if not isinstance(speed, (int, float)) or isinstance(speed, bool) or speed <= 0:
            return None
        if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < len(sources):
            return None
        source = sources[index]
        url = source.get("url") if isinstance(source, dict) else None
        if not url:
            return None
        return {
            "speed_mps": float(speed),
            "time_basis": "manufacturer_reference",
            "degraded": False,
            "speed_source": url,
            "source_title": source.get("title"),
            "source_fetched_at": source.get("fetched_at"),
            "reason": "使用厂家目录中有来源的参考速度估算到达时刻；该速度不是标定空速，也不能换算能耗。",
        }
    return None


def _resolve_speed(vehicle_key, custom_vehicle, assumed_airspeed_mps, profile):
    if custom_vehicle is not None and isinstance(custom_vehicle.cruise_speed_mps, (int, float)):
        if math.isfinite(custom_vehicle.cruise_speed_mps) and custom_vehicle.cruise_speed_mps > 0:
            return {
                "speed_mps": float(custom_vehicle.cruise_speed_mps),
                "time_basis": "assumed_constant_speed",
                "degraded": True,
                "speed_source": "caller:custom_vehicle.cruise_speed_mps",
                "reason": "调用方给出了测试空速，不是标定空速，也不是厂家参考速度。",
            }
    if profile is not None and isinstance(profile.cruise_speed_mps, (int, float)) and profile.cruise_speed_mps > 0:
        return {
            "speed_mps": float(profile.cruise_speed_mps),
            "time_basis": "calibrated_airspeed",
            "degraded": False,
            "speed_source": getattr(profile, "source", "") or "calibrated_profile",
            "reason": "",
        }
    referenced = _manufacturer_reference(vehicle_key)
    if referenced is not None:
        return referenced
    if isinstance(assumed_airspeed_mps, (int, float)) and not isinstance(assumed_airspeed_mps, bool):
        if math.isfinite(assumed_airspeed_mps) and assumed_airspeed_mps > 0:
            return {
                "speed_mps": float(assumed_airspeed_mps),
                "time_basis": "assumed_constant_speed",
                "degraded": True,
                "speed_source": "caller:assumed_airspeed_mps",
                "reason": "调用方显式给出假设空速。规格允许这个时间基准，但没有给出可默认的数值。",
            }
    return None


def _values_if_covered(forecast, instant):
    if not isinstance(forecast, dict) or forecast.get("status") != "ok":
        return None
    try:
        return evidence.values_at(forecast, instant)
    except (ValueError, TypeError, OverflowError):
        return None


def estimate_arrival_times(samples, forecasts, departure, speed_mps):
    """Iterate ETAs. At most 5 rounds, and stop when the correction is strictly under 5 s.

    A segment with no usable wind keeps the airspeed duration and is marked
    unadjusted. It is not treated as calm. An unflyable crosswind or headwind
    is returned to the caller instead of escaping as an exception.
    """
    etas = [departure + timedelta(seconds=item["s_m"] / speed_mps) for item in samples]
    converged = False
    iterations = 0
    max_delta_s = None
    infeasible = None
    segment_notes = []
    degraded = False
    for iteration in range(1, MAX_ETA_ITERATIONS + 1):
        iterations = iteration
        new_etas = [departure]
        segment_notes = []
        degraded = False
        for index in range(len(samples) - 1):
            distance = samples[index + 1]["s_m"] - samples[index]["s_m"]
            if distance <= 0:
                new_etas.append(new_etas[-1])
                segment_notes.append({"index": index, "wind_adjusted": False, "reason": "零长度段"})
                continue
            bearing = _bearing(samples[index]["point"], samples[index + 1]["point"])
            start_values = _values_if_covered(forecasts[index], etas[index])
            end_values = _values_if_covered(forecasts[index + 1], etas[index + 1])
            selected = (_select_wind(start_values), _select_wind(end_values))
            if start_values is None or end_values is None or any(item is None for item in selected):
                new_etas.append(new_etas[-1] + timedelta(seconds=distance / speed_mps))
                segment_notes.append(
                    {
                        "index": index,
                        "wind_adjusted": False,
                        "reason": "该段缺少可用风，未用零风代替，时长保持空速初值",
                    }
                )
                continue
            if any(item[3] for item in selected):
                degraded = True
            try:
                speed, direction = _mean_components([(item[0], item[1]) for item in selected])
                ground = ground_speed_mps(speed_mps, bearing, speed, direction)
            except ValueError as exc:
                infeasible = str(exc)
                break
            new_etas.append(new_etas[-1] + timedelta(seconds=distance / ground))
            segment_notes.append(
                {
                    "index": index,
                    "wind_adjusted": True,
                    "vertical_wind_source": "surface_10m" if any(item[3] for item in selected) else "wind_speed_120m",
                    "crosswind_mps": max(_crosswind_mps(item[0], item[1], bearing) for item in selected),
                }
            )
        if infeasible:
            break
        max_delta_s = max(abs((new - old).total_seconds()) for new, old in zip(new_etas, etas, strict=True))
        etas = new_etas
        if max_delta_s < ETA_CONVERGENCE_S:
            converged = True
            break
    return etas, {
        "iteration_count": iterations,
        "converged": converged and infeasible is None,
        "max_eta_delta_s": max_delta_s,
        "infeasible": infeasible,
        "vertical_wind_degraded": degraded,
        "segment_notes": segment_notes,
    }


def _mean_or_none(rows, field):
    numbers = [float(row[field]) for row in rows if isinstance(row, dict) and _finite(row.get(field))]
    return sum(numbers) / len(numbers) if numbers else None


def leg_envelopes(samples, point_values, forecasts, etas):
    """Safety uses the worst overlapping hour. Efficiency uses the vector mean."""
    legs = []
    for index in range(len(samples) - 1):
        distance = samples[index + 1]["s_m"] - samples[index]["s_m"]
        if distance <= 0:
            continue
        bearing = _bearing(samples[index]["point"], samples[index + 1]["point"])
        observed = []
        if etas[index] is not None and etas[index + 1] is not None:
            observed.extend(_leg_observed(forecasts[index : index + 2], etas[index], etas[index + 1]))
        observed.extend(row for row in (point_values[index], point_values[index + 1]) if isinstance(row, dict))
        envelope = safety_envelope(observed)
        selected = [item for item in (_select_wind(point_values[index]), _select_wind(point_values[index + 1])) if item]
        envelope["crosswind_max"] = (
            max(_crosswind_mps(item[0], item[1], bearing) for item in selected) if selected else None
        )
        envelope["weather_codes"] = [row["weather_code"] for row in observed if _finite(row.get("weather_code"))]
        envelope["weather_code_worst"] = None
        envelope["weather_code_worst_reason"] = "没有来源支持的天气代码严重度排序，不把代码编成最不利等级"
        clouds = [float(row["cloud_cover"]) for row in observed if _finite(row.get("cloud_cover"))]
        envelope["cloud_cover_max"] = max(clouds) if clouds else None
        efficiency = {
            "wind_vector_mean_mps": None,
            "wind_from_deg": None,
            "vertical_wind_source": None,
            "degraded": None,
        }
        if len(selected) == 2:
            speed, direction = _mean_components([(item[0], item[1]) for item in selected])
            efficiency.update(
                wind_vector_mean_mps=speed,
                wind_from_deg=direction,
                vertical_wind_source="surface_10m" if any(item[3] for item in selected) else "wind_speed_120m",
                degraded=any(item[3] for item in selected),
            )
        ends = [point_values[index], point_values[index + 1]]
        if all(isinstance(item, dict) for item in ends):
            efficiency["temperature_mean"] = _mean_or_none(ends, "temperature_2m")
            efficiency["pressure_mean"] = _mean_or_none(ends, "surface_pressure")
            efficiency["humidity_mean"] = _mean_or_none(ends, "relative_humidity_2m")
        legs.append(
            {
                "index": index,
                "origin": list(samples[index]["point"]),
                "destination": list(samples[index + 1]["point"]),
                "distance_m": truncate_reported(distance, 1),
                "bearing_deg": bearing,
                "safety_envelope": envelope,
                "efficiency": efficiency,
            }
        )
    return legs


def _valid_model_point(point) -> bool:
    if not isinstance(point, (list, tuple)) or len(point) < 2:
        return False
    try:
        pair = (float(point[0]), float(point[1]))
    except (TypeError, ValueError):
        return False
    return all(math.isfinite(value) for value in pair)


def _coverage(samples, length_m):
    present = [sample.get("model_point") for sample in samples if _valid_model_point(sample.get("model_point"))]
    if not present:
        cells = None
        spacing_km = None
        statement = "未获得模式格点 model_point，independent_cells 为 null，不用请求坐标代替。"
    else:
        cells = evidence.count_independent_cells(samples)
        distinct = []
        for point in present:
            key = (float(point[0]), float(point[1]))
            if key not in distinct:
                distinct.append(key)
        gaps = [
            _distance(distinct[left], distinct[right]) / 1000.0
            for left in range(len(distinct))
            for right in range(left + 1, len(distinct))
        ]
        spacing_km = min(gaps) if gaps else None
        statement = (
            f"{len(samples)} 个采样点落在 {cells} 个模式格点内，实际独立信息量 {cells}；"
            "不代表沿线连续气象真值。inferred_model_point_spacing_km 只是返回格点的最小球面间距，"
            "不是模式分辨率，不参与判定。"
        )
    count = len(samples)
    return {
        "sample_count": count,
        "spacing_m": truncate_reported(length_m / (count - 1), 1) if count >= 2 else None,
        "independent_cells": cells,
        "model_grid_resolution_km": None,
        "inferred_model_point_spacing_km": None if spacing_km is None else round(spacing_km, 2),
        "inferred_spacing_basis": None
        if spacing_km is None
        else "proxy_min_geodesic_separation_of_returned_model_points",
        "statement": statement,
    }


def _over_building(point, obstacles):
    if obstacles is None:
        return "unknown", "未提供建筑几何，不判断采样点是否落在建筑内"
    try:
        from shapely.geometry import Point, shape
        from shapely.strtree import STRtree

        geometries = []
        for feature in obstacles.get("features") or []:
            geometry = feature.get("geometry") if isinstance(feature, dict) else None
            if geometry:
                geometries.append(shape(geometry))
        if not geometries:
            return False, "已检查传入的建筑集合，没有多边形包含该点"
        hits = STRtree(geometries).query(Point(point[0], point[1]), predicate="intersects")
        return len(hits) > 0, "依据调用方传入的建筑几何"
    except Exception:
        return "unknown", "建筑几何无法读取，未判断采样点是否落在建筑内"


def _request_stats(forecasts):
    stats = []
    seen = set()
    for forecast in forecasts:
        item = forecast.get("request_stats") if isinstance(forecast, dict) else None
        if not isinstance(item, dict) or item.get("batch_index") in seen:
            continue
        seen.add(item.get("batch_index"))
        stats.append(item)
    return stats


def assess_route_weather(
    waypoints,
    scheduled_for=None,
    *,
    vehicle_key=None,
    custom_vehicle=None,
    client=None,
    assumed_airspeed_mps=None,
    obstacles=None,
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
            "coverage": {"independent_cells": None, "model_grid_resolution_km": None, "sample_count": 0},
            "energy": unavailable,
            "flight_feasibility": unavailable,
        }
    arc_samples, step_m, total = sample_by_arc_length(points)
    try:
        forecasts = evidence.fetch_weather_batch(
            [point[1] for point in (item["point"] for item in arc_samples)],
            [point[0] for point in (item["point"] for item in arc_samples)],
            departure.isoformat(),
            forecast_days=evidence.ROUTE_FORECAST_DAYS,
            client=client,
            include_hourly=True,
        )
    except Exception:
        forecasts = [
            evidence.unavailable_weather("气象服务返回无效，未填任何数值", departure.isoformat())
            for _ in arc_samples
        ]
    if len(forecasts) != len(arc_samples):
        forecasts = [
            evidence.unavailable_weather("气象批量结果数量与采样点不一致，未填任何数值", departure.isoformat())
            for _ in arc_samples
        ]
    profile, profile_reason = _load_real_profile(vehicle_key)
    if custom_vehicle is not None and custom_vehicle.energy_per_meter_wh is not None:
        profile = SimpleNamespace(**custom_vehicle.model_dump(), calibrated_at=None)
    elif custom_vehicle is not None:
        profile, profile_reason = None, "自定义测试机型未填写巡航 Wh/m；仍可对照载荷和参考航程。"
    speed_info = _resolve_speed(vehicle_key, custom_vehicle, assumed_airspeed_mps, profile)
    eta_meta = {
        "iteration_count": 0,
        "converged": False,
        "max_eta_delta_s": None,
        "infeasible": None,
        "vertical_wind_degraded": False,
        "segment_notes": [],
    }
    etas = [None] * len(arc_samples)
    if speed_info is not None:
        etas, eta_meta = estimate_arrival_times(arc_samples, forecasts, departure, speed_info["speed_mps"])
    point_values = []
    samples = []
    for sample, forecast, eta in zip(arc_samples, forecasts, etas, strict=True):
        values = _values_if_covered(forecast, eta) if eta is not None else None
        selected = _select_wind(values)
        covered = selected is not None
        over, over_reason = _over_building(sample["point"], obstacles)
        role = "origin" if sample["index"] == 0 else "destination" if sample["index"] == len(arc_samples) - 1 else "along_track"
        reason = ""
        if eta is None:
            reason = "无可用空速，未估算到达时刻，未用起飞时刻代替"
        elif values is None:
            reason = forecast.get("reason") or "该点预报不覆盖其到达时刻，未外推"
        elif selected is None:
            reason = "到达时刻缺少可用的 120 m 或 10 m 风，未用零风或邻近高度代替"
        samples.append(
            {
                "at": role,
                "index": sample["index"],
                "s_m": truncate_reported(sample["s_m"], 1),
                "eta": eta.isoformat() if eta is not None else None,
                "point": [sample["point"][0], sample["point"][1]],
                "model_point": forecast.get("model_point") if _valid_model_point(forecast.get("model_point")) else None,
                "model": forecast.get("model"),
                "over_building": over,
                "over_building_reason": over_reason,
                "status": "ok" if covered else "unavailable",
                "valid_for": eta.isoformat() if covered else None,
                "fetched_at": forecast.get("fetched_at"),
                "source": forecast.get("source", SOURCE),
                "values": values or {},
                "omitted_fields": forecast.get("omitted_fields") or {},
                "units": {
                    "wind_speed_10m": "m/s",
                    "wind_speed_120m": "m/s",
                    "wind_gusts_10m": "m/s",
                    "wind_direction_10m": "degree FROM",
                    "wind_direction_120m": "degree FROM",
                    "surface_pressure": "hPa",
                    "temperature_2m": "degC",
                    "relative_humidity_2m": "%",
                    **(forecast.get("hourly_units") or {}),
                },
                "atmosphere": _atmosphere(values or {}),
                "reason": reason,
            }
        )
        point_values.append(values)
    weather_ok = all(sample["status"] == "ok" for sample in samples)
    legs = leg_envelopes(arc_samples, point_values, forecasts, etas) if speed_info is not None else []
    envelopes = [leg["safety_envelope"] for leg in legs] or [safety_envelope(point_values)]
    route_envelope = _merge_envelopes(envelopes)
    for leg in legs:
        if _finite(leg["safety_envelope"].get("crosswind_max")) and (
            not _finite(route_envelope.get("crosswind_max"))
            or leg["safety_envelope"]["crosswind_max"] > route_envelope["crosswind_max"]
        ):
            route_envelope["crosswind_max"] = leg["safety_envelope"]["crosswind_max"]
    vertical_sources = {
        note.get("vertical_wind_source")
        for note in eta_meta["segment_notes"]
        if note.get("wind_adjusted") and note.get("vertical_wind_source")
    }
    if "surface_10m" in vertical_sources or eta_meta["vertical_wind_degraded"]:
        vertical_wind_source, vertical_wind_degraded = "surface_10m", True
    elif "wind_speed_120m" in vertical_sources:
        vertical_wind_source, vertical_wind_degraded = "wind_speed_120m", False
    else:
        vertical_wind_source, vertical_wind_degraded = None, False
    result = {
        **base,
        "operationally_approved": False,
        "environment_verdict": None,
        "status": "ok" if weather_ok else "unavailable",
        "scheduled_for": departure.isoformat(),
        "samples": samples,
        "sample_step_m": step_m,
        "coverage": _coverage(samples, total),
        "safety_envelope": route_envelope,
        "energy": unavailable,
        "flight_feasibility": unavailable,
        "vertical_wind_source": vertical_wind_source,
        "vertical_wind_degraded": vertical_wind_degraded,
        "provenance": {
            "time_basis": None if speed_info is None else speed_info["time_basis"],
            "speed_mps": None if speed_info is None else speed_info["speed_mps"],
            "speed_source": None if speed_info is None else speed_info["speed_source"],
            "speed_degraded": None if speed_info is None else speed_info["degraded"],
            "source_title": None if speed_info is None else speed_info.get("source_title"),
            "source_fetched_at": None if speed_info is None else speed_info.get("source_fetched_at"),
            "iteration_count": eta_meta["iteration_count"],
            "converged": eta_meta["converged"],
            "max_eta_delta_s": eta_meta["max_eta_delta_s"],
            "model": None,
            "model_grid_resolution_km": None,
            "weather_request_stats": _request_stats(forecasts),
        },
        "honesty": {
            "factor_matrix": "not_evaluated",
            "environment_verdict": "not_evaluated",
            "eta": "evaluated" if speed_info is not None and eta_meta["infeasible"] is None else "unavailable",
            "note": "P2 因素矩阵和 verdict 引擎未实现，因此不会给出 pass。",
        },
        "gaps": [],
        "route_legs": legs,
    }
    if speed_info is None:
        result["gaps"].append({"item": "eta", "reason": "没有标定空速、有来源的厂家参考速度，也没有调用方显式给出的假设空速。不编造空速。"})
        result["reason"] = result["gaps"][0]["reason"]
        warnings.append(profile_reason)
    elif speed_info["degraded"]:
        result["gaps"].append({"item": "time_basis", "reason": speed_info["reason"]})
        warnings.append(speed_info["reason"])
    if eta_meta["infeasible"]:
        status = "infeasible" if ("侧风" in eta_meta["infeasible"] or "逆风" in eta_meta["infeasible"]) else "unavailable"
        result["energy"] = result["flight_feasibility"] = {"status": status, "reason": eta_meta["infeasible"]}
        result["constraints_evaluated"] = "wind_triangle_only"
        warnings.append(eta_meta["infeasible"])
        return result
    if not weather_ok:
        warnings.append("部分采样点没有覆盖其到达时刻的预报；未外推，未把缺测填成 0。")
        result["reason"] = "至少一个采样点的到达时刻预报不可用。"
    if speed_info is None or profile is None or not _finite(getattr(profile, "energy_per_meter_wh", None)):
        reason = profile_reason if speed_info is None or profile is None else "有到达时刻可用的速度，但没有标定或调用方给出的 Wh/m，未计算能耗。"
        if speed_info is not None and profile is None:
            reason = profile_reason or speed_info["reason"]
        result["energy"] = {"status": "unavailable", "reason": reason}
        result["flight_feasibility"] = {"status": "unavailable", "reason": reason}
        if reason:
            warnings.append(reason)
        return result
    if not weather_ok or any(not note.get("wind_adjusted") for note in eta_meta["segment_notes"] if note.get("reason") != "零长度段"):
        result["energy"] = {"status": "unavailable", "reason": "有采样点缺少可用于风三角的风，未用零风计算能耗。"}
        result["flight_feasibility"] = result["energy"]
        return result
    try:
        duration = energy = 0.0
        timed_legs = []
        for leg, _note in zip(legs, (item for item in eta_meta["segment_notes"] if item.get("reason") != "零长度段"), strict=True):
            distance = arc_samples[leg["index"] + 1]["s_m"] - arc_samples[leg["index"]]["s_m"]
            metrics = wind_leg_energy_wh(
                profile,
                distance,
                leg["bearing_deg"],
                leg["efficiency"]["wind_vector_mean_mps"],
                leg["efficiency"]["wind_from_deg"],
            )
            duration += metrics["duration_s"]
            energy += metrics["energy_wh"]
            timed_legs.append(
                {
                    **leg,
                    **metrics,
                    "duration_s": truncate_reported(metrics["duration_s"], 1),
                    "departure_at": etas[leg["index"]].isoformat(),
                    "arrival_at": etas[leg["index"] + 1].isoformat(),
                    "atmosphere_start": _atmosphere(point_values[leg["index"]] or {}),
                    "atmosphere_end": _atmosphere(point_values[leg["index"] + 1] or {}),
                    "wind_speed_mps": leg["efficiency"]["wind_vector_mean_mps"],
                    "wind_from_deg": leg["efficiency"]["wind_from_deg"],
                }
            )
        magnitude = max(leg["efficiency"]["wind_vector_mean_mps"] or 0.0 for leg in legs)
        result["energy"] = {
            "status": "conditional",
            "model": MODEL,
            "duration_s": truncate_reported(duration, 1),
            "energy_wh": energy,
            "vehicle_source": getattr(profile, "source", None),
            "vehicle_calibrated_at": getattr(profile, "calibrated_at", None),
            "legs": timed_legs,
            "safety_envelope": route_envelope,
            "precision_note": PRECISION_NOTE,
            "sensitivity": wind_sensitivity(profile, total, magnitude),
            "sensitivity_note": SENSITIVITY_NOTE,
            "formula": "Vg=sqrt(Va^2-Wcross^2)+Walong; P=e_calibrated*Va*3600; E_Wh=P_W*t_s/3600",
            "limitation": "到达时刻最多迭代 5 轮，收敛判据严格小于 5 s。能耗风是各采样段端点的向量平均；阵风只进入安全包络。",
        }
        if custom_vehicle is not None:
            result["energy"].update(
                status="user_test",
                model="用户输入空速与 Wh/m 的恒功率风三角测试",
                vehicle_data_status="user_supplied_test",
                vehicle_calibrated_at=None,
            )
            if custom_vehicle.usable_battery_wh is not None and custom_vehicle.reserve_policy_wh is not None:
                margin = custom_vehicle.usable_battery_wh - custom_vehicle.reserve_policy_wh - energy
                result["energy"]["remaining_after_reserve_wh"] = margin
                result["energy"]["budget_status"] = "exceeded" if margin < 0 else "within_test_budget"
        result["flight_feasibility"] = {
            "status": "conditional",
            "reason": "只做了风三角时间/能耗。120 m 风缺测时已标明退回 10 m。没有性能包线和完整空域，未判真实飞行可行。",
        }
        result["constraints_evaluated"] = "wind_triangle_only"
    except (ValueError, TypeError, KeyError, OverflowError) as exc:
        reason = str(exc)
        status = "infeasible" if "侧风" in reason or "逆风" in reason else "unavailable"
        result["energy"] = result["flight_feasibility"] = {"status": status, "reason": reason}
        if status == "infeasible":
            result["constraints_evaluated"] = "wind_triangle_only"
        warnings.append(reason)
    return result
