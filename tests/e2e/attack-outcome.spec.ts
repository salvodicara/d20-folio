/**
 * Hit · Miss · Critical on an attack (owner 2026-10-13), Italian, dark theme, desktop
 * and phone: a Champion with Extra Attack swings the Longsword at two goblins — the
 * first swing Colpito for 9, the second Critico ("dadi raddoppiati") for 14 — and the
 * sheet's log says "Goblin Chief: critico, 14 danni". Review shots land under
 * REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

// Cold dev-server compiles under parallel workers can exceed the default 30 s.
test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function openChampion(page: Page, size: "desktop" | "mobile") {
  await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  // The dev encounter: Goblin, Goblin Chief and Ogre to pick from.
  await page.addInitScript(() =>
    window.localStorage.setItem("d20-dev-combat-chronicle", "1")
  );
  await page.goto("/characters/scn-champion-6?tab=play");
  const allChip = page.getByRole("button", { name: /^tutti$/i });
  await expect(allChip).toBeVisible({ timeout: 45_000 });
  await allChip.click();
  await freezeMotion(page);
}

/** Swing the Longsword at one creature and return the tray it opens. */
async function swingAt(page: Page, target: string): Promise<Locator> {
  await page.getByRole("button", { name: "Attacca: Spada Lunga" }).first().click();
  const picker = page.getByRole("dialog", { name: /su chi\?/i });
  await picker
    .locator('.cl-target[data-side="enemy"]')
    .filter({ hasText: new RegExp(`^.?${target}$`) })
    .click();
  const tray = page.getByTestId("damage-tray");
  await expect(tray).toBeVisible();
  return tray;
}

/** The sheet never scrolls sideways and the row's controls stay inside the tray. */
async function expectFits(page: Page, tray: Locator) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await tray.boundingBox();
  if (!box) throw new Error("tray not laid out");
  for (const group of await tray.getByRole("group").all()) {
    const r = await group.boundingBox();
    expect(r && r.x >= box.x && r.x + r.width <= box.x + box.width + 0.5).toBe(true);
  }
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Longsword on two goblins, one Critico (it, dark, ${size})`, async ({ page }) => {
    await openChampion(page, size);

    // Swing 1 → Goblin: Colpito is the default; type 9, Applica.
    let tray = await swingAt(page, "Goblin");
    const outcome = (name: string) =>
      tray
        .getByRole("group", { name: /^Esito dell'attacco su / })
        .getByRole("button", { name });
    await expect(outcome("Colpito")).toHaveAttribute("aria-pressed", "true");
    await tray.getByRole("textbox", { name: "Totale tirato" }).fill("9");
    await expect(tray.getByTestId("damage-tray-preview")).toHaveText("−9");
    await tray.getByRole("button", { name: "Applica" }).click();
    await expect(tray).toBeHidden();

    // Swing 2 → Goblin Chief: Critico shows the hint; the player types the doubled dice.
    tray = await swingAt(page, "Goblin Chief");
    await outcome("Critico").click();
    await expect(outcome("Critico")).toHaveAttribute("aria-pressed", "true");
    await expect(tray.getByTestId("damage-tray-crit-hint")).toHaveText(
      "dadi raddoppiati"
    );
    await tray.getByRole("textbox", { name: "Totale tirato" }).fill("8+3+3");
    await expect(tray.getByTestId("damage-tray-preview")).toHaveText("−14");
    await expectFits(page, tray);
    await page.screenshot({ path: shotPath(`critico-tray-${size}.png`) });

    // Mancato sets the row to ×0 and needs no number; back to Critico to apply.
    await outcome("Mancato").click();
    await expect(tray.getByRole("button", { name: "×0" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await outcome("Critico").click();
    await tray.getByRole("button", { name: "Applica" }).click();
    await expect(tray).toBeHidden();

    // The sheet's log says it.
    const crit = page.getByText("Goblin Chief: critico, 14 danni").first();
    await expect(crit).toBeAttached();
    await expect(page.getByText("Goblin: colpito, 9 danni").first()).toBeAttached();
    await expect(
      page.getByText("Usato Spada Lunga (attacco 2 di 2): critico").first()
    ).toBeAttached();
    if (await crit.isVisible()) {
      await crit.scrollIntoViewIfNeeded();
      await page.screenshot({ path: shotPath(`log-${size}.png`) });
    }
  });
}
