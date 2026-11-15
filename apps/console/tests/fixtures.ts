import { test as base, expect, type APIRequestContext } from "@playwright/test";
export { expect };
export type { Page } from "@playwright/test";
export async function authenticate(request: APIRequestContext) {
  const policy = await (await request.get("/api/auth/policy")).json();
  const result = await request.post(
    policy.setup_required ? "/api/auth/setup" : "/api/auth/login",
    {
      headers: { "X-Aeris-Request": "1" },
      data: policy.setup_required
        ? {
            email: "browser@example.com",
            name: "测试调度员",
            password: "BrowserTest2026",
          }
        : { email: "browser@example.com", password: "BrowserTest2026" },
    },
  );
  expect(result.ok(), await result.text()).toBeTruthy();
}
export const test = base.extend<{ sessionReady: void }>({
  sessionReady: [
    async ({ context }, use) => {
      await authenticate(context.request);
      await use();
    },
    { auto: true },
  ],
});
