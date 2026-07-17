/**
 * E2E: Character cockpit navigation (Phase-3C tab model).
 *
 * The pre-rewrite sheet navigated via a NavRail of links to `/characters/:id/<tab>`
 * sub-routes (with a "More" overflow). The cockpit replaces that with a single
 * primary tab bar — `role="tab"` buttons selecting the center panel as in-view
 * `?tab=` STATE — plus the persistent Left/Right HUD. Abilities moved to the Left
 * HUD, Rest is a header action, and Lore + Notes folded into the Bio tab, so those
 * are no longer tabs. Uses Lyra Voss (Elf Bard 9) loaded via DEV_BYPASS_AUTH.
 */

import { test, expect, type Page } from "@playwright/test";
import { enterSheetEdit } from "./sheet-edit";

/** Select a cockpit tab — a `role="tab"` button that flips `?tab=` view state. */
async function selectTab(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("tab", { name }).click();
}

test.describe("Sheet Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/characters/mock-1");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
  });

  test("header shows character identity", async ({ page }) => {
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
    await expect(page.getByText(/Bard/i).first()).toBeVisible();
  });

  // The cockpit header must reflow (not push Rest/Level-Up/Edit/vitals off-screen
  // behind a page-level horizontal scrollbar) across the iPad band, in both play
  // and edit mode.
  for (const width of [768, 834]) {
    test(`no horizontal page overflow at ${width}px (tablet band)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1024 });
      await expect(page.getByText("Lyra Voss").first()).toBeVisible();
      const playOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(playOverflow).toBeLessThanOrEqual(1);
      // Enter edit mode (the wider header variant) and re-check. At the coarse-
      // pointer tablet band the Signet home renders (not the fine-pointer fob), so
      // the shared helper blooms its seal chain to reach ✎ Edit.
      await enterSheetEdit(page);
      const editOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(editOverflow).toBeLessThanOrEqual(1);
    });
  }

  test("Combat is the default selected tab", async ({ page }) => {
    await expect(page.getByRole("tab", { name: /combat/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("can navigate to the Spells tab", async ({ page }) => {
    await selectTab(page, /spells/i);
    await expect(page).toHaveURL(/tab=spells/);
    await expect(page.getByText(/Vicious Mockery/i).first()).toBeVisible();
  });

  test("can navigate to the Features tab", async ({ page }) => {
    await selectTab(page, /features/i);
    await expect(page).toHaveURL(/tab=features/);
    await expect(
      page.locator(".uc-name", { hasText: /Bardic Inspiration/i }).first()
    ).toBeVisible();
  });

  test("can navigate to the Inventory tab", async ({ page }) => {
    await selectTab(page, /inventory/i);
    await expect(page).toHaveURL(/tab=inventory/);
    await expect(page.getByText(/Rapier/i).first()).toBeVisible();
  });

  test("can navigate to the Bio tab (backstory + folded notes)", async ({ page }) => {
    await selectTab(page, /bio/i);
    await expect(page).toHaveURL(/tab=bio/);
    await expect(page.getByText(/Lyra grew up/i).first()).toBeVisible();
  });

  test("a `?tab=` deep-link selects that tab on load", async ({ page }) => {
    await page.goto("/characters/mock-1?tab=features");
    await expect(page.getByRole("tab", { name: /features/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("back to the roster", async ({ page }) => {
    // The roster's canonical route is `/characters`; the index route redirects
    // `/` → `/characters` (router.tsx, the routing-coherence fix). So landing on
    // root drops you on the roster, not a bare `/`.
    await page.goto("/");
    await expect(page).toHaveURL(/\/characters$/);
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
  });
});
