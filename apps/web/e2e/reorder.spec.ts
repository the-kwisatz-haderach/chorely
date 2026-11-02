import { expect, test, type Page } from "@playwright/test";
import { addChore, signIn } from "./helpers";

/** The Queue's titles in order: Next up first, then the numbered list. */
async function order(page: Page): Promise<string[]> {
  const next = await page.getByLabel("Next up").locator("strong").first().innerText();
  const rest = await page.getByLabel("Queue list").locator("li > strong").allInnerTexts();
  return [next, ...rest];
}

test("Reorder the Queue by drag and by the Move menu, and it sticks after a reload", async ({ page }) => {
  test.setTimeout(90_000);
  const saved: boolean[] = [];
  page.on("response", (r) => {
    if (r.url().endsWith("/move")) saved.push(r.ok());
  });
  await page.goto("/");
  await signIn(page, `e2e-reorder-${Date.now()}@example.com`, "Ada");
  await page.getByLabel("Group name").fill("Flat 4");
  await page.getByRole("button", { name: "Create Group" }).click();
  for (const title of ["Bins", "Dishes", "Laundry", "Plants"]) await addChore(page, title);
  await expect.poll(() => order(page)).toEqual(["Bins", "Dishes", "Laundry", "Plants"]);

  // Menu: to the front becomes Next up at once, before the server has even answered.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/move", async (route) => {
    await held;
    await route.continue();
  });
  await page.getByLabel("Move Plants").click();
  await page.getByRole("button", { name: "Move to front" }).click();
  await expect.poll(() => order(page)).toEqual(["Plants", "Bins", "Dishes", "Laundry"]);
  expect(saved).toHaveLength(0);
  release();
  await page.unroute("**/move");
  await expect.poll(() => saved.length, { timeout: 15_000 }).toBe(1);

  // To the back goes last.
  await page.getByLabel("Move Bins").click();
  await page.getByRole("button", { name: "Move to back" }).click();
  await expect.poll(() => order(page)).toEqual(["Plants", "Dishes", "Laundry", "Bins"]);

  // Drag: dropping on a Chore lands below it going down, above it going up.
  const row = (title: string) => page.getByRole("listitem").filter({ hasText: title });
  await row("Dishes").dragTo(row("Bins"));
  await expect.poll(() => order(page)).toEqual(["Plants", "Laundry", "Bins", "Dishes"]);
  await row("Bins").dragTo(page.getByLabel("Next up"));
  await expect.poll(() => order(page)).toEqual(["Bins", "Plants", "Laundry", "Dishes"]);

  // The order showed instantly; once the server has answered all four moves, it survives a reload.
  await expect.poll(() => saved.length, { timeout: 15_000 }).toBe(4);
  expect(saved.every((ok) => ok)).toBe(true);

  // A move the server rejects as a conflict is undone by a refetch, with a message.
  await page.route("**/move", (route) =>
    route.fulfill({ status: 409, json: { code: "conflict", message: "The Queue changed while you were moving this Chore" } }),
  );
  await page.getByLabel("Move Dishes").click();
  await page.getByRole("button", { name: "Move to front" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "has been refreshed" })).toBeVisible();
  await expect.poll(() => order(page)).toEqual(["Bins", "Plants", "Laundry", "Dishes"]);
  await page.unroute("**/move");

  await page.reload();
  await expect.poll(() => order(page)).toEqual(["Bins", "Plants", "Laundry", "Dishes"]);
});
