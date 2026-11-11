/**
 * Rehearsal 6 — the DM's journey on the new campaign page (#913, DM tools): with a
 * fight running, the DM adds monsters, damages a group of them at once, sets a
 * condition, and ends the fight. One test with steps, soft where it can go on, so one
 * finding never hides the rest.
 */
import { expect, test } from "@playwright/test";
import { expectNoCrash, openFightTab, watchErrors } from "./helpers";

test("the DM runs a fight: add monsters, damage a group, set a condition, end", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);

  await test.step("a fight is running", async () => {
    await openFightTab(page);
    const missing = page.getByRole("button", { name: "Roll for the missing" });
    if (await missing.isVisible()) await missing.click();
    await expect(page.getByText(/INITIATIVE · ROUND/i).first()).toBeVisible();
  });

  await test.step("the DM adds two goblins", async () => {
    await page.getByRole("button", { name: "Add monsters" }).first().click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByRole("textbox", { name: /search for a monster/i }).fill("goblin");
    const more = dialog.getByRole("button", { name: /^One more: Goblin/ }).first();
    await more.click();
    await more.click();
    await dialog.getByRole("button", { name: /^Add 2$/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page
        .locator("[role=status]")
        .filter({ hasText: /In the fight/ })
        .first()
    ).toBeVisible();
    // The two goblins sit on one grouped row ("Goblin Minion ×2"); the search may
    // put any goblin first, so the row is matched by its count, not by a name.
    await expect(page.getByText(/Goblin.*×\s*\u2060?\s*2/).first()).toBeVisible();
  });

  await test.step("the DM damages both goblins at once", async () => {
    await page
      .getByRole("button", { name: /^Damage and healing: Goblin/ })
      .first()
      .click();
    const dialog = page.locator("dialog[open]");
    // The first goblin is chosen; add every other goblin on «On whom».
    for (const chip of await dialog
      .locator(".f-chips button[aria-pressed=false]")
      .all()) {
      if (/goblin/i.test(await chip.innerText())) await chip.click();
    }
    await dialog
      .getByRole("textbox", { name: /how many hit points/i })
      .or(dialog.getByRole("spinbutton", { name: /how many hit points/i }))
      .fill("5");
    await dialog.getByRole("button", { name: /^Damage$/ }).click();
    await expect
      .soft(
        page
          .locator("[role=status]")
          .filter({ hasText: /5 damage to 2 targets/ })
          .first(),
        "the hit lands on both goblins"
      )
      .toBeVisible();
  });

  await test.step("the DM knocks a goblin Prone", async () => {
    await page
      .getByRole("button", { name: /^Damage and healing: Goblin/ })
      .first()
      .click();
    const dialog = page.locator("dialog[open]");
    // Conditions are offered for one creature at a time: keep only the first goblin.
    const chosen = dialog.locator(".f-chips button[aria-pressed=true]");
    while ((await chosen.count()) > 1) await chosen.last().click();
    await dialog.getByRole("button", { name: /^Prone$/ }).click();
    await expect
      .soft(
        page
          .locator("[role=status]")
          .filter({ hasText: /Condition added to Goblin/ })
          .first(),
        "the condition lands"
      )
      .toBeVisible();
    if ((await dialog.count()) > 0) await page.keyboard.press("Escape");
  });

  await test.step("the DM ends the fight", async () => {
    await page.getByRole("button", { name: "End fight" }).click();
    await expect(page.getByText(/No fight running/i)).toBeVisible();
  });

  await expectNoCrash(page);
  expect.soft(errors).toEqual([]);
});
