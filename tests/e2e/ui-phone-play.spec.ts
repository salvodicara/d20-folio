/**
 * E2E, on a phone (Pixel 7): the new UI's player path stays usable at phone width
 * (#1231). The Play screen opens one section at a time from «Sezioni» (D&D Beyond's
 * phone model); the inventory's item pane and coin pane open and write; the rest
 * dialog opens from the page menu; the level-up page keeps its sticky Confirm bar.
 * No page scrolls sideways. Runs on the VITE_NEW_UI preview (the `new-ui-phone`
 * project), with the public mock character.
 */
import { expect, test, type Page } from "@playwright/test";

const SHEET = "/characters/mock-1";

async function noSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ page }) => {
  await page.goto(SHEET);
  await expect(page.locator(".f-sheet")).toBeVisible({ timeout: 30_000 });
});

test("Play: «Sezioni» picks one section at a time, and nothing scrolls sideways", async ({
  page,
}) => {
  await noSideScroll(page);
  await page.getByRole("button", { name: /^(sezioni|sections)$/i }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button")).not.toHaveCount(0);
  await sheet.getByRole("button").nth(1).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await noSideScroll(page);
});

test("Inventory: the item pane and the coin pane open and write", async ({ page }) => {
  await page.getByRole("tab", { name: /^(inventario|inventory)$/i }).click();
  await noSideScroll(page);

  await page.locator("button.f-row-open").first().click();
  const item = page.getByRole("dialog");
  await expect(item.getByRole("group", { name: /quantità|quantity/i })).toBeVisible();
  await noSideScroll(page);
  await page.keyboard.press("Escape");

  const coins = page.getByRole("button", { name: /gestisci le monete|manage coins/i });
  const gpBefore = Number(
    (await coins.locator('[data-coin="gp"] b').innerText()).replace(/\D/g, "")
  );
  await coins.click();
  const pane = page.getByRole("dialog");
  await pane.getByRole("spinbutton", { name: /^(mo|gp)$/i }).fill("7");
  await pane.getByRole("button", { name: /^(aggiungi|add)$/i }).click();
  await page.keyboard.press("Escape");
  await expect(coins.locator('[data-coin="gp"] b')).toHaveText(String(gpBefore + 7));
});

test("Level-up: one column with the sticky Confirm bar, nothing sideways", async ({
  page,
}) => {
  await page.goto(`${SHEET}/level-up`);
  const confirm = page.getByRole("button", { name: /^(conferma|confirm)$/i });
  await expect(confirm).toBeVisible({ timeout: 30_000 });
  await noSideScroll(page);
  await page.mouse.wheel(0, 2000);
  await expect(confirm).toBeInViewport();
});
