import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { EMAIL_OUTBOX_DIR } from "../playwright.config";

/** The sign-in code the dev email transport wrote for `email`. */
export async function emailedCode(email: string): Promise<string> {
  const file = join(EMAIL_OUTBOX_DIR, `${encodeURIComponent(email)}.json`);
  let text = "";
  await expect(async () => {
    text = (JSON.parse(await readFile(file, "utf8")) as { text: string }).text;
  }).toPass();
  const code = /\b(\d{6})\b/.exec(text)?.[1];
  if (!code) throw new Error("No code in email");
  return code;
}

/** First sign-in from the sign-in screen, through to choosing a Display name. */
export async function signIn(page: Page, email: string, displayName: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill(await emailedCode(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("What should we call you?").fill(displayName);
  await page.getByRole("button", { name: "Continue" }).click();
}

/** Adds a Chore to the back through the FAB's sheet; a Due date is set on the "More options" screen. */
export async function addChore(page: Page, title: string, dueDate?: string) {
  await page.getByRole("button", { name: "Add a Chore" }).click();
  const form = page.getByRole("form", { name: "Add a Chore" });
  await form.getByLabel("Title").fill(title);
  if (dueDate) {
    await form.getByRole("button", { name: "More options" }).click();
    await form.getByLabel("Due date").fill(dueDate);
  }
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("form", { name: "Add a Chore" })).toBeHidden();
}
