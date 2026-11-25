**让 Agent 用图表、卡片和可操作视图回答**

AERIS 的助手现在可以在文字摘要下面展示指标卡、统计图、数据表、事件时间线和路线小图。每个视图都附带工具来源，已有数据时间时同时展示时间。

可以在当前助手中尝试以下输入。

| 输入或操作 | 展示结果 |
| --- | --- |
| 用卡片展示当前电量和飞行状态 | 电量、高度、速度与剩余电量指标卡 |
| 做个工单看板 | 最近工单的指标、航线状态分布与载荷表 |
| 用柱状图比较工单载荷 | 柱状图，可切换表格、排序和下载 CSV |
| 用时间线展示最近事件 | 带时间、级别和明细的事件列表 |
| 在任务草稿中点击预览几何路线 | 路线小图，可点击显示到主地图 |

空数据保持为空，未知指标显示为 `—`。航线生成状态以工具记录为依据。看板统计的是最近一批工单，统计范围在卡片中显示。

**这项能力如何实现**

```mermaid
flowchart LR
  U[用户提问] --> A[Agent 选择并调用工具]
  A --> D[工具返回事实数据]
  D --> P[后端构造 presentation]
  P --> V[校验类型与数值]
  V --> R[前端选择组件]
  R --> I[查看表格 导出 定位]
```

模型负责理解问题、选择工具和组织解释。后端把工具数据整理成稳定的展示结构，前端按类型渲染。这项能力主要位于应用层，换模型时可以保留展示协议与组件。

数据结构可以使用 JSON Schema 描述类型、必填项和取值限制。AERIS 使用现有的 Pydantic 生成和校验这份契约。官方入门资料提供了同样的定义与验证流程。[JSON Schema 入门](https://json-schema.org/learn/getting-started-step-by-step)

**每个 Agent 都可以使用的响应结构**

下面是一个协议示例，数值只用于解释字段。

```json
{
  "text": "当前状态见下方卡片。",
  "presentation": {
    "version": 1,
    "blocks": [
      {
        "type": "metrics",
        "title": "飞行状态",
        "source": "工具返回的数据来源",
        "as_of": "2026-11-19T10:00:00+08:00",
        "note": "",
        "items": [
          {"label": "电量", "value": 83.4, "unit": "%"},
          {"label": "高度", "value": null, "unit": "m"}
        ]
      }
    ]
  }
}
```

`text` 用于摘要和兼容展示。`presentation.version` 标识协议版本，`blocks` 是组件列表。每个 block 都有固定的 type，数据来源和时间随数据传递。

可直接使用项目附带的 [JSON Schema](agent-presentation.schema.json) 校验展示字段。它由当前 Python 模型生成，可用于其他语言和不同模型接口的适配。

| type | 适合的数据 | 当前交互 |
| --- | --- | --- |
| metrics | 电量、速度、温度、数量等指标 | 显示单位、未知值与快照时间 |
| chart | 分类占比、数值比较、序列趋势 | 图表与表格切换、排序、CSV 导出 |
| table | 多条记录和参数比较 | 点击列名排序、CSV 导出 |
| timeline | 事件、步骤、状态变化 | 查看时间、级别和明细 |
| route | 有坐标基准的路线点列 | 查看小图、显示到主地图 |
| task_evidence | 冻结任务、算法路线、余量剖面和独立校验 | 曲线与地图采样点联动、查看缺口、定位算法地图 |

未来做采购 Agent，可以先实现指标、价格对比表和报价图。做学习 Agent，可以使用知识点表格、测验结果和学习记录时间线。先选与任务直接有关的类型，再逐步增加。

**AERIS 中可复用的代码**

| 文件 | 职责 |
| --- | --- |
| `services/assistant/presentation.py` | Pydantic 展示契约，以及把工具结果转换成视图数据的适配函数 |
| `apps/console/src/assistant/presentation.ts` | 前端数据类型和运行时校验 |
| `apps/console/src/assistant/ResponseBlocks.tsx` | 指标、表格、时间线、路线的渲染 |
| `apps/console/src/assistant/ChartBlock.tsx` | 柱状图、饼图、折线图与数据视图切换 |
| `apps/console/src/assistant/DataTable.tsx` | 表格排序与 CSV 导出 |
| `apps/console/src/assistant/responseBlocks.css` | 日间、夜间和减少动画模式的样式 |

复用到下一项目时，先带走协议类型和所需组件，再替换 `build_presentation()` 中读取业务工具结果的部分。路线类型和地图回调属于 AERIS 的业务适配，有地图需求时再接入对应坐标与定位逻辑。

例如，一个订单 Agent 的工具返回订单数量后，可以直接构造卡片。

```python
from services.assistant.presentation import Metric, MetricsBlock, Presentation

def order_reply(tool_result):
    view = Presentation(blocks=[MetricsBlock(
        title="订单概览",
        source=tool_result["source"],
        as_of=tool_result["sampled_at"],
        items=[Metric(label="订单数", value=tool_result["order_count"], unit="单")],
    )])
    return {
        "text": "已读取当前订单概览。",
        "presentation": view.model_dump(mode="json"),
    }
```

前端只需要读取契约并选择组件。

```tsx
const view = readPresentation(response.presentation);
return <>
  <RichText text={response.text} />
  {view && <ResponseBlocks presentation={view} onRoute={showRoute} />}
</>;
```

React 可以通过条件渲染根据类型选择组件。AERIS 将这个选择集中在 ResponseBlocks，业务页面只负责提供地图等已有操作的回调。[React 条件渲染](https://react.dev/learn/conditional-rendering)

**以后新建 Agent 时的实施顺序**

1. 列出工具返回的数据和用户需要完成的动作，选两三种展示类型。
2. 定义 `text + presentation` 响应结构，明确字段、单位、来源、时间与缺失值。
3. 在服务端从工具结果生成展示数据，并通过 schema 校验。
4. 在前端注册组件，对收到的响应再次校验，未知版本保留可读文字。
5. 将组件里的操作接到已有业务 API。涉及创建、修改等操作，继续使用该业务的身份、校验和用户确认流程。
6. 验证正常值、零、空数据、长文本、非法数值、未知类型、手机宽度与导出结果。

当模型需要选择视图时，可以给它一个受限的展示偏好，例如 `chart`、`table` 或 `timeline`，随后由服务端绑定实际数据。这样视图选择可以变化，数值与业务状态仍由工具确定。

**以后可以直接复用的开发要求**

> 为这个 Agent 增加结构化展示能力。响应保留 text，并增加带版本号的 presentation.blocks。先支持指标卡、图表和数据表。展示数据必须来自工具结果，附带来源、时间和单位，缺失值保持为空。服务端用 schema 校验，前端按固定类型渲染，未知类型回退到文字。图表支持查看原始表格和 CSV 导出，适配手机和减少动画设置。创建、修改等操作复用业务确认流程。补充正常数据、零值、空数据、非法类型和操作回调的回归测试。最后给出实际可用的提问示例。

随着多个项目开始共用这套协议和组件，再将它们提取为公共包。每个 Agent 保留自己的工具适配和操作权限。

**本次验收**

助手 159 项、知识库 9 项、浏览器 13 项测试通过，TypeScript/Vite 构建与 Ruff 检查通过。浏览器覆盖指标卡、排序、CSV 内容、路线显示、协议降级、旧图表兼容和手机布局。界面示例使用明确标注的回归测试数据。

本次运行采用 local 规则模式。结构化展示协议同时用于 MaaS 响应路径，真实云模型联调仍需恢复有效的服务端模型配置。
