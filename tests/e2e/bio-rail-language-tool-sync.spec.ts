/**
 * E2E: Bio ↔ cockpit-rail languages/tools are a SINGLE SOURCE OF TRUTH.
 *
 * Owner (2026-06-06): "make sure the Bio and the right rail are always in sync —
 * single source of truth … same for tools and everything similar." Both surfaces
 * render the SAME `displayLanguages` / `displayToolProficiencies` helper (free-text
 * ∪ grant-derived, localized), so the read-only Bio view and the rail can never
 * show different lists. This spec proves it in a real browser: on the cockpit Bio
 * tab (play mode) every "Languages" / "Tools" row — Bio LoreDetail + rail row —
 * must resolve to exactly ONE distinct value. If a future change re-introduces a
 * raw (un-merged) display on one surface, the distinct-count goes to 2 and fails.
 */

import { test, expect, type Page } from "@playwright/test";

/** Distinct trimmed values rendered for a given label across the whole page. */
async function distinctValuesFor(page: Page, label: string): Promise<string[]> {
  const rows = page.locator(`text=/^${label}$/`);
  const n = await rows.count();
  const values = new Set<string>();
  for (let i = 0; i < n; i++) {
    // innerText is CSS-transformed (one surface uppercases the label, the other
    // doesn't), so strip the leading label case-INsensitively and collapse all
    // whitespace — we're comparing the VALUE lists, not the label styling.
    const parentText = await rows.nth(i).locator("..").innerText();
    const value = parentText
      .replace(new RegExp(`^\\s*${label}`, "i"), "")
      .replace(/\s+/g, " ")
      .trim();
    if (value) values.add(value);
  }
  return [...values];
}

test.describe("Bio ↔ rail single source of truth", () => {
  test("languages and tools resolve to ONE value across Bio + rail", async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto("/characters/mock-1?tab=bio");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
    // Let the rail + Bio lore card paint.
    await expect(page.getByText(/^Languages$/).first()).toBeVisible({ timeout: 10000 });

    const langs = await distinctValuesFor(page, "Languages");
    expect(
      langs.length,
      `Languages drifted across surfaces: ${JSON.stringify(langs)}`
    ).toBe(1);
    // The mock's stored "Thieves' Cant" must be present (proves a real value, not blank).
    expect(langs[0]).toContain("Thieves' Cant");

    const tools = await distinctValuesFor(page, "Tools");
    expect(tools.length, `Tools drifted across surfaces: ${JSON.stringify(tools)}`).toBe(
      1
    );
    // The mock's stored concrete tools appear on BOTH surfaces (proves a real value).
    expect(tools[0]).toContain("Lute");
    // A background's "Choose one kind of Musical Instrument" is a CHOICE, never a
    // fixed grant — so the generic "Musical Instrument" UMBRELLA must NEVER surface as
    // a proficiency (the owner's umbrella-leak bug). Only concrete tools show.
    expect(tools[0]).not.toContain("Musical Instrument");
    expect(tools[0]).not.toContain("Strumento Musicale");
  });
});
