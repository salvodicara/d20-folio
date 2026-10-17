/**
 * Outside an encounter the turn economy only LOGS, it never gates (owner decision
 * 2026-10-16). The dev mock with its solo fight ended (round 1, no Initiative, no
 * campaign encounter): Second Wind then a Potion of Healing both heal, and Search
 * then Study both log, with no End Turn in between. Review shots land under
 * REVIEW_SHOTS when set, else in the output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 90_000 });

const DOC_KEY = "d20-folio.dev-doc.v1:combat-state:mock-uid%2Fmock-1";

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function savedHp(page: Page): Promise<number> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("Missing local combat document");
    return (JSON.parse(raw) as { value: { hp: { current: number } } }).value.hp.current;
  }, DOC_KEY);
}

/** The mock out of combat: its solo fight ended, round 1, no encounter. */
async function openOutOfCombat(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedLang(page, "en");
  await seedUI(page, "dark", "play");
  await page.goto("/characters/mock-1?tab=play");
  const end = page.locator(".turn .end-combat");
  await expect(end).toBeVisible({ timeout: 45_000 });
  await end.click();
  await page.getByRole("dialog").getByRole("button", { name: "End Combat" }).click();
  await expect(page.locator(".turn")).toContainText("1");
  await freezeMotion(page);
}

async function heal(page: Page, use: string, amount: string) {
  await page
    .getByRole("button", { name: `Use: ${use}` })
    .first()
    .click();
  const tray = page.getByRole("dialog");
  await tray.getByRole("textbox").first().fill(amount);
  await tray.getByRole("button", { name: "Apply" }).click();
  await expect(tray).toHaveCount(0);
}

test("out of combat: Second Wind then a Potion of Healing both heal, no End Turn", async ({
  page,
}) => {
  await openOutOfCombat(page);
  const before = await savedHp(page);

  await heal(page, "Second Wind", "6");
  await expect.poll(() => savedHp(page)).toBe(before + 6);

  // The Bonus Action coin stays open and the potion stays usable.
  const potion = page
    .getByRole("button", { name: /^(Use|Used): Potion of Healing/ })
    .first();
  await potion.scrollIntoViewIfNeeded();
  await page.screenshot({ path: shotPath("bonus-twice-out-of-combat.png") });
  await expect(page.locator('.turn .econ-tok[data-kind="bonus"]')).toHaveAttribute(
    "data-state",
    "open"
  );
  await expect(potion).toHaveAccessibleName(/^Use: /);
  await expect(potion).toBeEnabled();

  await heal(page, "Potion of Healing", "7");
  await expect.poll(() => savedHp(page)).toBe(before + 13);

  // Undo still reverses the last act (the potion), on its own.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => savedHp(page)).toBe(before + 6);
});

test("out of combat: Search then Study both log, no End Turn", async ({ page }) => {
  await openOutOfCombat(page);
  const log = page.getByRole("log", { name: "Action Log" });

  await page.getByRole("button", { name: "Use: Search" }).click();
  await expect(log).toContainText("Used Search");
  await page.screenshot({ path: shotPath("actions-twice-out-of-combat.png") });
  await expect(page.locator('.turn .econ-tok[data-kind="action"]')).toHaveAttribute(
    "data-state",
    "open"
  );

  const study = page.getByRole("button", { name: "Use: Study" });
  await expect(study).toBeEnabled();
  await study.click();
  await expect(log).toContainText("Used Study");
  await expect(page.getByRole("button", { name: "Use: Search" })).toBeEnabled();
});

test("out of combat: a reaction logs, stays ready, and undoes", async ({ page }) => {
  await openOutOfCombat(page);
  const log = page.getByRole("log", { name: "Action Log" });
  const oa = page.getByRole("button", { name: "React: Opportunity Attack" });

  await oa.click();
  await expect(log).toContainText("Opportunity Attack");
  await expect(page.locator('.turn .econ-tok[data-kind="reaction"]')).toHaveAttribute(
    "data-state",
    "open"
  );
  await expect(oa).toBeEnabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(log).not.toContainText("Opportunity Attack");
});

test("in a solo fight the turn economy still gates", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedLang(page, "en");
  await seedUI(page, "dark", "play");
  // The mock opens mid-fight (a solo round past the first).
  await page.goto("/characters/mock-1?tab=play");
  await expect(page.locator(".turn .end-combat")).toBeVisible({ timeout: 45_000 });
  await freezeMotion(page);

  await page.getByRole("button", { name: "Use: Search" }).click();
  await expect(page.locator('.turn .econ-tok[data-kind="action"]')).toHaveAttribute(
    "data-state",
    "spent"
  );
  await expect(page.getByRole("button", { name: "Used: Study" })).toBeDisabled();
});
