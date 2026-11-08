# lowalt-dispatch

面向**应急配送**的低空航线规划系统。核心机制只有一条：把"备降可达性"做成**规划搜索阶段的硬约束**（每个候选状态都必须还能落到一个当前有效的降落点，否则直接剪枝），而不是选完最短路线之后再弹一次告警。配套的是云端链路退化时，边缘端按已同步、仍有效的快照执行**预校验过的**备用方案。

> **验证边界：软件在环仿真（SITL），无实机飞行。**
> 本仓库目前**没有**真实飞行数据、**没有**已完成的规划算法、**没有**云部署。

## 现在是什么状态

v0.1 —— 骨架 + 一条能跑通的评测管道。

已经有的：

- `core/models.py` —— 五类接口的数据契约（Task / RiskSnapshot / RoutePlan / VehicleState / 执行确认），带单位、高度基准和"是否仿真"的硬校验
- `eval/` —— 评测 harness，一条命令跑 20 场景 × 3 种子 × 3 算法，产出带溯源 meta 的 CSV
- `tests/` —— 11 个契约测试，保证数据不合约定时立刻炸而不是静默出错

**没有的**：规划算法、飞控连接、云端部署、前端页面、场景几何、机型参数。
准确进度只看 [`事实文档.md`](事实文档.md)，别信 README 的乐观描述。

## 快速开始

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt     # Windows
# source .venv/bin/activate && pip install -r requirements.txt  # Linux/macOS

# 跑评测管道（当前全是 mock）
.venv/Scripts/python -m eval.run --suite eval/scenarios/v0.yaml --seeds 1,2,3 --out results/v0.csv

# 跑契约测试
.venv/Scripts/python -m pytest
```

预期输出：

```
MOCK 运行 —— 这些数字不是结果，只证明管道能跑通
场景 20 × 种子 3 × 算法 3 = 180 行
CSV  → results\v0_MOCK.csv
meta → results\v0_MOCK.meta.json
```

文件名里的 `_MOCK` 是自动加的：只要用的还是占位规划器，输出就别想伪装成真实结果。

## 目录

```
core/            数据契约（A/B/C 共用，改这里必须同步 docs/接口契约.md）
eval/            评测 harness + 场景集
  scenarios/     20 个任务样例（v0.yaml）
scenarios/       场景几何（建筑/限制区/备降点）—— 待 B 设计
  vehicles/      机型平台参数 —— 待 A 填写，当前全为 null
services/api/    FastAPI 后端 —— 未开始
edge/            边缘 agent（云边断连时兜底）—— 未开始
apps/web/        React + MapLibre 任务台 —— 未开始
ops/             Compose 拓扑（含断连演示用的双网络）
docs/            接口契约
results/         评测产物（CSV + meta.json 属于证据，要进版本库）
```

## 三个人从哪进

| 角色 | 第一件事 | 卡点 |
|---|---|---|
| A · 飞控与仿真 | 确认 PX4 还是 ArduPilot，SITL 起得来并读到位置/状态 | 填 `scenarios/vehicles/placeholder.yaml` 的 `null` |
| B · 规划与数据 | 设计场景几何；把 `eval/planners.py` 里的 mock 换成真实 A* | 机型参数（来自 A） |
| C · 平台与智能体 | ECS 最小部署 + SWR 镜像预检；FastAPI 骨架 | 云账号与安全组 |

## 表述红线

这些词在本仓库和一切材料里都不许乱用，理由见 [`事实文档.md`](事实文档.md) 第 5 节：

- 仿真 → 不能说成实飞
- 本地备用方案切换 → 不能说成边缘实时重规划
- 固定顺序调用工具 → 不能说成 Agent 自主决策
- mock 数字 → 不能出现在任何效果描述里
