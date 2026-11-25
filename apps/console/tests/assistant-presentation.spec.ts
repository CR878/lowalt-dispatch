import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";

test("task evidence is produced by the real local tool and locates its route", async ({
  page,
}) => {
  await page.route("https://basemaps.cartocdn.com/**", (r) => r.abort());
  await page.goto("/airspace");
  await page.getByRole("button", { name: "打开调度助手", exact: true }).click();
  await page
    .getByRole("textbox", { name: "向调度助手提问" })
    .fill("显示拒绝案例的任务证据卡");
  await page.getByRole("button", { name: "发送给调度助手" }).click();
  const card = page.locator(".assistant-response-block.response-task_evidence");
  await expect(card).toContainText("T-S1-01");
  await expect(card).toContainText("独立校验拒绝");
  await expect(card.locator(".task-evidence")).toHaveAttribute(
    "data-revision",
    /^[a-f0-9]{64}$/,
  );
  await card.getByRole("button", { name: "定位算法地图" }).click();
  await expect(
    page.getByRole("button", { name: "隐藏预览航线", exact: true }),
  ).toBeVisible();
  const summary = page.getByRole("region", { name: "规划航线状态概览" });
  await expect(summary).toContainText("ENU 航线参考");
  await expect(summary).toContainText("局部仿真坐标");
  await expect(summary).not.toContainText("OpenStreetMap");
});

test("real status questions produce evidence-backed metric cards", async ({
  page,
}) => {
  await page.route("https://basemaps.cartocdn.com/**", (r) => r.abort());
  await page.goto("/airspace");
  await page.getByRole("button", { name: "打开调度助手", exact: true }).click();
  await page
    .getByRole("textbox", { name: "向调度助手提问" })
    .fill("用卡片展示当前电量和飞行状态");
  await page.getByRole("button", { name: "发送给调度助手" }).click();
  const card = page.locator(".assistant-response-block.response-metrics");
  await expect(card).toContainText("电量");
  await expect(card.locator("dd")).toHaveCount(4);
  await expect(card).toContainText("浏览器演示遥测快照");
});

test("structured replies support chart tables, sorting, CSV, timeline and route actions", async ({
  page,
}, testInfo) => {
  await page.route("https://basemaps.cartocdn.com/**", (r) => r.abort());
  const metadata = {
    source: "界面回归测试数据",
    as_of: "2026-11-19T10:00:00Z",
    note: "演示数据",
  };
  const blocks = [
    {
      ...metadata,
      type: "metrics",
      title: "工单概览",
      items: [
        { label: "本次统计", value: 12, unit: "单" },
        { label: "航线已生成", value: 10, unit: "单" },
        { label: "后台计算中", value: 2, unit: "单" },
        { label: "缺失数据", value: null, unit: "" },
      ],
    },
    {
      ...metadata,
      type: "chart",
      title: "航线状态分布",
      chart: {
        type: "pie",
        title: "航线状态分布",
        unit: "单",
        data: [
          { label: "航线已生成", value: 10 },
          { label: "后台计算中", value: 2 },
        ],
      },
    },
    {
      ...metadata,
      type: "timeline",
      title: "最近事件",
      items: [
        {
          time: "10:05",
          title: "等待人工核对",
          detail: "测试事件明细",
          level: "warning",
        },
      ],
    },
    {
      ...metadata,
      type: "route",
      title: "路线预览",
      route_id: "test-route",
      draft_digest: "test-digest",
      length_m: 200,
      waypoints: [
        [100, 100],
        [100, 200],
        [200, 200],
      ],
    },
    {
      ...metadata,
      type: "table",
      title: "工单载荷",
      columns: ["任务", "kg"],
      rows: [
        ["B", 10],
        ["A", 2],
      ],
    },
  ];
  await page.route("**/api/assistant/turn", (r) =>
    r.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "result",
          result: {
            turn_id: r.request().postDataJSON().request_id,
            provider: "local",
            text: '已汇总本次工单。\n\n```chart\n{"type":"pie","data":[{"label":"重复图表","value":999}]}\n```',
            traces: [],
            draft: null,
            draft_digest: null,
            dispatch_enabled: false,
            is_simulated: true,
            created_at: new Date().toISOString(),
            presentation: { version: 1, blocks },
          },
        }) + "\n",
    }),
  );
  await page.goto("/airspace");
  await page.getByRole("button", { name: "打开调度助手", exact: true }).click();
  await page
    .getByRole("textbox", { name: "向调度助手提问" })
    .fill("做一个工单看板");
  await page.getByRole("button", { name: "发送给调度助手" }).click();
  const chart = page.getByRole("region", { name: "航线状态分布", exact: true });
  await expect(page.locator(".assistant-chart")).toHaveCount(1);
  await expect(page.locator(".assistant-response-blocks")).not.toContainText(
    "999",
  );
  await expect(page.locator(".assistant-metric-grid")).toContainText("—");
  await page.locator(".response-metrics").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("aeris-agent-cards.png"),
  });
  await chart.getByRole("button", { name: "表格", exact: true }).click();
  const table = chart.getByRole("table");
  await table.getByRole("button", { name: "数值", exact: false }).click();
  await expect(table.locator("tbody tr").first()).toContainText("后台计算中");
  const pending = page.waitForEvent("download");
  await chart.getByRole("button", { name: "导出航线状态分布数据" }).click();
  const csv = await readFile((await (await pending).path())!, "utf8");
  expect(csv).toContain('"航线已生成","10"');
  await chart.getByRole("button", { name: "图表", exact: true }).click();
  await expect(chart.getByRole("img", { name: "航线状态分布" })).toBeVisible();
  await expect(page.locator(".assistant-event-timeline")).toContainText(
    "等待人工核对",
  );
  await page.getByRole("button", { name: "显示到主地图" }).click();
  await expect(page.locator(".assistant-preview-label")).toBeVisible();
});

