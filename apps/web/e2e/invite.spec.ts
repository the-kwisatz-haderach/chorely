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

test("Invite link: share, join through sign-in, replace, paste on first run", async ({ browser }) => {
  const stamp = Date.now();
  const ada = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  const cy = await (await browser.newContext()).newPage();

  // Ada creates the Group and its Invite link.
  await ada.goto("/");
  await signIn(ada, `e2e-ada-${stamp}@example.com`, "Ada");
  await ada.getByLabel("Group name").fill("Flat 4");
  await ada.getByRole("button", { name: "Create Group" }).click();
  await ada.getByRole("button", { name: "Create Invite link" }).click();
  const firstLink = await ada.getByLabel("Invite link").inputValue();
  expect(firstLink).toMatch(/\/join\/[\w-]{22}$/);

  // Bob has no Account: opening the link signs him up and joins him in one flow.
  await bob.goto(firstLink);
  await signIn(bob, `e2e-bob-${stamp}@example.com`, "Bob");
  await expect(bob.getByRole("heading", { name: "Flat 4" })).toBeVisible();
  await expect(bob.getByRole("list").filter({ hasText: "Ada" })).toContainText("Bob");

  // Ada replaces the link; the old one now explains itself.
  await ada.getByRole("button", { name: "Replace Invite link" }).click();
  await expect(ada.getByLabel("Invite link")).not.toHaveValue(firstLink);
  const secondLink = await ada.getByLabel("Invite link").inputValue();

  await cy.goto(firstLink);
  await signIn(cy, `e2e-cy-${stamp}@example.com`, "Cy");
  await expect(cy.getByText("Invite link is not valid any more")).toBeVisible();

  // Cy is signed in with no Group: the first-run screen takes the new link pasted.
  await cy.goto("/");
  await cy.getByLabel("Paste an Invite link").fill(secondLink);
  await cy.getByRole("button", { name: "Join Group" }).click();
  await expect(cy.getByRole("heading", { name: "Flat 4" })).toBeVisible();

  // Someone already in another Group is told why they cannot join this one.
  const dana = await (await browser.newContext()).newPage();
  await dana.goto("/");
  await signIn(dana, `e2e-dana-${stamp}@example.com`, "Dana");
  await dana.getByLabel("Group name").fill("Office");
  await dana.getByRole("button", { name: "Create Group" }).click();
  await expect(dana.getByRole("heading", { name: "Office" })).toBeVisible();
  await dana.goto(secondLink);
  await expect(dana.getByText("You are already in a Group")).toBeVisible();

  // A Member opening their own Group's link just lands in the Group (blocking other Groups is in the contract tests).
  await bob.goto(secondLink);
  await expect(bob.getByRole("heading", { name: "Flat 4" })).toBeVisible();
});
