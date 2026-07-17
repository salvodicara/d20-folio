/**
 * THROWAWAY scenario-shot harness (not a regression test; gated on
 * SCENARIO_SHOT_DIR; delete before a milestone commit). Drives the dev-scenario
 * injection (`lib/dev-scenarios.ts`) so an agent can SELF-VALIDATE a mechanic on
 * the exact build that exercises it and hand the owner screenshots to LOOK at.
 *
 *   SCENARIO_SHOT_DIR=/tmp/folio-scn pnpm exec playwright test tests/e2e/_scenario-shots.spec.ts --project=chromium
 */
import { test, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { freezeMotion, seedLang, seedUI } from "./surfaces";

const DIR = process.env.SCENARIO_SHOT_DIR;
test.skip(!DIR, "SCENARIO_SHOT_DIR unset");
test.beforeAll(() => {
  if (DIR) fs.mkdirSync(DIR, { recursive: true });
});

const VP = { width: 1440, height: 900 } as const;
const THEMES = ["dark", "light"] as const;

const SCENARIOS = [
  { id: "scn-life-cleric", name: "Mirovel" },
  { id: "scn-goo-warlock", name: "Vexis" },
  { id: "scn-undead-warlock", name: "Morthos" },
  // R4 — the multiclass scenario (Wizard 5 / Cleric 3, total 8).
  { id: "scn-wizard-cleric-multiclass", name: "Talenor" },
  // Fey-Touched: the labelled Spell-Slots group + the two independent free-cast rows.
  { id: "scn-fey-touched-bard", name: "Fenra" },
];

async function shot(page: Page, name: string): Promise<void> {
  await freezeMotion(page);
  await page.screenshot({ path: path.join(DIR ?? "", `${name}.png`), fullPage: true });
}

for (const theme of THEMES) {
  for (const s of SCENARIOS) {
    test(`${s.id} ${theme}`, async ({ page }) => {
      await page.setViewportSize(VP);
      await seedUI(page, theme, "play");
      await seedLang(page, "en");
      await page.goto(`/characters/${s.id}`);
      await page.getByText(s.name).first().waitFor({ timeout: 20000 });
      // Play tab (default) — the action cards carry the spell damage/heal verdicts.
      await shot(page, `${s.id}-play-${theme}`);
      // Spells tab — the full prepared-spell list.
      await page.goto(`/characters/${s.id}?tab=spells`);
      await page.getByText(s.name).first().waitFor({ timeout: 20000 });
      await shot(page, `${s.id}-spells-${theme}`);
    });
  }
}
