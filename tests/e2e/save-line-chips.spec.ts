/**
 * A save spell with nothing for the app to apply asks each creature's save on the row
 * just used (Italian, dark, phone): Command on the Goblin, then Calm Emotions on the Ogre
 * creatures. No tray opens; ignoring the chips costs nothing. Review shots land under
 * REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { MOBILE, freezeMotion, seedLang, seedUI, startSoloFight } from "./surfaces";

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function open(page: Page) {
  await page.setViewportSize(MOBILE);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.addInitScript(() =>
    window.localStorage.setItem("d20-dev-combat-chronicle", "1")
  );
  await page.goto("/characters/scn-command-cleric?tab=play");
  const allChip = page.getByRole("button", { name: /^tutti$/i });
  await expect(allChip).toBeVisible({ timeout: 45_000 });
  await allChip.click();
  await freezeMotion(page);
  await startSoloFight(page);
}

async function castOn(page: Page, spell: string, targets: string[]) {
  await page
    .getByRole("button", { name: new RegExp(`^Lancia: ${spell}`) })
    .first()
    .click();
  // The slot picker first: the spell's own level.
  await page
    .getByRole("button", { name: /\(base\)/ })
    .first()
    .click();
  const picker = page.getByRole("dialog", { name: /su chi\?/i });
  await expect(picker).toBeVisible();
  for (const target of targets)
    await picker
      .locator('.cl-target[data-side="enemy"]')
      .filter({ hasText: new RegExp(`^.?${target}$`) })
      .click();
  const confirm = picker.getByRole("button", { name: /^conferma/i });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(picker).toBeHidden();
}

test("Command, then Calm Emotions: the saves on the row, no tray (it, dark, phone)", async ({
  page,
}) => {
  await open(page);

  await castOn(page, "Comando", ["Goblin"]);
  await expect(page.getByTestId("damage-tray")).toHaveCount(0);
  const goblin = page.getByRole("group", { name: "Goblin" });
  await expect(goblin).toBeVisible();
  await goblin.getByRole("button", { name: "Fallito" }).click();
  await expect(goblin.getByRole("button", { name: "Fallito" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await goblin.scrollIntoViewIfNeeded();
  await page.screenshot({ path: shotPath("save-line-command-phone.png") });

  await castOn(page, "Calmare Emozioni", ["Ogre"]);
  await expect(page.getByTestId("damage-tray")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Ogre" })).toBeVisible();
  await page.getByRole("group", { name: "Ogre" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: shotPath("save-line-calm-emotions-phone.png") });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
