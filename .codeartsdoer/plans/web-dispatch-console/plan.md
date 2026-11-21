# 应急低空配送调度控制台（前端原型）—— 集成计划

- 特性名（feature）：`web-dispatch-console`
- 计划修订（plan revision）：**P1**
- 计划路径：`.codeartsdoer/plans/web-dispatch-console/plan.md`（仓库根 `E:\ICT大赛\lowalt-dispatch`）
- 交付形态：单文件静态原型 `apps/web/index.html` + 唯一数据资源脚本 `apps/web/assets/scene.js`，双击 `file://` 直接打开，无构建、无依赖安装
- 生效范围：仅前端展示原型。**验证边界为 SITL 软件在环仿真，无实机飞行**；页面全部数据带 `is_simulated=true`

---

## 1. 需求（Requirements）

本节只写"用户能看到什么、什么情况下必须显示什么"，不写实现方式。技术签名、图层构造、坐标公式在 §2。

**默认值（可逆选择，已按团队确认写死，不再询问）**：桌面优先、暗色单一主题、中文界面 + 英文术语并列（如"备降余量 / DIVERSION MARGIN"）、演示时钟周期 180 s 循环、播放速度 6×、默认视角 3D（pitch 55°）。

### R1 地图与三维场景

控制台主舞台应能同时表达"平面地理"与"垂直高度"两类信息：底图为暗色地理底图，其上有可识别的三维体块与轨迹。

- **R1.1** The 控制台 shall 在页面加载完成后于主舞台渲染一个地图视图，并在该视图上叠加建筑/障碍体块、限制区、备降点/起降点、航线轨迹、飞行器标记这五类要素。
- **R1.2** The 控制台 shall 以"从地面拉伸的三维体块"呈现 `scenarios/v0/obstacles.geojson` 中的每个 Polygon 要素（共 20 个），体块高度可见且相互可比。
- **R1.3** The 控制台 shall 以"带高度带的半透明竖直柱体"呈现 `scenarios/v0/zones.geojson` 中每个限制区（共 4 个，`alt_min_m`–`alt_max_m` 高度带 0–120 m），并使其在三维视角下可辨认为"柱"而非"面"。
- **R1.4** The 控制台 shall 以可读标签显示备降点（L1–L4）与其可用半径，并区分"可用"与"被占用/不可用"两种状态。
- **R1.5** The 控制台 shall 显示至少一条完整航线轨迹（从起点到终点），以及一个沿航线移动的飞行器标记。
- **R1.6** Where 源数据缺少所需字段（例如 `obstacles.geojson` 的 properties 没有高度字段），the 控制台 shall 使用显式标注为"演示构造（demo derived）"的高度值，并在图例中说明该高度不是实测值。

### R2 二维/三维视角切换

- **R2.1** The 控制台 shall 提供一个单一、可点击且键盘可聚焦的视角切换控件，其可见状态文案能区分两种模式（如"3D 斜视 / 2D 俯视"）。
- **R2.2** When 用户激活该控件，the 控制台 shall 在 600–1200 ms 内以连续缓动（非瞬间跳变）把视角从当前模式过渡到目标模式：2D 模式为俯角 0°、正北朝上；3D 模式为俯角 50°–60°、允许旋转与倾斜。
- **R2.3** While 视角过渡动画进行中，the 控制台 shall 保持控件处于"过渡中"可见反馈（按钮 `aria-pressed` 或状态文案变化），并在过渡完成后落到稳定状态。
- **R2.4** The 控制台 shall 在切换后保持当前选中的候选路线与飞行器位置不丢失（切换只改变相机，不重置业务状态）。
- **R2.5** If 两次切换请求在动画未结束时连续到达，the 控制台 shall 以最后一次请求的目标模式为准，且不出现相机卡死或状态文案与真实视角不一致。

### R3 轨迹动画

- **R3.1** The 控制台 shall 让航线轨迹具备持续流动的视觉指示（流光/虚线流动），使观察者无需交互即可判断飞行方向。
- **R3.2** The 控制台 shall 让至少一架飞行器标记沿当前选中路线连续移动，其位置随时间推进而单调前进，到达终点后按演示时钟循环重置。
- **R3.3** The 控制台 shall 提供暂停/继续控制；While 处于暂停状态，the 飞行器位置与流光进度 shall 保持不变，且控件文案与状态一致。
- **R3.4** When 用户切换选中的候选路线，the 飞行器与流光 shall 切换到该路线并在其起点重新开始（或按其已用进度继续），不得出现位置跳变到无关坐标。

### R4 备降余量剖面（主视觉，优先级最高）

剖面图的业务定义：横轴为沿航线累计距离 `s_m`，纵轴为 `margin_wh = E_left − E_reserve − E_need_to_nearest_valid_landing`；零线以下即为不可行区。

- **R4.1** The 控制台 shall 以折线图绘制当前选中路线对应的 `DiversionMarginProfile`，横轴单位 m、纵轴单位 Wh，并标注两条坐标轴的单位与刻度值。
- **R4.2** The 控制台 shall 把纵轴低于零线的区域以醒目的警示色填充（区别于正区），并绘制一条可见的零线。
- **R4.3** The 控制台 shall 在剖面上标注：①各有效备降点对应的航线位置（含 `site_id` 标签）；②限制区生效点对应的航线位置（含 `zone_id` 或事件标签）；③全程最小值点（含数值标签）。
- **R4.4** The 控制台 shall 支持同一任务的两条剖面（不同 `plan_version`）并排或叠加对比，其中旧版本（`astar_static`）在红区、新版本（`astar_diversion_aware`）全程非负，且两条线的图例可区分。
- **R4.5** If 某采样点 `nearest_site_id` 为 `null`（无有效退出路径），the 控制台 shall 在该位置以独立标记表达"无有效退出路径"，而不是把它画成 0 余量。
- **R4.6** The 控制台 shall 在剖面图区域显示该剖面的可行性结论（可行 / 不可行）与负值采样点数量，结论取自数据（`negative_sample_count` / `is_feasible` 的等价判断），不得由前端随意判定。

### R5 任务队列面板

- **R5.1** The 控制台 shall 显示任务列表，每条至少包含 `task_id`、载荷 `payload_kg`、机型 `vehicle_type`、时限 `time_limit_s`、状态。
- **R5.2** When 用户选中某任务，the 控制台 shall 显示该任务详情，字段覆盖 `Task` 的全部字段（`origin`、`destination`、`payload_kg`、`vehicle_type`、`initial_energy_wh`、`reserve_energy_wh`、`time_limit_s`、`provenance`）。
- **R5.3** The 控制台 shall 在任务列表与详情上显示 `is_simulated` 徽标（"仿真 / SIM"），不得对仿真数据省略该标记。
- **R5.4** If 某任务被判为不可行（无可行候选路线），the 控制台 shall 在详情中明确显示"不可行"及原因（如载荷超限/时限过紧），不得显示为"待起飞"。

### R6 候选路线/方案对比面板

- **R6.1** The 控制台 shall 为至少一个任务提供 ≥2 条候选路线，各自带 `route_id`、`plan_version`、`algorithm`、`diversion_site_id`、能量预算与自报检查结果。
- **R6.2** When 用户选中某候选路线，the 控制台 shall 在地图上高亮该路线轨迹、同步切换剖面对应的 `plan_version`，并在候选面板中标明"当前选中"。
- **R6.3** The 控制台 shall 区分"规划器自报检查"与"独立校验结论"的措辞，不得把规划器 `checks` 展示为最终判定。
- **R6.4** If 某候选路线的 `diversion_site_id` 为 `null`，the 控制台 shall 显示"无有效退出方案"而不是空白。

### R7 事件时间线面板

- **R7.1** The 控制台 shall 以时间倒序显示风险事件与计划版本变更，事件类型覆盖 `restriction_zone`、`wind`、`link_degradation`、`landing_site_change`、`battery_anomaly` 中至少四种。
- **R7.2** The 控制台 shall 为每条事件显示生效时刻与（若有）失效时刻，并标明其是否已生效/已过期（相对于演示时钟）。
- **R7.3** The 控制台 shall 显示计划版本变更条目，体现 `plan_version` 从旧到新的变化及触发原因。
- **R7.4** While 演示时钟推进并跨过某事件生效时刻，the 控制台 shall 使该条目进入"已生效"可见状态（不需要用户刷新）。

### R8 遥测 KPI 条

- **R8.1** The 控制台 shall 在顶部显示 5 个遥测指标：任务总数、在飞数量、最小备降余量、链路质量、仿真数据占比或仿真标注。
- **R8.2** When 页面首次进入或指标值变化，the 控制台 shall 以数值滚动/计数动画呈现新值，动画结束后停在与数据一致的最终值。
- **R8.3** The 控制台 shall 使每个 KPI 带单位与一条细进度段（表示相对量级），并在"最小备降余量（含历史方案）"为负时以警示色呈现；该指标的统计口径必须随标签一并显示，避免被读作"在飞方案已不可行"。

### R9 动画与氛围

- **R9.1** The 控制台 shall 呈现暗色控制台视觉语言：细边框、等宽极小字号标签、扫描线覆盖层与暗角，克制使用粉/青点缀。
- **R9.2** The 控制台 shall 在页面进入时让各面板以错峰淡入方式出现，顺序稳定可复现。
- **R9.3** The 控制台 shall 在主舞台呈现至少一种周期性氛围动效（扫描/脉冲/扩散环），且该动效不遮挡业务读数。
- **R9.4** While 交互与动画同时进行（拖拽地图 + 轨迹流动 + 剖面重绘），the 控制台 shall 保持可交互与视觉流畅（目标 60 fps；在演示机型上出现持续掉帧视为不达标，须降低动画更新频率而不是删除功能）。
- **R9.5** If 用户系统启用"减少动态效果"（`prefers-reduced-motion`），the 控制台 shall 缩短或关闭装饰性动画，同时保留数据可读性与必要的状态反馈。

### R10 仿真标注与表述红线

- **R10.1** The 控制台 shall 在页头或状态区常驻"仿真数据 / SITL 软件在环仿真，无实机飞行"字样。
- **R10.2** The 控制台 shall 使每个数据面板能追溯到 `is_simulated`（徽标、图例或 provenance 字段），并在 `provenance` 中给出 `source` / `version` / `captured_at`。
- **R10.3** The 控制台 shall 不得出现"实飞""真实飞行""边缘实时重规划""Agent 自主决策""实测数据"等与仓库表述红线冲突的措辞（含注释、标题、tooltip、控制台日志）。
- **R10.4** The 控制台 shall 在页脚注明视觉语言来源："视觉语言参考 HALOFLUX by Ryder191（PolyForm Noncommercial），页面实现为原创，未复制其源码"，且不得声称本项目获得其授权或为商业用途。

### R11 离线兜底

- **R11.1** If 在线底图样式或其瓦片请求失败/超时（5 s 内未就绪），the 控制台 shall 切换到程序化暗色底（网格/纯色），并保持三维体块、限制区、备降点、轨迹、飞行器全部可见。
- **R11.2** The 控制台 shall 在降级发生时显示一条可见的降级提示，文案说明"底图不可用，已切换离线底图；三维场景不受影响"。
- **R11.3** If WebGL 或地图库初始化失败，the 控制台 shall 显示明确的降级说明与仍可用的信息面板，而不是空白页或仅控制台报错。
- **R11.4** The 控制台 shall 在无网络字体时以本地等宽字体回退呈现，排版不破裂。

### R12 响应式

- **R12.1** The 控制台 shall 在 ≥1440 px 宽度下以"主舞台 + 三列/双侧面板"的桌面控制台布局呈现，页面不出现横向滚动条。
- **R12.2** While 视口宽度 < 1080 px，the 控制台 shall 把主舞台与各面板改为纵向堆叠并可整体滚动，地图容器保持 ≥ 320 px 高度。
- **R12.3** The 控制台 shall 在 1280×800 与 1920×1080 两种窗口尺寸下保证顶部 KPI 条不换行截断、剖面图刻度可读。

### 需求→任务覆盖（初稿）

| 需求 | 主要实现 | 主要验证 |
|---|---|---|
| R1, R4, R5, R6, R7, R8, R10 | T1（数据）+ T2（呈现） | T3（静态契约）、T4（浏览器集成）、T5（独立终验） |
| R2, R3, R9, R11, R12 | T2 | T3（静态红线/结构）、T4（交互与降级演练）、T5 |
| R10 表述红线 | T1（数据标注）+ T2（文案） | T3（禁用词扫描） |

