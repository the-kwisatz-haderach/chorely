import { expect, test } from "@playwright/test";
import { emailedCode } from "./helpers";

test("first sign-in: email, code, display name, create and rename a Group, then sign out", async ({ page }) => {
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

  // No Group yet: create one, land in it, and rename it.
  await page.getByLabel("Group name").fill("Flat 4");
  await page.getByRole("button", { name: "Create Group" }).click();
  await expect(page.getByRole("heading", { name: "Flat 4" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Ada" })).toBeVisible();

  await page.getByLabel("Rename Group").fill("Flat 5");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("heading", { name: "Flat 5" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Flat 5" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Email")).toBeVisible();
});
