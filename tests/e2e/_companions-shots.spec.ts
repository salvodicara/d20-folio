/**
 * THROWAWAY companion-surface shot harness (gated on COMPANION_SHOT_DIR; delete
 * before the milestone commit). Drives the chain-master dev scenario (find-familiar
 * prepared + Pact of the Chain) through the summon flow so an agent can hand the
 * owner real-Chromium screenshots of the Companions rail, the form picker, the
 * familiar stat-block modal, and the dismissed state.
 *
 *   COMPANION_SHOT_DIR=/tmp/folio-companions pnpm exec playwright test \
 *     tests/e2e/_companions-shots.spec.ts --project=chromium
 */
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { freezeMotion, seedLang, seedUI } from "./surfaces";

const DIR = process.env.COMPANION_SHOT_DIR;
test.skip(!DIR, "COMPANION_SHOT_DIR unset");
test.beforeAll(() => {
  if (DIR) fs.mkdirSync(DIR, { recursive: true });
});

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(DIR ?? "", `${name}.png`), fullPage: true });

/** Crop to the Companions rail section (the change's region — rule 15). `rubric` is
 *  the localized section heading; its nearest <section> ancestor is the RailSection. */
async function shotCompanions(page: Page, name: string, rubric: string): Promise<void> {
  // Hide the sticky app top-bar so it can't overlap the cropped section's box.
  await page.addStyleTag({ content: ".topbar{display:none !important}" });
  const section = page
    .getByRole("heading", { name: rubric })
    .locator("xpath=ancestor::section[1]");
  await section.scrollIntoViewIfNeeded();
  await freezeMotion(page);
  await section.screenshot({ path: path.join(DIR ?? "", `${name}.png`) });
}

interface Labels {
  spell: string;
  summon: string;
  bat: string;
}
const EN: Labels = { spell: "Find Familiar", summon: "Summon familiar", bat: "Bat" };
const IT: Labels = {
  spell: "Trova Famiglio",
  summon: "Evoca famiglio",
  bat: "Pipistrello",
};

async function openPicker(page: Page, L: Labels): Promise<void> {
  // Expand the Find Familiar card via its chevron (its accessible name carries the
  // spell name); the name span sits under the chevron's pointer layer.
  await page
    .getByRole("button", { name: new RegExp(L.spell) })
    .first()
    .click();
  await page.getByRole("button", { name: L.summon }).first().click();
  await page.getByRole("dialog").waitFor({ timeout: 10000 });
  await page
    .getByRole("dialog")
    .getByPlaceholder(/search|cerca/i)
    .first()
    .fill("bat");
  await page.getByRole("dialog").getByText(L.bat, { exact: true }).first().click();
}

async function summonBat(page: Page, L: Labels): Promise<void> {
  await openPicker(page, L);
  await page.getByRole("dialog").getByRole("button", { name: L.summon }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 10000 });
}

test("companions — desktop dark EN full flow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedUI(page, "dark", "play");
  await seedLang(page, "en");
  await page.goto("/characters/scn-chain-master?tab=spells");
  await page.getByText("Ysolde", { exact: false }).first().waitFor({ timeout: 20000 });

  // Open the form picker (Bat selected, default Fey) and screenshot it.
  await openPicker(page, EN);
  await freezeMotion(page);
  await shot(page, "familiar-picker-dark-en-desktop");

  // Commit the summon; the rail gains the familiar row (lazy leaf — wait for it).
  await page.getByRole("dialog").getByRole("button", { name: "Summon familiar" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 10000 });
  await page.getByText("Familiar", { exact: true }).first().waitFor({ timeout: 10000 });
  await shotCompanions(page, "companions-rail-dark-en-desktop", "Companions");

  // Open the familiar stat-block modal (the type swap: Bat-as-Fey).
  await page.getByText("Familiar", { exact: true }).first().click();
  await page.getByRole("dialog").waitFor({ timeout: 10000 });
  await freezeMotion(page);
  await shot(page, "familiar-statblock-dark-en-desktop");
});

test("companions — light IT rail", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedUI(page, "light", "play");
  await seedLang(page, "it");
  await page.goto("/characters/scn-chain-master?tab=spells");
  await page.getByText("Ysolde", { exact: false }).first().waitFor({ timeout: 20000 });
  await summonBat(page, IT);
  await page.getByText("Famiglio", { exact: true }).first().waitFor({ timeout: 10000 });
  await shotCompanions(page, "companions-rail-light-it-desktop", "Compagni");
});

test("companions — mobile resources disclosure", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedUI(page, "dark", "play");
  await seedLang(page, "en");
  await page.goto("/characters/scn-chain-master?tab=spells");
  await page.getByText("Ysolde", { exact: false }).first().waitFor({ timeout: 20000 });
  await summonBat(page, EN);
  // On mobile the rail lives in the collapsed "Resources" bottom disclosure — open
  // it FIRST, then the lazy familiar row becomes visible.
  const resources = page.getByRole("button", { name: /resources/i }).first();
  if (await resources.isVisible().catch(() => false)) await resources.click();
  await page
    .getByText("Familiar", { exact: true })
    .first()
    .waitFor({ timeout: 10000 })
    .catch(() => {});
  await freezeMotion(page);
  await shot(page, "companions-mobile-resources");
});

// Keep at least one hard assertion so a broken flow FAILS loudly (not a silent blank).
test("companions — summon actually adds the rail row", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedUI(page, "dark", "play");
  await seedLang(page, "en");
  await page.goto("/characters/scn-chain-master?tab=spells");
  await page.getByText("Ysolde", { exact: false }).first().waitFor({ timeout: 20000 });
  await summonBat(page, EN);
  await expect(page.getByText("Familiar", { exact: true }).first()).toBeVisible();
});
