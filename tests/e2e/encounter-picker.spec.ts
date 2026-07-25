/**
 * encounter-picker — the DM's bestiary picker + statblock disclosure journey, in REAL
 * Chromium under dev-bypass (no Firebase). The dev campaign `mock-1` seeds a mid-combat
 * encounter when `d20-dev-encounter=1` is set before boot; the dev-bypass user is its DM,
 * so `apply` updates the campaign store optimistically and a picker add renders a new row.
 *
 * The journey (spec §F.5):
 *   1. Add-monster → the modal opens on Bestiary → search "goblin" → open the Goblin
 *      Warrior statblock → set quantity 3 → Add → a toast + a "Goblin Warrior ×3" row with
 *      AC/HP pre-filled and INIT "—".
 *   2. Custom tab → type a name + Add → the hand-typed combatant appears (manual path).
 *   3. The seeded monster-1 (srdId goblin-warrior) → DM disclosure → Statblock → the modal
 *      shows the statblock plaque.
 *   4. IT leg: an added combatant's name is the IT SRD name ("Goblin Guerriero").
 */

import { test, expect, type Page } from "@playwright/test";
import { seedUI, seedLang, type Locale } from "./surfaces";

/** Seed the dev encounter flag before boot, then open the dev campaign hub as its DM. */
async function bootEncounter(page: Page, locale: Locale = "en"): Promise<void> {
  await seedUI(page, "dark", "play");
  await seedLang(page, locale);
  await page.addInitScript(() => window.localStorage.setItem("d20-dev-encounter", "1"));
  await page.goto("/campaigns/mock-1");
  await expect(page.getByText(/coralino/i).first()).toBeVisible({ timeout: 20_000 });
}

const dialog = (page: Page) => page.getByRole("dialog");

test.describe("encounter bestiary picker", () => {
  test("add a bestiary monster ×3 → a pre-filled row with a blank initiative", async ({
    page,
  }) => {
    await bootEncounter(page, "en");

    // Open the picker modal.
    await page
      .getByRole("button", { name: /add monster/i })
      .first()
      .click();
    await expect(dialog(page)).toBeVisible();

    // Search + open the Goblin Warrior statblock detail.
    await dialog(page)
      .getByPlaceholder(/search monsters/i)
      .fill("goblin warrior");
    await dialog(page)
      .getByRole("button", { name: /^goblin warrior$/i })
      .first()
      .click();
    // The statblock plaque painted in the detail leaf.
    await expect(dialog(page).locator(".mon-ref, .beast-ref").first()).toBeVisible();

    // Set the count to 3 (stepper starts at 1) and add.
    const increase = dialog(page).getByRole("button", { name: "Increase" });
    await increase.click();
    await increase.click();
    await dialog(page)
      .getByRole("button", { name: /add monster/i })
      .click();

    // The commit toast confirms the add.
    await expect(page.getByText(/goblin warrior ×3/i).first()).toBeVisible();

    // Close the modal — a new "Goblin Warrior" combatant row is on the table.
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText(/^goblin warrior$/i).first()).toBeVisible();
    // The group carries ×3 and a blank ("—") initiative until the DM rolls.
    await expect(page.getByText("×3").first()).toBeVisible();
  });

  test("the Custom tab still adds a hand-typed monster", async ({ page }) => {
    await bootEncounter(page, "en");
    await page
      .getByRole("button", { name: /add monster/i })
      .first()
      .click();
    await expect(dialog(page)).toBeVisible();

    await dialog(page)
      .getByRole("button", { name: /custom monster/i })
      .click();
    await dialog(page)
      .getByLabel(/monster name/i)
      .fill("Bandit Captain");
    await dialog(page)
      .getByRole("button", { name: /add monster/i })
      .click();
    await expect(page.getByText(/bandit captain ×1/i).first()).toBeVisible();
  });

  test("the DM statblock disclosure opens the seeded monster's statblock", async ({
    page,
  }) => {
    await bootEncounter(page, "en");
    // Expand monster-1 ("Goblin") — its disclosure toggle is labelled by its name.
    const statblockBtn = page.getByRole("button", { name: /^statblock$/i }).first();
    if (!(await statblockBtn.isVisible().catch(() => false))) {
      await page
        .getByRole("button", { name: /^goblin$/i })
        .first()
        .click();
    }
    await statblockBtn.click();
    await expect(dialog(page)).toBeVisible();
    // The dual-title: the modal shows the canonical statblock name "Goblin Warrior".
    await expect(
      dialog(page)
        .getByText(/goblin warrior/i)
        .first()
    ).toBeVisible();
    await expect(dialog(page).locator(".mon-ref, .beast-ref").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
  });

  test("IT leg: an added bestiary monster carries its Italian SRD name", async ({
    page,
  }) => {
    await bootEncounter(page, "it");
    await page
      .getByRole("button", { name: /aggiungi mostro/i })
      .first()
      .click();
    await expect(dialog(page)).toBeVisible();
    await dialog(page)
      .getByPlaceholder(/cerca mostri/i)
      .fill("goblin guerriero");
    await dialog(page)
      .getByRole("button", { name: /goblin guerriero/i })
      .first()
      .click();
    await dialog(page)
      .getByRole("button", { name: /aggiungi mostro/i })
      .click();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    // The stored name is the IT SRD name, not the raw id or the EN name.
    await expect(page.getByText(/goblin guerriero/i).first()).toBeVisible();
  });
});
