"""CLI 在非 UTF-8 控制台上的存活测试。

2026-11-09 的 CI 红过一次：pytest / ruff / agent.demo 全过，只有 `python -m validator`
在 Windows runner 上失败，因为 runner 的 stdout 是 cp1252，而 validator 打印中文：

    UnicodeEncodeError: 'charmap' codec can't encode characters in position 2-6

`agent.demo` 只是碰巧全 ASCII 才躲过去。修复在 `core/console.py`。

这个测试用子进程强制 `PYTHONIOENCODING=cp1252`（一种表示不了中文的编码），
然后断言两件事：
1. 退出码为 0 —— 不崩；
2. stdout 能被 UTF-8 正确解码且含中文 —— 不是把中文替换成问号糊过去。

第二条是关键：只测"不崩"的话，一个把所有非 ASCII 字符吞掉的假修复也能过。
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]

CLIS = [
    ("validator",),
    ("planner.astar",),
    ("tools.render_route", "S2-01"),
    ("edge.demo", "--scenario", "S1-01"),
]


@pytest.mark.parametrize("argv", CLIS, ids=[a[0] for a in CLIS])
def test_cli_survives_non_utf8_stdout(argv: tuple[str, ...]) -> None:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "cp1252"  # 表示不了中文的编码，模拟 Windows runner
    env.pop("PYTHONUTF8", None)  # 确保不是 UTF-8 模式，否则测不到兜底逻辑
    env.pop("PYTHONIOENCODING_OVERRIDE", None)

    proc = subprocess.run(
        [sys.executable, "-m", *argv],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        timeout=300,
    )

    assert proc.returncode == 0, (
        f"{argv[0]} 在 cp1252 下崩溃：\n"
        + proc.stderr.decode("utf-8", "replace")[-3000:]
    )

    text = proc.stdout.decode("utf-8")  # 解码失败本身就是结论
    assert text.strip(), "输出为空，无法判断编码是否修好"
    assert "\ufffd" not in text, "输出里出现了替换字符，说明中文被吞掉了"


def test_validator_cli_keeps_chinese_readable() -> None:
    """单独确认：中文是真的写出去了，不是被替换成问号。"""
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "cp1252"
    env.pop("PYTHONUTF8", None)

    proc = subprocess.run(
        [sys.executable, "-m", "validator"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        timeout=300,
    )
    text = proc.stdout.decode("utf-8")
    assert "独立校验器" in text
    assert "无法下发" in text or "全部通过" in text
