import { expect, test } from "./fixtures";

test("confirmation preserves year, zero payload and the operation id", async ({
  page,
}) => {
  const submissions: Record<string, any>[] = [];
  await page.route("https://basemaps.cartocdn.com/**", (r) => r.abort());
  await page.route("**/api/assistant/turn", async (r) => {
    const request = r.request().postDataJSON();
    if (request.confirmation) submissions.push(request.confirmation);
    const clarification = request.confirmation
      ? null
      : {
          status: "needs_clarification",
          source: "test",
          questions: [
            {
              field: "scheduled_for",
              question: "确认时间",
              current: "2028-01-20T06:30:00Z",
            },
          ],
          map_pins: [
            {
              field: "origin",
              name: "起点 A",
              point: [121.4, 31.2],
              crs: "EPSG:4326",
              source: "test",
              confirmed: false,
              note: "",
            },
            {
              field: "destination",
              name: "终点 B",
              point: [121.5, 31.3],
              crs: "EPSG:4326",
              source: "test",
              confirmed: false,
              note: "",
            },
          ],
          draft_values: { payload_kg: 0, priority: "P1" },
          weather_feasibility: {
            status: "available_if_date_in_window",
            note: "模式预报",
          },
          summary: "请确认任务参数",
          is_simulated: true,
          dispatch_enabled: false,
        };
    await r.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "result",
          result: {
            turn_id: request.request_id,
            provider: "local",
            text: request.confirmation ? "工单已保存" : "请确认任务参数",
            traces: [],
            draft: null,
            draft_digest: null,
            dispatch_enabled: false,
            is_simulated: true,
            created_at: new Date().toISOString(),
            clarification,
          },
        }) + "\n",
    });
  });
  await page.goto("/airspace");
  await page.getByRole("button", { name: "打开调度助手", exact: true }).click();
  await page.getByRole("textbox", { name: "向调度助手提问" }).fill("创建任务");
  await page.getByRole("button", { name: "发送给调度助手" }).click();
  const card = page.getByTestId("intake-clarification");
  await expect(card.getByLabel("确认起飞时间")).toHaveValue("2028-01-20T14:30");
  await card.getByTestId("intake-confirm").click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toMatchObject({
    scheduled_for: "2028-01-20T14:30:00+08:00",
    payload_kg: 0,
    priority: "P1",
    origin_point: [121.4, 31.2],
  });
  await card.getByTestId("intake-confirm").click();
  await expect.poll(() => submissions.length).toBe(2);
  expect(submissions[1].confirmation_id).toBe(submissions[0].confirmation_id);
});

test("charts preserve missing data and draw complete single-category pies", async ({
  page,
}) => {
  await page.route("https://basemaps.cartocdn.com/**", (r) => r.abort());
  const specs = [
    { type: "pie", title: "单分类", data: [{ label: "已生成", value: 3 }] },
    {
      type: "pie",
      title: "十二分类",
      data: Array.from({ length: 12 }, (_, i) => ({
        label: `类别${i}`,
        value: 1,
      })),
    },
    { type: "bar", title: "空数据", data: [{ label: "缺少", value: null }] },
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
            text: specs
              .map((s) => "```chart\n" + JSON.stringify(s) + "\n```")
              .join("\n\n"),
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
  await expect(
    page.getByRole("img", { name: "单分类", exact: true }).locator("circle"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("img", { name: "十二分类", exact: true }),
  ).toHaveAttribute("viewBox", "0 0 320 260");
  await expect(page.locator(".assistant-chart-fallback")).toContainText("null");
  await expect(
    page.getByRole("img", { name: "空数据", exact: true }),
  ).toHaveCount(0);
});
