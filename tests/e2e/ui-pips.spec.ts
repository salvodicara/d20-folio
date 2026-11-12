/**
 * A resource with up to six pips keeps them on one row (sweep 2026-11-11: Bardic
 * Inspiration's fifth pip used to wrap under the other four), at every laptop width
 * the Play screen's side column takes.
 */
import { test, expect } from "@playwright/test";
import { seedLang } from "./surfaces";

test.describe.configure({ timeout: 150_000 });

for (const width of [961, 1024, 1281, 1440]) {
  test(`five Bardic Inspiration pips sit on one row at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedLang(page, "it");
    await page.goto("/characters/mock-1");
    const row = page.locator(".f-res", { hasText: "Ispirazione Bardica" }).first();
    await expect(row).toBeVisible({ timeout: 90_000 });
    const tops = await row
      .locator(".f-pips i")
      .evaluateAll((pips) => pips.map((p) => Math.round(p.getBoundingClientRect().top)));
    expect(tops).toHaveLength(5);
    expect(new Set(tops).size).toBe(1);
  });
}