## 2. 技术设计（Technical Design）

### 2.1 架构与实现边界

#### 2.1.1 交付物拓扑（`apps/web` 运行时文件只有两个：`index.html` + `assets/scene.js`）

```
apps/web/
  index.html            ← 唯一页面：内联 CSS + 内联经典 script；不引用任何本地 .js/.css
  assets/scene.js       ← 唯一数据资源脚本：内联 GeoJSON + 构造仿真数据 + 坐标工具（经典脚本，非 ES module）
  README.md             ← 运行方式、降级说明、验收记录（本轮改写）
tests/
  test_web_console_static.py   ← 静态契约/红线检查（pytest，新增）
```

`scenarios/v0/*.geojson`、`core/models.py` 为**只读基线**，本特性不修改。

#### 2.1.2 关键运行时决定（均为已验证约束或明确规避）

| 决定 | 理由 | 对实现者的硬约束 |
|---|---|---|
| `scene.js` 以**经典脚本** `<script src="assets/scene.js"></script>` 加载，不得使用 `type="module"`、`export`、`import` | `file://` 下 ES module 受 CORS 限制会被浏览器直接拒绝；用户要求双击可开 | 只允许挂载全局 `window.LOWALT_SCENE_DATA` 与 `window.LOWALT_SCENE_API` |
| `scene.js` **内联** GeoJSON 内容，不在运行时 `fetch('./scenarios/v0/*.geojson')` | `file://` 下 `fetch` 本地文件被 CORS 拦截，双击打开会 100% 失败 | 内联内容必须与仓库文件字节级同源（人工复制后 `JSON.stringify` 不带注释）；数据块顶部注释注明来源路径与 `draft` 状态 |
| 所有 CDN 依赖以 UMD/经典脚本 + **固定版本号**引入 | 用户已实测 200；禁止浮动版本 | 版本锁：`maplibre-gl@4.7.1`、`deck.gl@9.1.0`、`@deck.gl/mapbox@9.1.0`、`@deck.gl/layers@9.1.0`、`@deck.gl/geo-layers@9.1.0` |
| deck.gl 图层通过 `MapboxOverlay` 叠加到 MapLibre | 二者共用同一 WebGL 上下文与相机，视角切换/拖拽天然同步 | `interleaved` 保持默认 `false`（非 interleaved 模式兼容性更好） |
| 建筑物高度为**演示构造** | `obstacles.geojson` 的 properties 仅含 `id/kind/is_simulated/status/source/design_intent`，**确实没有高度字段** | 高度必须由 id 派生的确定性公式生成，并标注 `height_source:"demo_derived"`（见 C-SCENE-DATA@1） |
| 场景坐标为局部 ENU（`x` 东、`y` 北，0–3000 m），渲染前转换为演示近似 WGS84 | `crs_note` 明确"转 WGS84 前不得用于地图渲染" | 页面与注释必须声明"演示近似、非真实地理坐标、不对应真实地点"（见 C-CRS@1） |

#### 2.1.3 脚本加载与启动序列（必须按此顺序，避免全局未定义）

1. `<head>`：`<link>` Google Fonts（`JetBrains Mono`，`preconnect`），失败不影响布局（CSS 有本地等宽回退）。
2. `</body>` 前依次插入：`scene.js` → MapLibre UMD → deck.gl 主包 UMD → `@deck.gl/layers` → `@deck.gl/geo-layers` → `@deck.gl/mapbox`（顺序保证后加载的图层注册到已存在的 `deck` 命名空间）。
3. 每个 CDN `<script>` 带 `onerror="window.__CDN_FAIL__.push('<name>')"`（`index.html` 在 `<head>` 内先内联初始化 `window.__CDN_FAIL__ = []`）。
4. `DOMContentLoaded` 后执行内联 `boot()`：先 `assertSceneLoaded()`（`LOWALT_SCENE_DATA` 存在且 `schema_version` 匹配），再按 §2.1.4 选择运行模式，最后启动演示时钟 `rAF` 循环。

#### 2.1.4 运行模式降级阶梯（`BOOT_MODE`，页面右上角常驻显示）

| 模式 | 触发条件 | 仍须可用 | 用户可见提示 |
|---|---|---|---|
| `FULL` | MapLibre + deck + `MapboxOverlay` 就绪，在线底图 5 s 内就绪 | 全部功能 | 无（仅状态点亮 `ONLINE`） |
| `NO_BASEMAP` | 底图样式/瓦片失败或 5 s 超时，库本身正常 | 全部三维要素 + 程序化网格底 + 2D/3D 切换 | 降级条："底图不可用，已切换离线底图（网格）" |
| `DECK_ONLY` | MapLibre 初始化失败（无 WebGL/worker 被阻）但 deck 可用 | deck 独立视图（`controller:true`）+ 网格 + 轨迹 + 面板 + 剖面 | 降级条："地图引擎不可用，已切换纯三维视图" |
| `STATIC` | deck 或其关键图层符号缺失 | 面板、剖面图（canvas 2D）、KPI、时间线、说明 | 降级条："三维渲染库未加载，仅显示数据面板"（禁止白屏） |

`DECK_ONLY`/`STATIC` 是**保护性兜底**，不以降低主路径质量为代价实现；主路径必须是 `FULL`。

#### 2.1.5 责任边界（谁是唯一写者）

- **T1**：唯一写 `apps/web/assets/scene.js`。负责"把 ENU 草稿几何变成可渲染 + 可复算的仿真数据"，**不写任何 DOM/图层/样式**。
- **T2**：唯一写 `apps/web/index.html`。负责全部视觉、交互、图层、剖面绘制、降级、响应式。**不得在页面内重新定义数据语义**（如自行改 margin 公式、自行编造备降点）。
- **T3**：唯一写 `tests/test_web_console_static.py`。只读产品文件，不改产品文件。
- **T4**：唯一写 `apps/web/README.md`（运行说明 + 验收记录）。不改 `index.html` / `scene.js`；发现缺陷只记录并回报，由 T1/T2 的 owner 修。
- **T5**：不写文件，只审阅 + 复跑 + 判定。

#### 2.1.6 与既有基线的对齐（不得自造语义）

| 前端字段 | 唯一依据 | 对齐要求 |
|---|---|---|
| `Task`（`task_id/origin/destination/payload_kg/vehicle_type/initial_energy_wh/reserve_energy_wh/time_limit_s/provenance`） | `core/models.py:126` | 字段名逐字一致，不新增同义字段；缺失用 `null`，禁止用 `0`/`-1` 顶替 |
| `Position`（`frame/alt_m/alt_ref/x_m/y_m/lat_deg/lon_deg`） | `core/models.py:79` | `frame=enu_m` 时只给 `x_m/y_m`；不得在同一对象内混放经纬度 |
| `RoutePlan`（含 `plan_version/snapshot_id/algorithm/waypoints/energy_budget_wh/diversion_site_id/checks`） | `core/models.py:236` | `checks` 措辞标注"规划器自报，仅供参考" |
| `DiversionMarginProfile` / `DiversionMarginSample` | `core/models.py:199-233` | `margin_wh` 语义严格为 `E_left − E_reserve − E_need`；可用性判定 = 样本非空且负值数为 0 |
| `RiskEvent`（`kind/geometry/alt_min_m/alt_max_m/effective_from/effective_until/provenance`） | `core/models.py:142` | `kind` 取值范围不得超出五值 |
| 表述红线 | `README.md` §表述红线、`docs/接口契约.md` §2.6 | 禁用词清单见 C-COPY@1 |

### 2.2 接口契约

**契约修订**：`C-CRS@1`、`C-SCENE-DATA@1`、`C-SCENE-GEO@1`、`C-SCENE-API@1`、`C-MARGIN-INVARIANT@1`、`C-COPY@1`、`C-STATIC-TEST@1`（全部 **READY**，除非条目内显式标注 BLOCKED）。

#### 2.2.0 契约索引

| 契约 ID | 提供方 | 消费方（任务） | 覆盖需求 | 状态 |
|---|---|---|---|---|
| `C-CRS@1` | T1 | T2、T3、T4 | R1.6、R10.2 | READY |
| `C-SCENE-GEO@1` | T1 | T2、T3 | R1.1–R1.6 | READY |
| `C-SCENE-DATA@1` | T1 | T2、T3 | R3–R8 | READY |
| `C-SCENE-API@1` | T1 | T2 | R2.4、R3.2、R4、R6.2 | READY |
| `C-MARGIN-INVARIANT@1` | T1（实现） + 本计划（规定） | T2、T3 | R4 | READY |
| `C-COPY@1` | 本计划（规定） | T1、T2、T3 | R10 | READY |
| `C-PAGE-ANCHORS@1` | T2（`index.html`） | T3、T4、T5 | R2、R3、R9.4、R11 的验收驱动 | READY |
| `C-STATIC-TEST@1` | T3 | T4、T5 | 全部验收 | READY |
| `VIEW-MARGIN@1` | 本计划（规定） | T2、T4 | R4 | READY（规范见 §2.3.3） |
| `C-BASELINE@1` | 既有仓库（只读） | T1、T2 | §2.1.6 | READY（未变更） |

---

#### C-CRS@1 —— ENU → WGS84 演示近似（命名空间、常量、公式）

**提供方**：T1（在 `scene.js` 内定义并随数据导出）。**消费方**：T2（渲染）、T3（数值复算）、T4（视觉核对）。

**性质声明（必须原文出现在页面与 `scene.js` 注释中）**：

> 局部 ENU 米制 → WGS84 的等距圆柱近似，仅用于演示渲染。非测量级转换，几何为自建虚拟城区，不对应任何真实地点。

**常量（`LOWALT_SCENE_DATA.crs`，全为只读）**：

| 键 | 值 | 说明 |
|---|---|---|
| `frame` | `"enu_m"` | 源坐标基准，与 `Frame.ENU_M` 一致 |
| `origin_lat_deg` | `31.2304` | 虚拟场景原点纬度（演示用） |
| `origin_lon_deg` | `121.4737` | 虚拟场景原点经度（演示用） |
| `meters_per_deg_lat` | `111320` | 每纬度米数（常量） |
| `meters_per_deg_lon` | `95188.9` | `111320 * cos(origin_lat_deg)`，保留 1 位小数 |
| `approximation` | `"equirectangular_demo"` | 近似方法标识 |
| `is_demo_approximation` | `true` | 机读标识，UI 必须据此显示"演示近似" |
| `disclaimer` | 上述性质声明全文 | 页面渐变提示与脚注复用该字符串 |

**转换公式（唯一实现，`C-SCENE-API@1.enuToLngLat` 内部使用）**：

```
lng = origin_lon_deg + x_m / meters_per_deg_lon
lat = origin_lat_deg + y_m / meters_per_deg_lat
（返回 MapLibre/deck 顺序 [lng, lat]，均为十进制度）
```

**逆变换**：`x_m = (lng − origin_lon_deg) * meters_per_deg_lon`，`y_m = (lat − origin_lat_deg) * meters_per_deg_lat`。

**不变量（T3 校验）**：
- 往返误差：对 8 个给定 ENU 点（0/750/1500/2250/3000 组合）`lngLatToEnu(enuToLngLat(p))` 与 `p` 相差 < 1e-6 m。
- 覆盖范围：`coverage = {min_x_m:0, max_x_m:3000, min_y_m:0, max_y_m:3000, center_lnglat:[121.489460, 31.243876]}`；`center_lnglat` 由 `enuToLngLat(1500,1500)` 得到，容差 ±1e-5 度。
- 场景全部要素的 `_lnglat` 派生值必须落在上述范围的 ±50 m 等价包围框内（防止转换写反经纬度顺序）。

---

#### C-SCENE-GEO@1 —— 几何数据（含三维派生）

**提供方**：T1。**消费方**：T2（图层）、T3（字段/数量校验）。

**来源基线（只读，必须原样内联）**：`scenarios/v0/landing_sites.geojson`、`scenarios/v0/zones.geojson`、`scenarios/v0/obstacles.geojson` 的全部 `features`（顺序保持文件内顺序）。三份文件的 `crs_note` 一律为"局部 ENU 米制坐标…转 WGS84 前不得用于地图渲染"。

