/**
 * combat-pip-dest-contrast — REAL-Chromium proof that the topbar combat pip's
 * combat-pip carved controls carry readable text in BOTH themes. This covers the
 * "Open {hero}" destination (`.cp-dest-chip`), its compact single-encounter mobile lead,
 * and the mobile multi-encounter count (`.cp-count`). The first bug (owner-reported):
 * in LIGHT theme the destination label rode
 * `--text-secondary` (a dark espresso ink) on a HARDCODED warm-black gradient →
 * dark-on-dark, ~1.2:1, unreadable ("Apri Lyra ›" invisible).
 *
 * jsdom can't see this — the failure is a computed-style fact (the token cascade
 * per theme + the gradient stops), so it must be measured in a real browser.
 * This drives the dev-bypass pip seed (`d20-dev-pip=actorturn` → a quiet split
 * switch), toggles each theme, and asserts the label text clears WCAG-AA 4.5:1
 * against each chip's DARKEST gradient stop (the worst case). The count variant was
 * added after its light-theme espresso ink disappeared on the dark socket.
 */

import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { seedUI, seedLang, freezeMotion, type Theme } from "./surfaces";

const SHOT_DIR = process.env.PIP_SHOT_DIR;

function lum([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
  return (hi + 0.05) / (lo + 0.05);
}
function parseRgbs(s: string): [number, number, number][] {
  return [...s.matchAll(/rgba?\(([^)]+)\)/g)].map((m) => {
    const [r, g, b] = (m[1] ?? "").split(",").map((n) => parseFloat(n));
    return [r ?? 0, g ?? 0, b ?? 0] as [number, number, number];
  });
}

/** Boot the pip's quiet split switch on the encounter surface (→ hero flip) in `theme`. */
async function bootDestChip(page: Page, theme: Theme) {
  await seedUI(page, theme, "play");
  await seedLang(page, "it"); // owner saw it in IT ("Apri Lyra")
  await page.addInitScript(() => window.localStorage.setItem("d20-dev-pip", "actorturn"));
  await page.goto("/campaigns/mock-1");
  const chip = page.locator(".combat-pip-split .cp-dest-chip");
  await chip.waitFor({ timeout: 20_000 });
  await freezeMotion(page);
  return chip;
}

async function measure(page: Page): Promise<{ color: string; bg: string }> {
  const raw = await page.evaluate(() => {
    const chip = document.querySelector(".cp-dest-chip") as HTMLElement;
    const label = chip.querySelector(".cp-dest-label-desktop") as HTMLElement;
    return JSON.stringify({
      color: getComputedStyle(label).color,
      bg: getComputedStyle(chip).backgroundImage,
    });
  });
  return JSON.parse(raw) as { color: string; bg: string };
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page
    .locator(".topbar")
    .screenshot({ path: path.join(SHOT_DIR, `${name}.png`) })
    .catch(() => {});
}

test.describe("combat pip dest-chip — label text clears AA in both themes", () => {
  for (const theme of ["dark", "light"] as const) {
    test(`${theme}: cp-dest-chip label ≥ 4.5:1 on the chip`, async ({ page }) => {
      await bootDestChip(page, theme);
      const { color, bg } = await measure(page);
      const fg = parseRgbs(color)[0];
      const stops = parseRgbs(bg);
      expect(fg, "label color parsed").toBeTruthy();
      expect(stops.length, "chip has ≥1 gradient stop").toBeGreaterThan(0);
      // Worst case: the DARKEST gradient stop under the label.
      const darkest = stops.reduce((a, b) => (lum(a) < lum(b) ? a : b));
      const ratio = contrast(fg as [number, number, number], darkest);
      console.log(
        `[dest-chip ${theme}] text=${color} darkest-stop=${darkest} → ${ratio.toFixed(2)}:1`
      );
      await shot(page, `dest-chip-${theme}`);
      expect(ratio, `dest-chip label vs darkest stop (${theme})`).toBeGreaterThanOrEqual(
        4.5
      );
    });
  }
});

test.describe("combat pip dest-chip — compact mobile glyph and round clear AA", () => {
  for (const theme of ["dark", "light"] as const) {
    test(`${theme}: compact cp-dest-lead ink ≥ 4.5:1 on the chip`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const chip = await bootDestChip(page, theme);
      const lead = chip.locator(".cp-dest-lead");
      await expect(lead).toBeVisible();

      const raw = await chip.evaluate((el) => {
        const glyph = el.querySelector(".cp-dest-lead .cp-glyph") as HTMLElement;
        const round = el.querySelector(".cp-dest-lead .cp-round") as HTMLElement;
        return JSON.stringify({
          glyphColor: getComputedStyle(glyph).color,
          roundColor: getComputedStyle(round).color,
          bg: getComputedStyle(el).backgroundImage,
        });
      });
      const { glyphColor, roundColor, bg } = JSON.parse(raw) as {
        glyphColor: string;
        roundColor: string;
        bg: string;
      };
      const glyphFg = parseRgbs(glyphColor)[0];
      const roundFg = parseRgbs(roundColor)[0];
      const stops = parseRgbs(bg);
      expect(glyphFg, "compact glyph color parsed").toBeTruthy();
      expect(roundFg, "compact round color parsed").toBeTruthy();
      expect(stops.length, "chip has ≥1 gradient stop").toBeGreaterThan(0);
      const darkest = stops.reduce((a, b) => (lum(a) < lum(b) ? a : b));
      await shot(page, `dest-chip-compact-${theme}`);

      expect(
        contrast(glyphFg as [number, number, number], darkest)
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(roundFg as [number, number, number], darkest)
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

test.describe("combat pip multi-count — glyph and number clear AA in both themes", () => {
  for (const theme of ["dark", "light"] as const) {
    test(`${theme}: mobile cp-count ink ≥ 4.5:1 on the chip`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await seedUI(page, theme, "play");
      await seedLang(page, "en");
      await page.addInitScript(() =>
        window.localStorage.setItem("d20-dev-pip-scenario", "multi")
      );
      await page.goto("/characters/mock-1");
      const chip = page.locator(".cp-count");
      await chip.waitFor({ timeout: 20_000 });
      await freezeMotion(page);

      const raw = await chip.evaluate((el) => {
        const glyph = el.querySelector(".cp-count-glyph") as HTMLElement;
        return JSON.stringify({
          color: getComputedStyle(el).color,
          glyphColor: getComputedStyle(glyph).color,
          bg: getComputedStyle(el).backgroundImage,
        });
      });
      const { color, glyphColor, bg } = JSON.parse(raw) as {
        color: string;
        glyphColor: string;
        bg: string;
      };
      const fg = parseRgbs(color)[0];
      const glyphFg = parseRgbs(glyphColor)[0];
      const stops = parseRgbs(bg);
      expect(fg, "count color parsed").toBeTruthy();
      expect(glyphFg, "glyph color parsed").toBeTruthy();
      expect(stops.length, "count has ≥1 gradient stop").toBeGreaterThan(0);
      const darkest = stops.reduce((a, b) => (lum(a) < lum(b) ? a : b));
      await shot(page, `multi-count-${theme}`);

      expect(contrast(fg as [number, number, number], darkest)).toBeGreaterThanOrEqual(
        4.5
      );
      expect(
        contrast(glyphFg as [number, number, number], darkest)
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});
