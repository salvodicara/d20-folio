/**
 * A state a spell leaves only on a failed save or a hit reaches its target through
 * the real tray (#793 wrote nothing until its rows were kept), in a fight: Slow on
 * the Goblin, left un-saved, and Ray of Frost marked Hit, each write their state on
 * that Goblin when the tray is applied. The dev sheet's fight keeps every effect
 * operation on `window.__d20DevEffectOps`.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function openEvoker(page: Page, size: "desktop" | "mobile" = "desktop") {
  await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.addInitScript(() => {
    window.localStorage.setItem("d20-dev-combat-chronicle", "1");
    window.localStorage.setItem("d20-dev-effects-v26", "1");
    window.localStorage.setItem("d20-dev-combat-ally", "1");
  });
  await page.goto("/characters/scn-evoker-wizard?tab=play");
  await expect(page.locator('.turn[data-phase="my-turn"]')).toBeVisible({
    timeout: 45_000,
  });
  const allChip = page.getByRole("button", { name: /^tutti$/i });
  if (await allChip.isVisible()) await allChip.click();
  await freezeMotion(page);
}

async function writtenOn(page: Page, targetId: string, spellId: string) {
  return page.evaluate(
    ([target, spell]) => {
      const ops =
        (
          window as unknown as {
            __d20DevEffectOps?: Array<{
              kind: string;
              effect?: { target: { combatantId: string }; source: { id: string } };
            }>;
          }
        ).__d20DevEffectOps ?? [];
      return ops.some(
        (op) =>
          op.kind === "apply" &&
          op.effect?.target.combatantId === target &&
          op.effect?.source.id === spell
      );
    },
    [targetId, spellId]
  );
}

test("Slow lands on the Goblin that failed its save", async ({ page }) => {
  await openEvoker(page);
  await page
    .getByRole("button", { name: /^Lancia: Lentezza/ })
    .first()
    .click();
  const slot = page.getByRole("button", { name: /^Slot di livello 3/ });
  if (await slot.isVisible()) await slot.click();
  const picker = page.getByRole("dialog", { name: /su chi\?/i });
  await picker.locator('.cl-target[data-side="enemy"]').first().click();
  const confirm = picker.getByRole("button", { name: /^Conferma|^Lancia/ });
  if (await confirm.isVisible()) await confirm.click();
  const tray = page.getByTestId("damage-tray");
  await expect(tray).toBeVisible();
  await tray.getByRole("button", { name: "Applica" }).click();
  await expect(tray).toBeHidden();
  await expect.poll(() => writtenOn(page, "monster-1", "slow")).toBe(true);
});

test("Ray of Frost's hit lands its state on the Goblin", async ({ page }) => {
  await openEvoker(page);
  await page
    .getByRole("button", { name: /^Lancia: Raggio di Gelo/ })
    .first()
    .click();
  const picker = page.getByRole("dialog", { name: /su chi\?/i });
  await picker.locator('.cl-target[data-side="enemy"]').first().click();
  const tray = page.getByTestId("damage-tray");
  await expect(tray).toBeVisible();
  await tray
    .getByRole("button", { name: /^Colpito$/ })
    .first()
    .click();
  // Its damage too: the rolled total.
  await tray.getByRole("textbox", { name: "Totale tirato" }).fill("4");
  await tray.getByRole("button", { name: "Applica" }).click();
  await expect(tray).toBeHidden();
  await expect.poll(() => writtenOn(page, "monster-1", "ray-of-frost")).toBe(true);
});

for (const size of ["desktop", "mobile"] as const) {
  test(`Enlarge/Reduce on a willing ally: no save, the state lands (${size})`, async ({
    page,
  }) => {
    await openEvoker(page, size);
    await page
      .getByRole("button", { name: /^Lancia: Ingrandire\/Ridurre/ })
      .first()
      .click();
    await page.getByRole("button", { name: /^Slot di livello 2/ }).click();
    const picker = page.getByRole("dialog", { name: /su chi\?/i });
    await picker.locator(".cl-target").filter({ hasText: /Bren/ }).first().click();
    const tray = page.getByTestId("damage-tray");
    await expect(tray).toBeVisible();
    const willing = tray.getByRole("button", { name: "Bren è consenziente: nessun TS" });
    await willing.click();
    await expect(willing).toHaveAttribute("aria-pressed", "true");
    // The row names the state it takes, not «Nessun effetto».
    await expect(tray).toContainText("Sotto Ingrandire/Ridurre");
    await expect(
      tray.getByRole("button", { name: /Bren ha superato il TS/ })
    ).toBeDisabled();
    await page.screenshot({ path: shotPath(`willing-ally-${size}.png`) });
    await tray.getByRole("button", { name: "Applica" }).click();
    await expect(tray).toBeHidden();
    await expect.poll(() => writtenOn(page, "pc-mock-ally", "enlarge-reduce")).toBe(true);
  });
}
