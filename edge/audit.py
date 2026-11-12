"""执行端审计：按行追加 JSONL。

与 M3 的 `JsonlAudit` 不同，这里允许同一批次目录重跑（追加而不是拒绝），
因为执行端 demo 会被反复执行。需要不可篡改证据时再由上层冻结文件。
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from threading import RLock
from typing import Any

from pydantic_core import to_jsonable_python


class AuditWriter:
    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._handle = self.path.open("a", encoding="utf-8")

    def append(self, *, ts: datetime, event: str, **fields: Any) -> None:
        record = {"ts": ts.isoformat(), "event": event, **to_jsonable_python(fields)}
        line = json.dumps(record, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        with self._lock:
            self._handle.write(line + "\n")
            self._handle.flush()

    def close(self) -> None:
        self._handle.close()

    def __enter__(self) -> AuditWriter:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
