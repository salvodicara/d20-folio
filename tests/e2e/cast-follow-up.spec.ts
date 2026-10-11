/**
 * The optional follow-up line under a used card (owner 2026-10-11, "B"): cast Healing
 * Word from the Play tab, the line "Lyra Voss [—] PF Applica" appears inside the card,
 * filling it heals the hero and the change persists. A Fireball on two goblins in the
 * dev encounter offers one damage row per target. Saves review shots for the owner.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

async function savedHp(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem(
      "d20-folio.dev-doc.v1:combat-state:mock-uid%2Fmock-1"
    );
    if (!raw) throw new Error("Missing local combat document");
    return (JSON.parse(raw) as { value: { hp: { current: number } } }).value.hp.current;
  });
}

for (const size of ["desktop", "mobile"] as const) {
  test(`a heal's follow-up line heals on demand (it, ${size})`, async ({
    page,
  }, info) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/mock-1?tab=play");
    await page.getByRole("button", { name: /^tutti$/i }).click();
    const cast = page.getByRole("button", { name: "Lancia: Parola Guaritrice" });
    await expect(cast).toBeVisible();
    await freezeMotion(page);
    const before = await savedHp(page);

    await cast.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`before-${size}.png`) });

    await cast.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /Slot di livello 1 \(base\)/ }).click();
    await expect(dialog).toBeHidden();

    const line = page.getByTestId("cast-follow-up");
    const field = line.getByRole("spinbutton", { name: "PF recuperati da Lyra Voss" });
    await expect(field).toHaveAttribute("placeholder", "—");
    expect(await savedHp(page)).toBe(before);
    // One row: the input never wraps under the name.
    const [nameBox, fieldBox] = await Promise.all([
      line.getByText("Lyra Voss").boundingBox(),
      field.boundingBox(),
    ]);
    expect(Math.abs((nameBox?.y ?? 0) - (fieldBox?.y ?? 0))).toBeLessThan(16);
    await line.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`line-${size}.png`) });

    await field.fill("6");
    await line.getByRole("button", { name: "Applica" }).click();
    await expect(line).toBeHidden();
    await expect.poll(() => savedHp(page)).toBe(before + 6);
    await cast.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`after-${size}.png`) });
  });

  test(`two targets get two rows (it, ${size})`, async ({ page }, info) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.addInitScript(() =>
      window.localStorage.setItem("d20-dev-combat-chronicle", "1")
    );
    await page.goto("/characters/scn-evoker-wizard?tab=play");
    await expect(page.locator('.turn[data-phase="my-turn"]')).toBeVisible({
      timeout: 20_000,
    });
    const allChip = page.getByRole("button", { name: /^tutti$/i });
    if (await allChip.isVisible()) await allChip.click();
    await freezeMotion(page);
    await page
      .getByRole("button", { name: /^Lancia: Palla di Fuoco/ })
      .first()
      .click();
    await page.getByRole("button", { name: /^Slot di livello 3/ }).click();
    const picker = page.getByRole("dialog", { name: /su chi\?/i });
    const enemies = picker.locator('.cl-target[data-side="enemy"]');
    await enemies.nth(0).click();
    await enemies.nth(1).click();
    await picker.getByRole("button", { name: "Lancia su 2" }).click();

    const line = page.getByTestId("cast-follow-up");
    await expect(line.getByRole("spinbutton")).toHaveCount(2);
    await line.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`two-targets-${size}.png`) });
  });
}
