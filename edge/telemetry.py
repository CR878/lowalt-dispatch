"""遥测：把执行器采样包装成 `ExecutionObservation`，并按行落盘。

`ExecutionObservation` 定义在 `agent/edge_decisions.py`（M3 已有契约），这里不复制，
只负责组装与写文件。所有采样必须 `is_simulated=True` —— SITL 与 Fake 都算仿真。
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from agent.edge_decisions import ExecutionObservation
from core.models import VehicleState


def make_observation(
    *,
    task_id: str,
    state: VehicleState,
    accepted_command_id: str,
    received_at: datetime,
) -> ExecutionObservation:
    return ExecutionObservation(
        task_id=task_id,
        state=state,
        received_at=received_at,
        accepted_command_id=accepted_command_id,
    )


class TelemetryWriter:
    """JSONL 追加写。文件名与内容都由调用方标注 MOCK 命名空间。"""

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._handle = self.path.open("a", encoding="utf-8")

    def append(self, observation: ExecutionObservation) -> None:
        self._handle.write(observation.model_dump_json() + "\n")
        self._handle.flush()

    def close(self) -> None:
        self._handle.close()

    def __enter__(self) -> TelemetryWriter:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


def read_jsonl(path: Path | str) -> list[dict]:
    """读回遥测，供 demo 校验与测试使用。坏行直接跳过而不是整份炸掉。"""
    records: list[dict] = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return records
