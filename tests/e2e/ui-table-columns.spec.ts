/**
 * The Play screen's actions table keeps one set of columns (sweep 2026-11-11, #1045):
 * every row's range, hit/DC and effect sit at the same x, under their headers, at every
 * width the centre column can take: the right rail present (a campaign fight) or absent,
 * from a 1024 px laptop to 1440.
 */
import { test, expect, type Page } from "@playwright/test";
import { seedLang } from "./surfaces";

test.describe.configure({ timeout: 150_000 });

/** For each of the first rows: the centre x of its three value cells. */
async function columns(page: Page) {
  return page.evaluate(() => {
    const centre = (el: Element | null | undefined) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return Math.round(r.left + r.width / 2);
    };
    const head = document.querySelector(".f-act-table .f-act-head");
    const heads = head ? [...head.children].slice(2, 5).map(centre) : [];
    const rows = [...document.querySelectorAll(".f-act-table .f-act:not(.f-act-head)")]
      .slice(0, 6)
      .map((row) => [...row.querySelectorAll(":scope > .f-act-c")].map(centre));
    return { heads, rows };
  });
}

for (const [what, route] of [
  ["with the right rail (a campaign fight)", "/characters/mock-1"],
  ["without a campaign", "/characters/scn-thief-reflexes"],
] as const) {
  for (const width of [1024, 1281, 1440]) {
    test(`the actions table keeps its columns ${what} at ${String(width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedLang(page, "it");
      await page.goto(route);
      await expect(page.locator(".f-act-table .f-act-c").first()).toBeVisible({
        timeout: 90_000,
      });
      const { heads, rows } = await columns(page);
      expect(rows.length).toBeGreaterThan(2);
      for (const row of rows) {
        // every value cell sits on its column (a cell may be empty but is still placed)
        row.forEach((x, i) => {
          expect(Math.abs((x ?? 0) - (rows[0]?.[i] ?? 0))).toBeLessThanOrEqual(1);
        });
      }
      // and each header sits over its column
      heads.forEach((x, i) => {
        expect(Math.abs((x ?? 0) - (rows[0]?.[i] ?? 0))).toBeLessThanOrEqual(1);
      });
    });
  }
}
