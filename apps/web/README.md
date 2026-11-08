# apps/web —— 调度任务台（未开始）

**负责人：C**　**状态：⬜ 目录占位，无工程**

## 职责

调度员看到的那个网页：建任务 → 看候选方案 → 看备降余量剖面 → 看计划和实际轨迹 →
看事件时间线 → 回放 → 导出。

## 技术选择

React + TypeScript + Vite + MapLibre GL JS。组件库用 Ant Design 或团队熟的都行，
**不引入 CesiumJS** —— 二维够用，三维高度展示不是本月的评分点。

## 初始化

```bash
cd apps/web
npm create vite@latest . -- --template react-ts
npm install
npm install maplibre-gl
```

完成后把 `node_modules/`、`dist/` 交给根 `.gitignore`（已经写好了）。

## 第一个任务（11/12—11/16）

1. 地图 + 场景 GeoJSON 图层（建筑、限制区、备降点、起降点）。
2. 任务表：列表 + 详情，字段直接对齐 `core/models.py` 的 `Task`。
3. **备降余量剖面图** —— 这是主视觉，优先级高于任何美化。
   横轴沿路线累计距离，纵轴 `E_left − E_reserve − E_need`，零线以下涂红，
   标出备降点位置和限制区生效点。同一事件下并排显示旧线（进红区）和新线（全程非负）。
4. 事件时间线：谁在什么时候改了什么，`plan_version` 怎么变的。

## 注意

页面上要能看出哪些数据是仿真、哪些是实测（`is_simulated` 字段别浪费）。
