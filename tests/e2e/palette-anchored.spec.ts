/**
 * E2E: the "Ask the Folio" palette is TOP-ANCHORED (owner 2026-06-07).
 *
 * The palette used to sit in the centered scrim, so as the result count changed the
 * box grew/shrank symmetrically and the header + search bar drifted up and down. Now
 * it is pinned near the top: the head + search hold a FIXED y, and only the results
 * region expands/contracts downward. Guard: the search field's top is identical with
 * a many-result query vs a no-result query, while the modal's overall height grows.
 */

import { test, expect, type Page, type Locator } from "@playwright/test";
import { ensurePaletteSearchFocused } from "./ready";

async function openPalette(page: Page) {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/characters/mock-1");
  await expect(page.getByText("Lyra Voss").first()).toBeVisible();
  await page.keyboard.press("Meta+k");
  await expect(page.locator('[role="combobox"]')).toBeVisible();
  // On touch the search field is NOT auto-focused (keyboard/reflow guard); tap it so
  // the field is reachable on both projects before the box-measurement queries.
  await ensurePaletteSearchFocused(page);
}

/** A non-null bounding box (avoids forbidden `!` assertions). */
async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b).not.toBeNull();
  if (!b) throw new Error("element has no bounding box");
  return b;
}

test("the header + search stay anchored while results expand downward", async ({
  page,
}) => {
  await openPalette(page);
  const search = page.locator("#palette-search-input");
  const modal = page.locator(".modal");

  // A broad query → many result rows → a tall box.
  await search.fill("a");
  await page.waitForTimeout(150);
  const searchTall = await box(search);
  const modalTall = await box(modal);

  // A query that matches nothing → the empty state → a short box.
  await search.fill("zzzzzzzzzz");
  await page.waitForTimeout(150);
  const searchShort = await box(search);
  const modalShort = await box(modal);

  // The search bar's top is FIXED regardless of how many results show…
  expect(Math.abs(searchTall.y - searchShort.y)).toBeLessThan(2);
  // …and the modal's TOP is fixed too (it only grows from the bottom).
  expect(Math.abs(modalTall.y - modalShort.y)).toBeLessThan(2);
  // …while the many-result box is genuinely taller (grew downward, not centered).
  expect(modalTall.height).toBeGreaterThan(modalShort.height + 8);
});
