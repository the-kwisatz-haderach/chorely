import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

type Manifest = {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
};

test("Chorely is installable: a manifest with icons and a service worker that caches nothing", async ({ page, request }) => {
  await page.goto("/");

  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const res = await request.get(href!);
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as Manifest;
  expect(manifest).toMatchObject({ name: "Chorely", short_name: "Chorely", start_url: "/", display: "standalone" });
  expect(manifest.theme_color).toBe("#f4f1ea");
  expect(manifest.background_color).toBe("#f4f1ea");

  const sizes = (purpose: string) =>
    manifest.icons.filter((i) => (i.purpose ?? "any") === purpose && i.type === "image/png").map((i) => i.sizes);
  expect(sizes("any")).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(sizes("maskable")).toEqual(expect.arrayContaining(["512x512"]));
  for (const icon of manifest.icons) {
    const img = await request.get(new URL(icon.src, page.url()).href);
    expect(img.ok(), icon.src).toBe(true);
    expect(img.headers()["content-type"]).toBe(icon.type);
  }

  // One theme colour per colour scheme, from the light and dark background tokens.
  await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')).toHaveAttribute(
    "content",
    "#f4f1ea",
  );
  await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')).toHaveAttribute(
    "content",
    "#141a17",
  );

  // The service worker is there for installability only: it activates and caches nothing.
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe("/");
  await page.reload();
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
});

test("Offline: a clear message instead of silent failure, gone again once back online", async ({ page, context }) => {
  await page.goto("/");
  await signIn(page, `e2e-offline-${Date.now()}@example.com`, "Ada");
  await page.getByLabel("Group name").fill("Flat 5");
  await page.getByRole("button", { name: "Create Group" }).click();
  await expect(page.getByRole("button", { name: "Add a Chore" })).toBeVisible();

  const notice = page.getByRole("status").filter({ hasText: "You're offline" });
  await expect(notice).toBeHidden();
  await context.setOffline(true);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Changes won't save until you're back online.");

  // A save while offline says why it failed, not the browser's "Failed to fetch".
  await page.getByRole("button", { name: "Add a Chore" }).click();
  const form = page.getByRole("form", { name: "Add a Chore" });
  await form.getByLabel("Title").fill("Bins");
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Can't reach Chorely. Check your connection and try again.");

  await context.setOffline(false);
  await expect(notice).toBeHidden();
});
