/**
 * The damage tray (owner 2026-10-12), Italian, dark theme, desktop and phone:
 *  (a) Parola Guaritrice on myself — type the roll, Applica, the hero's HP persist;
 *  (b) Palla di Fuoco on three monsters, one "Salvato" — one total, three rows;
 *  (c) Blocca Persone on a goblin — no number, the Paralizzato chip.
 * Saves review shots for the owner under REVIEW_SHOTS (default below).
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

// Cold dev-server compiles under parallel workers can exceed the default 30 s.
test.describe.configure({ timeout: 60_000 });

const SHOTS =
  process.env.REVIEW_SHOTS ?? "/private/tmp/claude-501/review-shots/damage-tray";

async function savedHp(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem(
      "d20-folio.dev-doc.v1:combat-state:mock-uid%2Fmock-1"
    );
    if (!raw) throw new Error("Missing local combat document");
    return (JSON.parse(raw) as { value: { hp: { current: number } } }).value.hp.current;
  });
}

/** The sheet never scrolls sideways and every row stays inside the tray. */
async function expectFits(page: Page, tray: Locator) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await tray.boundingBox();
  if (!box) throw new Error("tray not laid out");
  for (const row of await tray.getByTestId("damage-tray-row").all()) {
    const r = await row.boundingBox();
    expect(r && r.x >= box.x && r.x + r.width <= box.x + box.width + 0.5).toBe(true);
  }
}

async function openEvoker(page: Page, size: "desktop" | "mobile") {
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
}

for (const size of ["desktop", "mobile"] as const) {
  test(`(a) Parola Guaritrice on me (it, dark, ${size})`, async ({ page }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/mock-1?tab=play");
    await page.getByRole("button", { name: /^tutti$/i }).click();
    const cast = page.getByRole("button", { name: "Lancia: Parola Guaritrice" });
    await expect(cast).toBeVisible();
    await freezeMotion(page);
    const before = await savedHp(page);

    await cast.click();
    await page.getByRole("button", { name: /Slot di livello 1 \(base\)/ }).click();

    const tray = page.getByTestId("damage-tray");
    await expect(tray).toBeVisible();
    await expect(tray.getByRole("heading", { name: "Parola Guaritrice" })).toBeVisible();
    const field = tray.getByRole("textbox", { name: "Totale tirato" });
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("placeholder", "—");
    expect(await savedHp(page)).toBe(before);
    await field.fill("4+2");
    await expect(tray.getByTestId("damage-tray-preview")).toContainText("+6");
    await expectFits(page, tray);
    await page.screenshot({ path: `${SHOTS}/a-parola-guaritrice-${size}.png` });

    await tray.getByRole("button", { name: "Applica" }).click();
    await expect(tray).toBeHidden();
    await expect.poll(() => savedHp(page)).toBe(before + 6);
  });

  test(`(b) Palla di Fuoco on three, one saved (it, dark, ${size})`, async ({ page }) => {
    await openEvoker(page, size);
    await page
      .getByRole("button", { name: /^Lancia: Palla di Fuoco/ })
      .first()
      .click();
    await page.getByRole("button", { name: /^Slot di livello 3/ }).click();
    const picker = page.getByRole("dialog", { name: /su chi\?/i });
    const enemies = picker.locator('.cl-target[data-side="enemy"]');
    await expect(enemies).toHaveCount(3);
    for (let i = 0; i < 3; i++) await enemies.nth(i).click();
    await picker.getByRole("button", { name: "Lancia su 3" }).click();

    const tray = page.getByTestId("damage-tray");
    await expect(tray).toBeVisible();
    await expect(tray).toContainText("Danni da Fuoco");
    await expect(tray).toContainText(/TS DES · CD \d+/);
    await expect(tray.getByTestId("damage-tray-row")).toHaveCount(3);
    await tray.getByRole("textbox", { name: "Totale tirato" }).fill("8+6+5+4+3+2");
    await tray.getByRole("button", { name: "Goblin Chief ha superato il TS" }).click();
    // The segment IS the multiplier: Salvato selected ½ on that row.
    const chief = tray.getByTestId("damage-tray-row").nth(1);
    await expect(chief.getByRole("button", { name: "×½" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(chief.getByRole("button", { name: "×1" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    await expect(tray.getByTestId("damage-tray-preview")).toHaveText([
      "−28",
      "−14",
      "−28",
    ]);
    await expectFits(page, tray);
    await page.screenshot({ path: `${SHOTS}/b-palla-di-fuoco-${size}.png` });

    await tray.getByRole("button", { name: "Applica" }).click();
    await expect(tray).toBeHidden();
  });

  test(`(c) Blocca Persone on a goblin (it, dark, ${size})`, async ({ page }) => {
    await openEvoker(page, size);
    await page
      .getByRole("button", { name: /^Lancia: Blocca Persone/ })
      .first()
      .click();
    await page.getByRole("button", { name: /^Slot di livello 2/ }).click();
    const picker = page.getByRole("dialog", { name: /su chi\?/i });
    await picker.locator('.cl-target[data-side="enemy"]').first().click();

    const tray = page.getByTestId("damage-tray");
    await expect(tray).toBeVisible();
    await expect(tray.getByRole("textbox")).toHaveCount(0);
    await expect(tray).toContainText(/Paralizzato · TS SAG · CD \d+/);
    await expect(tray.getByRole("button", { name: "Paralizzato" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expectFits(page, tray);
    await page.screenshot({ path: `${SHOTS}/c-blocca-persone-${size}.png` });

    await tray.getByRole("button", { name: "Applica" }).click();
    await expect(tray).toBeHidden();
  });
}
