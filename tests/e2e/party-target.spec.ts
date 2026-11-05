/**
 * Out of a fight in a campaign, «Su chi?» offers the party («Il gruppo»): Mage Armor
 * cast on Bren lands on the campaign clock, 8 hours from now, and «Annulla» ends it.
 * The dev sheet's party (`d20-dev-party`) is the evoker and Bren; what the cast writes
 * is on `window.__d20DevCampaignEffects`.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function stored(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __d20DevCampaignEffects?: Array<{
            target: { combatantId: string };
            source: { id: string };
            duration: { kind: string; untilMinute?: number };
            ended?: string;
          }>;
        }
      ).__d20DevCampaignEffects ?? []
  );
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Mage Armor on Bren out of a fight lands on the campaign clock (${size})`, async ({
    page,
  }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.addInitScript(() => {
      window.localStorage.setItem("d20-dev-effects-v26", "1");
      window.localStorage.setItem("d20-dev-party", "1");
    });
    await page.goto("/characters/scn-evoker-wizard?tab=play");
    const allChip = page.getByRole("button", { name: /^tutti$/i });
    await allChip.waitFor({ state: "visible", timeout: 45_000 }).catch(() => undefined);
    if (await allChip.isVisible()) await allChip.click();
    await freezeMotion(page);
    await page
      .getByRole("button", { name: /^Lancia: Armatura Magica/ })
      .first()
      .click();
    const slot = page.getByRole("button", { name: /^Slot di livello 1/ });
    if (await slot.isVisible()) await slot.click();
    const picker = page.getByRole("dialog", { name: /su chi\?/i });
    await expect(picker).toContainText("Il gruppo");
    await expect(picker.locator(".cl-target")).toHaveCount(2);
    await page.screenshot({ path: shotPath(`party-target-${size}.png`) });
    await picker.locator(".cl-target").filter({ hasText: /Bren/ }).first().click();
    await expect
      .poll(async () =>
        (await stored(page)).map((e) => [
          e.target.combatantId,
          e.source.id,
          e.duration.kind,
          e.duration.untilMinute,
          e.ended ?? null,
        ])
      )
      .toEqual([["pc-mock-ally", "mage-armor", "game-clock", 480, null]]);
    await page
      .getByRole("button", { name: /^Annulla$/ })
      .first()
      .click();
    await expect.poll(async () => (await stored(page))[0]?.ended).toBe("revoked");
  });
}
