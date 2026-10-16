/**
 * Beginner glossary on Play's combat labels, Italian, dark theme, desktop and phone:
 * the Reactions section header explains Reazione, and an Advantage row in the
 * resources rail (Danger Sense) explains Vantaggio. Reading a line changes nothing.
 * Before/after shots land under REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";
import itGlossary from "../../src/i18n/it/ui/glossary.json" with { type: "json" };

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function readTip(page: Page, rubric: string, line: string, shot: string) {
  const tip = page
    .getByRole("button", { name: `Scopri cosa significa ${rubric}` })
    .first();
  await tip.scrollIntoViewIfNeeded();
  await page.screenshot({ path: shotPath(`${shot}-before.png`) });
  await tip.click();
  const pop = page.locator(".glossary-pop");
  await expect(pop).toBeVisible();
  await expect(pop).toContainText(rubric);
  await expect(pop).toContainText(line);
  await page.screenshot({ path: shotPath(`${shot}-after.png`) });
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Reazione and Vantaggio labels explain themselves (it, dark, ${size})`, async ({
    page,
  }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/scn-barbarian-extra-attack?tab=play");
    const allChip = page.getByRole("button", { name: /^tutti$/i });
    await expect(allChip).toBeVisible({ timeout: 45_000 });
    await allChip.click();
    await freezeMotion(page);

    await readTip(
      page,
      "Reazione",
      itGlossary.glossary.term.reaction,
      `combat-glossary-reazione-${size}`
    );

    const advantage = page.getByRole("button", {
      name: "Scopri cosa significa Vantaggio",
    });
    // Advantages are a fact you look up: on a phone they sit in the Stats drawer.
    if (!(await advantage.first().isVisible())) {
      await page
        .getByRole("button", { name: /^statistiche$/i })
        .first()
        .click();
    }
    await readTip(
      page,
      "Vantaggio",
      itGlossary.glossary.term.advantage,
      `combat-glossary-vantaggio-${size}`
    );
  });
}
