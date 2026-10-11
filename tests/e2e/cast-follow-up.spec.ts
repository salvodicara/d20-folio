/**
 * The optional follow-up line under a used card (owner 2026-10-11, "B"): cast Healing
 * Word from the Play tab, the line "Lyra Voss + PF" appears under the card, filling it
 * heals the hero and the change persists. Saves before/after shots for the owner.
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
    await expect(line).toContainText("Lyra Voss + PF");
    expect(await savedHp(page)).toBe(before);
    await line.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`line-${size}.png`) });

    await line.getByRole("spinbutton").fill("6");
    await line.getByRole("button", { name: "Applica" }).click();
    await expect(line).toBeHidden();
    await expect.poll(() => savedHp(page)).toBe(before + 6);
    await cast.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`after-${size}.png`) });
  });
}
