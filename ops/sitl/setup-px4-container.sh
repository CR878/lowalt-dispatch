#!/usr/bin/env bash
# 在 PX4 编译容器内执行（不是宿主机！）。
# 前提：宿主机已建好挂载 E:/px4 -> /work 的容器并进入：
#   docker run -it --name px4 -v E:/px4:/work -p 14540:14540/udp -p 14550:14550/udp ubuntu:22.04
#   bash /work/ops/sitl/setup-px4-container.sh
# 目标：编译 PX4 v1.15.4 SITL（px4_sitl_default，纯软件飞控 + MAVLink，不需要 Gazebo）。
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
export PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
export PIP_TRUSTED_HOST=mirrors.aliyun.com

echo "=== 1/4 换源 + 编译依赖 ==="
sed -i 's|http://archive.ubuntu.com|http://mirrors.aliyun.com|g; s|http://security.ubuntu.com|http://mirrors.aliyun.com|g' /etc/apt/sources.list
apt-get update -qq
apt-get install -y --no-install-recommends \
  git curl ca-certificates cmake ninja-build gcc g++ make \
  python3 python3-pip unzip rsync libeigen3-dev

echo "=== 2/4 PX4 的 Python 依赖（按需，勿整份 requirements.txt） ==="
python3 -m pip install --no-cache-dir \
  kconfiglib jinja2 "empy==3.3.4" pyros-genmsg packaging toml \
  numpy lxml jsonschema cerberus psutil pygments pymavlink \
  pyserial pyulog future six requests setuptools sympy nunavut \
  argcomplete pkgconfig

echo "=== 3/4 克隆 PX4 v1.15.4 ==="
if [ ! -d /work/src/.git ]; then
  git clone --depth 1 --branch v1.15.4 \
    https://ghproxy.net/https://github.com/PX4/PX4-Autopilot.git /work/src
  # 子模块不走 insteadOf，逐个补（约 20+ 个）：
  cd /work/src
  git config --file .gitmodules submodule.update none 2>/dev/null || true
fi

echo "=== 4/4 编译 ==="
cd /work/src
CI=true make px4_sitl_default
echo "BUILD_DONE"
ls -lh ./build/px4_sitl_default/bin/px4
