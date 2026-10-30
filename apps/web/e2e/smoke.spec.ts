import { expect, test } from "@playwright/test";

test("the app serves its home page and a healthy API", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chorely" })).toBeVisible();

  const res = await request.get("/api/v1/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});
