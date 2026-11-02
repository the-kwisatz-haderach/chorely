import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
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

async function signIn(page: Page, email: string, displayName: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill(await emailedCode(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("What should we call you?").fill(displayName);
  await page.getByRole("button", { name: "Continue" }).click();
}

async function addChore(page: Page, title: string) {
  await page.getByRole("button", { name: "Add a Chore" }).click();
  const form = page.getByRole("form", { name: "Add a Chore" });
  await form.getByLabel("Title").fill(title);
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("form", { name: "Add a Chore" })).toBeHidden();
}

test("Complete with Undo, and the Done list", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await signIn(page, `e2e-complete-${Date.now()}@example.com`, "Ada");
  await page.getByLabel("Group name").fill("Flat 4");
  await page.getByRole("button", { name: "Create Group" }).click();
  await addChore(page, "Bins");
  await addChore(page, "Dishes");
  await expect(page.getByLabel("Next up")).toContainText("Bins");

  // Complete the Next-up Chore: the next one takes over and the toast offers Undo.
  await page.getByRole("button", { name: "Complete Bins" }).click();
  await expect(page.getByLabel("Next up")).toContainText("Dishes");
  await expect(page.getByRole("status")).toContainText("Completed Bins");

  // Undo restores Bins to its place at the front.
  await page.getByRole("button", { name: "Undo completing Bins" }).click();
  await expect(page.getByLabel("Next up")).toContainText("Bins");
  await expect(page.getByLabel("Queue list")).toContainText("Dishes");

  // Complete again and let the toast go: there is no way back, and the Done list shows who did it.
  await page.getByRole("button", { name: "Complete Bins" }).click();
  await expect(page.getByRole("status")).toContainText("Completed Bins");
  await expect(page.getByRole("button", { name: "Undo completing Bins" })).toBeHidden({ timeout: 15_000 });
  await page.getByRole("button", { name: "Show Done list" }).click();
  await expect(page.getByLabel("Done list")).toContainText("Bins");
  await expect(page.getByLabel("Done list")).toContainText("Done by Ada");
  await expect(page.getByLabel("Done list").getByRole("button")).toHaveCount(0);

  // Newest first: completing Dishes puts it above Bins, and the open Done list reloads.
  await page.getByRole("button", { name: "Complete Dishes" }).click();
  await expect(page.getByLabel("Done list").getByRole("listitem").first()).toContainText("Dishes");
  await expect(page.getByLabel("Done list").getByRole("listitem").nth(1)).toContainText("Bins");
  await expect(page.getByText("Nothing in the Queue yet")).toBeVisible();
});
