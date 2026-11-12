/**
 * Rehearsal 5 — rests and the clock. Bard lets an hour pass so Warding Bond, which
 * outlived the fight, ends by itself; then takes a Short Rest (spending a Hit Die). The
 * hour comes first: a Short Rest is itself an hour, and would end the bond already.
 * The Wizard takes a Long Rest and goes through its prepared-spells step.
 */
import { expect, test } from "@playwright/test";
import {
  expectNoCrash,
  openCharacter,
  SANDBOX_USERS,
  signInAs,
  watchErrors,
} from "./helpers";

test("Bard: an hour passes and Warding Bond ends by itself", async ({ page }) => {
  await signInAs(page, SANDBOX_USERS.bard.email);
  await page.goto(`/characters/${SANDBOX_USERS.bard.characterId}`);
  await expect(page.locator(".f-char")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".f-char-stats")).toContainText("15"); // Warding Bond's +1 AC
  await page.getByRole("button", { name: "Let time pass" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog
    .getByRole("button", { name: /1 hour|1 h|an hour/i })
    .first()
    .click();
  await dialog
    .getByRole("button", { name: /^(Pass|Let it pass|Done|Confirm)/ })
    .last()
    .click();
  await expect(dialog).toHaveCount(0);
  // Warding Bond lasts 1 hour: after it, its +1 AC is gone (Bard's AC 15 → 14).
  await expect(page.locator(".f-char-stats")).toContainText("14");
});

test("Bard: a Short Rest spends a Hit Die and heals", async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, SANDBOX_USERS.bard.email);
  await page.goto(`/characters/${SANDBOX_USERS.bard.characterId}`);
  await page.getByRole("button", { name: "Short rest" }).first().click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "d8" }).first().click();
  // The player rolls the die at the table and types the total.
  await dialog.getByRole("textbox").fill("5");
  await dialog.getByRole("button", { name: "Complete rest" }).click();
  // The rest ends on its summary (what came back): the Hit Die spent is listed.
  const summary = page
    .locator("dialog[open]")
    .filter({ hasText: /Short\sRest\sSummary/ });
  await expect(summary).toBeVisible();
  await expect(summary).toContainText(/Hit\sDice\sSpent/);
  await summary.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
  await expectNoCrash(page);
  expect(errors).toEqual([]);
});

test("the Wizard: a Long Rest offers the prepared-spells step", async ({ page }) => {
  const errors = watchErrors(page);
  await openCharacter(page, "Rehearsal Wizard");
  await page.getByRole("button", { name: "Long rest" }).first().click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  // The rest first, its summary, then the step that offers to change the prepared
  // spells (#903).
  await dialog.getByRole("button", { name: "Complete rest" }).click();
  const summary = page.locator("dialog[open]").filter({ hasText: /Long\sRest\sSummary/ });
  await expect(summary).toBeVisible();
  await summary.getByRole("button", { name: "Done" }).click();
  await expect(
    page
      .locator("dialog[open]")
      .getByText(/prepare/i)
      .first()
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expectNoCrash(page);
  expect(errors).toEqual([]);
});
