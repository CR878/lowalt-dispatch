# services/api —— FastAPI 后端（未开始）

**负责人：C**　**状态：⬜ 目录占位，无代码**

## 职责

任务台的后端：接收 Task、取 RiskSnapshot、调规划与校验、下发 PlanCommand、读回 VehicleState、
导出回放与结果。它不负责姿态控制，也不直接拼电机指令。

## 第一个任务（11/10—11/13）

1. 最小可跑的 `main.py`：`GET /health` 返回版本号和 git commit。
2. 用 `core/models.py` 里的模型直接当请求/响应体 —— **不要另写一套 schema**。
3. 接 RDS 的任务表（先只存 `task_id / 状态 / plan_version / 快照 id`）。
4. Redis 只放"当前任务状态"这类易失数据，审计记录一律落 RDS 或 OBS。

## 依赖

- 等 A 给出飞控接口形态（MAVSDK 直连还是经边缘 agent 转发）
- 等 B 给出 `plan_route` / `verify_route` 的函数签名

## 注意

- 密钥只走环境变量，见仓库根 `.env.example`。`.env` 已在 `.gitignore` 里。
- 容器镜像构建后必须能 push 到 SWR。**不要假设服务器能拉 Docker Hub。**
