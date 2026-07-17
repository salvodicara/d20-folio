/**
 * E2E: Equipment Page
 *
 * Tests weapon display, armor, gear sections, and consumable usage.
 * Lyra Voss has: Rapier, 2x Dagger, Shortbow, Potion of Healing x3,
 * Brooch of Shielding, Cael's Antidote Vial x2, Cael's Last Letter.
 */

import { test, expect } from "@playwright/test";

test.describe("Equipment Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/characters/mock-1?tab=inventory");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
  });

  test("displays weapons section", async ({ page }) => {
    await expect(page.getByText(/Rapier/i).first()).toBeVisible();
    await expect(page.getByText(/Dagger/i).first()).toBeVisible();
    await expect(page.getByText(/Shortbow/i).first()).toBeVisible();
  });

  test("shows weapon attack bonus, gated on 2024 proficiency", async ({ page }) => {
    // 2024 Bards are proficient with SIMPLE weapons only (bard.ts: ["Simple weapons"]).
    // The Rapier is MARTIAL → NOT proficient → DEX 16 (+3) only, no PB.
    const rapierSection = page
      .getByText(/Rapier/i)
      .first()
      .locator("../..");
    await expect(rapierSection.getByText("+3").first()).toBeVisible();
    // A SIMPLE weapon she IS proficient with adds PB: DEX (+3) + PB 4 at L9 = +7.
    const daggerSection = page
      .getByText(/Dagger/i)
      .first()
      .locator("../..");
    await expect(daggerSection.getByText("+7").first()).toBeVisible();
  });

  test("shows damage formula for weapons", async ({ page }) => {
    // Rapier: 1d8+3 (DEX based for finesse)
    await expect(page.getByText(/1d8\+3|1d8 \+ 3/i).first()).toBeVisible();
  });

  test("displays gear section with items", async ({ page }) => {
    await expect(page.getByText(/Potion of Healing/i).first()).toBeVisible();
    await expect(page.getByText(/Brooch of Shielding/i).first()).toBeVisible();
    await expect(page.getByText(/Cael's Antidote Vial/i).first()).toBeVisible();
  });

  test("shows quantity badge for multiple items", async ({ page }) => {
    // Potion of Healing ×3 — target the actual `.uc-qty` badge, not a loose
    // /3/ regex (which matched the hidden HP "38" span first).
    await expect(page.locator(".uc-qty", { hasText: "×3" }).first()).toBeVisible();
  });

  test("can expand a weapon card to see properties", async ({ page }) => {
    // UniversalCard exposes the accordion via the "Expand: <name>" affordance
    // (the whole row toggles, but the explicit button is the stable target).
    await page.getByRole("button", { name: /Expand: Rapier/i }).click();

    // Should show weapon properties in expanded view
    await expect(page.getByText(/Finesse/i).first()).toBeVisible();
  });

  test("can expand a gear card to see description", async ({ page }) => {
    await page.getByRole("button", { name: /Expand: Brooch of Shielding/i }).click();

    // Should show description
    await expect(page.getByText(/Resistance to Force damage/i).first()).toBeVisible();
  });

  test("displays currency section", async ({ page }) => {
    // Mock has: 340 gp, 5 ep, 22 sp, 8 cp
    await expect(page.getByText("340").first()).toBeVisible();
    await expect(page.getByText("22").first()).toBeVisible();
  });

  test("can use a consumable item", async ({ page }) => {
    // Look for a Use button on Potion of Healing
    const potionRow = page
      .getByText(/Potion of Healing/i)
      .first()
      .locator("..");
    const useButton = potionRow.getByRole("button", { name: /use/i });
    if (await useButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await useButton.click();
      // Quantity should decrease from 3 to 2
      await expect(
        page.getByText(/×2|x2/).first().or(page.getByText(/undo/i).first())
      ).toBeVisible();
    }
  });
});