> **禁止引用不存在的文件**：`scenarios/README.md` 提到的 `origin_destination.geojson`、`vehicles/placeholder.yaml` 在当前仓库**不存在**（`vehicles/` 只有 `placeholder.yaml` 但内容为占位、数值待定）。起降点一律取自任务（`Task.origin/destination`），机型参数不得编造数值用作展示统计。

**`LOWALT_SCENE_DATA.geojson`**：三个键 `landing_sites` / `zones` / `obstacles`，值为**未转换的原始 FeatureCollection 对象**（逐字段原样，便于与仓库文件比对）。数量必须为 4 / 4 / 20。

**`LOWALT_SCENE_DATA.sites`**（数组，顺序 L1→L4，4 条）：

```js
{
  site_id: "L1",                 // 取自 properties.id
  kind: "landing_site",
  x_m: 700, y_m: 700,            // 原始 ENU（保留原值，不改精度）
  lnglat: [lng, lat],            // 派生渲染值（见 C-CRS@1）
  position: {                    // 与 core/models.py Position 对齐
    frame: "enu_m", alt_m: 0, alt_ref: "agl", x_m: 700, y_m: 700
  },
  radius_m: 30,                  // 源字段
  compatible_vehicle_types: ["placeholder"],
  occupied: false,
  available_from: null, available_until: null,
  is_simulated: true, source: "自建虚拟城区 v0",
  status: "available"            // 派生：available | occupied（由 occupied 与演示时钟的时窗决定）
}
```

**`LOWALT_SCENE_DATA.zones`**（数组，顺序 R01→R04，4 条）：

```js
{
  zone_id: "R01", kind: "restriction_zone",
  polygon_enu: [[x,y], ...],          // 闭合环，首末点相同
  polygon_lnglat: [[lng,lat], ...],   // 同序派生
  alt_min_m: 0, alt_max_m: 120,       // 源字段；三维柱体 = 从 alt_min_m 拉伸到 alt_max_m
  centroid_lnglat: [lng, lat],
  is_simulated: true, source: "自建虚拟城区 v0"
}
```

**`LOWALT_SCENE_DATA.obstacles`**（数组，顺序 B01→B20，20 条）：

```js
{
  obstacle_id: "B01", kind: "building",
  polygon_enu: [[x,y], ...],
  polygon_lnglat: [[lng,lat], ...],
  centroid_lnglat: [lng, lat],
  footprint_area_m2: <数值>,      // 派生，供体块着色/排序
  height_m: 36 + ((index * 37) % 11) * 6.5,   // index = 该要素在 features 中的 1 基序号；范围 36.0–101.0
  height_ref: "agl",
  height_source: "demo_derived",  // 关键：源数据无高度字段
  is_simulated: true, source: "自建虚拟城区 v0"
}
```

> `height_m` 公式是**规范值**，不得由 T2 重新发明。理由与后果必须出现在图例文案中："建筑高度为演示构造值（源草稿几何无高度字段）"。

**不变量（T3 校验）**：
- `sites.length === 4` 且 `sites[*].site_id === ["L1","L2","L3","L4"]`；`sites[*].radius_m === 30`。
- `zones.length === 4`，`zones[*].alt_min_m === 0 && alt_max_m === 120`；4 个区域 id 与 `R01..R04` 一一对应。
- `obstacles.length === 20`；每个 `height_m` 落在 `[36.0, 101.0]`，且 `height_source === "demo_derived"`。
- 每个多边形 `polygon_enu` 与 `polygon_lnglat` 顶点数相同、首末点闭合、点序一致。
- `radius_m` 只出现在 sites；sites 不含 `alt_min_m`（与 `scenarios/README.md` 表格一致）。

---

#### C-SCENE-DATA@1 —— 业务数据（任务 / 候选路线 / 剖面 / 事件 / KPI）

**提供方**：T1。**消费方**：T2（全部面板与场景）、T3（结构校验）。
字段命名**逐字**对齐 `core/models.py`；允许的**新增展示字段**只有本节列出的 `*_lnglat`、`at_s`、`e_left_wh`、`e_need_wh`、`status`、`label`、`scenario_ref`、`title`，其余不得自造。

**演示时钟基准**：所有 `at_s` / `t_s` 均为"相对任务开始秒数"（与 `eval/scenarios/v0.yaml` 注释一致），周期 `CYCLE_S = 180`。

##### C-SCENE-DATA@1.1 `tasks`（5 条，必须完整）

```js
{
  task_id: "T-S2-01",
  scenario_ref: "S2-01",                  // 展示字段：对应 eval/scenarios/v0.yaml 的 id
  title: "改线 · 起飞后 40 s 限制区生效",
  status: "in_flight",                    // 展示字段：queued | in_flight | infeasible | delivered | diverted
  origin:      { frame:"enu_m", alt_m:0,  alt_ref:"agl", x_m:300,  y_m:300  },
  destination: { frame:"enu_m", alt_m:30, alt_ref:"agl", x_m:2700, y_m:2700 },
  payload_kg: 1.0,
  vehicle_type: "placeholder",
  initial_energy_wh: 45.0,
  reserve_energy_wh: 10.0,
  time_limit_s: 700,
  provenance: {
    source: "sim:scenario_v0", version: "v0-draft",
    captured_at: "2026-11-10T00:00:00Z",
    valid_from: null, valid_until: null,
    is_simulated: true,
    uncertainty_note: "构造的 SITL 演示任务，数值用于展示，不作为性能结论"
  },
  is_simulated: true                      // 冗余机读位，UI 徽标直接读它
}
```

必须存在的 5 个 `task_id` 与来源场景：`T-S1-01`(S1-01)、`T-S2-01`(S2-01)、`T-S2-04`(S2-04)、`T-S3-03`(S3-03)、`T-S4-01`(S4-01)。
`origin/destination` 的 `x_m,y_m,alt_m` **直接取自** `eval/scenarios/v0.yaml` 对应场景，不得改写；`payload_kg` / `time_limit_s` 同样取自该文件。
`T-S4-01` 的 `status` 必须为 `"infeasible"`（场景为"载荷超出机型能力"，`payload_kg: 6.0`）。

##### C-SCENE-DATA@1.2 `routes`（候选路线，`RoutePlan` 形状）

```js
{
  route_id: "RT-S2-01-A",
  task_id: "T-S2-01",                 // 展示关联键（RoutePlan 本身无 task_id，用此键挂接）
  plan_version: "v1",
  snapshot_id: "SN-S2-01-01",
  algorithm: "astar_static",
  waypoints: [                        // ≥2；frame=enu_m；alt_m 30–45，alt_ref="agl"
    { frame:"enu_m", alt_m:30, alt_ref:"agl", x_m:300,  y_m:300  },
    { frame:"enu_m", alt_m:30, alt_ref:"agl", x_m:2700, y_m:2700 }
  ],
  energy_budget_wh: 38.0,
  diversion_site_id: "L2",            // 可为 null
  valid_until: "2026-11-10T00:20:00Z",
  checks: [                           // 规划器自报；UI 必须标注"自报，仅供参考"
    { name: "restriction_zone", passed: false, detail: "航段穿越 R01 生效时段" },
    { name: "diversion_reachability", passed: false, detail: "中段退出距离超过剩余能量" }
  ],
  is_simulated: true
}
```

**必须存在的路线**：

| `route_id` | `task_id` | `plan_version` | `algorithm` | `diversion_site_id` | 几何硬约束 |
|---|---|---|---|---|---|
| `RT-S2-01-A` | T-S2-01 | v1 | `astar_static` | `"L2"` | 折线**必须穿越 R01 多边形**（对角直连即可），起点=任务 origin、终点=任务 destination |
| `RT-S2-01-B` | T-S2-01 | v2 | `astar_diversion_aware` | `"L2"` | 折线**必须不穿越** R01/R02/R03/R04 任一多边形；起终点同上 |
| `RT-S1-01-A` | T-S1-01 | v1 | `astar_static` | `"L4"` | 起终点同任务；避开全部限制区 |
| `RT-S2-04-A` | T-S2-04 | v1 | `astar_static` | `"L2"` | 避开 R01（起飞前已知，必须绕行） |
| `RT-S3-03-A` | T-S3-03 | v1 | `astar_static` | `"L2"` | 与 R03 有交叉（体现断连期间不可知） |

`T-S4-01` **不提供路线**；`routes` 中不得出现 `task_id:"T-S4-01"` 的条目，页面据此显示"不可行"。

##### C-SCENE-DATA@1.3 `margin_profiles`（`DiversionMarginProfile` 形状）

```js
{
  route_id: "RT-S2-01-A",
  task_id: "T-S2-01",
  plan_version: "v1",
  reserve_wh: 10.0,                  // 必须 === 对应 Task.reserve_energy_wh
  samples: [                          // 采样步长 ≤ 20 m；按 s_m 严格递增
    { s_m: 0, t_s: 0, margin_wh: 8.9, nearest_site_id: "L1", e_left_wh: 45.0, e_need_wh: 26.1 }
    /* ... 至终点 ... */
  ],
  is_simulated: true
}
```

必须存在 4 条剖面：`RT-S2-01-A`、`RT-S2-01-B`、`RT-S1-01-A`、`RT-S2-04-A`。
`RT-S3-03-A` 可省略剖面；页面在该任务下显示"无剖面数据"而不是空白。

##### C-SCENE-DATA@1.4 `events`（`RiskEvent` 形状 + 相对时刻）

```js
{
  event_id: "EV-S2-01-R01",
  kind: "restriction_zone",                     // 只允许 models.py 的五值
  task_id: "T-S2-01",
  label: "R01 限制区生效 0–120 m",
  geometry: { type:"Polygon", coordinates:[[[x,y],...]] },   // ENU 原始坐标，与 zones.geojson 同源
  alt_min_m: 0, alt_max_m: 120,
  at_s: 40,                                     // 相对任务开始秒数（演示时钟联动）
  effective_from: "2026-11-10T00:00:40Z",       // = 基准时刻 + at_s，ISO8601 UTC
  effective_until: null,
  provenance: { source:"sim:scenario_v0", version:"v0-draft", captured_at:"2026-11-10T00:00:00Z",
                valid_from:null, valid_until:null, is_simulated:true, uncertainty_note:null },
  is_simulated: true
}
```

必须覆盖 5 种 `kind` 各 ≥1 条（`restriction_zone` / `wind` / `link_degradation` / `landing_site_change` / `battery_anomaly`），另加 **1 条计划版本变更条目**：

```js
{ event_id:"EV-S2-01-PLAN-V2", kind:"plan_version_change", task_id:"T-S2-01",
  label:"改线 v1 → v2（避开 R01，备降余量恢复非负）", from_version:"v1", to_version:"v2",
  at_s: 52, effective_from:"2026-11-10T00:00:52Z", effective_until:null, ... }
```

> `plan_version_change` 是**展示层条目类型**，不属于 `RiskEvent.kind` 枚举：该条目的 `kind` 只用于时间线分组，不得被当作第 6 种 RiskEvent。T3 校验规则：五值 RiskEvent 条目各自存在且其 `kind` ∈ 五值集合；时间线条目总数 ≥ 6。

##### C-SCENE-DATA@1.5 `telemetry`（`VehicleState` 形状）

至少 2 条在飞记录（`T-S2-01`、`T-S3-03`），每条含**轨迹序列**：

```js
{
  task_id: "T-S2-01",
  route_id: "RT-S2-01-B",           // 演示中执行 v2
  samples: [                        // 按 ts 递增；长度 ≥ 24
    { ts:"2026-11-10T00:00:00Z", at_s:0,
      position:{ frame:"enu_m", alt_m:0, alt_ref:"agl", x_m:300, y_m:300 },
      groundspeed_mps: 12.5, energy_remaining_wh: 45.0,
      flight_mode:"AUTO.MISSION", gps_fix:"3d_fix", link_quality_pct: 96,
      executing_plan_version:"v2",
      provenance:{ source:"sim:scenario_v0", version:"v0-draft", captured_at:"2026-11-10T00:00:00Z",
                   valid_from:null, valid_until:null, is_simulated:true, uncertainty_note:null } }
  ]
}
```

##### C-SCENE-DATA@1.6 `kpi_baseline` 与派生规则

