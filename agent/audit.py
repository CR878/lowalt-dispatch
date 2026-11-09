"""Append-only JSONL trace; I/O failure prevents an unrecorded tool submission."""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel


class AuditError(RuntimeError):
    pass


def json_value(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: json_value(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [json_value(v) for v in value]
    return value


class JsonlAudit:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.sequence = 0
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Never silently concatenate unrelated runs or overwrite old evidence.
        with self.path.open("x", encoding="utf-8"):
            pass

    def append(self, **record: Any) -> None:
        try:
            encoded = json.dumps(
                {"schema_version": "m3-0.1", "sequence": self.sequence + 1, **json_value(record)},
                ensure_ascii=False,
                allow_nan=False,
                separators=(",", ":"),
            )
            with self.path.open("a", encoding="utf-8", newline="\n") as stream:
                stream.write(encoded + "\n")
                stream.flush()
                os.fsync(stream.fileno())
        except (OSError, TypeError, ValueError) as exc:
            raise AuditError("Unable to persist audit record; submission must stop") from exc
        self.sequence += 1
