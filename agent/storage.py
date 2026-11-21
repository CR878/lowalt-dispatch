"""Small local-file primitives: cross-process lease and atomic JSON replacement."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


class ResourceBusyError(RuntimeError):
    """Another live writer owns this local resource."""


class FileLease:
    """Advisory process lease; the OS releases it after a process crash.

    The lock file remains intentionally: unlinking it could create two lock
    inodes and allow independent writers. All cooperating writers must use it.
    """

    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._file = path.open("a+b")
        try:
            if self._file.seek(0, os.SEEK_END) == 0:
                self._file.write(b"0")
                self._file.flush()
            self._file.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(self._file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(self._file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self._file.close()
            raise ResourceBusyError(f"Resource is already in use: {path}") from exc

    def close(self) -> None:
        if not self._file.closed:
            # Closing a handle releases either OS's advisory lock.
            self._file.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def __del__(self):
        if hasattr(self, "_file"):
            self.close()


def atomic_json(path: Path, data: dict[str, Any]) -> None:
    """Write in the same directory, fsync and replace; never expose half a JSON."""
    path = Path(path)
    encoded = json.dumps(data, ensure_ascii=False, allow_nan=False, sort_keys=True, indent=2) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            prefix=path.name + ".",
            suffix=".tmp",
            dir=path.parent,
            delete=False,
        ) as stream:
            temporary = Path(stream.name)
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        if os.name != "nt":
            descriptor = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
