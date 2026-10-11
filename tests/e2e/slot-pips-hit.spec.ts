/**
 * The rail's spell-slot diamonds: a tap at a diamond's centre acts on THAT diamond.
 * The rotated gems used to carry an enlarged hit area that reached over the next
 * gem's centre, so tapping the last lit gem restored a slot instead of spending one.
 * Cases: every slot diamond the dev character renders (real browser hit-testing).
 */
import { test, expect } from "@playwright/test";

test("every slot diamond's centre hits that diamond", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/characters/mock-1");
  const pips = page.locator(".slot-cell .sc-pips button");
  await expect(pips.first()).toBeVisible();
  const misses = await pips.evaluateAll((buttons) =>
    buttons.flatMap((button, index) => {
      const gem = button.querySelector(".sc-pip") ?? button;
      const r = gem.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit && button.contains(hit) ? [] : [`pip ${index}`];
    })
  );
  expect(await pips.count()).toBeGreaterThan(3);
  expect(misses).toEqual([]);
});
