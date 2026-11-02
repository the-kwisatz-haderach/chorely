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

test("Claim, unclaim, assign and a lost Claim race", async ({ browser }) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  const ada = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();

  await ada.goto("/");
  await signIn(ada, `e2e-claim-ada-${stamp}@example.com`, "Ada");
  await ada.getByLabel("Group name").fill("Flat 4");
  await ada.getByRole("button", { name: "Create Group" }).click();
  await ada.getByRole("button", { name: "Create Invite link" }).click();
  const link = await ada.getByLabel("Invite link").inputValue();

  await bob.goto(link);
  await signIn(bob, `e2e-claim-bob-${stamp}@example.com`, "Bob");
  await expect(bob.getByRole("heading", { name: "Flat 4" })).toBeVisible();

  // Ada reloads so her Member list includes Bob, then adds a Chore.
  await ada.reload();
  await ada.getByRole("button", { name: "Add a Chore" }).click();
  await ada.getByRole("form", { name: "Add a Chore" }).getByLabel("Title").fill("Bins");
  await ada.getByRole("form", { name: "Add a Chore" }).getByRole("button", { name: "Add", exact: true }).click();
  await expect(ada.getByLabel("Next up")).toContainText("Unassigned");

  // Bob loads the Queue while Bins is still unassigned.
  await bob.reload();
  await expect(bob.getByLabel("Next up")).toContainText("Unassigned");

  // Ada claims in one tap and can unclaim.
  await ada.getByRole("button", { name: "Claim Bins" }).click();
  await expect(ada.getByLabel("Next up")).toContainText("Assigned to Ada");
  await ada.getByRole("button", { name: "Unclaim Bins" }).click();
  await expect(ada.getByLabel("Next up")).toContainText("Unassigned");
  await ada.getByRole("button", { name: "Claim Bins" }).click();
  await expect(ada.getByLabel("Next up")).toContainText("Assigned to Ada");

  // Bob's Queue is stale: his Claim loses, he is told why, and his Queue refreshes.
  await bob.getByRole("button", { name: "Claim Bins" }).click();
  await expect(bob.getByText("Someone else got there first")).toBeVisible();
  await expect(bob.getByLabel("Next up")).toContainText("Assigned to Ada");
  await expect(bob.getByRole("button", { name: "Claim Bins" })).toBeHidden();

  // Bob reassigns it to himself, then Ada hands it back to nobody.
  await bob.getByLabel("Assign Bins").selectOption({ label: "Bob" });
  await expect(bob.getByLabel("Next up")).toContainText("Assigned to Bob");
  await expect(bob.getByRole("button", { name: "Unclaim Bins" })).toBeVisible();
  await bob.getByLabel("Assign Bins").selectOption({ label: "Unassigned" });
  await expect(bob.getByLabel("Next up")).toContainText("Unassigned");
});
