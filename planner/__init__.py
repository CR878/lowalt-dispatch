"""规划（M2）：场景 → 栅格 → A* 候选路线。

刻意不做 re-export：这里一旦 `from planner.astar import ...`，
`python -m planner.astar` 就会触发 RuntimeWarning（模块先被包导入、再当 __main__ 执行）。
用的时候直接 `from planner.astar import plan`。
"""
