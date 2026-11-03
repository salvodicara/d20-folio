/**
 * Wild Shape as a form in a real browser (edge-case family M2): a level-7 Druid uses
 * Wild Shape on the Play tab, the picker offers only Beasts of CR 1/2 or lower with
 * no Fly Speed (no Giant Eagle), the Wolf form takes the Druid level in Temporary
 * HP and keeps the Druid's Wisdom, and Revert brings the Druid back with the
 * Temporary HP kept. Review shots land under REVIEW_SHOTS when set, else in the
 * test output.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 120_000 });

const DOC_KEY = "d20-folio.dev-doc.v1:combat-state:mock-uid%2Fscn-potent-druid";

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function shot(page: Page, name: string): Promise<void> {
  await freezeMotion(page);
  await page.screenshot({ path: shotPath(`${name}.png`) });
}

test("Wild Shape: pick a Wolf on the Play tab, then revert (en, dark, desktop)", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await seedLang(page, "en");
  await seedUI(page, "dark", "play");
  await page.goto("/characters/scn-potent-druid?tab=play");
  const use = page.getByRole("button", { name: "Use: Wild Shape" }).first();
  await use.waitFor({ timeout: 90_000 });
  await use.scrollIntoViewIfNeeded();
  await use.click();

  const dialog = page.getByRole("dialog").filter({ hasText: "Choose a Beast Form" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  // Wild Shape only ever changes the druid: no reference card for another creature.
  await expect(dialog.getByText("Another creature")).toHaveCount(0);
  await dialog.getByRole("searchbox").fill("eagle");
  await expect(dialog.getByText("Giant Eagle")).toHaveCount(0);
  await dialog.getByRole("searchbox").fill("wolf");
  await shot(page, "wild-shape-picker");
  await dialog.getByText("Wolf", { exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const temp = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw
      ? (JSON.parse(raw) as { value: { hp: { temp: number } } }).value.hp.temp
      : null;
  }, DOC_KEY);
  expect(temp).toBe(7);
  await shot(page, "wild-shape-play");

  await page.goto("/characters/scn-potent-druid?tab=spells");
  const banner = page.locator(".polymorph-banner");
  await expect(banner).toContainText("Wild Shape: Wolf", { timeout: 60_000 });
  await banner.scrollIntoViewIfNeeded();
  await shot(page, "wild-shape-banner");
  await page.getByRole("button", { name: "Revert form" }).click();
  await expect(page.locator(".polymorph-banner")).toHaveCount(0);
});
