/**
 * Beginner glossary on a spell card, Italian, dark theme, desktop and phone: on
 * Onda Tonante (Thunderwave) the Tempo di Lancio label and the Cubo in its range
 * explain themselves. Reading a line changes nothing.
 * Before/after shots land under REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";
import itGlossary from "../../src/i18n/it/ui/glossary.json" with { type: "json" };

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function readTip(
  page: Page,
  card: Locator,
  rubric: string,
  line: string,
  shot: string
) {
  const tip = card.getByRole("button", { name: `Scopri cosa significa ${rubric}` });
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
  test(`Tempo di Lancio and Cubo explain themselves on a spell card (it, dark, ${size})`, async ({
    page,
  }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/mock-1?tab=spells");
    const card = page.locator(".uc").filter({ hasText: "Onda Tonante" }).first();
    await expect(card).toBeVisible({ timeout: 45_000 });
    await freezeMotion(page);
    await card.locator(".uc-chevron").click();

    const terms = itGlossary.glossary.term;
    const detail = page.getByRole("region", { name: "Onda Tonante" });
    await readTip(
      page,
      detail,
      "Tempo di Lancio",
      terms.castingTime,
      `spell-glossary-tempo-${size}`
    );
    await readTip(page, detail, "Cubo", terms.cube, `spell-glossary-cubo-${size}`);
  });
}
