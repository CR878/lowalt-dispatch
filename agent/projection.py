"""Disposable current-status projection for DCS. Never a dispatch authority."""

from __future__ import annotations

import hashlib
import json

from agent.repository import RunRecord

# Compare and replace atomically: a delayed worker must not overwrite newer state.
_PUT_NEWER = """
local old = redis.call('GET', KEYS[1])
if old then
    local ok, value = pcall(cjson.decode, old)
    if not ok or not value.revision then return -1 end
    if tonumber(value.revision) >= tonumber(ARGV[1]) then return 0 end
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
"""


class RedisProjection:
    def __init__(self, client, *, ttl_s: int = 3600):
        if ttl_s <= 0:
            raise ValueError("Projection TTL must be positive")
        self.client, self.ttl_s = client, ttl_s

    @staticmethod
    def key(task_id: str, run_mode: str) -> str:
        return f"lowalt:m3:{run_mode}:" + hashlib.sha256(task_id.encode("utf-8")).hexdigest()

    def publish(self, record: RunRecord) -> bool:
        if record.result is None:
            raise ValueError("No result to project")
        value = json.dumps(record.model_dump(mode="json"), allow_nan=False)
        response = self.client.eval(
            _PUT_NEWER, 1, self.key(record.task.task_id, record.run_mode), record.revision, value, self.ttl_s
        )
        if response == -1:
            raise ValueError("Malformed existing projection; authoritative ledger is unchanged")
        return response == 1

    def get(self, task_id: str, run_mode: str) -> RunRecord | None:
        raw = self.client.get(self.key(task_id, run_mode))
        if raw is None:
            return None
        record = RunRecord.model_validate_json(raw)
        if record.task.task_id != task_id or record.run_mode != run_mode:
            raise ValueError("Cached projection identity mismatch")
        return record