test("unknown presentation versions fall back to the text reply", async ({
  page,
}) => {
  await page.route("https://basemaps.cartocdn.com/**", (r) => r.abort());
  await page.route("**/api/assistant/turn", (r) =>
    r.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "result",
          result: {
            turn_id: r.request().postDataJSON().request_id,
            provider: "local",
            text: "可读的兼容回答",
            traces: [],
            draft: null,
            draft_digest: null,
            dispatch_enabled: false,
            is_simulated: true,
            created_at: new Date().toISOString(),
            presentation: {
              version: 99,
              blocks: [{ type: "html", html: "<script>alert(1)</script>" }],
            },
          },
        }) + "\n",
    }),
  );
  await page.goto("/airspace");
  await page.getByRole("button", { name: "打开调度助手", exact: true }).click();
  await page.getByRole("textbox", { name: "向调度助手提问" }).fill("展示结果");
  await page.getByRole("button", { name: "发送给调度助手" }).click();
  await expect(
    page.locator(".assistant-message.assistant").last(),
  ).toContainText("可读的兼容回答");
  await expect(page.locator(".assistant-response-blocks")).toHaveCount(0);
});

test("chart fences after a paragraph and unfinished tables stay readable", async ({
  page,
}) => {
  await page.route("https://basemaps.cartocdn.com/**", (r) => r.abort());
  await page.route("**/api/assistant/turn", (r) =>
    r.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "result",
          result: {
            turn_id: r.request().postDataJSON().request_id,
            provider: "local",
            text: '图表如下\n```chart\n{"type":"bar","title":"兼容图表","data":[{"label":"A","value":2}]}\n```\n|未完成的表格',
            traces: [],
            draft: null,
            draft_digest: null,
            dispatch_enabled: false,
            is_simulated: true,
            created_at: new Date().toISOString(),
          },
        }) + "\n",
    }),
  );
  await page.goto("/airspace");
  await page.getByRole("button", { name: "打开调度助手", exact: true }).click();
  await page.getByRole("textbox", { name: "向调度助手提问" }).fill("展示图表");
  await page.getByRole("button", { name: "发送给调度助手" }).click();
  await expect(page.getByRole("img", { name: "兼容图表" })).toBeVisible();
  await expect(
    page.locator(".assistant-message.assistant").last(),
  ).toContainText("未完成的表格");
});
