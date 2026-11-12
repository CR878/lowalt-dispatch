# ops —— 本地 Docker 替身（不是华为云）

**这里没有开通任何华为云资源。** `postgres` / `redis` / `mosquitto` 三个容器只是
RDS / DCS / 云侧 MQTT 的**本地替身**，用来在没云账号的情况下把 M3 的持久化、投影和消息链路跑通。

材料里不能据此写"已部署华为云"或"已连接 RDS/DCS"——它们跑在你自己的机器上。

另外：`ops/sitl/` 是 PX4 SITL 环境的搭建脚本与遥测探针（2026-11-11 实测搭建成功，
遥测通道已通，**未起飞未执行任务**），详见 [sitl/README.md](sitl/README.md)。

## 起停

```bash
# 起（首次会拉 postgres:16-alpine / redis:7-alpine / eclipse-mosquitto:2）
docker compose -f ops/docker-compose.yml up -d

# 看健康状态，等三个都 healthy / running
docker compose -f ops/docker-compose.yml ps

# 停（保留 Postgres 数据卷）
docker compose -f ops/docker-compose.yml down

# 连数据一起清掉
docker compose -f ops/docker-compose.yml down -v
```

前提：Docker Desktop 的 Linux 引擎要在运行。判断方法：

```bash
docker version --format '{{.Server.Version}}'
```

报 `failed to connect to the docker API at npipe:...` 就是 daemon 没起，先启动 Docker Desktop。

## 三个容器

| 容器 | 替身 | 端口（只绑 127.0.0.1） | 数据 |
|---|---|---|---|
| `lowalt-postgres` | RDS | 5432 | 命名卷 `lowalt_pgdata`，`down` 不丢 |
| `lowalt-redis` | DCS | 6379 | 不持久化（`--save "" --appendonly no`），重启即丢，本来就只有 TTL 语义 |
| `lowalt-mosquitto` | 云侧 MQTT | 1883 | 无；配置见 `mosquitto/mosquitto.conf`，**匿名 + 不加密，仅开发** |

三个都在 `lowalt_cloud_link` 网络上，语义上属于"云侧"；断连演示只摘边缘容器的接入，不会误伤它们。

## 配本地 .env

```bash
cp ops/local.env.example .env
```

`.env` 已被 `.gitignore` 排除，不会进仓库。里面几个容易踩的点：

- `M3_LEDGER_BACKEND=rds` 的 `rds` 只是**后端类型名**（PostgreSQL），指向本机容器，不代表买了云数据库。
- `DCS_TLS=false` **必须显式写**。`agent/settings.py` 默认 `True`（云上必须开 TLS），本地容器没证书，留着 true 会直接连不上。
- `M3_RUN_MODE=mock` 和"用不用云"无关：它表示工具是 MOCK 还是非 MOCK。连了本地 PG/Redis 仍然是 mock。
- `M3_ARCHIVE_BACKEND=local`，审计归档落在 `logs/agent/archive`，不用 OBS。

## 验证

```bash
# 1. 只检查配置完整性，不联网、不规划（预期 network_contacted: false, missing: []）
.venv/Scripts/python.exe -m agent.integration --env-file .env check

# 2. 真跑三个外部服务测试：先把 .env 灌进环境变量（pytest 不读 .env 文件）
set -a
. ./.env
set +a
.venv/Scripts/python.exe -m pytest tests/test_m3_external.py -v
```

> `python -m dotenv run` 需要额外装 `python-dotenv[cli]`，这里不用它，避免为一条测试命令加依赖。

第 2 条跑通的话，原来 `3 skipped` 会变成 `3 passed`：

- `test_real_postgresql_claim_and_revision` —— 8 个并发抢同一任务，只允许 1 个拿到
- `test_real_redis_lua_revision_and_expiry` —— Lua 原子更新 + TTL + 拒绝回退修订号
- `test_real_mqtt_roundtrip_with_explicit_mock_executor` —— 命令/ACK 真实过 Broker，对端是显式 MOCK 执行器

> MQTT 那条通过只证明**线缆通**，不是 PX4 接收验证，也不是飞控 ACK。

## 断连演示

```bash
# 断开边缘容器的云端链路（cloud_link），保留飞控链路（flight_control）
docker network disconnect lowalt_cloud_link lowalt-edge-agent

# 恢复
docker network connect lowalt_cloud_link lowalt-edge-agent
```

前提是 `edge-agent` 容器已经起来（`docker-compose.yml` 里目前还是注释状态，等 Dockerfile 就绪再启用）。

**不要**用 `docker pause lowalt-mosquitto` 冒充"网络物理断开"：那只是 Broker 进程被暂停，
客户端多久判定失效取决于 Keep Alive 和超时，属于 Broker 故障用例。

## 红线

- 这套 compose 是**开发替身**，不是云部署；不能作为"关联华为云服务"的证据。
- 密码 `lowalt_dev_only` 只用于本机；端口只绑 `127.0.0.1`，不要改成 `0.0.0.0` 暴露到局域网。
- Mosquitto 开的是匿名 + 不加密，仅限本机开发与断连演示。
- 现状仍以项目根《事实文档.md》为准；真实云资源、MaaS、PX4 执行端都还没接。
