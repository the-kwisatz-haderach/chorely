import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/** The local date `days` from today, as the date input and the Queue show it. */
function localDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Adds a Chore due today that repeats every 2 days on a fixed calendar, through "More options". */
async function addRecurringChore(page: Page, title: string) {
  await page.getByRole("button", { name: "Add a Chore" }).click();
  await page.getByRole("form", { name: "Add a Chore" }).getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "More options" }).click();
  const form = page.getByRole("form", { name: "Add a Chore" });
  await form.getByLabel("Due date").fill(localDate(0));
  await form.getByLabel("Repeats").selectOption({ label: "Every N days" });
  await form.getByRole("spinbutton", { name: "Every" }).fill("2");
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByLabel("Next up")).toContainText(title);
}

test("Complete a Recurring Chore with Undo, skip one, then delete and stop repeating", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await signIn(page, `e2e-recurrence-${Date.now()}@example.com`, "Ada");
  await page.getByLabel("Group name").fill("Flat 4");
  await page.getByRole("button", { name: "Create Group" }).click();
  await addRecurringChore(page, "Bins");
  await expect(page.getByLabel("Next up")).toContainText(`Due ${localDate(0)}`);

  // Completing creates the next Occurrence, two days on; it is the only Bins in the Queue.
  await page.getByRole("button", { name: "Complete Bins" }).click();
  await expect(page.getByRole("status")).toContainText("Completed Bins");
  await expect(page.getByLabel("Next up")).toContainText(`Due ${localDate(2)}`);
  await expect(page.getByLabel("Queue list")).toBeHidden();

  // Undo removes that Occurrence and brings back the one that was done.
  await page.getByRole("button", { name: "Undo completing Bins" }).click();
  await expect(page.getByLabel("Next up")).toContainText(`Due ${localDate(0)}`);
  await expect(page.getByLabel("Queue list")).toBeHidden();

  // The edit screen shows the schedule. "Delete this one" skips to the next Occurrence.
  await page.getByRole("link", { name: "Edit Bins" }).click();
  await expect(page.getByRole("form", { name: "Edit Chore" }).getByLabel("Repeats")).toHaveValue("day");
  await page.getByRole("button", { name: "Delete Chore" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete this one" }).click();
  await expect(page.getByLabel("Next up")).toContainText(`Due ${localDate(2)}`);

  // "Delete and stop repeating" ends the series: nothing comes back.
  await page.getByRole("link", { name: "Edit Bins" }).click();
  await page.getByRole("button", { name: "Delete Chore" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete and stop repeating" }).click();
  await expect(page.getByText("Nothing in the Queue yet")).toBeVisible();
});

test("Stop repeating leaves the current Occurrence as a one-off", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await signIn(page, `e2e-stop-${Date.now()}@example.com`, "Ada");
  await page.getByLabel("Group name").fill("Flat 4");
  await page.getByRole("button", { name: "Create Group" }).click();
  await addRecurringChore(page, "Plants");

  await page.getByRole("link", { name: "Edit Plants" }).click();
  await page.getByRole("button", { name: "Stop repeating" }).click();
  await expect(page.getByLabel("Next up")).toContainText("Plants");
  await page.getByRole("button", { name: "Complete Plants" }).click();
  await expect(page.getByText("Nothing in the Queue yet")).toBeVisible();
});
