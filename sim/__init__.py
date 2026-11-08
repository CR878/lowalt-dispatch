"""仿真与环境模型（M2 的能量部分）。只描述物理，不做决策。"""

from sim.energy import (
    IncompleteVehicleProfile,
    VehicleProfile,
    climb_energy_wh,
    cruise_energy_wh,
    cruise_time_s,
    leg_energy_wh,
    load_vehicle,
    max_range_m,
)

__all__ = [
    "IncompleteVehicleProfile",
    "VehicleProfile",
    "climb_energy_wh",
    "cruise_energy_wh",
    "cruise_time_s",
    "leg_energy_wh",
    "load_vehicle",
    "max_range_m",
]
