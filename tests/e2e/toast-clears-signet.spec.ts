/**
 * On a phone the undo toasts never cover the Signet coin (the floating tools button
 * above the bottom nav). Bug report 2026-10-16 (rules session): a toast sat on the
 * coin, and two toasts stacked over it, so the tools were hard to reach while a toast
 * was up.
 */
import { test, expect, type Page } from "@playwright/test";
import { MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

async function overlaps(page: Page) {
  return page.evaluate(() => {
    const coin = document.querySelector(".signet")?.getBoundingClientRect();
    if (!coin) return ["no signet"];
    return [...document.querySelectorAll(".toast")]
      .map((t) => t.getBoundingClientRect())
      .filter(
        (r) =>
          r.left < coin.right &&
          r.right > coin.left &&
          r.top < coin.bottom &&
          r.bottom > coin.top
      )
      .map(
        (r) =>
          `toast ${Math.round(r.top)}–${Math.round(r.bottom)} over coin ${Math.round(coin.top)}–${Math.round(coin.bottom)}`
      );
  });
}

test("a toast on the attack list leaves the Signet clear (it)", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.goto("/characters/mock-1?tab=play");
  await page.getByRole("button", { name: /^tutti$/i }).click({ timeout: 60_000 });
  await freezeMotion(page);
  await page.getByRole("button", { name: "Usa: Scatto" }).click();
  await expect(page.locator(".toast")).toHaveCount(1);
  expect(await overlaps(page)).toEqual([]);
});

test("a cast plus its material-cost offer (two toasts) leave the Signet clear (it)", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.goto("/characters/scn-material-cost?tab=spells");
  const expand = page.getByRole("button", { name: /^Espandi: Rinascita/i }).first();
  await expect(expand).toBeVisible({ timeout: 45_000 });
  await freezeMotion(page);
  await expand.click();
  await page
    .getByRole("region", { name: "Rinascita", exact: true })
    .getByRole("button", { name: /^Lancia/i })
    .first()
    .click();
  await expect(page.locator(".toast", { hasText: "Rinascita consuma" })).toBeVisible();
  await expect(page.locator(".toast")).toHaveCount(2);
  expect(await overlaps(page)).toEqual([]);
});
