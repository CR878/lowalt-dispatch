"""命令行输出编码的兜底。

## 为什么需要这个

Windows 上 Python 默认用 **locale 编码**写 stdout。GitHub Actions 的 windows runner
用的是 cp1252，程序一打印中文就抛：

    UnicodeEncodeError: 'charmap' codec can't encode characters in position 2-6

本地开发时通常看不出来（Windows Terminal / Git Bash 是 UTF-8），但一旦重定向到文件、
接到管道、或者跑在 CI 上就会炸。2026-11-09 的 CI 就是这么红的：
pytest、ruff、agent.demo 全过，只有 `python -m validator` 因为输出中文而失败——
而 `agent.demo` 只是碰巧全 ASCII 才躲过去。

## 策略

只在**当前编码确实表示不了中文**时才改成 UTF-8 + `errors="replace"`：

- cp1252 / ascii → 改成 UTF-8（GitHub 日志、Windows Terminal、文件重定向都能正确解码）
- cp936（中文 Windows 的 cmd）→ **不动**，它本来就能正确显示中文，改了反而乱码
- 已经是 UTF-8 → 不动

最坏情况是显示成问号，但**任何情况下都不会中断程序**。乱码比崩溃好。
"""

from __future__ import annotations

import sys

PROBE = "中"


def ensure_utf8_stdout() -> None:
    """让 CLI 在非 UTF-8 控制台/管道上不会因为打印中文而崩溃。幂等，可重复调用。"""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        encoding = getattr(stream, "encoding", None) or "ascii"
        try:
            PROBE.encode(encoding)
            continue  # 当前编码能表示中文，别动它
        except (UnicodeEncodeError, LookupError):
            pass
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            pass