```js
kpi_baseline = { tasks_total: 5, in_flight: 2, min_margin_wh: <全部剖面 samples 的最小值（含历史 v1 的负值）>, link_quality_pct: 87, simulated_ratio_pct: 100 }
```

`computeKpis(t_s)` 返回字段名与上表一致，并满足：`tasks_total` = `tasks.length`；`in_flight` = `tasks` 中 `status==="in_flight"` 的数量；`min_margin_wh` = **全部剖面**（含被替换的历史 `plan_version`）`min(samples.margin_wh)`；UI 该 KPI 的标签必须带"（含历史方案）"，否则读者会误以为在飞方案已不可行。`link_quality_pct` ∈ [0,100] 且随 `link_degradation` 事件窗口下降到 ≤ 35；`simulated_ratio_pct` = 100（当前全部数据 `is_simulated=true`）。

---

#### C-MARGIN-INVARIANT@1 —— 剖面数值不变量（主视觉可复算）

**规定方**：本计划；**实现方**：T1；**校验方**：T2（自检）与 T3（自动化）。

采样与计算规范（T1 实现时必须遵守，使两条剖面自洽且可复算）：

```
步长 STEP = 15 m（s_m 从 0 到路线几何总长 L，末点必含 L）
E_left(s)  = initial_energy_wh − CRUISE_WH_PER_M * s
d_site(s)  = 采样点到"最近有效备降点"的退出距离（ENU 欧氏距离）
             × 绕行系数 SURCHARGE：1.0（无生效中限制区阻隔）/ 2.6（退出路径穿越生效中的限制区）
E_need(s)  = NEED_WH_PER_M * d_site(s) + CLIMB_FIXED_WH        // CLIMB_FIXED_WH = 2.5
margin(s)  = E_left(s) − reserve_wh − E_need(s)
```

硬不变量（任何一条不满足即视为 T1 未完成）：

| 编号 | 不变量 | 校验方式 |
|---|---|---|
| `I1` | `RT-S2-01-A`（旧线）至少 5 个采样 `margin_wh < 0`，且 `min(margin_wh) ≤ −1.5` | 数值断言 |
| `I2` | `RT-S2-01-B`（新线）全部 `margin_wh ≥ +1.0` | 数值断言 |
| `I3` | 每条剖面 `s_m` 严格递增、首点 `s_m === 0`、末点 `\|s_m − 路线总长\| ≤ 0.5`；`t_s` 非递减 | 数值断言 |
| `I4` | `profile.reserve_wh === task.reserve_energy_wh`（同一 task 下所有 profile） | 相等断言 |
| `I5` | `RT-S2-01-A` 负值区间的 `nearest_site_id` 必须为 `"L2"`（体现"唯一中段备降点不足"），不得为 `null` | 集合断言 |
| `I6` | 每个采样 `abs(e_left_wh − reserve_wh − e_need_wh − margin_wh) ≤ 0.05` | 浮点容差断言 |
| `I7` | 所有 `margin_wh` 为有限数（禁止 `NaN`/`Infinity`/`null`）；`abs(margin_wh) ≤ 500` | 有限性断言 |

**语义红线（T2 不得改写）**：`margin_wh` 的符号含义固定 —— 负值表示"该点处剩余能量不足以支撑就近备降"，不是"电量低"；UI 文案不得写"电量不足告警"，须写"备降余量为负（无足够能量完成就近备降）"。

参数起点建议（允许微调，但必须满足 I1–I7）：`initial_energy_wh=45`、`reserve_wh=10`、`CRUISE_WH_PER_M=0.011`、`NEED_WH_PER_M=0.010`、`CLIMB_FIXED_WH=2.5`。若 `I1` 不满足，优先提高 `CRUISE_WH_PER_M` 或调整旧线与 L2 的相对关系，**禁止**硬编码伪造负值。

#### C-SCENE-API@1 —— 全局 API 表面（`window.LOWALT_SCENE_API`）

**提供方**：T1。**消费方**：T2。T1 只保证这些函数存在且语义如此，不得把渲染逻辑塞进 API；T2 不得绕过 API 自行实现坐标转换或剖面插值。

| 签名 | 语义（精确） | 失败/边界行为 |
|---|---|---|
| `enuToLngLat(x_m:number, y_m:number): [number, number]` | 按 `C-CRS@1` 公式返回 `[lng, lat]` | 非有限数输入抛 `RangeError`；输入超 `coverage ± 5000 m` 仍按公式计算（不夹取），便于调试 |
| `lngLatToEnu(lng:number, lat:number): {x_m:number, y_m:number}` | 逆变换 | 同上 |
| `routePolylineEnu(route_id:string): Array<{x_m:number,y_m:number,alt_m:number}>` | 返回该路线 waypoints 的 ENU 视图（与 `waypoints` 等长同序） | 未知 `route_id` 返回 `[]`，并在 `console.warn` 输出一次（不得抛错中断页面） |
| `routePolylineLngLat(route_id:string): Array<[number,number,number]>` | 同上转为 `[lng, lat, alt_m]`，供 deck.gl 直接使用 | 未知 id 返回 `[]` |
| `routeLengthM(route_id:string): number` | 折线 ENU 平面长度总和（m，保留 3 位小数） | 未知 id 返回 `0` |
| `sampleRouteAt(route_id:string, s_m:number): {x_m:number,y_m:number,alt_m:number,bearing_deg:number}` | 沿线累计距离 `s_m` 线性插值取点；`bearing_deg` 为该段方向角（0=正北，顺时针，0–360） | `s_m<0` 夹到 0；`s_m>L` 夹到 L；未知 id 返回 `null` |
| `routeDurationS(route_id:string): number` | 演示用飞行时长（按 `groundspeed_mps` 均值推算，s） | 未知 id 返回 `0` |
| `getTask(task_id:string): Task \| null` | 返回任务对象引用 | 未知 id 返回 `null` |
| `getRoutesForTask(task_id:string): RoutePlan[]` | 返回该任务的候选路线（按 `plan_version` 升序） | 无候选返回 `[]` |
| `getProfile(route_id:string): DiversionMarginProfile \| null` | 返回剖面 | 无剖面返回 `null` |
| `getEventsSortedDesc(): Event[]` | 按 `at_s` 降序（时间线用） | 无事件返回 `[]` |
| `getVehicleAt(task_id:string, t_s:number): VehicleState \| null` | 在 `samples` 上按 `at_s` 线性插值 `position/energy_remaining_wh/link_quality_pct`；`flight_mode`/`executing_plan_version` 取左侧样本 | 无 telemetry 返回 `null` |
| `getSiteStatus(site_id:string, t_s:number): {status:"available"\|"occupied", reason:string}` | 结合 `occupied` 与演示事件（`landing_site_change`）判定 | 未知 id 返回 `{status:"occupied", reason:"unknown site"}` |
| `computeKpis(t_s:number): KpiSet` | 见 `C-SCENE-DATA@1.6` | 无数据时数值字段为 `0`，`min_margin_wh` 为 `null` |
| `CYCLE_S: number` | 演示周期常量，必须 `=== 180` | — |
| `DEMO_CLOCK_SPEED: number` | 播放倍速常量，必须 `=== 6` | — |

**只读性要求**：`LOWALT_SCENE_DATA` 与 API 返回值在页面上不得被原地修改（T2 若需派生值必须复制）。T1 在 `scene.js` 末尾对 `LOWALT_SCENE_DATA` 执行 `Object.freeze` 深层冻结（数组与对象均冻结），并在 `file://` 下保持无副作用。

---

#### C-PAGE-ANCHORS@1 —— 页面锚点与诊断接口（供自动化/人工验收驱动）

**提供方**：T2（`index.html`）。**消费方**：T3（静态锚点断言）、T4（浏览器验收驱动）、T5（复跑）。

**必需的 DOM 锚点**（`id` 必须存在且唯一；内部结构由 T2 自定）：

| `id` | 用途 | 被谁断言 |
|---|---|---|
| `app` | 根容器（承载布局 grid） | T3 |
| `kpi-strip` | KPI 条容器，内部至少 5 个 `.kpi` 子项 | T3/T4 |
| `stage` | 主舞台容器（地图 canvas 挂载点） | T3/T4 |
| `stage-overlay` | 扫描线/暗角覆盖层（`pointer-events:none`） | T4 |
| `mode-toggle` | 视角切换控件（`button`，含 `aria-pressed`） | T4 |
| `play-toggle` | 暂停/继续控件 | T4 |
| `degradation-banner` | 降级提示条（默认隐藏，降级时可见） | T4 |
| `margin-profile` | 剖面 `<canvas>` | T3/T4 |
| `task-list` / `task-detail` | 任务队列与详情 | T3/T4 |
| `route-list` | 候选路线列表 | T3/T4 |
| `event-timeline` | 事件时间线 | T3/T4 |
| `legend` | 图例（含建筑高度演示说明、坐标说明） | T3 |
| `footer-copyright` | 版权与灵感来源声明 | T3 |

**必需诊断接口**（`window.LOWALT_CONSOLE`，只在 `FULL`/`NO_BASEMAP`/`DECK_ONLY` 下完整可用；`STATIC` 下至少 `getState`/`selectTask`/`selectRoute` 可用）：

| 成员 | 语义 |
|---|---|
| `version: string` | 页面版本，必须 `"1.0.0"` |
| `bootMode: string` | 当前 `FULL`/`NO_BASEMAP`/`DECK_ONLY`/`STATIC` |
| `getState(): {mode, cameraBusy, selectedTaskId, selectedRouteId, playing, demoT_s, bootMode}` | 返回状态快照（只读副本） |
| `setMode(mode: "2D"\|"3D"): Promise<void>` | 触发一次视角切换；resolve 于过渡完成（≤ 1500 ms 必须 resolve 或 reject 并说明原因） |
| `selectTask(task_id: string): void` | 等价于点击任务列表项（用于 T4 驱动 R5/R6 一致性） |
| `selectRoute(route_id: string): void` | 等价于点击候选路线项 |
| `setPlaying(playing: boolean): void` | 等价于点击播放控件 |
| `setDemoTime(t_s: number): void` | 直接定位演示时钟（用于断言 R7.4/R8 状态） |
| `simulateDegradation(kind: "basemap"\|"map"\|"cdn"): void` | **仅用于验收演练**：分别强制进入 `NO_BASEMAP`/`DECK_ONLY`/`STATIC`，并弹出对应降级条；不得影响正常路径 |
| `symbols: {maplibre: boolean, deck: boolean, layers: {PolygonLayer: boolean, PathLayer: boolean, TripsLayer: boolean, ScatterplotLayer: boolean, TextLayer: boolean, LineLayer: boolean}, mapboxOverlay: boolean}` | D1 风险留证：启动时解析结果的机读快照 |
| `lastFrameMs: number` | 最近 30 帧平均帧时间（用于 R9.4 证据） |

**约束**：诊断接口不得引入业务逻辑分歧（即 `selectTask()` 与点击列表必须走同一函数）；`simulateDegradation` 只允许在 `index.html` 内切换模式与展示，不得伪造数据。

---

#### C-COPY@1 —— 文案与表述红线（禁用词清单）

**规定方**：本计划。**实现方**：T1（数据文案）+ T2（界面文案）。**校验方**：T3（文件级扫描）、T5（人工复核）。

**必须出现的文案（逐字）**：

1. 页头状态区：`仿真数据 · SITL 软件在环仿真 · 无实机飞行`
2. 坐标说明（图例或舞台角标）：`局部 ENU → WGS84 演示近似，非真实地理坐标`
3. 数据徽标：`SIM`（每个仿真面板/任务/事件旁）
4. 规划器检查标注：`规划器自报，仅供参考；最终判定以独立校验为准`
5. 建筑高度说明：`建筑高度为演示构造值（源草稿几何无高度字段）`
6. 页脚：`视觉语言参考 HALOFLUX by Ryder191（PolyForm Noncommercial，仅非商业用途）。本页面为原创实现，未复制其源码。`

**禁用词（文件级、含 HTML 注释与 JS 注释、不区分大小写）**：

| 禁用串 | 理由 |
|---|---|
| `实飞` | 仓库红线：仿真不得称为实飞 |
| `真实飞行` | 同上 |
| `实测数据` / `实测飞行` | 无实测数据 |
| `边缘实时重规划` | 仓库红线：本地备用方案切换 ≠ 边缘实时重规划 |
| `Agent 自主决策` / `自主决策` | 仓库红线：固定顺序调用工具 |
| `生产环境` / `已上线` | 与原型定位冲突 |
| `HALOFLUX 源码` 的复制性表述（如 `移植自 HALOFLUX`、`forked from haloflux`） | 版权：仅借鉴视觉语言 |

