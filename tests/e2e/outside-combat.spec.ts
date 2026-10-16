/**
 * Actions work outside combat (owner decision 2026-10-16). The dev mock with its
 * solo combat ended (round 1, no encounter): a ritual spends no slot, a slotted
 * cast spends one and holds Concentration, a potion heals and Second Wind spends
 * its use. Review shots land under REVIEW_SHOTS when set, else in the output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 90_000 });

const DOC_KEY = "d20-folio.dev-doc.v1:combat-state:mock-uid%2Fmock-1";

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function saved(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("Missing local combat document");
    const { value } = JSON.parse(raw) as {
      value: {
        playState: {
          state: { usedSlots: Record<string, number>; concentration?: string };
        };
        hp: { current: number; temp: number };
      };
    };
    return {
      slot1: value.playState.state.usedSlots["1"] ?? 0,
      hp: value.hp.current,
      concentration: value.playState.state.concentration ?? "",
    };
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

async function confirmIfAsked(page: Page) {
  const anyway = page.getByRole("button", { name: "Cast anyway" });
  if (await anyway.isVisible().catch(() => false)) await anyway.click();
}

test("spells out of combat: a ritual spends no slot, a slotted cast spends one", async ({
  page,
}) => {
  await openOutOfCombat(page);
  await page.screenshot({ path: shotPath("00-out-of-combat.png") });
  await page.getByRole("tab", { name: /Spells/ }).click();
  const before = await saved(page);

  const detect = page.getByRole("region", { name: "Detect Magic", exact: true });
  await page.getByRole("button", { name: "Expand: Detect Magic" }).click();
  await detect.getByRole("button", { name: "Ritual" }).click();
  await confirmIfAsked(page);
  await expect(page.getByText("Cast Detect Magic as ritual (no slot)")).toBeVisible();
  expect((await saved(page)).slot1).toBe(before.slot1);
  await expect
    .poll(async () => (await saved(page)).concentration)
    .toContain("detect-magic");
  await detect.scrollIntoViewIfNeeded();
  await page.screenshot({ path: shotPath("01-ritual-no-slot.png") });

  const bane = page.getByRole("region", { name: "Bane", exact: true });
  await page.getByRole("button", { name: "Expand: Bane" }).click();
  await bane.getByRole("button", { name: /^Cast/ }).first().click();
  await confirmIfAsked(page);
  await page.getByRole("button", { name: /Level 1 slot \(base\)/ }).click();
  await confirmIfAsked(page);
  const skip = page.getByRole("button", { name: /^Skip$/ });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect.poll(async () => (await saved(page)).slot1).toBe(before.slot1 + 1);
  await expect.poll(async () => (await saved(page)).concentration).toContain("bane");
  await bane.scrollIntoViewIfNeeded();
  await page.screenshot({ path: shotPath("02-slot-cast-concentration.png") });
});

test("features and items out of combat: Second Wind and a Potion of Healing heal", async ({
  page,
}) => {
  await openOutOfCombat(page);
  const before = await saved(page);

  await page.getByRole("button", { name: "Use: Second Wind" }).click();
  const tray = page.getByRole("dialog");
  await tray.getByRole("textbox").first().fill("6");
  await tray.getByRole("button", { name: "Apply" }).click();
  await expect.poll(async () => (await saved(page)).hp).toBe(before.hp + 6);

  // Second Wind took the Bonus Action, so the potion (also a Bonus Action) now
  // waits for End Turn: the shot records it (Phase 1 item, no exploration mode).
  const potion = page.getByRole("button", { name: "Used: Potion of Healing" }).first();
  await potion.scrollIntoViewIfNeeded();
  await page.screenshot({ path: shotPath("03-bonus-taken-out-of-combat.png") });
  await page
    .locator(".turn")
    .getByRole("button", { name: /End Turn/ })
    .click();

  await page.getByRole("button", { name: "Use: Potion of Healing" }).click();
  await tray.getByRole("textbox").first().fill("7");
  await tray.getByRole("button", { name: "Apply" }).click();
  await expect.poll(async () => (await saved(page)).hp).toBe(before.hp + 13);
  await page.screenshot({ path: shotPath("04-potion-heals.png") });
});
