/**
 * Beginner glossary on toggles, Italian, dark theme, desktop and phones (390 and
 * 375 wide): the info mark after the movement meter's ×2 explains Terreno Difficile
 * and the one under the AC tile's cover toggle explains Copertura (the first tap's
 * level). Neither mark wraps its row or reaches past its card. Before/after shots
 * land under REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";
import itGlossary from "../../src/i18n/it/ui/glossary.json" with { type: "json" };
import itRules from "../../src/i18n/it/srd/rules.json" with { type: "json" };

test.describe.configure({ timeout: 90_000 });

const SIZES = {
  desktop: DESKTOP,
  mobile: MOBILE,
  phone375: { width: 375, height: 812 },
} as const;

const HALF_COVER = itRules["cover.half"].name;

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

/** The mark sits inside `card` and on the same row as `toggle`. */
async function expectInside(mark: Locator, toggle: Locator, card: Locator) {
  const [m, t, c] = await Promise.all([
    mark.boundingBox(),
    toggle.boundingBox(),
    card.boundingBox(),
  ]);
  if (!m || !t || !c) throw new Error("missing box");
  expect(m.x + m.width).toBeLessThanOrEqual(c.x + c.width);
  expect(m.y).toBeLessThan(t.y + t.height + 24);
}

async function readMark(
  page: Page,
  mark: Locator,
  rubric: string,
  line: string,
  shot: string
) {
  await mark.scrollIntoViewIfNeeded();
  await page.screenshot({ path: shotPath(`${shot}-before.png`) });
  await mark.click();
  const pop = page.locator(".glossary-pop");
  await expect(pop).toBeVisible();
  await expect(pop).toContainText(rubric);
  await expect(pop).toContainText(line);
  await page.screenshot({ path: shotPath(`${shot}-after.png`) });
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
}

for (const [size, viewport] of Object.entries(SIZES)) {
  test(`Terreno Difficile and Copertura marks explain themselves (it, dark, ${size})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/scn-weapon-mastery-numbers?tab=play");
    await expect(page.getByRole("button", { name: /^tutti$/i })).toBeVisible({
      timeout: 45_000,
    });
    await freezeMotion(page);
    // No horizontal overflow: content wider than the visible area is positive. On
    // Linux CI the classic vertical scrollbar makes a page that fits report a
    // negative difference, so only a positive one is an overflow.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    ).toBeLessThanOrEqual(0);

    // Movement meter: the mark rides right after ×2, and the economy row keeps its
    // tokens on one line wherever it did before (390+ wide).
    const turn = page.locator(".turn").first();
    const terrain = page.getByRole("button", {
      name: "Terreno difficile: il movimento costa il doppio",
    });
    const terrainMark = page.getByRole("button", {
      name: "Scopri cosa significa Terreno Difficile",
    });
    await terrainMark.scrollIntoViewIfNeeded();
    await expectInside(terrainMark, terrain, turn);
    if (viewport.width >= 390) {
      // Action and Movement share a row: their tokens overlap vertically.
      const action = await turn.locator(".econ-tok").first().boundingBox();
      const move = await terrain.boundingBox();
      if (!action || !move) throw new Error("missing box");
      expect(move.y).toBeLessThan(action.y + action.height);
    }
    await turn.screenshot({ path: shotPath(`toggle-glossary-movement-${size}.png`) });
    await readMark(
      page,
      terrainMark,
      "Terreno Difficile",
      itGlossary.glossary.term.difficultTerrain,
      `toggle-glossary-terreno-${size}`
    );
    await expect(terrain).toHaveAttribute("aria-pressed", "false");

    // AC tile: one mark for the cover cycle, under its corner toggle.
    const vitals = page.getByRole("group", { name: "Statistiche vitali" });
    const coverToggle = vitals.getByRole("button", { name: /^Copertura: nessuna/ });
    const coverMark = vitals.getByRole("button", {
      name: `Scopri cosa significa ${HALF_COVER}`,
    });
    const acTile = vitals.locator(".vital", {
      has: page.getByRole("button", { name: /^Copertura: nessuna/ }),
    });
    await coverMark.scrollIntoViewIfNeeded();
    await expectInside(coverMark, coverToggle, acTile);
    await vitals.screenshot({ path: shotPath(`toggle-glossary-ac-tile-${size}.png`) });
    await readMark(
      page,
      coverMark,
      HALF_COVER,
      itGlossary.glossary.term.halfCover,
      `toggle-glossary-copertura-${size}`
    );
    // Reading the line changed nothing: cover is still off.
    await expect(coverToggle).toBeVisible();
  });
}
