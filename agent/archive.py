"""Content-addressed audit snapshots: local files today, OBS after configuration."""

from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path
from typing import Protocol

from agent.audit import decode_records
from agent.contracts import Contract
from agent.repository import RunRecord
from agent.storage import FileLease


class AuditObjectStore(Protocol):
    def put(self, key: str, content: bytes) -> None: ...


class ArchiveReceipt(Contract):
    key: str
    sha256: str
    size_bytes: int
    task_id: str
    run_id: str
    run_mode: str


class LocalAuditObjects:
    def __init__(self, root: Path):
        self.root = Path(root).resolve()

    def put(self, key: str, content: bytes) -> None:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("Archive key escapes storage root")
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)


class ObsAuditObjects:
    def __init__(self, client, bucket: str):
        if not bucket.strip():
            raise ValueError("OBS bucket is required")
        self.client, self.bucket = client, bucket

    def put(self, key: str, content: bytes) -> None:
        try:
            response = self.client.putContent(self.bucket, key, content=content)
            if not 200 <= response.status < 300:
                raise RuntimeError("OBS rejected audit upload")
        except Exception:
            raise RuntimeError("OBS audit upload failed; local audit retained") from None


def archive_run(record: RunRecord, store: AuditObjectStore) -> ArchiveReceipt:
    if record.result is None:
        raise ValueError("Recover the task before archiving")
    path = Path(record.audit_path)
    with FileLease(path.with_name(path.name + ".lock")):
        content = path.read_bytes()
    rows, _ = decode_records(content)
    identity = record.task.task_id, record.result.run_id, record.run_mode
    if any((r.get("task_id"), r.get("run_id"), r.get("run_mode")) != identity for r in rows):
        raise ValueError("Audit does not match the reserved task/run/mode")
    digest = hashlib.sha256(content).hexdigest()
    task_key = hashlib.sha256(record.task.task_id.encode("utf-8")).hexdigest()
    run_key = hashlib.sha256(record.result.run_id.encode("utf-8")).hexdigest()
    key = f"m3/{record.run_mode}/{task_key}/{run_key}/{digest}.jsonl"
    store.put(key, content)
    return ArchiveReceipt(
        key=key,
        sha256=digest,
        size_bytes=len(content),
        task_id=record.task.task_id,
        run_id=record.result.run_id,
        run_mode=record.run_mode,
    )