**允许出现**：`仿真`、`SITL`、`演示数据`、`构造数据`、`原型`、`参考`、`灵感来源`。
> 扫描实现注意：允许"参考 HALOFLUX"这一合法表述，禁用词扫描必须用**整词/整短语**匹配（如 `移植自`、`forked from`），不得因页脚合法引用而误报。

---

#### C-STATIC-TEST@1 —— T3 静态契约检查（pytest）

**提供方**：T3（`tests/test_web_console_static.py`）。**消费方**：T4（集成前门禁）、T5（独立终验）。**不修改产品文件**。

测试必须能从 `scene.js` 中**真实解析出数据**，因此 T1 必须满足（这是契约，不是建议）：

- `scene.js` 中赋值语句形如 `window.LOWALT_SCENE_DATA = {...};`，**整个对象是合法 JSON 字面量**：不得含注释、函数、单引号、尾逗号、`undefined`。
- 数据块**独占一个赋值表达式**，块结束后紧跟 `;` 且下一行是空行或注释；T3 用"截取 `window.LOWALT_SCENE_DATA = ` 之后、按括号配平找到的闭合 `}`"的方式提取，再 `json.loads`。所有行内注释必须放在数据块之外。
- 数据块内不得出现 `NaN` / `Infinity`（JSON 不允许）。

必须实现的断言（最小集，全部对应 C-COPY@1 / C-CRS@1 / C-SCENE-GEO@1 / C-SCENE-DATA@1 / C-MARGIN-INVARIANT@1）：

| 组 | 断言要点 |
|---|---|
| 文件存在 | `apps/web/index.html`、`apps/web/assets/scene.js`、`apps/web/README.md` 均存在且非空；`index.html` 内含 `<script src="assets/scene.js">` 与 `id="stage"` / `id="margin-profile"` 锚点 |
| 无构建痕迹 | `index.html` 不引用 `node_modules`、`dist/`、`.ts`、`import `、`require(`；无 `type="module"` |
| CDN 锁版本 | 存在 `maplibre-gl@4.7.1`、`deck.gl@9.1.0`、`@deck.gl/mapbox@9.1.0`、`@deck.gl/layers@9.1.0`、`@deck.gl/geo-layers@9.1.0` 五个固定版本串；不得出现 `@latest` 或省略版本的对应 URL |
| CRS | 往返误差 < 1e-6 m（用 Python 复算公式）；`meters_per_deg_lon ≈ 111320*cos(lat0)`（±1.0）；`is_demo_approximation is True` |
| 几何 | 数量 4/4/20；`height_m ∈ [36,101]`；`height_source=="demo_derived"`；多边形闭合 |
| 任务 | 5 个 `task_id` 齐全；`Task` 必需字段无缺失（用 `models.py` 的字段名集合比对）；起终点与 `eval/scenarios/v0.yaml` 数值一致（用 PyYAML 读取，若解析失败则跳过并在报告注明） |
| 路线 | 5 条必需路线存在；`RT-S2-01-A` 折线与 R01 相交、`RT-S2-01-B` 与 4 个限制区均不相交（射线法/点在多边形内） |
| 剖面 | 4 条剖面；`I1`–`I7` 全部断言；`reserve_wh` 与任务一致 |
| 事件 | 五值 `kind` 各 ≥1 条；时间线条目 ≥6；`effective_from` 可由 `at_s` 与基准时刻推算一致（±1 s） |
| 红线 | 全部 `apps/web/**` 文本文件扫描禁用词（C-COPY@1），命中即失败并打印文件:行 |
| 版权 | 页脚包含 `HALOFLUX by Ryder191` 与 `原创实现` 字样 |

**输出要求**：测试失败信息必须指出具体契约编号与字段路径（如 `C-SCENE-DATA@1.3 I2 RT-S2-01-B s_m=1185 margin=-0.4`），便于 T1 单点修复。

---

### 2.3 共享行为、集成与未决决策

#### 2.3.1 唯一状态源（UI 单一真相）

页面内部只允许一个可变的 UI 状态对象（`state`），其余模块只读派生值。字段与转移：

```js
state = {
  mode: "3D" | "2D",                 // 视角模式
  cameraBusy: false,                 // 过渡中
  selectedTaskId: "T-S2-01",
  selectedRouteId: "RT-S2-01-B",
  playing: true,
  demoT_s: 0,                        // 0..CYCLE_S，由 rAF 推进
  bootMode: "FULL",
  degradeReasons: []                 // 例如 ["basemap_timeout"]
}
```

**唯一性规则（跨面板一致性由此保证）**：
- `selectedTaskId` 变化 → 必须依次重算：候选路线列表 → 若 `selectedRouteId` 不属于该任务则默认选中该任务第一条（不可行任务则置 `null`）→ 剖面 `route_id` → 飞行器 `task_id` → 各面板高亮。**任一面板不得单独改变选中项**。
- `selectedRouteId` 变化 → 只允许改：地图高亮、剖面 `plan_version`、飞行器起始位置。不改任务选中。
- `demoT_s` 是**唯一时间源**：暂停 = 停止推进 `demoT_s`；流光、飞行器、事件"已生效"态、KPI 链路质量均由 `demoT_s` 派生，**不得各自持有独立计时器**。
- `mode` 变化 → 只改相机；不得重置 `demoT_s`、选中项。

**视角切换状态机（R2）**：

| 事件 | 前置 | 动作 | 后置 |
|---|---|---|---|
| 点击切换 | `cameraBusy=false` | `mode` 取反；`cameraBusy=true`；`camera.easeTo({pitch: 0|55, bearing: 0|-24, duration: 900, easing: t=>t<0.5?2t²:1-((-2t+2)²)/2})` | 完成后 `cameraBusy=false` |
| 点击切换 | `cameraBusy=true` | 记录 `pendingMode`；若与当前目标不同，在完成回调里立即再发起一次 `easeTo` | 以最后一次目标为准（R2.5） |
| 用户拖拽 | 任意 | `cameraBusy=false`；若实际 pitch < 5° 则 `mode` 归位为 `2D`，否则 `3D`（文案与真实视角一致） | 状态反馈与相机一致 |

`DECK_ONLY` 模式下无相机 pitch 概念：以 deck 的 `viewState.pitch` 达成同样的 0°/55° 过渡，并在状态区标注 `DECK_ONLY`。

#### 2.3.2 图层职责与更新节流（性能契约，R9.4）

| 图层（deck.gl） | 数据 | 更新时机 | 节流策略 |
|---|---|---|---|
| `PolygonLayer`（建筑拉伸） | `obstacles`（20），`extruded:true`，`getElevation: height_m`，`elevationScale:1` | 仅初始化/视角无关 | 静态，构建一次；切换 2D/3D 时只改 `extruded` 与 `material`，不重建数据 |
| `PolygonLayer`（限制区柱体） | `zones`（4），`elevation: alt_max_m−alt_min_m`，半透明，双面 | 演示时钟跨过生效时刻时改颜色/透明度 | 仅在布尔状态翻转时更新（非每帧） |
| `ScatterplotLayer`（备降点） | `sites`（4），半径 `radius_m` 折算像素，颜色按 `status` | 状态变化时 | 同上 |
| `TextLayer`（标签） | site/zone/任务起终点 | 视角变化后 200 ms 防抖 | 拖拽期间跳过更新（拖拽结束再刷） |
| `PathLayer`（航线底线） | 全部候选（5）+ 选中高亮 | 选中变化 | 静态数据缓存；仅改 `widthMinPixels`/颜色 |
| `TripsLayer`（轨迹流光） | 选中路线 | **每帧** `currentTime` | 必须：每帧只更新 `currentTime` 数值，不重建 layer 数组；`trailLength` 固定 |
| `ScatterplotLayer`×2（飞行器 + 脉冲环） | `getVehicleAt()` 结果 | 每帧 | 同上；脉冲半径用 `demoT_s` 取模计算，避免额外迭代 |
| `LineLayer`（程序化网格，离线/装饰） | 13×13 条线，250 m 间距 | 仅 `NO_BASEMAP`/`DECK_ONLY` 或在线低透明度装饰 | 静态 |

**硬性性能规则**：
1. 每帧最多 **1 次** `overlay.setProps()`（或 `deck.setProps()`），把本帧所有变化合并成一个 `layers` 数组；禁止 N 个图层各自 `setProps`。
2. 每帧工作量上限：只允许更新依赖 `demoT_s` 的 3 个属性（trips `currentTime`、飞行器 `position`、脉冲 `radius`）；其余属性不得每帧重建。
3. 页面在 `document.hidden` 时暂停 rAF（`visibilitychange`），恢复时不追帧（`demoT_s` 从暂停点继续），防止后台耗电与回到前台卡顿。
4. 剖面 canvas 与地图 canvas 独立：剖面重绘只由"选中变化/尺寸变化/窗口变化/hover"触发，不进入每帧循环；动画型数值（KPI 计数）使用固定 400 ms 过渡。
5. 帧时间超标处理：若连续 30 帧平均 `> 22 ms`，把流光与脉冲更新降到每 2 帧一次（仍保持视觉连续），并在状态区显示 `PERF: LITE`；禁止通过关闭功能来"达标"。

#### 2.3.3 剖面视图规范（`VIEW-MARGIN@1`，T2 必须实现，验收依据）

| 项 | 规范 |
|---|---|
| 画布 | `<canvas id="margin-profile">`，宽度 = 容器宽度 × `devicePixelRatio`，高度：桌面 ≥ 200 px、窄屏 ≥ 160 px |
| 内边距 | 左 52 px（纵轴标签）、右 16 px、上 20 px、下 26 px（横轴标签） |
| X 映射 | `x = padL + (s_m / totalS) * plotW`；`totalS = 该剖面 samples 末点 s_m`（不是路线长度，避免数据与坐标不一致时误导） |
| Y 映射 | `yMin = min(0, minMargin) * 1.15`，`yMax = max(0.5, maxMargin * 1.12)`；`y = padT + (yMax − m) / (yMax − yMin) * plotH` |
| 零线 | 1 px 虚线 `#cfd2d8`（45% 不透明度），右端标注 `0 Wh` |
| 正区线 | 2 px 实线 `#98e0cf`；线下方渐变填充 `rgba(152,224,207,0.10)` |
| 负区 | `canvas.save(); clip(零线以下路径)` → 填充 `rgba(230,86,122,0.20)` + 折线 `#f0708f` 2 px；`restore()`。**必须 clip**，不得整段涂红 |
| 网格 | 水平 4 条 + 垂直 5 条，1 px `#25282e`；刻度文字 9 px，`#6b6f78` |
| 备降点标注 | 在 `s_m` 最接近该点投影位置处画 6 px 竖向虚线 + 顶部 `L2` 标签（10 px，`#98e0cf`） |
| 限制区生效点 | 黑色三角标记 + `R01@40s` 标签（10 px，`#f0a6c6`） |
| 最小值点 | 2.5 px 圆点 + 数值标签 `MIN −3.4 Wh`；负值时标签色 `#f0708f`，非负时 `#98e0cf` |
| 对比模式 | 两条剖面同轴叠加：旧线 `#f0708f`（虚线 4/3）、新线 `#98e0cf`（实线）；右上角图例显示 `v1 astar_static` / `v2 astar_diversion_aware`（含各自 `min`） |
| 无数据 | 显示等宽字体文本 `NO PROFILE DATA` + "该候选路线未提供备降余量剖面" |
| hover（可选增强） | 显示 `s_m / t_s / margin_wh / nearest_site_id` 十字线读数；不实现不扣验收项 |

#### 2.3.4 离线兜底行为（R11 的具体结果）

1. **底图探测**：`fetch('https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', {mode:'cors', signal})`，`AbortController` 超时 **5000 ms**。成功 → `map.setStyle(url)`；失败/超时 → `bootMode="NO_BASEMAP"`，保留初始化时的本地内联 style：

```js
{ version: 8, sources: {}, layers: [
  { id: "bg", type: "background", paint: { "background-color": "#08090b" } } ] }
```

