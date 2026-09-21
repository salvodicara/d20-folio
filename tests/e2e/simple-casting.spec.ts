import { test, expect, type Page } from "@playwright/test";
import { seedLang, seedUI, freezeMotion } from "./surfaces";

async function savedState(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem(
      "d20-folio.dev-doc.v1:combat-state:mock-uid%2Fmock-1"
    );
    if (!raw) throw new Error("Missing local combat document");
    const { value } = JSON.parse(raw) as {
      value: {
        playState: { state: { usedSlots: Record<string, number> } };
        hp: { current: number; temp: number };
      };
    };
    return { used: value.playState.state.usedSlots["1"] ?? 0, hp: value.hp };
  });
}

for (const locale of ["en", "it"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const size of ["desktop", "mobile"] as const) {
      test(`simple cast persists and undoes: ${locale} ${theme} ${size}`, async ({
        page,
      }, info) => {
        await page.setViewportSize(
          size === "desktop" ? { width: 1440, height: 1000 } : { width: 390, height: 844 }
        );
        await seedLang(page, locale);
        await seedUI(page, theme, "play");
        await page.goto("/characters/mock-1?tab=spells");
        const spell = locale === "en" ? "Healing Word" : "Parola Guaritrice";
        const expand = page.getByRole("button", {
          name: new RegExp(`^(Expand|Espandi): ${spell}`, "i"),
        });
        await expect(expand).toBeVisible();
        await freezeMotion(page);
        const before = await savedState(page);
        await expand.click();
        const cast = page
          .getByRole("region", { name: spell, exact: true })
          .getByRole("button", { name: /^(Cast|Lancia)/i })
          .first();
        await cast.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await page.screenshot({ path: info.outputPath("choose-slot.png") });
        await dialog
          .getByRole("button", {
            name:
              locale === "en" ? /Level 1 slot \(base\)/ : /Slot di livello 1 \(base\)/,
          })
          .click();
        await expect(dialog).toBeHidden();
        await expect
          .poll(async () => (await savedState(page)).used)
          .toBe(before.used + 1);
        expect((await savedState(page)).hp).toEqual(before.hp);
        await cast.scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath("cast-complete.png") });
        await page.keyboard.press("ControlOrMeta+z");
        await expect.poll(async () => (await savedState(page)).used).toBe(before.used);
        await page.keyboard.press("ControlOrMeta+Shift+z");
        await expect
          .poll(async () => (await savedState(page)).used)
          .toBe(before.used + 1);
        await page.reload();
        await expect(expand).toBeVisible();
        expect(await savedState(page)).toEqual({ used: before.used + 1, hp: before.hp });
      });

      test(`manual damage is immediate and undoable: ${locale} ${theme} ${size}`, async ({
        page,
      }, info) => {
        await page.setViewportSize(
          size === "desktop" ? { width: 1440, height: 1000 } : { width: 390, height: 844 }
        );
        await seedLang(page, locale);
        await seedUI(page, theme, "play");
        await page.goto("/characters/mock-1");
        const hpControl = page.getByRole("button", {
          name: locale === "en" ? /hit points: open/i : /punti ferita: apri/i,
        });
        await expect(hpControl).toBeVisible();
        await freezeMotion(page);
        const before = await savedState(page);
        await hpControl.click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("spinbutton").fill("10");
        await dialog
          .getByRole("button", {
            name: locale === "en" ? "Damage" : "Danno",
            exact: true,
          })
          .click();
        const after = {
          current: before.hp.current - Math.max(0, 10 - before.hp.temp),
          temp: Math.max(0, before.hp.temp - 10),
        };
        await expect.poll(async () => (await savedState(page)).hp).toEqual(after);
        await expect(dialog).toBeHidden();
        await expect(
          page.getByRole("button", { name: /^(Take 10 damage|Subisci 10)/i })
        ).toHaveCount(0);
        await page.screenshot({ path: info.outputPath("manual-damage-complete.png") });
        await page.keyboard.press("ControlOrMeta+z");
        await expect.poll(async () => (await savedState(page)).hp).toEqual(before.hp);
        await page.keyboard.press("ControlOrMeta+Shift+z");
        await expect.poll(async () => (await savedState(page)).hp).toEqual(after);
        await page.reload();
        await expect(hpControl).toBeVisible();
        expect((await savedState(page)).hp).toEqual(after);
      });
    }
  }
}
