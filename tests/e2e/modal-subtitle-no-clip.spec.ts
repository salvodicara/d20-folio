/**
 * A dialog's subtitle carries information (what you may pick, what it costs), so on a
 * phone it wraps instead of being cut (bug sweep 2026-10-13: Wish's spell picker read
 * "Qualsiasi incantesimo di livello 8 o inferiore, s…" at 390px).
 */
import { test, expect } from "@playwright/test";
import { MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

test("the Wish spell picker's subtitle is whole on a phone (it)", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.goto("/characters/scn-wish?tab=play");
  await expect(page.getByRole("button", { name: /^tutti$/i })).toBeVisible({
    timeout: 60_000,
  });
  await freezeMotion(page);
  await page.getByRole("button", { name: /^tutti$/i }).click();
  await page.getByRole("button", { name: /^Lancia: Desiderio/ }).click();
  const skip = page.getByRole("dialog").getByRole("button", { name: /^Salta/ });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.getByRole("button", { name: "Duplica un incantesimo" }).click();
  const head = page.getByRole("dialog").locator(".modal-head");
  await expect(head.getByText(/Qualsiasi incantesimo/)).toBeVisible();
  const cut = await head
    .locator("p")
    .evaluateAll((ps) =>
      ps.filter((p) => p.scrollWidth > p.clientWidth + 1).map((p) => p.textContent)
    );
  expect(cut).toEqual([]);
});
