/**
 * On a phone every dialog's close × answers a finger anywhere in
 * a 44px box (PRODUCT: touch targets ≥ 44px on mobile), without changing how they
 * look: a tap a few pixels above or below the visible button still lands on it.
 * Cases: the Rest dialog's close button, read from the page.
 */
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("the dialog close × answers within a 44px box on a phone", async ({ page }) => {
  await page.goto("/characters/mock-1");
  await page.getByRole("button", { name: /rest/i }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /take short rest/i }).click();
  const misses = await dialog.evaluate((root) => {
    const targets = [...root.querySelectorAll<HTMLElement>(".modal-close")].filter(
      (el) => el.getBoundingClientRect().height > 0
    );
    const out: string[] = [];
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const reach = Math.max(0, (44 - r.height) / 2) - 1;
      for (const y of [r.top - reach, r.bottom + reach]) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !el.contains(hit))
          out.push(`${el.textContent.trim() || el.className} @${Math.round(y)}`);
      }
    }
    return { count: targets.length, out };
  });
  expect(misses.count).toBeGreaterThan(0);
  expect(misses.out).toEqual([]);
});