2. **程序化网格**：由 deck.gl `LineLayer` 绘制（不依赖底图）：`x`/`y` 各 13 条（0,250,…,3000），主线 `#25282e` 1 px，外框 `#3a3e46` 2 px，另加中心十字与 `3000 m × 3000 m` 角标。在线时同图层 `opacity:0.12` 作为装饰网格；离线时 `0.45`。
3. **降级提示条**：`#degradation-banner` 常驻于舞台顶部，文案见 R11.2，带"重试底图"按钮（点击重新探测，无需刷新）。
4. **WebGL/worker 失败**：捕获 `maplibregl.Map` 构造与 `on('error')`；连续 2 次致命错误 → 销毁 map，改用 `new deck.Deck({canvas, controller:true, initialViewState})`，`bootMode="DECK_ONLY"`。
5. **库缺失**：`window.__CDN_FAIL__` 非空或 `typeof deck === 'undefined'` → `bootMode="STATIC"`：保留 header/面板/剖面/KPI/时间线（剖面为 canvas 2D，不依赖 deck），舞台区域显示网格占位与说明文字。
6. **字体**：`font-family: "JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace`；Google Fonts `<link>` 失败不影响（无 `@import` 阻塞）。

#### 2.3.5 视觉设计 token（T2 实现依据，原创实现，不复制 HALOFLUX 源码）

| Token | 值 |
|---|---|
`--bg` `#08090b`；`--panel` `#0e0f12`；`--line` `#25282e`；`--line2` `#3a3e46`；`--text` `#cfd2d8`；`--muted` `#6b6f78`；`--faint` `#3f434a`；`--hi` `#f4f5f7`；`--pink` `#f0a6c6`；`--cyan` `#98e0cf`；`--warn` `#f0708f`

- 全局 1 px 边框，无圆角或 ≤2 px；字号阶梯 9/10/11/12/16/22 px；标签 `letter-spacing:0.12em`，`text-transform:uppercase`。
- 主舞台覆盖层：`repeating-linear-gradient(0deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 3px)` + `radial-gradient(120% 90% at 50% 40%, transparent 40%, rgba(0,0,0,0.65) 100%)`；`pointer-events:none`。
- 面板结构：`极小标题（11 px / 大写 / muted + 右侧状态点）` → 内容 → `底部 9 px 说明行（provenance 或单位）`。
- 动效：面板淡入 `opacity 0→1, translateY(6px→0)`，每面板延迟 60 ms 递增，总时长 ≤ 900 ms；扫描线 6 s 循环；雷达脉冲 2.4 s 循环；数字滚动 400 ms。
- 克制原则：粉/青仅用于状态与数据（警告/可用/选中），不用于大面积背景。

#### 2.3.6 未决决策与已识别风险

| 编号 | 事项 | 影响 | 处理方式 | 状态 |
|---|---|---|---|---|
| D1 | deck.gl 9.1 UMD 的**全局符号路径未逐一实测**（仅确认 URL 返回 200） | 影响 `PathLayer`/`TripsLayer`/`PolygonLayer`/`MapboxOverlay` 的取用方式 | T2 必须实现 `resolveDeckSymbol(candidates:string[])` 多重探测（`deck.X` → `deck.layers.X` → `window.X`），启动时 `console.info("[DECK_SYMBOLS]", {...})` 打印解析结果；关键符号缺失即进入 `STATIC` 降级。T4 用该日志作为证据 | 已缓解（不阻塞派发，但必须留证） |
| D2 | 建筑高度无语义基线（源数据确无高度字段） | 三维视觉"高度"是演示值 | 已在 `C-SCENE-GEO@1` 固定公式 + `height_source:"demo_derived"` + 图例声明 | 已定 |
| D3 | 底图与虚拟几何可能视觉冲突（真实城市轮廓 + 虚拟城区） | 观众可能误认为真实地点 | 页头与坐标说明常驻"演示近似/不对应真实地点"；3D 体块用强烈非写实配色 | 已定 |
| D4 | `T-S4-01`（不可行任务）在候选面板的呈现 | 影响 R5.4/R6 一致性 | 明确：显示 `INFEASIBLE` 与 `checks` 中的不可行原因；不显示空路线列表 | 已定 |
| D5 | 独立校验结论（`ConstraintCheck[]`）在原型中为构造数据 | 可能被误读为真实校验器输出 | 面板标注"构造的校验输出（SITL 演示）"，来源 `sim:scenario_v0` | 已定 |
| D6 | 性能基线无统一机型 | 60 fps 目标可能受硬件影响 | 以 `1280×800` 与 `1920×1080` 两窗口、Chrome 最新版、`PERF: LITE` 机制为验收口径；不承诺所有机器 60 fps | 已定（口径） |

#### 2.3.7 契约变更流程（执行期）

契约以 `@1` 冻结。T1/T2 在实现中发现必须变更时：**不得**私自改字段或用"兼容写法"掩盖 → 立即 `send-message` 给团队负责人说明"契约 ID + 需变更点 + 受影响任务"，由负责人协调后由本计划更新 §2.2 并升版为 `@2`，同时通知 T3/T4 更新断言与证据。已通知为 READY 的契约只允许**向后兼容的澄清**。

## 3. 任务（Tasks）

### 3.1 实现任务

> 契约只引用 ID + 修订（定义见 §2.2），不在任务里重复契约正文。每个任务一个稳定 ID，进度勾选框只出现一次。

---

#### T1 — 场景与仿真数据装配（`apps/web/assets/scene.js`）

- [ ] T1 交付 `apps/web/assets/scene.js`：内联 `scenarios/v0` 三份草稿几何、ENU→WGS84 演示近似、构造的 SITL 仿真业务数据（任务/候选路线/备降余量剖面/事件/遥测/KPI）、只读全局 API。

| 字段 | 内容 |
|---|---|
| `objective` | 产出一个**经典脚本**（非 ES module）的数据资源文件，使 `index.html` 在 `file://` 下双击即可拿到全部渲染与面板数据；数据语义严格对齐 `core/models.py`，剖面满足 `C-MARGIN-INVARIANT@1` 全部 7 条不变量 |
| `requirement_refs` | R1.6、R3（数据）、R4（数据）、R5（数据）、R6（数据）、R7（数据）、R8（数据）、R10.2、R11.1（内联避免 fetch） |
| `write_set` | 新建 `apps/web/assets/scene.js`（唯一写者）。**不修改** `scenarios/**`、`core/**`、`apps/web/index.html`、`apps/web/README.md` |
| `provides` | `C-CRS@1`、`C-SCENE-GEO@1`、`C-SCENE-DATA@1`、`C-SCENE-API@1`、`C-MARGIN-INVARIANT@1`（实现方） |
| `consumes` | `C-BASELINE@1`（只读：`core/models.py`、`scenarios/v0/landing_sites.geojson`、`zones.geojson`、`obstacles.geojson`、`eval/scenarios/v0.yaml`）、`C-COPY@1`（数据文案） |
| `blocked_by` | 无（契约已 READY；可直接开工，无需等待 T2/T3） |
| `verify_after` | ① `node --check apps/web/assets/scene.js`（Node 可用时必跑；不可用则记录并改用浏览器 `file://` 打开自检页）；② 用 Python 提取 `window.LOWALT_SCENE_DATA = {...};` 的 JSON 块并 `json.loads` 成功；③ 用同一脚本复算 `I1`–`I7` 与 `C-CRS@1` 往返误差；④ 临时自检页（放在仓库外，如系统临时目录，**不得写入 `apps/web/`**）在 Console 执行 `LOWALT_SCENE_API.enuToLngLat(1500,1500)`、`LOWALT_SCENE_API.getProfile("RT-S2-01-B")` 不报错 |
| `acceptance_and_local_checks` | 见下方验收清单 A1–A10 |
| `delivery_evidence` | 文件路径 + `write_set` 确认无越界；`node --check` 结果；JSON 解析与 I1–I7 复算输出（贴关键行）；4 条剖面的 `min` 值、负值点数；`RT-S2-01-A` 与 R01 相交、`RT-S2-01-B` 与四个限制区不相交的判定输出 |
| `dispatch_priority` | **P0（最高）**：T2 的渲染验证依赖真实数据；尽量首批启动 |

**T1 验收清单（可逐条勾）**：

| 编号 | 验收条件 |
|---|---|
| A1 | 文件为经典脚本：全文无 `export` / `import ` / `type="module"` 相关写法；只挂载 `window.LOWALT_SCENE_DATA` 与 `window.LOWALT_SCENE_API` |
| A2 | `LOWALT_SCENE_DATA` 是单一合法 JSON 字面量赋值，数据块内无注释/函数/`NaN`/`Infinity`/尾逗号；Python `json.loads` 通过 |
| A3 | `geojson` 三键的要素数与 properties 与仓库文件逐一吻合（4/4/20），且 `crs_note` 原样保留 |
| A4 | `sites/zones/obstacles` 派生：`lnglat` 与 ENU 往返一致（误差 < 1e-6 m）；多边形闭合；`height_m` 按契约公式落在 36–101 且 `height_source==="demo_derived"` |
| A5 | 5 个任务字段完整、起终点/载荷/时限与 `eval/scenarios/v0.yaml` 对应场景一致；`T-S4-01.status==="infeasible"` 且无候选路线 |
| A6 | 5 条候选路线存在；`RT-S2-01-A` 与 R01 相交（射线法判定 true），`RT-S2-01-B` 与 R01–R04 全部不相交；起终点均等于任务对应端点 |
| A7 | 4 条剖面满足 `I1`–`I7`；`RT-S2-01-A` 负值点数 ≥5 且 `min ≤ −1.5`；`RT-S2-01-B` 全部 `≥ +1.0`；`reserve_wh` 与任务一致 |
| A8 | 5 种 `RiskEvent.kind` 各 ≥1 条且 `kind` 不越界；时间线含 `plan_version_change` 共 ≥6 条；`effective_from` 与 `at_s` 可由基准时刻推算一致（±1 s） |
| A9 | 2 组 `telemetry` 序列各 ≥24 点，字段对齐 `VehicleState`；`executing_plan_version` 与演示中的 `plan_version` 一致 |
| A10 | 全部数据 `is_simulated===true`；文件内无 `C-COPY@1` 禁用词；API 的 16 个成员（14 个函数 + `CYCLE_S`/`DEMO_CLOCK_SPEED` 2 个常量）全部存在且签名一致；`LOWALT_SCENE_DATA` 深冻结 |

---

#### T2 — 控制台单页实现（`apps/web/index.html`）

- [ ] T2 交付 `apps/web/index.html`：暗色控制台布局、MapLibre + deck.gl 三维场景、2D/3D 视角切换、轨迹与飞行器动画、备降余量剖面、四类面板、KPI、降级兜底、响应式与诊断接口。

| 字段 | 内容 |
|---|---|
| `objective` | 用**单个 HTML 文件**（内联 CSS + 内联经典脚本）实现全部呈现与交互，消费 T1 的只读数据与 API，满足 R1–R12 的界面侧验收；在 `file://` 双击打开时无 JS 报错、无白屏 |
| `requirement_refs` | R1（R1.1–R1.6）、R2（全部）、R3（全部）、R4（R4.1–R4.6）、R5（全部）、R6（全部）、R7（全部）、R8（全部）、R9（全部）、R10.1/R10.3/R10.4、R11（全部）、R12（全部） |
| `write_set` | 新建 `apps/web/index.html`（**唯一写者**，含内联样式与内联脚本）。不修改 `apps/web/assets/scene.js`、`apps/web/README.md`、`tests/**`、`scenarios/**`、`core/**` |
| `provides` | `C-PAGE-ANCHORS@1`（锚点 + `window.LOWALT_CONSOLE` 诊断接口） |
| `consumes` | `C-SCENE-DATA@1`、`C-SCENE-GEO@1`、`C-SCENE-API@1`、`C-CRS@1`（只读使用，不重算坐标）、`C-MARGIN-INVARIANT@1`（只读语义，不改公式）、`VIEW-MARGIN@1`（§2.3.3 绘制规范）、`C-COPY@1`、`C-BASELINE@1` |
| `blocked_by` | 无（契约已 READY，可按字段名先行实现；T1 数据到位后完成运行期验证）。**这不是执行依赖**：数据缺失时页面必须走 `STATIC` 降级而不是抛错，允许独立开发与自检 |
| `verify_after` | 需要 T1 交付的真实 `scene.js` 才能执行"地图/剖面/面板/动画"的运行期验收；CDN 相关项需要可访问 unpkg/CARTO 的网络 |
| `acceptance_and_local_checks` | 见下方验收清单 B1–B16 |
| `delivery_evidence` | 文件路径与无越界确认；`file://` 打开后的 Console 截图/文本（无 `error` 级输出，`[DECK_SYMBOLS]` 与 `[BOOT]` 行存在）；`LOWALT_CONSOLE.getState()` 在 2D/3D/暂停/切换任务/切换路线五种操作后的输出；`lastFrameMs` 采样值；三种 `simulateDegradation()` 后的 `bootMode` 与降级条可见性；1280×800 与 1920×1080 两窗口布局截图或尺寸检查结果 |
| `dispatch_priority` | **P0**：与 T1 并行首批启动；T2 是页面可用性的关键路径 |

