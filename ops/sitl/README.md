# PX4 SITL 环境（本机 Docker）

2026-11-11 实测搭建成功。**这是开发验证环境，不是实飞。**

## 现状一句话

PX4 **v1.15.4** 在 Docker 容器（`px4`，Ubuntu 22.04）内从源码编译，后台常驻；
`mavsdk` 3.17.4 实连，**遥测通道打通**（姿态 / 里程计 / 电池 / in_air / health）。
**未做**：校准、起飞、`upload_mission`、任务执行。

## 布局

- 宿主机 `E:\px4` ↔ 容器 `/work`（bind mount，编译产物不占 C 盘）
- 容器 `px4`：`-p 14540:14540/udp -p 14550:14550/udp`
- PX4 二进制：`/work/src/build/px4_sitl_default/bin/px4`（46 MB）
- 运行日志：容器内 `/work/sitl2.log`

## 从零复现

```bash
# 1. 建容器（宿主机）
docker run -it --name px4 -v E:/px4:/work -p 14540:14540/udp -p 14550:14550/udp ubuntu:22.04

# 2. 把脚本送进容器并编译（约 15–30 分钟）
docker cp ops/sitl/setup-px4-container.sh px4:/work/setup.sh
docker exec -it px4 bash /work/setup.sh

# 3. 后台启动飞控（容器内；关掉 stdbuf 缓冲才能看到日志）
docker exec -d px4 bash -c "cd /work/src/build/px4_sitl_default && \
  ./bin/px4 -d > /work/sitl.log 2>&1"

# 4. 装 mavsdk（容器内；必须 <4，4.x 换 native binding API 不兼容）
docker exec px4 pip3 install "mavsdk<4"

# 5. 验证遥测（探针先拷进容器）
docker cp ops/sitl/sitl_probe.py px4:/work/sitl_probe.py
docker exec px4 python3 /work/sitl_probe.py
```

> 注意：容器只挂载 `E:\px4` → `/work`，**仓库目录不在容器里**。所以脚本要 `docker cp` 送进去，
> 不要写 `/work/ops/sitl/...`（那是个不存在的路径）。

容器停了之后重新起（不用重新编译）：

```bash
docker start px4
docker exec -d px4 bash -c "cd /work/src/build/px4_sitl_default && \
  ./bin/px4 -d > /work/sitl.log 2>&1"
docker exec px4 pgrep -x px4        # 有 PID 就是起来了
```

## 坑（踩过的）

| 坑 | 解法 |
|---|---|
| GitHub 直连被墙，20+ 子模块拉不下来 | `https://ghproxy.net/https://github.com/...` 反代；`CI=true` 让子模块并行更新且失败不中止 |
| PX4 整份 requirements.txt 装依赖哈希校验失败（阿里云镜像同步问题） | 按需单装关键包（见 setup 脚本第 2 步） |
| `mavsdk` 4.x `System` 不可直接构造（换 native binding） | 锁 `mavsdk<4`（3.17.4，gRPC API） |
| 容器 Python 3.10 没有 `datetime.UTC` | `from datetime import datetime, timezone` + `timezone.utc` |
| `px4 -d` 后台运行 stdout 被缓冲，日志 8 分钟不动 | `stdbuf -oL -eL` 前台跑几秒确认 `Startup script returned successfully` 再转后台 |
| 重启容器后 `PX4 server already running` | `pkill -x px4` + 删锁文件再起 |
| MAVLink 端口 | PX4 监听 14580、主动发往 14540（Onboard）；GCS 走 14550。mavsdk 用 `udpin://0.0.0.0:14540` |
| health 预检全红（accel/baro/compass missing） | 没接 Gazebo 传感器桥，SITL "none" 机型预期行为；遥测不受影响，`armable=false` |

## 证据

`docker exec px4 python3 /work/sitl_probe.py` 实跑输出（2026-11-11）：

```json
{
  "connected": true,
  "attitude_deg": {"roll": -1.581, "pitch": -0.01, "yaw": 15.646},
  "position_body_m": {"x": -1775.315, "y": 1069.004, "z": 0.589, "frame": "NED"},
  "battery_remaining_pct": 100.0,
  "in_air": false,
  "health": {"gyrometer_ok": true, "local_position_ok": true, "armable": false}
}
```

`armable=false`：未校准、无传感器桥——**只证明遥测链路，不证明能飞**。
