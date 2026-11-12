"""Append-only JSONL trace; I/O failure prevents an unrecorded tool submission."""

from __future__ import annotations

import json
import os
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from threading import RLock
from typing import Any
from uuid import uuid4

from pydantic import BaseModel

from agent.storage import FileLease


class AuditError(RuntimeError):
    pass


def decode_records(data: bytes, *, repair_tail: bool = False) -> tuple[list[dict], bytes]:
    """Parse committed rows, optionally preserving a torn FINAL row separately."""
    lines = data.splitlines(keepends=True)
    records = []
    torn = b""
    for index, raw in enumerate(lines):
        if not raw.strip():
            continue
        try:
            record = json.loads(raw)
        except (ValueError, UnicodeDecodeError) as exc:
            if repair_tail and index == len(lines) - 1 and not raw.endswith(b"\n"):
                torn = raw
                break
            raise ValueError(f"Invalid audit JSON at line {index + 1}") from exc
        if not isinstance(record, dict) or record.get("schema_version") != "m3-0.1":
            raise ValueError("Unknown audit schema")
        if type(record.get("sequence")) is not int or record["sequence"] != len(records) + 1:
            raise ValueError("Audit sequence mismatch")
        records.append(record)
    if not records:
        raise ValueError("Empty audit trail")
    return records, torn


def read_records(path: Path) -> list[dict]:
    return decode_records(Path(path).read_bytes())[0]


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
        self._mutex = RLock()
        self._poisoned = False
        self._closed = False
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            raise FileExistsError(self.path)
        self._lease = FileLease(self.path.with_name(self.path.name + ".lock"))
        # Never silently concatenate unrelated runs or overwrite old evidence.
        try:
            with self.path.open("x", encoding="utf-8"):
                pass
        except BaseException:
            self._lease.close()
            raise

    @classmethod
    def resume(
        cls,
        path: Path,
        *,
        repair_tail: bool = False,
        validate: Callable[[list[dict]], None] | None = None,
    ) -> tuple[JsonlAudit, list[dict], str | None]:
        instance = cls.__new__(cls)
        instance.path = Path(path)
        instance._mutex = RLock()
        instance._poisoned = False
        instance._closed = False
        instance._lease = FileLease(instance.path.with_name(instance.path.name + ".lock"))
        backup = None
        try:
            data = instance.path.read_bytes()
            records, torn = decode_records(data, repair_tail=repair_tail)
            if validate is not None:
                validate(records)
            if torn:
                backup_path = instance.path.with_name(instance.path.name + ".partial-" + uuid4().hex)
                with backup_path.open("xb") as stream:
                    stream.write(torn)
                    stream.flush()
                    os.fsync(stream.fileno())
                with instance.path.open("r+b") as stream:
                    stream.truncate(len(data) - len(torn))
                    stream.flush()
                    os.fsync(stream.fileno())
                data = data[: -len(torn)]
                backup = str(backup_path)
            if data and not data.endswith(b"\n"):
                with instance.path.open("ab") as stream:
                    stream.write(b"\n")
                    stream.flush()
                    os.fsync(stream.fileno())
            instance.sequence = len(records)
            return instance, records, backup
        except BaseException:
            instance._lease.close()
            raise

    def append(self, **record: Any) -> None:
        with self._mutex:
            self._append(record)

    def _append(self, record: dict[str, Any]) -> None:
        if self._closed or self._poisoned:
            raise AuditError("Audit writer is closed or failed; reopen through explicit recovery")
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
            self._poisoned = True
            raise AuditError("Unable to persist audit record; submission must stop") from exc
        self.sequence += 1

    def close(self) -> None:
        with self._mutex:
            self._closed = True
            self._lease.close()

    def __del__(self):
        if hasattr(self, "_lease"):
            self._lease.close()
