/**
 * E2E: Abilities (the cockpit Left HUD).
 *
 * Abilities are no longer a route — they live in the persistent Left HUD on the
 * character cockpit. On desktop the rail is always visible; on mobile it sits
 * behind the "Stats" disclosure (progressive disclosure), so the beforeEach opens
 * it when present.
 * Lyra Voss: STR 8, DEX 16, CON 14, INT 14, WIS 10, CHA 20
 * Saves: DEX, CHA | Skills: expertise in 3, proficient in 5
 */

import { test, expect } from "@playwright/test";

test.describe("Abilities Page", () => {
  // Abilities/skills/saves (Left HUD) + proficiencies/languages (Right HUD) are
  // always visible on the desktop cockpit; on mobile they collapse behind the
  // "Stats" / "Resources" disclosures (progressive disclosure), where bare text
  // matches resolve hidden copies. This data-correctness spec runs on desktop;
  // the mobile recompose is covered by the a11y + visual surfaces (character +
  // character-* mobile variants).
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "Cockpit HUD content is behind mobile disclosures; covered by a11y/visual."
    );
    await page.goto("/characters/mock-1");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
  });

  // Scope to the StatCard label (`.sc-label`) rather than a page-wide text match:
  // the ability abbreviations also appear in other viewport-hidden chrome (the
  // sticky stat ribbon / HP rail), so a bare `getByText(...).first()` could resolve
  // a hidden node — the class scope pins the assertion to the visible medallion.
  test("displays all six ability scores", async ({ page }) => {
    await expect(page.locator(".sc-label", { hasText: "STR" }).first()).toBeVisible();
    await expect(page.locator(".sc-label", { hasText: "DEX" }).first()).toBeVisible();
    await expect(page.locator(".sc-label", { hasText: "CON" }).first()).toBeVisible();
    await expect(page.locator(".sc-label", { hasText: "INT" }).first()).toBeVisible();
    await expect(page.locator(".sc-label", { hasText: "WIS" }).first()).toBeVisible();
    await expect(page.locator(".sc-label", { hasText: "CHA" }).first()).toBeVisible();
  });

  // Ability cards (StatCard "Carved Cartouche") render the modifier in `.sc-mod`
  // and the score in `.sc-gem`. Target those so the matches can't resolve the
  // sticky stat ribbon / HP rail copies that carry the same digits and are
  // viewport-hidden (a bare `getByText(...).first()` would pick a hidden one).
  test("shows ability modifiers", async ({ page }) => {
    // CHA 20 = +5 modifier
    await expect(page.locator(".sc-mod", { hasText: "+5" }).first()).toBeVisible();
    // DEX 16 = +3
    await expect(page.locator(".sc-mod", { hasText: "+3" }).first()).toBeVisible();
    // STR 8 = -1 (the card renders a typographic minus U+2212, not ASCII "-").
    await expect(page.locator(".sc-mod", { hasText: /[-−]1/ }).first()).toBeVisible();
  });

  test("shows ability score values", async ({ page }) => {
    await expect(page.locator(".sc-gem", { hasText: "20" }).first()).toBeVisible(); // CHA
    await expect(page.locator(".sc-gem", { hasText: "16" }).first()).toBeVisible(); // DEX
    await expect(page.locator(".sc-gem", { hasText: "8" }).first()).toBeVisible(); // STR
  });

  // These skill-name spans carry no distinctive class, and the mobile "Stats"
  // disclosure keeps a hidden copy of the skill list in the DOM — filter to the
  // visible node so the assertion can't resolve that hidden copy.
  test("displays skills list", async ({ page }) => {
    // Should show skills
    await expect(
      page
        .getByText(/Acrobatics/i)
        .filter({ visible: true })
        .first()
    ).toBeVisible();
    await expect(
      page
        .getByText(/Deception/i)
        .filter({ visible: true })
        .first()
    ).toBeVisible();
    await expect(
      page
        .getByText(/Persuasion/i)
        .filter({ visible: true })
        .first()
    ).toBeVisible();
    await expect(
      page
        .getByText(/Stealth/i)
        .filter({ visible: true })
        .first()
    ).toBeVisible();
  });

  test("shows skill modifiers with proficiency/expertise", async ({ page }) => {
    // Deception: expertise = CHA(+5) + PB(+4)*2 = +13. Same hidden-copy hazard as
    // above (the mobile "Stats" disclosure) — filter to the visible node.
    await expect(page.getByText("+13").filter({ visible: true }).first()).toBeVisible();
  });

  test("displays saving throws", async ({ page }) => {
    // Bard saves: DEX and CHA — section heading "Saving Throws"
    await expect(page.getByText("Saving Throws").first()).toBeVisible();
  });

  test("displays proficiencies section", async ({ page }) => {
    // Target the visible "Proficiencies" RailSection heading specifically. A loose
    // /proficienc/i also matched the (correctly hidden) "Proficiency Bonus"
    // breakdown tip #89 added to the Left HUD — a hidden, first-in-DOM match — so
    // assert on the section heading, whose exact name can't collide with it.
    await expect(
      page.getByRole("heading", { name: "Proficiencies" }).first()
    ).toBeVisible();
  });

  test("shows languages", async ({ page }) => {
    // Lyra knows: Common, Elvish, Draconic, Thieves' Cant
    await expect(page.getByText(/Common/i).first()).toBeVisible();
    await expect(page.getByText(/Elvish/i).first()).toBeVisible();
  });
});
