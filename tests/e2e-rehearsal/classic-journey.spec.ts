/**
 * Rehearsal, classic UI: the build v0.26.0 ships by default (`VITE_NEW_UI` off) with the
 * deploy's flags, on the real emulators and rules. The DM runs a fight from the classic
 * campaign hub and hits a player's character from their own device (a cross-device hit:
 * with `VITE_PEER_SPENDS_LEDGER` on, it goes through the spends ledger), sets a
 * condition and ends the fight; the player ends a turn, takes a Long Rest (the campaign
 * clock moves 8 hours) and levels up in the classic wizard.
 *
 * One test with steps, soft where the journey can go on, so one finding never hides
 * the rest. The classic UI has no "roll for the missing" and no clock control: the DM
 * rolls each hero, and only a rest moves the clock.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  expectNoCrash,
  PLAYER_BARD,
  SANDBOX_CAMPAIGN,
  SANDBOX_USERS,
  signInAs,
  watchErrors,
} from "./helpers";

const errors: string[][] = [];

async function seat(browser: Browser, email?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  errors.push(watchErrors(page));
  if (email) await signInAs(page, email);
  return page;
}

async function openLiveTab(page: Page): Promise<void> {
  await page.goto(`/campaigns/${SANDBOX_CAMPAIGN}`);
  await page.getByRole("tab", { name: "Live" }).click();
}

/** End a running encounter without a Chronicle entry (a leftover, or the end). */
async function endEncounter(page: Page): Promise<boolean> {
  const end = page.getByRole("button", { name: "End encounter" });
  if (!(await end.isVisible())) return false;
  await end.click();
  await page.getByRole("dialog").getByRole("button", { name: "Skip" }).click();
  return true;
}

/** The HP chip of a hero's card in the encounter ("24 of 24 hit points: …"). */
const hpChip = (page: Page, uid: string) =>
  page
    .locator(`li[data-combatant-id="pc-${uid}"]`)
    .getByRole("button", { name: /hit points: open damage/ });

async function currentHp(page: Page, uid: string): Promise<number> {
  const name = (await hpChip(page, uid).getAttribute("aria-label")) ?? "";
  return Number(name.match(/^(\d+) of/)?.[1] ?? Number.NaN);
}

test("classic UI: a campaign fight, a hit from the DM's device, a rest and a level", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const dm = await seat(browser);
  const bard = await seat(browser, SANDBOX_USERS.catalion.email);

  await test.step("the DM starts an encounter and rolls each hero", async () => {
    await openLiveTab(dm);
    await endEncounter(dm);
    await dm.getByRole("button", { name: "Run encounter" }).click();
    for (let i = 0; i < 4; i++) {
      const roll = dm.getByRole("button", { name: "Roll initiative" }).first();
      if (!(await roll.isVisible().catch(() => false))) break;
      await roll.click();
      // A committed roll keeps its field on the card: the one just opened has focus.
      const input = dm.locator("input.init-edit-input:focus");
      await input.fill(String(15 - i));
      await input.press("Enter");
    }
    await dm
      .getByRole("button", { name: /^Begin (turns|with)/ })
      .first()
      .click();
    await expect(dm.getByRole("button", { name: "Next turn" })).toBeVisible();
  });

  await test.step("the DM deals 3 damage to Catalion from their own device", async () => {
    const before = await currentHp(dm, PLAYER_BARD);
    await hpChip(dm, PLAYER_BARD).click();
    const dialog = dm.getByRole("dialog", { name: "Hit Points" });
    await dialog.getByRole("spinbutton", { name: /Amount of damage, healing/ }).fill("3");
    await dialog.getByRole("button", { name: "Damage", exact: true }).click();
    await expect
      .poll(() => currentHp(dm, PLAYER_BARD), {
        message: "the hit lands",
        timeout: 15_000,
      })
      .toBe(before - 3);
  });

  await test.step("the DM knocks Catalion Prone", async () => {
    const card = dm.locator(`li[data-combatant-id="pc-${PLAYER_BARD}"]`);
    await card
      .getByRole("button", { name: /^Catalion/ })
      .first()
      .click();
    await card.locator(".co-add").first().click();
    await dm
      .getByRole("listbox", { name: "Add condition" })
      .getByRole("option", { name: "Prone" })
      .click();
    await dm.keyboard.press("Escape");
    await expect
      .soft(card.getByText("Prone").first(), "the condition shows")
      .toBeVisible();
  });

  await test.step("the turns move; Catalion ends a turn from the classic sheet", async () => {
    await bard.goto(`/characters/${SANDBOX_USERS.catalion.characterId}`);
    for (let i = 0; i < 4; i++) {
      if (await bard.locator('.turn[data-phase="my-turn"]').isVisible()) break;
      await dm.getByRole("button", { name: "Next turn" }).click();
      await bard.waitForTimeout(1_000);
    }
    const endTurn = bard.getByRole("button", { name: "End Turn" });
    await expect.soft(endTurn, "Catalion's turn reaches the sheet").toBeEnabled();
    if (await endTurn.isEnabled().catch(() => false)) await endTurn.click();
  });

  await test.step("the DM ends the encounter", async () => {
    await openLiveTab(dm);
    expect(await endEncounter(dm)).toBe(true);
    await expect(dm.getByRole("button", { name: "Run encounter" })).toBeVisible();
  });

  await test.step("Catalion takes a Long Rest on the classic sheet", async () => {
    await bard.goto(`/characters/${SANDBOX_USERS.catalion.characterId}`);
    await bard.getByRole("button", { name: "Rest", exact: true }).click();
    const dialog = bard.getByRole("dialog", { name: "Rest" });
    await dialog.getByRole("button", { name: /^Long Rest/ }).click();
    await dialog.getByRole("button", { name: "Complete rest" }).click();
    await bard.getByRole("button", { name: "Done" }).click();
    await expectNoCrash(bard);
  });

  await test.step("Mandorlino levels up in the classic wizard", async () => {
    const paladin = await seat(browser, SANDBOX_USERS.mandorlino.email);
    await paladin.emulateMedia({ reducedMotion: "reduce" });
    await paladin.goto(`/characters/${SANDBOX_USERS.mandorlino.characterId}`);
    await paladin.getByRole("button", { name: /^Level up to level/ }).click();
    await expect(paladin).toHaveURL(/\/level-up$/);
    const next = paladin.locator(".wiz-pager-btn.next");
    for (let i = 0; i < 10; i++) {
      if (await paladin.locator(".wiz-done").isVisible()) break;
      await expect(next, "each step can go on (no pick left open)").toBeEnabled();
      await next.click();
      await paladin.waitForTimeout(300);
    }
    await expect(paladin.locator(".wiz-done")).toBeVisible({ timeout: 30_000 });
    await paladin.getByRole("button", { name: "To the sheet" }).click();
    await expectNoCrash(paladin);
  });

  await expectNoCrash(dm);
  expect.soft(errors.flat()).toEqual([]);
});
