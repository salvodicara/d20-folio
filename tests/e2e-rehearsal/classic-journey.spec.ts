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
import { expect, type Browser, type Page } from "@playwright/test";
import {
  BARD_FIRST,
  expectNoCrash,
  PLAYER_BARD,
  reseedHero,
  rollEachHero,
  SANDBOX_CAMPAIGN,
  SANDBOX_USERS,
  signInAs,
  test,
  watchErrors,
} from "./helpers";

const errors: string[][] = [];

/**
 * Put both heroes back as the seed holds them (level 3), so this journey never depends
 * on what the new-UI run did before it: `--project=classic` passes alone.
 */
function reseedHeroes(): void {
  reseedHero(SANDBOX_USERS.bard);
  reseedHero(SANDBOX_USERS.paladin);
}

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

/**
 * The DM rolls each hero still missing initiative. A hero who rolled on their own sheet
 * brings that roll a moment after the cards appear, and its «Roll initiative» button
 * goes: so wait for the cards to settle, and never wait on a button that went.
 */
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
  reseedHeroes();
  const dm = await seat(browser);
  const bard = await seat(browser, SANDBOX_USERS.bard.email);

  await test.step("the DM starts an encounter and rolls each hero", async () => {
    await openLiveTab(dm);
    await endEncounter(dm);
    await dm.getByRole("button", { name: "Run encounter" }).click();
    await rollEachHero(dm);
    await dm
      .getByRole("button", { name: /^Begin (turns|with)/ })
      .first()
      .click();
    await expect(dm.getByRole("button", { name: "Next turn" })).toBeVisible();
  });

  await test.step("the DM deals 3 damage to Bard from their own device", async () => {
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

  await test.step("the DM knocks Bard Prone", async () => {
    const card = dm.locator(`li[data-combatant-id="pc-${PLAYER_BARD}"]`);
    await card
      .getByRole("button", { name: new RegExp(`^${BARD_FIRST}`) })
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

  await test.step("the turns move; Bard ends a turn from the classic sheet", async () => {
    await bard.goto(`/characters/${SANDBOX_USERS.bard.characterId}`);
    // Advance one turn at a time, and only once the last move has reached the player's
    // sheet: the round pip says "Your turn" on the player's own turn, so the loop reads it (never the
    // turn panel, which settles a moment after the pip) before pressing Next again.
    const pip = bard.getByRole("link", { name: /^Round \d+ · / });
    for (let i = 0; i < 4; i++) {
      const shown = (await pip.getAttribute("aria-label")) ?? "";
      if (/· Your turn ·/.test(shown)) break;
      await dm.getByRole("button", { name: "Next turn" }).click();
      await expect
        .poll(() => pip.getAttribute("aria-label"), {
          message: "the turn reaches the player's sheet",
          timeout: 15_000,
        })
        .not.toBe(shown);
    }
    const endTurn = bard.getByRole("button", { name: "End Turn" });
    await expect(endTurn, "Bard's turn reaches the sheet").toBeEnabled({
      timeout: 15_000,
    });
  });

  await test.step("Bard casts an Action cantrip, reloads: the sheet is there and the Action stays spent", async () => {
    // A cast in a fight once saved a turn the reader refused, and the sheet showed its
    // error page on reload (#1158).
    const action = bard.locator('.econ-tok[data-kind="action"]');
    await expect(action).toHaveAttribute("data-state", "open");
    await bard.getByRole("button", { name: "Cast: Vicious Mockery" }).click();
    // Walk the cast's questions (a target, then the roll) until the dialog closes.
    const dialog = bard.locator("dialog[open]");
    for (let step = 0; step < 4 && (await dialog.count()) > 0; step++) {
      const next = dialog
        .getByRole("button", { name: /^(Cast|Confirm|Skip|Done)$/ })
        .first();
      if (await next.isVisible()) await next.click();
      else await bard.keyboard.press("Escape");
      await bard.waitForTimeout(500);
    }
    await expect(action).toHaveAttribute("data-state", "spent");
    await bard.reload();
    await expect(action, "the sheet comes back with the Action spent").toHaveAttribute(
      "data-state",
      "spent",
      { timeout: 60_000 }
    );
    await expectNoCrash(bard);
    await bard.getByRole("button", { name: "End Turn" }).click();
  });

  await test.step("the DM ends the encounter", async () => {
    await openLiveTab(dm);
    expect(await endEncounter(dm)).toBe(true);
    await expect(dm.getByRole("button", { name: "Run encounter" })).toBeVisible();
  });

  await test.step("Bard takes a Long Rest on the classic sheet", async () => {
    await bard.goto(`/characters/${SANDBOX_USERS.bard.characterId}`);
    await bard.getByRole("button", { name: "Rest", exact: true }).click();
    const dialog = bard.getByRole("dialog", { name: "Rest" });
    await dialog.getByRole("button", { name: /^Long Rest/ }).click();
    await dialog.getByRole("button", { name: "Complete rest" }).click();
    await bard.getByRole("button", { name: "Done" }).click();
    await expectNoCrash(bard);
  });

  await test.step("Paladin levels up in the classic wizard", async () => {
    const paladin = await seat(browser, SANDBOX_USERS.paladin.email);
    await paladin.emulateMedia({ reducedMotion: "reduce" });
    await paladin.goto(`/characters/${SANDBOX_USERS.paladin.characterId}`);
    await paladin.getByRole("button", { name: /^Level up to level/ }).click();
    await expect(paladin).toHaveURL(/\/level-up$/);
    const next = paladin.locator(".wiz-pager-btn.next");
    // Level 4 asks a boon (+2 Charisma; "+2 to One" is the default mode) and a spell.
    const boon = paladin.locator(".wiz-asi-boon");
    for (let i = 0; i < 10; i++) {
      if (await paladin.locator(".wiz-done").isVisible()) break;
      if (await boon.isVisible()) {
        await boon.locator(".wiz-asi-tile").filter({ hasText: "CHA" }).click();
      }
      // A spell to learn: open the first entry not yet learned and learn it.
      if (await paladin.getByText(/^Pick \d+ more$/).isVisible()) {
        const row = paladin.locator(".wiz-list .wiz-row[aria-expanded=false]").first();
        const name = (await row.locator(".wiz-row-name").innerText()).trim();
        await row.click();
        await paladin.getByRole("button", { name: `Learn ${name}` }).click();
      }
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
