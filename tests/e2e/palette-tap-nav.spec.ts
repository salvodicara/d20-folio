/**
 * E2E: TAPPING a palette result on a touch device must actually navigate (owner:
 * "on mobile, searching a spell in the palette shows results — but tapping a
 * result does not lead to the compendium").
 *
 * Drives the REAL mobile flow: tap the topbar trigger to open "Ask the Folio",
 * tap the search field (this is what focuses it on touch — coarse pointers skip
 * the open auto-focus), type a query, then TAP a compendium hit. The assertion is
 * the user-visible outcome: the URL deep-links to the entry (`?type=…&sel=…`) and
 * STAYS there — not a transient hop that history-rewinds back to the sheet.
 *
 * Runs under BOTH projects: `mobile` (Pixel 7, touch taps — the reported bug) and
 * `chromium` (desktop clicks — pins that the fix never regressed the working path).
 */

import { test, expect, type Page } from "@playwright/test";

async function openPaletteViaTrigger(page: Page, tap: boolean) {
  await page.goto("/characters/mock-1");
  await expect(page.getByText("Lyra Voss").first()).toBeVisible();
  const trigger = page.getByRole("button", { name: /ask the folio/i });
  if (tap) await trigger.tap();
  else await trigger.click();
  await expect(page.locator('[role="combobox"]')).toBeVisible();
}

test("activating a compendium hit navigates to the entry (tap on touch, click on desktop)", async ({
  page,
}, testInfo) => {
  const touch = testInfo.project.name === "mobile";
  await openPaletteViaTrigger(page, touch);

  const input = page.locator("#palette-search-input");
  if (touch) {
    // On touch the field is NOT auto-focused (the soft-keyboard guard); the user
    // taps it to type — reproduce exactly that, so the input HOLDS focus when the
    // result is tapped (the blur/dismiss race is the classic failure class).
    await input.tap();
    await expect(input).toBeFocused();
    await page.keyboard.type("smite");
  } else {
    await input.fill("smite");
  }

  const hit = page.getByRole("option", { name: /divine smite/i }).first();
  await expect(hit).toBeVisible();
  if (touch) await hit.tap();
  else await hit.click();

  // The palette closes and the app lands on the compendium entry deep-link…
  await expect(page).toHaveURL(/\/compendium\?type=.*&sel=/);
  // …and STAYS there (an overlay-history rewind undoing the navigation a beat
  // later is the failure mode this spec exists to catch).
  await page.waitForTimeout(600);
  await expect(page).toHaveURL(/\/compendium\?type=.*&sel=/);
  await expect(page.getByRole("heading", { name: /divine smite/i })).toBeVisible();
});
