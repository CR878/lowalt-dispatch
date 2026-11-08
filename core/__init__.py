"""core —— 跨模块公共数据结构。

只放数据契约，不放业务逻辑。前端、后端、边缘端、评测脚本都从这里 import，
避免各写一份字段再对不上。
"""

from core.models import (
    SCHEMA_VERSION,
    AltitudeReference,
    ConstraintCheck,
    DataProvenance,
    DiversionMarginProfile,
    DiversionMarginSample,
    Frame,
    LandingSite,
    PlanAck,
    PlanCommand,
    Position,
    RiskEvent,
    RiskSnapshot,
    RouteOutcome,
    RoutePlan,
    Task,
    VehicleState,
)

__all__ = [
    "SCHEMA_VERSION",
    "AltitudeReference",
    "ConstraintCheck",
    "DataProvenance",
    "DiversionMarginProfile",
    "DiversionMarginSample",
    "Frame",
    "LandingSite",
    "PlanAck",
    "PlanCommand",
    "Position",
    "RiskEvent",
    "RiskSnapshot",
    "RouteOutcome",
    "RoutePlan",
    "Task",
    "VehicleState",
]
