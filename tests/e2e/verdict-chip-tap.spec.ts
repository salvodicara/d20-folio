/**
 * The damage chip on a collapsed action card is a passive signal, so a tap on it opens
 * the card like a tap anywhere else on the row (bug sweep 2026-10-13: on a phone the
 * chip's wrapper swallowed the tap and nothing happened, a dead zone in the middle of
 * every attack row). A chip that carries a breakdown stays its own trigger.
 */
import { test, expect } from "@playwright/test";
import { MOBILE, DESKTOP, freezeMotion, seedLang, seedUI } from "./surfaces";

for (const [size, viewport] of [
  ["mobile", MOBILE],
  ["desktop", DESKTOP],
] as const) {
  test(`tapping the damage chip opens the row (${size})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/mock-1?tab=play");
    await page.getByRole("button", { name: /^tutti$/i }).click({ timeout: 60_000 });
    await freezeMotion(page);
    const toggle = page.getByRole("button", { name: "Espandi: Arco Corto" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const chip = page.locator(".uc-verdict", { hasText: "1d6+3 Perf" }).first();
    await chip.scrollIntoViewIfNeeded();
    const box = await chip.boundingBox();
    if (!box) throw new Error("damage chip has no box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
}

test("a chip that carries a breakdown opens it (Second Wind's heal, desktop)", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.goto("/characters/scn-fighter-3?tab=play");
  await page.getByRole("button", { name: /^tutti$/i }).click({ timeout: 60_000 });
  await freezeMotion(page);
  const trigger = page.locator(".uc-verdict-cluster button.uc-verdict").first();
  await trigger.scrollIntoViewIfNeeded();
  const box = await trigger.boundingBox();
  if (!box) throw new Error("breakdown chip has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(".glossary-pop").first()).toBeVisible();
});
