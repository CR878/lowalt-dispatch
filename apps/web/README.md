# apps/web —— 调度任务台

**负责人：C**　**状态：🟡 有硬编码静态可视化页；React / MapLibre 正式工程未开始**

三维与视觉前端不在本目录，在 [`apps/web-3d/`](../web-3d/)（Vite + React + TypeScript；展厅用 R3F / Three.js）。阶段 0–1：工程骨架、ENU 换算、M350 RTK 比例骨架。天地图 / Cesium ion token 与后端接线未实现。本目录的静态页保持原样。

## 现在有什么（2026-11-10）

| 文件 | 说明 |
|---|---|
| `index.html` | 正式前端入口。单文件 + `view3d.js`，**零依赖、零后端、不接 API** |
| `view3d.js` | Canvas 2D 手写透视投影渲染器（无 WebGL、无 three.js） |
| `designs/` | 设计候选快照（A / B / C 与 D1 / D2 / D3），只用于对比，不参与构建 |

页面是「3D 倾斜俯视 + 终端 ASCII 侧栏」双视图：

- 右侧 3D：局部 ENU 3000 × 3000 m 草稿场景，建筑有高度、限制区有体积、航线与备降点是 3D 几何；三机位自动运镜，节拍时钟 + 低分辨率 glow 缓冲合成。
- 左侧：`01 ROUTE / LOCAL ENU 3000 x 3000 m (DRAFT)` ASCII 战术航图、备降余量剖面、7 项独立检查清单。
- 顶部常驻 `SIMULATION ONLY · NO REAL FLIGHT`。

### 打开

直接双击 `index.html` 即可；或起个静态服务：

```bash
cd apps/web
python -m http.server 8000
# 浏览器打开 http://localhost:8000/
```

### 数据边界（重要）

- 21 栋建筑 / 4 个限制区 / 8 段航线 / 4 个备降点全部是**硬编码草稿几何**，不是 `scenarios/v0/*.geojson` 的真实内容，也不是真实城区。
- 场景号（S2-01、S4-04）、7 个检查项名、19/20、R01 坐标取自仓库真实定义；**所有数值为占位示意**。
- 能量与备降两项用合成参数演示，数值无物理意义，**不得写入参赛材料**。
- 没有真机、没有 PX4 / SITL 链路、没有华为云部署、没有任何 API 调用。
- 现状基准以项目根《事实文档.md》为唯一依据。

> `designs/view3d.js` 是候选阶段的快照副本，与 `apps/web/view3d.js` 内容相同。后续改渲染器只改 `apps/web/view3d.js`；候选页保持当时验证过的状态，不再同步。

---

## 尚未开始（原计划 11/12—11/16，未执行）

React + TypeScript + Vite + MapLibre GL JS。组件库用 Ant Design 或团队熟的都行，
**不引入 CesiumJS** —— 二维够用，三维高度展示不是本月的评分点。

```bash
cd apps/web
npm create vite@latest . -- --template react-ts
npm install
npm install maplibre-gl
```

> 注意：上面的初始化会覆盖当前目录结构，动手前先和 C 确认是否保留 `index.html` 作为静态预览。
> `node_modules/`、`dist/` 已在根 `.gitignore` 中排除。

第一个任务清单：

1. 地图 + 场景 GeoJSON 图层（建筑、限制区、备降点、起降点）。
2. 任务表：列表 + 详情，字段直接对齐 `core/models.py` 的 `Task`。
3. **备降余量剖面图** —— 主视觉，优先级高于任何美化。横轴沿路线累计距离，纵轴 `E_left − E_reserve − E_need`，零线以下涂红，标出备降点位置和限制区生效点；同一事件下并排显示旧线（进红区）和新线（全程非负）。
4. 事件时间线：谁在什么时候改了什么，`plan_version` 怎么变的。

页面上要能看出哪些数据是仿真、哪些是实测（`is_simulated` 字段别浪费）。
