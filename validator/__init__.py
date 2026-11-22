"""独立路线校验器（M2）。

刻意不在 `__init__` 里 re-export，避免 `python -m validator` 触发 RuntimeWarning。
用的时候直接 `from validator.checks import validate_route`。
"""
