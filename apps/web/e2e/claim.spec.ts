import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

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

  // Ada assigns it to Bob, another Member.
  await ada.getByLabel("Assign Bins").selectOption({ label: "Bob" });
  await expect(ada.getByLabel("Next up")).toContainText("Assigned to Bob");
  await bob.reload();
  await expect(bob.getByLabel("Next up")).toContainText("Assigned to Bob");
  await expect(bob.getByRole("button", { name: "Unclaim Bins" })).toBeVisible();

  // Ada reassigns it back to herself while Bob's page is stale: his Unclaim 409s with the server's message, not the Claim one.
  await ada.getByLabel("Assign Bins").selectOption({ label: "Ada" });
  await expect(ada.getByLabel("Next up")).toContainText("Assigned to Ada");
  await bob.getByRole("button", { name: "Unclaim Bins" }).click();
  await expect(bob.getByText("You are not assigned to this Chore")).toBeVisible();
  await expect(bob.getByText("Someone else got there first")).toBeHidden();
  await expect(bob.getByLabel("Next up")).toContainText("Assigned to Ada");

  // Bob reassigns it to himself, then back to nobody.
  await bob.getByLabel("Assign Bins").selectOption({ label: "Bob" });
  await expect(bob.getByLabel("Next up")).toContainText("Assigned to Bob");
  await expect(bob.getByRole("button", { name: "Unclaim Bins" })).toBeVisible();
  await bob.getByLabel("Assign Bins").selectOption({ label: "Unassigned" });
  await expect(bob.getByLabel("Next up")).toContainText("Unassigned");
});
