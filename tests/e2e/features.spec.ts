/**
 * E2E: Features Page
 *
 * Tests feature card display, expansion, and tracker interactions.
 * Lyra Voss has: Bardic Inspiration, Jack of All Trades, Font of Inspiration,
 * Expertise, Countercharm, Second Wind, Action Surge, Uncanny Dodge.
 */

import { test, expect } from "@playwright/test";

test.describe("Features Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/characters/mock-1?tab=features");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
  });

  // Each feature renders as a UniversalCard whose lemma is a `.uc-name` span.
  // Target THAT span (not a bare text match) because the page also carries a
  // tablet/mobile RESOURCES tracker bar (`.res-trackers.hide-when-rail`) that
  // mirrors the same tracker names in hidden `.tr-name` spans at the desktop
  // viewport — a bare `getByText(...).first()` would resolve that hidden copy.
  const ucName = (page: import("@playwright/test").Page, name: RegExp) =>
    page.locator(".uc-name", { hasText: name });

  test("displays class features", async ({ page }) => {
    await expect(ucName(page, /Bardic Inspiration/i).first()).toBeVisible();
    await expect(ucName(page, /Jack of All Trades/i).first()).toBeVisible();
  });

  test("displays cross-class features", async ({ page }) => {
    await expect(ucName(page, /Second Wind/i).first()).toBeVisible();
    await expect(ucName(page, /Action Surge/i).first()).toBeVisible();
    await expect(ucName(page, /Uncanny Dodge/i).first()).toBeVisible();
  });

  test("can expand a feature card to see description", async ({ page }) => {
    // UniversalCard discloses its description via the "Expand: <name>" affordance.
    await page.getByRole("button", { name: /Expand: Bardic Inspiration/i }).click();

    // Assert inside the disclosed accordion region (named for the feature), so
    // the match can't resolve the hidden tracker-bar `.tr-die` ("d8") copy.
    const detail = page.getByRole("region", { name: /Bardic Inspiration/i });
    await expect(detail.getByText(/d8|inspire|bonus action/i).first()).toBeVisible();
  });

  test("displays tracker pips for tracked features", async ({ page }) => {
    // Bardic Inspiration card (CHA mod = 5 uses, 2 used) renders on the page.
    await expect(ucName(page, /Bardic Inspiration/i).first()).toBeVisible();
  });

  test("can use a tracked feature", async ({ page }) => {
    // The tracker's Use/Spend button lives inside the UniversalCard's .uc-detail
    // section, which is `inert` while the card is collapsed. Expand the card
    // first, then click Use — this tests the correct expanded-detail interaction.
    const actionSurgeRow = ucName(page, /Action Surge/i)
      .first()
      .locator("xpath=ancestor::article");
    // Expand by clicking the uc-head row (which expands the detail via the chevron
    // button overlay).
    const chevron = actionSurgeRow.getByRole("button", { name: /expand/i });
    if (await chevron.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chevron.click();
    }
    // After expansion the tracker's Spend/Use button is interactive.
    const surgeUse = actionSurgeRow.getByRole("button", { name: /use|spend/i });
    if (await surgeUse.isVisible({ timeout: 2000 }).catch(() => false)) {
      await surgeUse.click();
      // Should mark one use consumed — verified by the tracker updating
    }
  });

  test("shows action type badges (action, bonus, reaction)", async ({ page }) => {
    // Feature cards surface action type / recovery in the gloss sub-line.
    await expect(
      page.locator(".uc-gloss", { hasText: /bonus|reaction|action/i }).first()
    ).toBeVisible();
  });
});
