/**
 * combat-band-phases — PERMANENT proof of the cockpit turn band's solo↔encounter precedence
 * (owner-ratified 2026-07-03) in REAL Chromium, where jsdom can't reach: the per-phase DIM +
 * the not-your-turn REACTION carve-out are computed-style facts (`opacity`), unreadable in a
 * unit render. It drives the dev-bypass status seed (`d20-dev-pip`, which publishes a
 * {@link makeDevGlobalCombat} status for the dev hero `team-catalion-bard`) and opens that
 * hero's Play tab, so the band reads the real phase.
 *
 * The matrix pinned here:
 *   • SOLO (no encounter)        → no `data-phase`, End Turn live, End Combat PRESENT.
 *   • GATHERING (pre-begin)      → `data-phase="gathering"`, End Turn inert, End Combat ABSENT.
 *   • NOT-MY-TURN (`waiting`)    → `data-phase="waiting"`, End Turn inert, End Combat ABSENT,
 *                                  and the ACTION coin dims while the REACTION coin stays LIVE
 *                                  (full opacity — the RAW off-turn carve-out).
 *   • CHARACTER SCOPING          → a DIFFERENT hero of the same user, opened while the seed
 *                                  fight is live, reads PURE SOLO (no phase, End Combat back).
 */

import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { seedUI, seedLang, freezeMotion } from "./surfaces";

/** Optional screenshot capture (unset in CI): `BAND_SHOT_DIR=/path pnpm exec playwright test
 *  tests/e2e/combat-band-phases.spec.ts --project=chromium` writes the three key states. */
const SHOT_DIR = process.env.BAND_SHOT_DIR;

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.locator(".turn").scrollIntoViewIfNeeded();
  await page
    .locator(".turn")
    .screenshot({ path: path.join(SHOT_DIR, `${name}.png`) })
    .catch(() => {});
}

/** Seed a cockpit-band phase (`d20-dev-pip`) before boot, then open a hero's Play tab. */
async function bootBand(page: Page, pip: string | null, charId: string): Promise<void> {
  await seedUI(page, "dark", "play");
  await seedLang(page, "en");
  if (pip) {
    await page.addInitScript((p) => window.localStorage.setItem("d20-dev-pip", p), pip);
  }
  await page.goto(`/characters/${charId}?tab=play`);
  await page.locator(".turn").waitFor({ timeout: 20_000 });
}

const band = (page: Page) => page.locator(".turn");
const endTurn = (page: Page) => page.locator(".turn .endturn");
const endCombat = (page: Page) => page.locator(".turn .end-combat");
const coin = (page: Page, kind: string) =>
  page.locator(`.turn .econ-tok[data-kind="${kind}"]`);

const opacityOf = (page: Page, kind: string) =>
  coin(page, kind).evaluate((el) => Number(getComputedStyle(el).opacity));

test.describe("cockpit turn band — solo↔encounter precedence", () => {
  test("SOLO: no phase, End Turn live, End Combat present", async ({ page }) => {
    await bootBand(page, null, "team-catalion-bard");
    await expect(band(page)).not.toHaveAttribute("data-phase", /.+/);
    await expect(endTurn(page)).toBeEnabled();
    await expect(endCombat(page)).toBeVisible();
    await freezeMotion(page);
    await shot(page, "solo-end-combat");
  });

  test("GATHERING: phase `gathering`, End Turn inert, End Combat absent", async ({
    page,
  }) => {
    await bootBand(page, "gathering", "team-catalion-bard");
    await expect(band(page)).toHaveAttribute("data-phase", "gathering");
    await expect(endTurn(page)).toBeDisabled();
    await expect(endCombat(page)).toHaveCount(0);
    await freezeMotion(page);
    await shot(page, "gathering");
  });

  test("NOT-MY-TURN: phase `waiting`, action dims but the reaction coin stays LIVE", async ({
    page,
  }) => {
    await bootBand(page, "actorturn", "team-catalion-bard");
    await expect(band(page)).toHaveAttribute("data-phase", "waiting");
    await expect(endTurn(page)).toBeDisabled();
    await expect(endCombat(page)).toHaveCount(0);
    // The Chromium-only carve-out: Action / Bonus / Movement quiet (dimmed), but the Reaction
    // coin keeps its available treatment (RAW reactions on other combatants' turns).
    await freezeMotion(page);
    expect(await opacityOf(page, "action")).toBeLessThan(0.9);
    expect(await opacityOf(page, "bonus")).toBeLessThan(0.9);
    expect(await opacityOf(page, "move")).toBeLessThan(0.9);
    expect(await opacityOf(page, "reaction")).toBe(1);
    await shot(page, "not-my-turn-reaction-live");
  });

  test("CHARACTER SCOPING: a different hero of the same user reads pure solo", async ({
    page,
  }) => {
    // The seed fight names `team-catalion-bard`; opening mock-1 (a DIFFERENT hero) must NOT
    // inherit its combat chrome — the band is solo, End Combat is back.
    await bootBand(page, "actorturn", "mock-1");
    await expect(band(page)).not.toHaveAttribute("data-phase", /.+/);
    await expect(endTurn(page)).toBeEnabled();
    await expect(endCombat(page)).toBeVisible();
  });
});
