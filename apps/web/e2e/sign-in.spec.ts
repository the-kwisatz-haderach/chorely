import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { EMAIL_OUTBOX_DIR } from "../playwright.config";

async function emailedCode(email: string): Promise<string> {
  const file = join(EMAIL_OUTBOX_DIR, `${encodeURIComponent(email)}.json`);
  let text = "";
  await expect(async () => {
    text = (JSON.parse(await readFile(file, "utf8")) as { text: string }).text;
  }).toPass();
  const code = /\b(\d{6})\b/.exec(text)?.[1];
  if (!code) throw new Error("No code in email");
  return code;
}

test("first sign-in: email, code, display name, then sign out", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/");

  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();

  // A wrong code shows a clear error and keeps the person on the code step.
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That code is wrong or has expired.")).toBeVisible();

  await page.getByLabel("Code").fill(await emailedCode(email));
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.getByLabel("What should we call you?").fill("Ada");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Signed in as Ada")).toBeVisible();

  // The session survives a reload, and the display name is not asked for again.
  await page.reload();
  await expect(page.getByText("Signed in as Ada")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Email")).toBeVisible();
});
