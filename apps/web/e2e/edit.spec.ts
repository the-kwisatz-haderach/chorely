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

async function addChore(page: Page, title: string, dueDate?: string) {
  await page.getByRole("button", { name: "Add a Chore" }).click();
  const form = page.getByRole("form", { name: "Add a Chore" });
  await form.getByLabel("Title").fill(title);
  if (dueDate) await form.getByLabel("Due date").fill(dueDate);
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("form", { name: "Add a Chore" })).toBeHidden();
}

test("Edit a Chore without moving it, flag overdue, and delete with a confirm", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await signIn(page, `e2e-edit-${Date.now()}@example.com`, "Ada");
  await page.getByLabel("Group name").fill("Flat 4");
  await page.getByRole("button", { name: "Create Group" }).click();
  await addChore(page, "Bins", "2030-01-01");
  await addChore(page, "Dishes", "2031-01-01");
  await expect(page.getByLabel("Next up")).toContainText("Bins");
  await expect(page.getByLabel("Queue", { exact: true })).not.toContainText("Overdue");

  // Edit on a full page: a past Due date is flagged as overdue but Bins stays Next up.
  await page.getByRole("link", { name: "Edit Dishes" }).click();
  const form = page.getByRole("form", { name: "Edit Chore" });
  await form.getByLabel("Title").fill("Dishes and pans");
  await form.getByLabel("Note").fill("Soak first");
  await form.getByLabel("Due date").fill("2020-01-01");
  await form.getByLabel("Assignee").selectOption({ label: "Ada" });
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Queue list")).toContainText("Dishes and pans");
  await expect(page.getByLabel("Queue list")).toContainText("Overdue");
  await expect(page.getByLabel("Queue list")).toContainText("Assigned to Ada");
  await expect(page.getByLabel("Next up")).toContainText("Bins");

  // Declining the confirm keeps the Chore; accepting removes it for good.
  await page.getByRole("link", { name: "Edit Bins" }).click();
  page.once("dialog", (d) => void d.dismiss());
  await page.getByRole("button", { name: "Delete Chore" }).click();
  await expect(page.getByRole("form", { name: "Edit Chore" })).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete Chore" }).click();
  await expect(page.getByLabel("Next up")).toContainText("Dishes and pans");
  await expect(page.getByLabel("Next up")).not.toContainText("Bins");

  // Completed Chores have no edit link, and the Done list stays read-only.
  await page.getByRole("button", { name: "Complete Dishes and pans" }).click();
  await page.getByRole("button", { name: "Show Done list" }).click();
  await expect(page.getByLabel("Done list")).toContainText("Dishes and pans");
  await expect(page.getByLabel("Done list").getByRole("link")).toHaveCount(0);
});