**T2 必须实现的功能模块（缺一不可，按此自检）**：

| 模块 | 必须交付的行为 |
|---|---|
| M1 文档与加载 | `<head>` 内联初始化 `window.__CDN_FAIL__ = []`；按 §2.1.3 顺序加载 `scene.js` 与 5 个 CDN 脚本（固定版本、带 `onerror`）；`DOMContentLoaded` 后 `boot()`；全文无 `type="module"` / `import` / `require` |
| M2 设计系统 | §2.3.5 全部 token 落入 `:root`；1 px 边框、9–11 px 等宽标签、`letter-spacing`；字体回退链 |
| M3 布局 | 桌面 `grid`：左侧 320 px（任务+候选）、中间自适应（舞台 + 剖面）、右侧 300 px（时间线+图例）；<1080 px 单列堆叠可滚动；无横向滚动条 |
| M4 三维场景 | MapLibre 初始化（内联离线 style）→ deck `MapboxOverlay`；建筑 `PolygonLayer` 拉伸（20）、限制区柱体（4）、备降点圆环+标签（4）、起终点标记、5 条候选路线 `PathLayer`、选中路线高亮、`TripsLayer` 流光、飞行器 `ScatterplotLayer` + 脉冲环、程序化 `LineLayer` 网格（§2.3.4） |
| M5 视角切换 | `#mode-toggle` 状态机（§2.3.1）：0°/55°、900 ms 缓动、`aria-pressed`、过渡中反馈、连点以最后目标为准、`setMode` 返回 Promise |
| M6 动画时钟 | 单一 `demoT_s`（`CYCLE_S=180`、6×）；`rAF` 合并更新（每帧 1 次 `setProps`）；`visibilitychange` 暂停；飞行器位置由 `getVehicleAt()` 或 `sampleRouteAt()` 插值；暂停/继续不漂移 |
| M7 剖面图 | `#margin-profile` canvas 按 §2.3.3 全项实现（含零线 clip 涂红、三类标注、双版本对比、无数据态、DPR 适配、ResizeObserver） |
| M8 面板 | 任务列表+详情（含 `is_simulated` 徽标、不可行态）；候选路线（含 `checks` 自报标注、`diversion_site_id=null` 文案、选中高亮）；时间线（倒序、已生效/已过期态随 `demoT_s` 变化、版本变更条目）；KPI 5 项（数值滚动、单位、进度段、负余量警示色） |
| M9 降级与诊断 | 四级 `BOOT_MODE`（§2.1.4）；底图 5 s 探测与重试按钮；`window.LOWALT_CONSOLE` 全成员（`C-PAGE-ANCHORS@1`）；`prefers-reduced-motion` 分支 |
| M10 文案与版权 | `C-COPY@1` 六条必现文案 + 页脚版权声明；`#footer-copyright` 存在；禁用词零命中 |

**T2 验收清单**：

| 编号 | 验收条件 |
|---|---|
| B1 | 双击 `apps/web/index.html`（`file://`）可打开；Console 无未捕获异常；`[BOOT] mode=FULL`（网络可用时）或明确的降级模式 |
| B2 | `LOWALT_CONSOLE.symbols` 全部关键图层为 `true`，或 `bootMode` 已正确降级且降级条可见（不得静默失败） |
| B3 | 建筑在 3D 下呈立体体块且高度互不相同；切到 2D 后仍可见其轮廓（不消失）；图例含"建筑高度为演示构造值" |
| B4 | 限制区在 3D 下呈竖直柱体，透明度可辨；4 个区域全部可见且有 `R01–R04` 标签 |
| B5 | 备降点 4 个、半径圆环可辨、`occupied` 状态有可见差异 |
| B6 | 选中路线有高亮描边，非选中路线以低饱和底色显示；起点/终点标记与任务端点一致 |
| B7 | 点击 `#mode-toggle`：pitch 在 900 ms 内平滑变为 0°（2D）/55°（3D），`aria-pressed` 与文案同步；连点 3 次后状态与最终视角一致 |
| B8 | 流光可见且方向与航线一致；飞行器沿路线连续移动；暂停后位置与流光静止 3 s 不变；继续后从原位继续（无跳变） |
| B9 | `#margin-profile`：零线可见；`RT-S2-01-A` 负值区为红色填充且**只在零线以下**；标注含 ≥3 个备降点、≥1 个限制区生效点、最小值数值；切到 `v2` 后曲线全程非负且图例标明两个版本 |
| B10 | 任务列表 ≥5 条且含 `SIM` 徽标；选中任务后详情覆盖 `Task` 全字段；`T-S4-01` 显示"不可行"及原因 |
| B11 | 候选面板显示 ≥2 条且可切换；`checks` 区标有"规划器自报，仅供参考"；选中项与地图高亮、剖面版本三者一致（用 `getState()` 验证） |
| B12 | 时间线 ≥6 条、倒序；`restriction_zone` 条目在 `demoT_s` 跨过 40 s 后变为"已生效"；含 `v1 → v2` 版本变更条目 |
| B13 | KPI 5 项齐全、有单位；首次进入有数值滚动；`min_margin_wh` 为负时以警示色显示；数值与 `computeKpis()` 一致 |
| B14 | 调用 `simulateDegradation("basemap")`：网格底出现、全部三维要素仍在、降级条文案可见；`simulateDegradation("map")`：进入 `DECK_ONLY` 且三维仍可用；`simulateDegradation("cdn")`：进入 `STATIC` 且面板/剖面仍可见（无白屏） |
| B15 | 1280×800 与 1920×1080 下顶部 KPI 不换行截断、剖面刻度可读、无横向滚动条；视口 900 px 宽时单列堆叠、地图高度 ≥320 px |
| B16 | 全文禁用词零命中；`prefers-reduced-motion: reduce` 下装饰动画停止或显著缩短，数据仍可读 |

### 3.2 归属与派发就绪度

**所有权原则**：一个文件在重叠执行期只有一个写者。`apps/web/index.html` 由 T2 独占（含全部面板、剖面、动效），`apps/web/assets/scene.js` 由 T1 独占；T3 只写测试文件；T4 只写 `README.md`；T5 不写文件。读取可共享。

| Task ID | Provides / consumes revisions | Contract evidence | Ownership result | Genuine start prerequisites | Planning readiness / blocker | Priority |
|---|---|---|---|---|---|---|
| T1 | 提供 `C-CRS@1`、`C-SCENE-GEO@1`、`C-SCENE-DATA@1`、`C-SCENE-API@1`、`C-MARGIN-INVARIANT@1`；消费 `C-BASELINE@1`、`C-COPY@1` | §2.2 全部对应小节 + §2.1.6 基线表；源文件已核实：obstacles 无高度字段、landing_sites 4 条、zones 4 条（`alt_min_m=0/alt_max_m=120`）、`eval/scenarios/v0.yaml` 5 个目标场景数值已读取 | 独占 `apps/web/assets/scene.js`；与 T2/T3/T4 写集不重叠 | 无（契约已 READY；只读基线均为现有文件） | **PLANNING_READY** | P0 |
| T2 | 提供 `C-PAGE-ANCHORS@1`；消费 `C-SCENE-DATA@1`、`C-SCENE-GEO@1`、`C-SCENE-API@1`、`C-CRS@1`、`C-MARGIN-INVARIANT@1`、`VIEW-MARGIN@1`、`C-COPY@1`、`C-BASELINE@1` | §2.2 对应小节 + §2.3.1（状态机）、§2.3.2（节流）、§2.3.3（剖面规范）、§2.3.4（降级）、§2.3.5（token） | 独占 `apps/web/index.html`（含全部面板/剖面/动效）；与 T1/T3/T4 写集不重叠 | 无。契约 READY，可按字段名先行开发；真实数据的运行期验证见 `verify_after` | **PLANNING_READY**（运行期验收依赖 T1 交付，属验证依赖而非执行阻塞） | P0 |
| T3 | 提供 `C-STATIC-TEST@1`；消费 `C-CRS@1`、`C-SCENE-GEO@1`、`C-SCENE-DATA@1`、`C-MARGIN-INVARIANT@1`、`C-COPY@1`、`C-PAGE-ANCHORS@1` | §2.2 各契约的机读条款 + T3 验收表 C1–C8 | 独占 `tests/test_web_console_static.py`；只读产品文件，与 T1/T2/T4 写集不重叠 | 无（断言可先写）；`pytest` 执行需要 T1/T2 产物 | **PLANNING_READY**（执行属验证依赖） | P1 |
| T4 | 提供 —（验收记录）；消费 `C-PAGE-ANCHORS@1`、`C-STATIC-TEST@1`、`C-COPY@1`、`VIEW-MARGIN@1` | T4 验收表 D1–D14 + §2.3.4 降级行为 + §2.3.3 剖面规范 | 独占 `apps/web/README.md`；与 T1/T2/T3 写集不重叠；不改产品文件 | **真实产物**：T1 的 `scene.js` 与 T2 的 `index.html` 必须已交付（契约不能替代可运行页面） | **BLOCKED**（`blocked_by: T1, T2`，缺可运行页面与数据） | P2 |
| T5 | 提供 终验判定；消费 `C-STATIC-TEST@1` 结果、T4 验收记录、`C-COPY@1` | T5 判定规则 E1–E8 + R1–R12 全量 | 不写文件；只读全部交付物 | **T3 门禁可跑** + **T4 证据已采集** | **BLOCKED**（`blocked_by: T3, T4`） | P3 |

**候选初始就绪集（按优先级，容量未提供故不假设并发上限）**：

| 顺序 | 任务 | 为什么现在可开工 | 备注 |
|---|---|---|---|
| 1 | T1 | 契约全 READY；只读基线均为现有文件；写集独立 | 关键路径起点（数据决定一切渲染） |
| 2 | T2 | 契约全 READY；可按字段名与图层规范先行实现；数据缺失时走 `STATIC` 降级 | 关键路径主体；与 T1 并行不冲突 |
| 3 | T3 | 断言的全部阈值与字段名已在 §2.2 给出；不需产物即可编写 | 先写后跑；`pytest` 执行排到 T1/T2 交付后 |

**补位顺序（任务完成后按此补位，不等整批）**：T1 完成 → 若 T2 仍在进行，先补 T4 的前置准备（不可执行浏览器验收，故保持 BLOCKED，仅记录）；T2 完成 → 同时满足 T1 时立刻启动 T4；T4 完成且 T3 已跑通 → 启动 T5。

**真实串行段（不可并行化，已知代价）**：`T4 → T5`。理由：T5 必须复核已采集的运行期证据，避免引用过期结论；此外浏览器手测必须由 T4 独占执行（同一页面、同一网络条件下由单人采集证据，避免多人并行改 DevTools 网络条件导致证据互相污染）。

**共享可变资源**：无数据库、无构建产物、无共享缓存。唯一共享资源是文件系统写集（已按文件切分）与"浏览器验收会话"（T4 独占）。若 T1/T2 在 T4 采集证据后修改产品文件，T3 断言与受影响 D 项必须重跑，T5 不得引用旧证据。

**审批检查点**：本计划不设"需求/设计/契约/每任务"分散审批。仅保留**一次**用户总确认（计划是否覆盖期望功能）。用户已授权的执行范围（单文件 HTML + `scene.js` + MapLibre/deck.gl + 构造仿真数据）已在 §1 默认值中固化，执行期不再回问。

**派发交接规则（团队负责人必须遵守）**：

