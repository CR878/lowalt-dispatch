"""能量模型（M2 的能量部分）。

**这是全项目最容易被伪造的地方。** 机型、电池、爬升率任一参数是猜的，后面每一条
备降余量曲线、每一个"任务可行"的结论都是假的，而且没人看得出来。所以：

`load_vehicle()` 遇到 `null` 就**直接抛异常**，不做任何默认值填充。
宁可跑不起来，也不要跑出一个看起来合理的错数字。

模型本身是 v0 简化版，由学生 B 负责替换成标定模型：
- 巡航能耗 = 单位距离能耗 × 水平距离
- 爬升能耗 = 悬停单位时间能耗 × 爬升耗时（爬升过程按悬停功耗近似，偏保守）
- 风：暂不建模，见 `wind_note`
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

VEHICLE_PATH = Path(__file__).resolve().parents[1] / "scenarios" / "vehicles" / "placeholder.yaml"

REQUIRED_NUMERIC = (
    "max_payload_kg",
    "cruise_speed_mps",
    "climb_rate_mps",
    "energy_per_meter_wh",
    "energy_per_second_hover_wh",
    "usable_battery_wh",
    "reserve_policy_wh",
)

OPTIONAL_NUMERIC = (
    "descent_rate_mps",
    "max_bank_deg",
    "service_ceiling_m",
    "battery_capacity_wh",
)


class IncompleteVehicleProfile(RuntimeError):
    """机型参数缺失。这条异常是设计出来的，不是意外。"""


@dataclass(frozen=True)
class VehicleProfile:
    vehicle_key: str
    max_payload_kg: float
    cruise_speed_mps: float
    climb_rate_mps: float
    energy_per_meter_wh: float
    energy_per_second_hover_wh: float
    usable_battery_wh: float
    reserve_policy_wh: float
    descent_rate_mps: float | None = None
    max_bank_deg: float | None = None
    service_ceiling_m: float | None = None
    battery_capacity_wh: float | None = None
    source: str | None = None
    uncertainty_note: str | None = None
    is_example: bool = False
    display_name: str | None = None
    draft_geometry_vehicle_alias: str | None = None
    calibrated_at: str | None = None

    @property
    def wind_note(self) -> str:
        return "v0 未建模风场：能耗按无风计算，实际逆风会低估。B 负责替换。"


def load_vehicle(path: Path | None = None, key: str | None = None) -> VehicleProfile:
    p = path or VEHICLE_PATH
    if not p.is_file():
        raise FileNotFoundError(f"机型参数文件不存在：{p}")

    raw: dict[str, Any] = yaml.safe_load(p.read_text(encoding="utf-8"))
    vehicles: dict[str, Any] = raw.get("vehicles") or {}
    if not vehicles:
        raise IncompleteVehicleProfile(f"{p} 里没有 vehicles 段")

    vehicle_key = key or next(iter(vehicles))
    entry: dict[str, Any] = vehicles[vehicle_key]

    missing = [f for f in REQUIRED_NUMERIC if entry.get(f) is None]
    if missing:
        raise IncompleteVehicleProfile(
            "机型参数不完整，无法建立能量模型，因此不会产出任何能耗或备降余量数字。\n"
            f"  文件：{p}\n"
            f"  机型：{vehicle_key}\n"
            f"  缺失 {len(missing)} 项：{', '.join(missing)}\n"
            "  处理：由学生 A 按实际平台参数补齐（厂商手册值可用，但要在 source 里写明来源，\n"
            "        并在 uncertainty_note 里标'未标定'）。补齐前请继续使用 mock 规划器。"
        )

    alias = entry.get("draft_geometry_vehicle_alias")
    return VehicleProfile(
        vehicle_key=vehicle_key,
        **{f: float(entry[f]) for f in REQUIRED_NUMERIC},
        **{f: (float(entry[f]) if entry.get(f) is not None else None) for f in OPTIONAL_NUMERIC},
        source=entry.get("source"),
        uncertainty_note=entry.get("uncertainty_note"),
        is_example=bool(entry.get("is_example", False) or raw.get("is_example", False)),
        display_name=entry.get("display_name"),
        draft_geometry_vehicle_alias=None if alias is None else str(alias),
        calibrated_at=entry.get("calibrated_at"),
    )


# --------------------------------------------------------------------------- #
# 能耗计算
# --------------------------------------------------------------------------- #
def cruise_energy_wh(profile: VehicleProfile, distance_m: float) -> float:
    if distance_m < 0:
        raise ValueError("距离不能为负")
    return profile.energy_per_meter_wh * distance_m


def climb_energy_wh(profile: VehicleProfile, delta_alt_m: float) -> float:
    """上升为正、下降暂按 0 计（下降不耗巡航功率，但也忽略了回收/滑翔收益）。"""
    if delta_alt_m <= 0:
        return 0.0
    return profile.energy_per_second_hover_wh * (delta_alt_m / profile.climb_rate_mps)


def leg_energy_wh(profile: VehicleProfile, distance_m: float, delta_alt_m: float = 0.0) -> float:
    return cruise_energy_wh(profile, distance_m) + climb_energy_wh(profile, delta_alt_m)


def max_range_m(profile: VehicleProfile, available_energy_wh: float) -> float:
    """给定可用能量，无风平飞能走多远。不扣保留量——扣不扣由调用方决定。"""
    if available_energy_wh < 0:
        raise ValueError("可用能量不能为负")
    return available_energy_wh / profile.energy_per_meter_wh


def cruise_time_s(profile: VehicleProfile, distance_m: float) -> float:
    return distance_m / profile.cruise_speed_mps


# Real-route additions. The v0 functions above deliberately retain their exact
# outputs. These functions never invent a vehicle speed or a power coefficient.
def ground_speed_mps(
    airspeed_mps: float,
    track_bearing_deg: float,
    wind_speed_mps: float,
    wind_from_deg: float,
) -> float:
    """Fixed-TAS wind triangle with crab correction (bearing north=0/east=90).

    Va + W = Vg, so Vg = sqrt(Va² - W_cross²) + W_along.
    The wind direction is the meteorological FROM direction, not velocity TO.
    Source: vector addition; FAA Pilot's Handbook of Aeronautical Knowledge,
    chapter 16, Navigation, wind triangle / wind correction angle.
    https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak
    """
    if not all(math.isfinite(v) for v in (airspeed_mps, track_bearing_deg, wind_speed_mps, wind_from_deg)):
        raise ValueError("风场和空速必须是有限值")
    if airspeed_mps <= 0 or wind_speed_mps < 0:
        raise ValueError("空速必须为正，风速不能为负")
    angle = math.radians(wind_from_deg + 180.0 - track_bearing_deg)
    along = wind_speed_mps * math.cos(angle)
    cross = wind_speed_mps * math.sin(angle)
    if abs(cross) >= airspeed_mps:
        raise ValueError("侧风达到或超过空速，无法保持地面航迹")
    ground = math.sqrt(max(0.0, airspeed_mps ** 2 - cross ** 2)) + along
    if ground <= 0:
        raise ValueError("逆风阻止前进，无法保持正地速")
    return ground


def wind_leg_energy_wh(
    profile: VehicleProfile,
    distance_m: float,
    track_bearing_deg: float,
    wind_speed_mps: float,
    wind_from_deg: float,
) -> dict[str, float]:
    """Energy at one calibrated true-airspeed operating point, P × time.

    P_W = e_Wh/m × Va_m/s × 3600. This is NOT a guessed power curve: the
    supplied profile's calibrated calm-air energy/m fixes this single power
    point. Wind changes elapsed time; turns/climb/gust control and density
    effects on total electrical power require additional platform calibration.
    """
    if not math.isfinite(distance_m) or distance_m < 0:
        raise ValueError("航段距离必须是非负有限值")
    if not math.isfinite(profile.energy_per_meter_wh) or profile.energy_per_meter_wh <= 0:
        raise ValueError("需要正的标定巡航单位距离能耗")
    speed = ground_speed_mps(profile.cruise_speed_mps, track_bearing_deg, wind_speed_mps, wind_from_deg)
    duration = distance_m / speed
    power_w = profile.energy_per_meter_wh * profile.cruise_speed_mps * 3600.0
    return {"ground_speed_mps": speed, "duration_s": duration, "energy_wh": power_w * duration / 3600.0, "power_w": power_w}


def moist_air_density_kg_m3(temperature_c: float, relative_humidity_pct: float, pressure_hpa: float) -> float:
    """Ideal moist air rho = (p-e)/(Rd*T) + e/(Rv*T), actual surface pressure.

    Rd=287.05 and Rv=461.5 J/(kg K); saturation pressure is Buck's water/ice
    equation (1996 revision), not a battery-capacity guess. Buck's original
    method: J. Applied Meteorology 20:1527–1532 (1981),
    doi:10.1175/1520-0450(1981)020<1527:NEFCTV>2.0.CO;2.
    """
    if not all(math.isfinite(v) for v in (temperature_c, relative_humidity_pct, pressure_hpa)):
        raise ValueError("温湿压必须为有限值")
    if not -80 <= temperature_c <= 50 or not 0 <= relative_humidity_pct <= 100 or pressure_hpa <= 0:
        raise ValueError("温湿压超出公式适用范围")
    if temperature_c >= 0:
        saturated_pa = 611.21 * math.exp((18.678 - temperature_c / 234.5) * temperature_c / (257.14 + temperature_c))
    else:
        saturated_pa = 611.15 * math.exp((23.036 - temperature_c / 333.7) * temperature_c / (279.82 + temperature_c))
    vapor_pa = saturated_pa * relative_humidity_pct / 100.0
    pressure_pa = pressure_hpa * 100.0
    if vapor_pa >= pressure_pa:
        raise ValueError("水汽分压必须低于总压")
    kelvin = temperature_c + 273.15
    return (pressure_pa - vapor_pa) / (287.05 * kelvin) + vapor_pa / (461.5 * kelvin)


def wind_sensitivity(profile: VehicleProfile, distance_m: float, wind_speed_mps: float) -> list[dict]:
    """Conditional comparison using the supplied wind magnitude and profile.

    Direction scenarios are explicit counterfactuals, never forecast values.
    """
    result = []
    for label, speed, direction in (("calm", 0.0, 0.0), ("tailwind", wind_speed_mps, 270.0), ("headwind", wind_speed_mps, 90.0), ("crosswind", wind_speed_mps, 0.0)):
        try:
            values = wind_leg_energy_wh(profile, distance_m, 90.0, speed, direction)
            result.append({"scenario": label, "status": "conditional", "wind_speed_mps": speed, **values})
        except ValueError as exc:
            result.append({"scenario": label, "status": "infeasible", "wind_speed_mps": speed, "reason": str(exc)})
    return result
