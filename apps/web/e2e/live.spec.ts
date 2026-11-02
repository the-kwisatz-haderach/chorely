import { expect, test, type Page } from "@playwright/test";
import { addChore, signIn } from "./helpers";

/** The Queue's titles in order: Next up first, then the numbered list. */
async function order(page: Page): Promise<string[]> {
  const next = await page.getByLabel("Next up").locator("strong").first().innerText();
  const rest = await page.getByLabel("Queue list").locator("li > strong").allInnerTexts();
  return [next, ...rest];
}

/** Makes the page report itself hidden or visible, as switching tabs would. */
async function setVisibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate((s) => {
    Object.defineProperty(document, "visibilityState", { value: s, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

test("Live updates: a change in one browser appears in the other, without jumping an in-flight move", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  const ada = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  let bobPolls = 0;
  bob.on("request", (r) => {
    if (r.url().endsWith("/revision")) bobPolls++;
  });

  await ada.goto("/");
  await signIn(ada, `e2e-live-ada-${stamp}@example.com`, "Ada");
  await ada.getByLabel("Group name").fill("Flat 4");
  await ada.getByRole("button", { name: "Create Group" }).click();
  await addChore(ada, "Bins");
  await ada.getByRole("link", { name: "Group settings" }).click();
  await ada.getByRole("button", { name: "Create Invite link" }).click();
  const link = await ada.getByLabel("Invite link").inputValue();
  await ada.getByRole("link", { name: "Flat 4" }).click();

  await bob.goto(link);
  await signIn(bob, `e2e-live-bob-${stamp}@example.com`, "Bob");
  await expect(bob.getByLabel("Next up")).toContainText("Bins");

  // Ada's add and Claim reach Bob's open Queue within a few seconds, with no reload.
  await addChore(ada, "Dishes");
  await expect.poll(() => order(bob), { timeout: 10_000 }).toEqual(["Bins", "Dishes"]);
  await ada.getByRole("button", { name: "Claim Bins" }).click();
  await expect(bob.getByLabel("Next up")).toContainText("Assigned to Ada", { timeout: 10_000 });

  // Bob moves Dishes to the front, held in flight. Ada's add still shows up, but Dishes stays where Bob put it.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await bob.route("**/move", async (route) => {
    await held;
    await route.continue();
  });
  await bob.getByLabel("Move Dishes").click();
  await bob.getByRole("button", { name: "Move to front" }).click();
  await expect.poll(() => order(bob)).toEqual(["Dishes", "Bins"]);
  await addChore(ada, "Hoover");
  await expect.poll(() => order(bob), { timeout: 10_000 }).toEqual(["Dishes", "Bins", "Hoover"]);
  release();
  await bob.unroute("**/move");
  await expect.poll(() => order(ada), { timeout: 10_000 }).toEqual(["Dishes", "Bins", "Hoover"]);
  await expect.poll(() => order(bob)).toEqual(["Dishes", "Bins", "Hoover"]);

  // A hidden tab stops polling; showing it again catches up at once.
  await setVisibility(bob, "hidden");
  await bob.waitForTimeout(500);
  const pollsWhenHidden = bobPolls;
  await addChore(ada, "Plants");
  await bob.waitForTimeout(6_000);
  expect(bobPolls).toBe(pollsWhenHidden);
  await expect(bob.getByText("Plants")).toBeHidden();
  await setVisibility(bob, "visible");
  await expect.poll(() => order(bob), { timeout: 2_000 }).toEqual(["Dishes", "Bins", "Hoover", "Plants"]);
});
