import { expect, test } from "@playwright/test";
import { emailedCode } from "./helpers";

test("adding Chores fills the Queue: empty state, Next up, numbered list, Due-date seeding", async ({ page }) => {
  const email = `e2e-queue-${Date.now()}@example.com`;
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill(await emailedCode(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("What should we call you?").fill("Ada");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Group name").fill("Flat 4");
  await page.getByRole("button", { name: "Create Group" }).click();

  await expect(page.getByText("Nothing in the Queue yet")).toBeVisible();

  // The FAB's sheet takes a title and Front or Back (Back by default); "More options" opens the full add screen.
  const add = async (title: string, opts: { due?: string; front?: boolean } = {}) => {
    await page.getByRole("button", { name: "Add a Chore" }).click();
    const form = page.getByRole("form", { name: "Add a Chore" });
    await form.getByLabel("Title").fill(title);
    await expect(form.getByLabel("Back")).toBeChecked();
    if (opts.front) await form.getByLabel("Front").check();
    if (opts.due) {
      await form.getByRole("button", { name: "More options" }).click();
      await expect(page).toHaveURL(/\/chores\/new/);
      await expect(form.getByLabel("Title")).toHaveValue(title);
      await form.getByLabel("Due date").fill(opts.due);
    }
    await form.getByRole("button", { name: "Add", exact: true }).click();
    await expect(form).toBeHidden();
  };

  await add("Take out bins");
  await expect(page.getByLabel("Next up")).toContainText("Take out bins");
  await expect(page.getByText("Nothing in the Queue yet")).toBeHidden();

  await add("Vacuum");
  await add("Water plants", { front: true });
  await add("Pay rent", { due: "2030-01-10" });

  await expect(page.getByLabel("Next up")).toContainText("Water plants");
  const list = page.getByRole("list", { name: "Queue list" }).getByRole("listitem");
  await expect(list).toHaveText([/Take out bins/, /Vacuum/, /Pay rent/]);

  await page.reload();
  await expect(page.getByLabel("Next up")).toContainText("Water plants");
  await expect(list).toHaveCount(3);
});
