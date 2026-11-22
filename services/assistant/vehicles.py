"""Sourced manufacturer catalogue and explicitly user-supplied test profiles."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, model_validator

from sim.energy import ground_speed_mps

CATALOG_PATH = Path(__file__).resolve().parents[2] / "scenarios/vehicles/delivery_catalog.json"


class CustomVehicle(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)
    schema_version: int = Field(default=1, ge=1, le=1)
    display_name: str = Field(min_length=1, max_length=100)
    source: str = Field(min_length=1, max_length=1000)
    notes: str = Field(default="", max_length=2000)
    max_payload_kg: float = Field(gt=0, le=1000)
    cruise_speed_mps: float = Field(gt=0, le=100)
    max_speed_mps: float | None = Field(default=None, gt=0, le=150)
    max_range_km: float | None = Field(default=None, gt=0, le=2000)
    battery_capacity_wh: float | None = Field(default=None, gt=0, le=1_000_000)
    usable_battery_wh: float | None = Field(default=None, gt=0, le=1_000_000)
    reserve_policy_wh: float | None = Field(default=None, ge=0, le=1_000_000)
    energy_per_meter_wh: float | None = Field(default=None, gt=0, le=100)
    max_wind_mps: float | None = Field(default=None, gt=0, le=100)
    min_temperature_c: float | None = Field(default=None, ge=-80, le=80)
    max_temperature_c: float | None = Field(default=None, ge=-80, le=80)

    @model_validator(mode="after")
    def consistent(self):
        if self.max_speed_mps is not None and self.cruise_speed_mps > self.max_speed_mps:
            raise ValueError("测试巡航空速不能大于最大速度")
        if (
            self.usable_battery_wh is not None
            and self.battery_capacity_wh is not None
            and self.usable_battery_wh > self.battery_capacity_wh
        ):
            raise ValueError("可用电量不能超过标称电量")
        if self.reserve_policy_wh is not None and (
            self.usable_battery_wh is None or self.reserve_policy_wh >= self.usable_battery_wh
        ):
            raise ValueError("保留电量须小于已填写的可用电量")
        if (
            self.min_temperature_c is not None
            and self.max_temperature_c is not None
            and self.min_temperature_c >= self.max_temperature_c
        ):
            raise ValueError("最低工作温度须小于最高工作温度")
        return self


class VehicleSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    vehicle_key: str | None = Field(default=None, max_length=100, pattern=r"^[\w-]+$")
    custom_vehicle: CustomVehicle | None = None
    payload_kg: float | None = Field(default=None, ge=0, le=1000)

    @model_validator(mode="after")
    def one_vehicle(self):
        if self.vehicle_key and self.custom_vehicle:
            raise ValueError("请选择目录机型或自定义机型之一")
        if self.vehicle_key and not any(v["id"] == self.vehicle_key for v in catalog()["vehicles"]):
            raise ValueError("机型标识不存在，请重新选择")
        return self


class VehicleTestInput(VehicleSelection):
    distance_km: float = Field(gt=0, le=2000)
    wind_speed_mps: float = Field(ge=0, le=100)
    wind_direction: str = Field(pattern=r"^(headwind|tailwind|crosswind|calm)$")

    @model_validator(mode="after")
    def test_required(self):
        if not self.vehicle_key and not self.custom_vehicle:
            raise ValueError("测试前请选择机型")
        if self.wind_direction == "calm" and self.wind_speed_mps != 0:
            raise ValueError("无风情景的风速必须为0")
        return self


def catalog():
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def selected_vehicle(selection: VehicleSelection):
    if selection.custom_vehicle:
        value = selection.custom_vehicle.model_dump()
        return {
            **value,
            "id": "custom",
            "data_status": "user_supplied_test",
            "reference_speed_mps": value["cruise_speed_mps"],
            "calibrated_at": None,
            "range_note": "用户输入的测试航程上限，未由系统核实测量条件。",
            "limitations": ["自定义参数仅用于测试；填写来源不等于已完成第三方标定。"],
        }
    return next((v for v in catalog()["vehicles"] if v["id"] == selection.vehicle_key), None)


def evaluate_vehicle(
    selection: VehicleSelection, distance_m: float | None, *, wind_speed_mps=None, wind_direction=None
):
    vehicle = selected_vehicle(selection)
    base = {
        "dispatch_enabled": False,
        "operationally_approved": False,
        "payload_kg": selection.payload_kg,
        "distance_m": distance_m,
        "vehicle": vehicle,
    }
    if vehicle is None:
        return {**base, "status": "unavailable", "checks": [], "reason": "未选择机型"}
    checks = []

    def check(key, value, limit, label):
        status = (
            "unavailable"
            if value is None or limit is None
            else "exceeded"
            if value > limit
            else "within_reference"
        )
        checks.append({"key": key, "status": status, "value": value, "limit": limit, "label": label})

    check("payload", selection.payload_kg, vehicle["max_payload_kg"], "载荷与公布上限对照")
    check(
        "range",
        None if distance_m is None else distance_m / 1000,
        vehicle.get("max_range_km"),
        "航程与参考工况对照",
    )
    if wind_speed_mps is not None:
        check("wind", wind_speed_mps, vehicle.get("max_wind_mps"), "测试风速与公布抗风值对照")
    result = {
        **base,
        "status": "reference_only",
        "checks": checks,
        "range_note": vehicle["range_note"],
        "estimate": {"status": "unavailable", "reason": "未指定测试风场或航程"},
        "limitation": "规格边界仅用于对照，未验证各参数能同时成立；不包括返航、起降、转弯和备降，不代表飞行可行。",
    }
    if any(c["status"] == "exceeded" for c in checks):
        result["status"] = "exceeds_reference"
    if distance_m is None or wind_speed_mps is None:
        return result
    try:
        direction = {"headwind": 90, "tailwind": 270, "crosswind": 0, "calm": 0}[wind_direction]
        speed = ground_speed_mps(vehicle["reference_speed_mps"], 90, wind_speed_mps, direction)
        duration = distance_m / speed
        estimate = {
            "status": "user_test",
            "duration_s": duration,
            "ground_speed_mps": speed,
            "airspeed_mps": vehicle["reference_speed_mps"],
            "wind_speed_mps": wind_speed_mps,
            "wind_direction": wind_direction,
            "weather_source": "用户设定的恒定风场测试，非天气预报",
            "energy_wh": None,
            "remaining_after_reserve_wh": None,
            "energy_reason": "厂家规格未提供实测 Wh/m；未从标称电池与航程反推能耗。",
        }
        coefficient = vehicle.get("energy_per_meter_wh")
        if coefficient is not None:
            estimate["energy_wh"] = coefficient * vehicle["reference_speed_mps"] * duration
            estimate["energy_reason"] = "采用用户填写的测试 Wh/m，与测试空速配对；未做平台真实性认证。"
            usable, reserve = vehicle.get("usable_battery_wh"), vehicle.get("reserve_policy_wh")
            if usable is not None and reserve is not None:
                margin = usable - reserve - estimate["energy_wh"]
                estimate["remaining_after_reserve_wh"] = margin
                checks.append(
                    {
                        "key": "energy",
                        "status": "exceeded" if margin < 0 else "within_reference",
                        "value": estimate["energy_wh"],
                        "limit": usable - reserve,
                        "label": "用户电量预算测试",
                    }
                )
                if margin < 0:
                    result["status"] = "exceeds_reference"
        result["estimate"] = estimate
    except ValueError as exc:
        result["estimate"] = {"status": "infeasible", "reason": str(exc)}
        result["status"] = "exceeds_reference"
    return result
