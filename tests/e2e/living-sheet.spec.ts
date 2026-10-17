/**
 * E2E: the character header's vitals row (design 2026-10: D&D Beyond's header order,
 * Foundry's AC shield and stat plates). The pixel-geometry pin the unit test
 * (`tests/unit/combat-header.test.tsx`) defers to, since jsdom has no layout engine.
 *
 *  1. **Phones.** HP takes the full width of its own row, and the four reference
 *     plates (AC · Init · Speed · PB) share one even row beneath it.
 *  2. **Locale-stable geometry.** The vitals boxes land at identical rects in EN
 *     and IT: the row carries no locale-varying text. Rest lives with the
 *     identity, as a labelled button.
 *  3. **Desktop.** HP and the four plates read as one row.
 */

import { test, expect, type Page } from "@playwright/test";
import { MOBILE, seedUI, seedLang, freezeMotion } from "./surfaces";
import { waitForStableLayout } from "./ready";
import type { Locale } from "@/lib/locale";

type Rect = { x: number; y: number; w: number; h: number };

/** Rounded bounding rects of the vitals-row members, in DOM order. */
async function vitalsGeometry(page: Page): Promise<{
  hp: Rect | null;
  bar: Rect | null;
  tiles: Rect[];
}> {
  return page.evaluate(() => {
    const r = (el: Element | null): Rect | null => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        x: Math.round(b.x),
        y: Math.round(b.y),
        w: Math.round(b.width),
        h: Math.round(b.height),
      };
    };
    const vitals = document.querySelector(".hdr-vitals");
    return {
      hp: r(vitals?.querySelector(".vital-hp") ?? null),
      bar: r(vitals?.querySelector(".vital-hp .hp-bar") ?? null),
      tiles: [
        // The four REFERENCE tiles (AC · Init · Speed · PB) — the HP tile also
        // wears `.vital[data-density="tile"]`, so exclude it explicitly.
        ...(vitals?.querySelectorAll<HTMLElement>(
          '.vital[data-density="tile"]:not(.vital-hp)'
        ) ?? []),
      ].map((el) => r(el) as Rect),
    };
  });
}

async function loadCockpit(page: Page, locale: Locale): Promise<void> {
  await seedUI(page, "dark", "play");
  await seedLang(page, locale);
  await page.goto("/characters/mock-1", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  await page.locator(".hdr-vitals .vital-hp").waitFor({ timeout: 20000 });
  await freezeMotion(page);
  await waitForStableLayout(page);
}

test("phones: HP takes its own row and the four plates share the row beneath", async ({
  page,
}) => {
  test.skip(
    test.info().project.name === "mobile",
    "explicit 390×844 viewport — runs once under chromium"
  );
  await page.setViewportSize(MOBILE);
  await loadCockpit(page, "en");
  const { hp, bar, tiles } = await vitalsGeometry(page);

  expect(hp, "the HP tile must render").not.toBeNull();
  expect(bar, "the HP bar must render").not.toBeNull();
  expect(tiles.length, "the four reference plates must render").toBe(4);
  if (!hp) return;

  for (const tile of tiles) {
    expect(tile.y, "each plate sits on the row beneath HP").toBeGreaterThanOrEqual(
      hp.y + hp.h - 1
    );
  }
  const tops = tiles.map((t) => t.y);
  expect(
    Math.max(...tops) - Math.min(...tops),
    "the plates share one row"
  ).toBeLessThanOrEqual(8);
  // The rest button sits with the identity, outside the vitals row.
  await expect(page.locator(".hero-btns .rest-btn")).toBeVisible();
});

test("phones: the vitals row is geometry-identical EN vs IT (locale-stable)", async ({
  page,
}) => {
  test.skip(
    test.info().project.name === "mobile",
    "explicit 390×844 viewport — runs once under chromium"
  );
  await page.setViewportSize(MOBILE);

  await loadCockpit(page, "en");
  const en = await vitalsGeometry(page);
  await loadCockpit(page, "it");
  const it = await vitalsGeometry(page);

  // The row carries no locale text, so every vitals box lands at the same rect.
  expect(it.hp).toEqual(en.hp);
  expect(it.tiles).toEqual(en.tiles);
});

test("desktop: HP and the four plates read as one row", async ({ page }) => {
  test.skip(
    test.info().project.name === "mobile",
    "explicit desktop viewport — runs once under chromium"
  );
  await page.setViewportSize({ width: 1512, height: 960 });
  await loadCockpit(page, "en");
  const { hp, tiles } = await vitalsGeometry(page);
  expect(hp).not.toBeNull();
  expect(tiles.length).toBe(4);
  if (!hp) return;
  for (const tile of tiles) expect(tile.x).toBeGreaterThanOrEqual(hp.x + hp.w);
  const mids = [hp.y + hp.h / 2, ...tiles.map((t) => t.y + t.h / 2)];
  const spread = Math.max(...mids) - Math.min(...mids);
  expect(
    spread,
    `the vitals share one row (centre spread ${spread}px)`
  ).toBeLessThanOrEqual(16);
});