> The team leader must inspect the relevant contract definitions and ownership evidence before dispatch. After that check, launch ready tasks consecutively up to available capacity. Do not wait or perform blocking output collection between independent launches. Refill capacity as tasks finish; do not wait for an entire wave. Recheck affected entries after contract, ownership, or prerequisite changes.

对应中文口径：负责人在派发前须核对 §2.2 相应契约与写集归属证据；核对后按容量连续启动 PLANNING_READY 任务，**不在独立启动之间等待阻塞式结果收集**；每完成一个即补位，不等整批；契约、归属或前置条件变化后重查受影响条目。

### 3.3 验证与测试任务

> 验证任务不修改产品文件（`index.html` / `scene.js`）。实现任务的勾选不等于验收通过；未执行的检查不得记为 PASS。

---

#### T3 — 静态契约与红线检查（`tests/test_web_console_static.py`）

- [ ] T3 交付 pytest 测试文件，从 `scene.js` 真实解析数据并断言 `C-CRS@1`/`C-SCENE-GEO@1`/`C-SCENE-DATA@1`/`C-MARGIN-INVARIANT@1`/`C-COPY@1`/`C-PAGE-ANCHORS@1`，失败信息精确到契约 ID 与字段路径。

| 字段 | 内容 |
|---|---|
| `objective` | 用可复跑、无浏览器的自动化断言，把"契约是否被真实实现"从人工目检变成门禁；不使用 mock、不声称能证明运行期渲染正确 |
| `requirement_refs` | R1.6、R4.6、R5.2、R6.3、R10.2、R10.3（文件级）、R11（结构存在性）以及全部契约的结构性条款 |
| `write_set` | 新建 `tests/test_web_console_static.py`（唯一写者）。只读 `apps/web/**`、`scenarios/v0/**`、`core/models.py`、`eval/scenarios/v0.yaml`；不修改任何产品文件 |
| `provides` | `C-STATIC-TEST@1` |
| `consumes` | `C-CRS@1`、`C-SCENE-GEO@1`、`C-SCENE-DATA@1`、`C-MARGIN-INVARIANT@1`、`C-COPY@1`、`C-PAGE-ANCHORS@1`（断言对象） |
| `blocked_by` | 无（测试代码可先写：契约已给全字段名、公式与阈值）。运行通过需要 T1、T2 实际产物，属 `verify_after` |
| `verify_after` | 需要 `apps/web/assets/scene.js` 与 `apps/web/index.html` 存在；执行依赖：无 |
| `acceptance_and_local_checks` | 见 C1–C8 |
| `delivery_evidence` | 测试文件路径；`pytest tests/test_web_console_static.py -q` 的完整输出（通过项/失败项计数）；若失败，逐条列出契约 ID + 字段路径 + 实际值，并指明应回派的 owner（T1/T2） |
| `dispatch_priority` | P1：可与 T1/T2 并行启动（先写断言），在两者交付后立即执行 |

**T3 验收清单**：

| 编号 | 验收条件 |
|---|---|
| C1 | 测试可从 `scene.js` 中按括号配平提取 `window.LOWALT_SCENE_DATA` 并 `json.loads` 成功；提取失败时给出明确诊断（不是裸异常） |
| C2 | 覆盖 `C-STATIC-TEST@1` 表格中 11 组断言的**全部**条目（文件存在/无构建痕迹/CDN 锁版本/CRS/几何/任务/路线/剖面/事件/红线/版权） |
| C3 | 剖面断言实现 `I1`–`I7`（含浮点容差与有限性检查），失败信息包含 `route_id`、`s_m`、期望与实际 |
| C4 | 路线几何断言用射线法判定相交：`RT-S2-01-A` 与 R01 相交为 `True`，`RT-S2-01-B` 与 R01–R04 全部为 `False` |
| C5 | 任务字段断言以 `core/models.py` 的 `Task`/`RoutePlan`/`DiversionMarginProfile` 字段集合为基准（从 `pydantic` 模型 `model_fields` 读取，或退化为显式常量并在注释说明原因） |
| C6 | 禁用词扫描覆盖 `apps/web/**` 全部文本文件，使用整词/整短语匹配，页脚合法引用不误报 |
| C7 | 测试不依赖网络、不依赖浏览器、不依赖 `node`；仅用 Python 标准库 + `pytest` + 已安装的 `pyyaml`/`pydantic`（缺失时该组用 `pytest.skip` 并注明） |
| C8 | 单文件运行时间 < 10 s；不写入任何临时文件到仓库跟踪目录 |
---

#### T4 — 浏览器集成验收与运行说明（`apps/web/README.md`）

- [ ] T4 在真实浏览器中以 `file://` 打开页面，逐条执行 T2 的 B1–B16 与 R11 三级降级演练，把运行方式、降级说明与验收记录写回 `apps/web/README.md`。

| 字段 | 内容 |
|---|---|
| `objective` | 用真实浏览器证据（而非代码阅读）确认页面可用性、动画流畅度、降级可用性与表述合规；把"怎么打开、怎么排查、验收结论"沉淀为仓库内可复现说明 |
| `requirement_refs` | R1–R12 的全部**运行期**验收项（尤其 R2.2、R3.3、R4.2、R9.4、R11.1–R11.3、R12） |
| `write_set` | 修改 `apps/web/README.md`（唯一写者）。**不修改** `index.html`、`scene.js`、`tests/**`；发现缺陷只回报 |
| `provides` | —（验证任务，不提供新契约；产出为验收记录） |
| `consumes` | `C-PAGE-ANCHORS@1`（诊断接口驱动）、`C-STATIC-TEST@1`（门禁结果）、`C-COPY@1`（目检依据）、`VIEW-MARGIN@1`（像素判断依据） |
| `blocked_by` | **T1**（真实数据）、**T2**（真实页面）。理由：没有实际产物无法执行任何浏览器验收，契约无法替代 |
| `verify_after` | 若 T3 已交付，先执行 `pytest tests/test_web_console_static.py -q`；需要可访问 unpkg/CARTO 的网络以验收 `FULL` 模式，另需可在 DevTools 中阻断请求以验收 `NO_BASEMAP` |
| `acceptance_and_local_checks` | 见 D1–D14 |
| `delivery_evidence` | README 新增章节（运行方式/降级说明/验收记录表/已知限制）；每条 D 项的实际观察结果（含 `getState()` 输出、`lastFrameMs`、`bootMode`、截图或文字描述）；未通过项与回派 owner |
| `dispatch_priority` | P2：必须等 T1、T2 交付后执行；是进入独立终验前的唯一运行期门禁 |

**T4 验收清单**：

| 编号 | 验收条件 |
|---|---|
| D1 | `apps/web/README.md` 写明：双击打开路径、5 个 CDN 脚本（MapLibre 1 + deck.gl 4 个包）及固定版本、离线时的表现、如何重试底图、如何用 `LOWALT_CONSOLE` 驱动验收 |
| D2 | `FULL` 模式：`[BOOT] mode=FULL`；地图 + 20 个建筑体块 + 4 个限制区柱 + 4 个备降点 + 5 条路线 + 飞行器全部可见；Console 无 `error` |
| D3 | 视角切换：连续 3 次点击 `#mode-toggle`，每次都观察到连续缓动（非瞬变），终态与 `aria-pressed`/文案一致；`cameraBusy` 期间点击不卡死 |
| D4 | 轨迹：流光方向正确；飞行器单调前进；暂停 3 s 位置不变；继续后无跳变；切换路线后飞行器落在新路线起点或按进度继续 |
| D5 | 剖面：`RT-S2-01-A` 红色填充严格位于零线下方（截图判读）；标注含备降点、限制区生效点、最小值；切到 `v2` 后全程非负且图例含两版 `min` |
| D6 | 面板一致性：用 `selectTask()`/`selectRoute()` 驱动后，任务详情、候选选中、地图高亮、剖面版本、飞行器路线五处一致（对照 `getState()`） |
| D7 | 不可行任务：`T-S4-01` 详情显示 `INFEASIBLE` 与原因；候选面板不出现空列表或伪路线 |
| D8 | 时间线：≥6 条倒序；`setDemoTime(45)` 后 R01 条目为"已生效"；`setDemoTime(0)` 后回到"未生效" |
| D9 | KPI：5 项数值与 `computeKpis(45)` 一致；最小余量为负时显示警示色 |
| D10 | 降级演练：`simulateDegradation("basemap")` → 网格底 + 三维要素仍在 + 提示条；`("map")` → `DECK_ONLY` 仍可三维操作；`("cdn")` → `STATIC` 面板与剖面仍可见。三种模式均无白屏 |
| D11 | 断网演练：DevTools 阻断 `basemaps.cartocdn.com` 后刷新 → 自动进入 `NO_BASEMAP` 且 5 s 内出提示（不得长时间白屏） |
| D12 | 性能：1920×1080 下拖动地图 10 s，`lastFrameMs` 平均 ≤ 22 ms；若进入 `PERF: LITE`，须记录原因与视觉影响（不得为达标而删除功能） |
| D13 | 响应式：1280×800、1920×1080、900 px 宽三档截图/尺寸检查，无横向滚动条、KPI 不截断、剖面刻度可读 |
| D14 | 目检 `C-COPY@1`：六条必现文案全部出现；页脚版权声明存在；禁用词零命中 |
---

#### T5 — 独立最终验证（不写文件）

- [ ] T5 独立复核 T1–T4 的交付与证据是否真实支撑 R1–R12，复跑自动化门禁并抽查浏览器行为，给出逐需求 PASS/FAIL 与缺口清单。

| 字段 | 内容 |
|---|---|
| `objective` | 以"不信自述、只认证据"的方式判定特性是否可接受；不新增功能、不修改产品文件、不替 T1/T2 修缺陷 |
| `requirement_refs` | R1–R12 全部 |
| `write_set` | **无**（不写任何文件；结论通过任务汇总回报，避免与 T4 的 README 写权冲突） |
| `provides` | 终验判定（PASS / FAIL / 有条件通过 + 缺口清单） |
| `consumes` | `C-STATIC-TEST@1` 运行结果、`apps/web/README.md` 验收记录（T4）、`C-COPY@1`、`VIEW-MARGIN@1`、`C-MARGIN-INVARIANT@1` |
| `blocked_by` | **T3**（自动化门禁存在且可跑）、**T4**（运行期证据已采集）。理由：终验必须针对已执行的真实检查，而非计划文本 |
| `verify_after` | 需在代码稳定状态下复跑；若 T1/T2 在 T4 采集证据后又改动，T3 与受影响 D 项必须重跑，终验不得引用过期证据 |
| `acceptance_and_local_checks` | 见 E1–E8 |
| `delivery_evidence` | 逐需求（R1.1…R12.3）的 PASS/FAIL 表；每条结论指向具体证据（命令输出、`getState()` 值、截图、日志行）；未覆盖项明确标注"未验证"而非默认通过 |
| `dispatch_priority` | P3：最后一个执行，作为发布门禁 |

**T5 判定规则（必须遵守）**：

| 编号 | 规则 |
|---|---|
| E1 | 复跑 `pytest tests/test_web_console_static.py -q`：全绿才可判相关结构/数值项 PASS |
| E2 | 抽查 ≥6 条 D 项（必含 D5 剖面红区、D7 不可行任务、D10 降级、D12 性能、D14 文案），独立复现而非引用 T4 结论 |
| E3 | 逐需求核对：无实现或无证据的需求项不得判 PASS；可判 "NOT VERIFIED" 并列出缺少的证据 |
| E4 | 版权合规：确认页面为原创实现、页脚声明存在、无 HALOFLUX 源码片段（抽查 ≥3 段关键实现，比对是否为其代码风格的直接搬用，仅作合理判断） |
| E5 | 表述红线：全文禁用词零命中，且页头/图例/页脚必现文案齐全 |
| E6 | 坐标诚实性：确认页面与注释声明"演示近似、非真实地理坐标"，且未声称场景为真实地点 |
| E7 | 交付形态：`apps/web/` 下除 `index.html`、`assets/scene.js`、`README.md` 外无新增运行时文件；无构建产物、无 `node_modules` 依赖 |
| E8 | 若存在未通过项：输出"缺口 + 责任任务 + 需要的具体修复"，不得把未执行检查记为 PASS，也不得因单个缺口否定已达标项 |