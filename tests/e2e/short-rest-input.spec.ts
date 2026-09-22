import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedLang, seedUI, freezeMotion } from "./surfaces";

async function savedRestState(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem(
      "d20-folio.dev-doc.v1:combat-state:mock-uid%2Fmock-1"
    );
    if (!raw) throw new Error("Missing local combat document");
    const { value } = JSON.parse(raw) as {
      value: {
        hp: { current: number; temp: number };
        playState: { state: { usedHitDice?: number } };
      };
    };
    return { hp: value.hp, dice: value.playState.state.usedHitDice ?? 0 };
  });
}

for (const locale of ["en", "it"] as const) {
  for (const theme of ["dark", "light"] as const) {
    for (const size of ["desktop", "mobile"] as const) {
      test(`short rest input and persistence: ${locale} ${theme} ${size}`, async ({
        page,
      }, info) => {
        await page.setViewportSize(
          size === "desktop" ? { width: 1440, height: 1000 } : { width: 390, height: 844 }
        );
        await seedLang(page, locale);
        await seedUI(page, theme, "play");
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto("/characters/mock-1");
        const rest = page
          .getByRole("button", { name: locale === "en" ? "Rest" : "Riposo", exact: true })
          .first();
        await expect(rest).toBeVisible();
        await freezeMotion(page);
        const before = await savedRestState(page);
        await rest.click();
        const dialog = page.getByRole("dialog");
        await dialog
          .getByRole("button", {
            name: locale === "en" ? /short rest/i : /riposo breve/i,
          })
          .click();
        const add = dialog.getByRole("button", {
          name: locale === "en" ? "Use one more Hit Die" : "Usa un dado vita in più",
        });
        await add.click();
        const roll = dialog.getByRole("spinbutton", {
          name: locale === "en" ? "Dice total" : "Totale dei dadi",
        });
        const confirm = dialog.getByRole("button", {
          name: locale === "en" ? "Complete rest" : "Completa riposo",
        });
        await expect(roll).toHaveValue("");
        await expect(confirm).toBeDisabled();
        await roll.fill("9");
        await expect(roll).toHaveAttribute("aria-invalid", "true");
        await expect(confirm).toBeDisabled();
        await roll.fill("6");
        await add.click();
        await expect(roll).toHaveValue("");
        await expect(confirm).toBeDisabled();
        await roll.fill("10");
        const after = {
          hp: { ...before.hp, current: before.hp.current + 14 },
          dice: before.dice + 2,
        };
        await expect(
          dialog.getByRole("status", {
            name: locale === "en" ? "HP after rest" : "PF dopo il riposo",
          })
        ).toHaveText(`${before.hp.current} → ${after.hp.current} / 62`);
        expect(await savedRestState(page)).toEqual(before);
        await expect(confirm).toBeInViewport();
        const bounds = await add.boundingBox();
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
        const axe = await new AxeBuilder({ page })
          .include('[role="dialog"]')
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(axe.violations).toEqual([]);
        await page.screenshot({ path: info.outputPath("short-rest-preview.png") });
        // Enter works from the numeric field; no pointer-only confirmation.
        await roll.press("Enter");
        await expect(
          dialog.getByText(
            locale === "en" ? "Short Rest Complete" : "Riposo Breve Completato"
          )
        ).toBeVisible();
        await expect.poll(async () => savedRestState(page)).toEqual(after);
        await page.screenshot({ path: info.outputPath("short-rest-complete.png") });
        await page.reload();
        await expect(rest).toBeVisible();
        expect(await savedRestState(page)).toEqual(after);
        expect(errors).toEqual([]);
      });
    }
  }
}
