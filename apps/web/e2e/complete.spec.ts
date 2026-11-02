import { expect, test } from "@playwright/test";
import { addChore, signIn } from "./helpers";

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
  await page.getByRole("link", { name: "Done" }).click();
  await expect(page.getByLabel("Done list")).toContainText("Bins");
  await expect(page.getByLabel("Done list")).toContainText("Done by Ada");
  await expect(page.getByLabel("Done list").getByRole("button")).toHaveCount(0);

  // Newest first: completing Dishes puts it above Bins.
  await page.getByRole("link", { name: "Flat 4" }).click();
  await page.getByRole("button", { name: "Complete Dishes" }).click();
  await expect(page.getByText("Nothing in the Queue yet")).toBeVisible();
  await page.getByRole("link", { name: "Done" }).click();
  await expect(page.getByLabel("Done list").getByRole("listitem").first()).toContainText("Dishes");
  await expect(page.getByLabel("Done list").getByRole("listitem").nth(1)).toContainText("Bins");
});
