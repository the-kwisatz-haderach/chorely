import { expect, test } from "@playwright/test";
import { addChore, signIn } from "./helpers";

test("Leave a Group: Chores unassigned, Former member in the Done list, last Member deletes the Group", async ({ browser }) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  const ada = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();

  await ada.goto("/");
  await signIn(ada, `e2e-leave-ada-${stamp}@example.com`, "Ada");
  await ada.getByLabel("Group name").fill("Flat 4");
  await ada.getByRole("button", { name: "Create Group" }).click();
  await addChore(ada, "Bins");
  await addChore(ada, "Dishes");
  await ada.getByRole("link", { name: "Group settings" }).click();
  await ada.getByRole("button", { name: "Create Invite link" }).click();
  const link = await ada.getByLabel("Invite link").inputValue();

  // Bob joins, completes Bins and claims Dishes.
  await bob.goto(link);
  await signIn(bob, `e2e-leave-bob-${stamp}@example.com`, "Bob");
  await bob.getByRole("button", { name: "Complete Bins" }).click();
  await expect(bob.getByRole("status")).toContainText("Completed Bins");
  await bob.getByRole("button", { name: "Claim Dishes" }).click();
  await expect(bob.getByLabel("Next up")).toContainText("Assigned to Bob");

  // Bob leaves after a confirm, and lands on the first-run screen.
  await bob.getByRole("link", { name: "Group settings" }).click();
  await bob.getByRole("button", { name: "Leave Group" }).click();
  await expect(bob.getByRole("dialog")).toContainText("Former member");
  await bob.getByRole("dialog").getByRole("button", { name: "Leave Group" }).click();
  await expect(bob.getByRole("button", { name: "Create Group" })).toBeVisible();

  // Ada sees Dishes unassigned and Bob as a Former member in the Done list.
  await ada.getByRole("link", { name: "Flat 4" }).click();
  await expect(ada.getByLabel("Next up")).toContainText("Dishes");
  await expect(ada.getByLabel("Next up")).toContainText("Unassigned");
  await ada.getByRole("link", { name: "Done" }).click();
  await expect(ada.getByLabel("Done list")).toContainText("Done by Former member");

  // As the last Member, Ada is told the Group goes with her; cancelling keeps it.
  await ada.getByRole("link", { name: "Group settings" }).click();
  await expect(ada.getByRole("list").filter({ hasText: "Ada" })).not.toContainText("Bob");
  await ada.getByRole("button", { name: "Leave Group" }).click();
  await expect(ada.getByRole("dialog")).toContainText("the Group is deleted");
  await ada.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(ada.getByRole("dialog")).toBeHidden();
  await ada.getByRole("button", { name: "Leave Group" }).click();
  await ada.getByRole("dialog").getByRole("button", { name: "Leave and delete Group" }).click();
  await expect(ada.getByRole("button", { name: "Create Group" })).toBeVisible();

  // The old link no longer works: the Group is gone.
  await bob.goto(link);
  await expect(bob.getByText("Invite link is not valid any more")).toBeVisible();
});
