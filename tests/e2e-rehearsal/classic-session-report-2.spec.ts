/**
 * Rehearsal, classic UI: the session report's second evening (coordinator's request,
 * 2026-11-12). The classic sheet is what players use today, so the five scenes of
 * `session-report-2.ts` are played here on it, each player signed in on their own
 * browser and the DM on the classic campaign hub: saves marked on the row, a level-up
 * in the classic wizard, an encounter the DM runs and ends in round 2, a solo fight
 * started by a player's own initiative roll, and an encounter left open until a Long
 * Rest. Then the DM opens the hub's Journal and reads the evening's automatic report:
 * three encounters, only the solo one «(inferred)», every line in play order.
 *
 * One evening, not one sitting per scene: each scene closes its fight before the next
 * starts, so the report must keep them apart by itself, as at a real table. The evening
 * starts a new sitting (`startNewSitting`), so the report holds only this spec's lines.
 *
 * Both players roll their own initiative on their sheets (the turn band's roll), which
 * writes the report's initiative line. The DM's typed roll on the hub card writes one too
 * (#1162): the forgotten encounter's Paladin roll is typed by the DM, «rolled by the DM».
 */
import { expect, type Browser, type Page } from "@playwright/test";
import {
  BARD_NAME,
  expectNoCrash,
  PALADIN_NAME,
  reseedHero,
  rollEachHero,
  SANDBOX_CAMPAIGN,
  SANDBOX_USERS,
  signInAs,
  startNewSitting,
  test,
  watchErrors,
} from "./helpers";
import {
  BARD_D20,
  BARD_WEAPON,
  classicJournalReport,
  expectReport,
  FAILED_DAMAGE,
  FIGHT_HIT,
  fightBlows,
  lastEvening,
  LEVEL_TO,
  levelUpLine,
  markMiss,
  markSave,
  dmInitiative,
  ownInitiative,
  PALADIN_D20,
  PALADIN_WEAPON,
  SAVE_CANTRIP,
  SAVE_SPELL,
  SAVE_SPELL_SLOT,
  SAVED_DAMAGE,
  savesLines,
  SOLO_HIT,
  soloLines,
} from "./session-report-2";
import { expectNothingDangling, markHit } from "./session-report";
import { visibleWithin } from "../e2e/visible-within";

const errors: string[][] = [];

async function seat(browser: Browser, email?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  errors.push(watchErrors(page));
  if (email) await signInAs(page, email);
  return page;
}

/** The classic sheet, on its Combat tab (the default for the sheet's owner). */
async function openSheet(page: Page, id: string): Promise<void> {
  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("button", { name: "Rest", exact: true })).toBeVisible({
    timeout: 60_000,
  });
}

async function openLiveTab(dm: Page): Promise<void> {
  await dm.goto(`/campaigns/${SANDBOX_CAMPAIGN}`);
  await dm.getByRole("tab", { name: "Live" }).click();
}

/** End a running encounter without a Chronicle entry; then none runs. */
async function endEncounter(dm: Page): Promise<void> {
  const end = dm.getByRole("button", { name: "End encounter" });
  const run = dm.getByRole("button", { name: "Run encounter" });
  await expect(end.or(run).first()).toBeVisible({ timeout: 60_000 });
  if (await end.isVisible()) {
    await end.click();
    await dm.getByRole("dialog").getByRole("button", { name: "Skip" }).click();
  }
  await expect(run).toBeVisible();
}

/** The optional «On whom?» step: no one. */
async function skipTargets(page: Page): Promise<void> {
  const picker = page.getByRole("dialog", { name: /on whom\?/i });
  if (await visibleWithin(picker, 3_000))
    await picker.getByRole("button", { name: /^Skip/ }).click();
  await expect(picker).toHaveCount(0);
}

async function attack(page: Page, weapon: string): Promise<void> {
  await page
    .getByRole("button", { name: new RegExp(`^Attack: ${weapon}$`) })
    .first()
    .click();
  await skipTargets(page);
}

/**
 * The player's own initiative from the sheet's turn band: the d20 typed, the total read
 * from the band's «+bonus = total», then Enter. In an encounter it is the report's
 * initiative line; solo it starts the sheet's own fight.
 */
async function rollOwnInitiative(page: Page, d20: number): Promise<number> {
  await page
    .getByRole("button", { name: "Roll initiative", exact: true })
    .first()
    .click();
  const input = page.getByRole("textbox", { name: /^Your d20 roll for/ });
  await input.fill(String(d20));
  const math = page.locator(".vi-math").filter({ hasText: /=/ }).first();
  await expect(math).toHaveText(/= \d+/);
  const total = Number((await math.innerText()).match(/= (\d+)/)?.[1]);
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  return total;
}

/** The round the sheet's pip shows ("Round 2 · …"). */
async function pipRound(page: Page): Promise<number> {
  const name =
    (await page
      .getByRole("link", { name: /^Round \d+ · / })
      .getAttribute("aria-label")) ?? "";
  return Number(name.match(/^Round (\d+)/)?.[1] ?? 0);
}

test("classic UI: a second evening, read back from the hub's Journal", async ({
  browser,
}) => {
  test.setTimeout(900_000);
  reseedHero(SANDBOX_USERS.bard);
  reseedHero(SANDBOX_USERS.paladin);

  const dm = await seat(browser);

  await test.step("no encounter is running; the evening starts a new sitting", async () => {
    await openLiveTab(dm);
    await endEncounter(dm);
    await dm.reload();
    await expect(
      dm.getByRole("button", { name: "Run encounter" }),
      "the end is on the server"
    ).toBeVisible({
      timeout: 30_000,
    });
    await startNewSitting();
  });

  const bard = await seat(browser, SANDBOX_USERS.bard.email);
  const paladin = await seat(browser, SANDBOX_USERS.paladin.email);
  await openSheet(bard, SANDBOX_USERS.bard.characterId);

  await test.step(`saves: Bard's ${SAVE_CANTRIP} fails (${String(FAILED_DAMAGE)} damage), ${SAVE_SPELL} is saved (${String(SAVED_DAMAGE)})`, async () => {
    await bard
      .getByRole("button", { name: new RegExp(`^Cast: ${SAVE_CANTRIP}`) })
      .first()
      .click();
    await skipTargets(bard);
    await markSave(bard, "Failed", FAILED_DAMAGE);
    await bard
      .getByRole("button", { name: new RegExp(`^Cast: ${SAVE_SPELL}`) })
      .first()
      .click();
    // The cast-level picker: a tile commits the cast at that level.
    await bard
      .getByRole("button", { name: new RegExp(`^Level ${String(SAVE_SPELL_SLOT)} slot`) })
      .click();
    await skipTargets(bard);
    await markSave(bard, "Saved", SAVED_DAMAGE);
  });

  await test.step(`level-up: Paladin reaches level ${String(LEVEL_TO)} in the classic wizard`, async () => {
    await paladin.emulateMedia({ reducedMotion: "reduce" });
    await openSheet(paladin, SANDBOX_USERS.paladin.characterId);
    await paladin.getByRole("button", { name: /^Level up to level/ }).click();
    await expect(paladin).toHaveURL(/\/level-up$/);
    const next = paladin.locator(".wiz-pager-btn.next");
    // Level 4 asks a boon (+2 Charisma) and a spell, as in classic-journey.
    const boon = paladin.locator(".wiz-asi-boon");
    for (let i = 0; i < 10; i++) {
      if (await paladin.locator(".wiz-done").isVisible()) break;
      if (await boon.isVisible())
        await boon.locator(".wiz-asi-tile").filter({ hasText: "CHA" }).click();
      if (await paladin.getByText(/^Pick \d+ more$/).isVisible()) {
        const row = paladin.locator(".wiz-list .wiz-row[aria-expanded=false]").first();
        const name = (await row.locator(".wiz-row-name").innerText()).trim();
        await row.click();
        await paladin.getByRole("button", { name: `Learn ${name}` }).click();
      }
      await expect(next, "each step can go on").toBeEnabled();
      await next.click();
      await paladin.waitForTimeout(300);
    }
    await expect(paladin.locator(".wiz-done")).toBeVisible({ timeout: 30_000 });
    await paladin.getByRole("button", { name: "To the sheet" }).click();
    await expectNoCrash(paladin);
  });

  let bardInitiative = 0;
  let paladinInitiative = 0;
  await test.step("an encounter: the DM runs it, each player rolls on their own sheet", async () => {
    await openLiveTab(dm);
    await dm.getByRole("button", { name: "Run encounter" }).click();
    await expect(
      dm.getByRole("button", { name: /^Begin (turns|with)/ }).first()
    ).toBeVisible();
    await openSheet(bard, SANDBOX_USERS.bard.characterId);
    bardInitiative = await rollOwnInitiative(bard, BARD_D20);
    await openSheet(paladin, SANDBOX_USERS.paladin.characterId);
    paladinInitiative = await rollOwnInitiative(paladin, PALADIN_D20);
    // Both rolls on the hub, then the turns begin.
    await expect(dm.getByRole("button", { name: "Begin turns" })).toBeVisible({
      timeout: 30_000,
    });
    await dm.getByRole("button", { name: "Begin turns" }).click();
    await expect(dm.getByRole("button", { name: "Next turn" })).toBeVisible();
  });

  await test.step(`round 1: Paladin hits with the ${PALADIN_WEAPON} (${String(FIGHT_HIT)} damage)`, async () => {
    await attack(paladin, PALADIN_WEAPON);
    await markHit(paladin, FIGHT_HIT);
  });

  await test.step("the DM passes the turns into round 2", async () => {
    for (let pass = 0; pass < 4 && (await pipRound(bard)) < 2; pass++) {
      await dm.getByRole("button", { name: "Next turn" }).click();
      await dm.waitForTimeout(1_500);
    }
    await expect.poll(() => pipRound(bard), { timeout: 15_000 }).toBe(2);
  });

  await test.step(`round 2: Bard misses with the ${BARD_WEAPON}; the DM ends the encounter`, async () => {
    await attack(bard, BARD_WEAPON);
    await markMiss(bard);
    await openLiveTab(dm);
    await endEncounter(dm);
  });

  await test.step(`a solo fight: Paladin rolls initiative alone, Bard hits once (${String(SOLO_HIT)}), Paladin ends it`, async () => {
    await openSheet(paladin, SANDBOX_USERS.paladin.characterId);
    await rollOwnInitiative(paladin, PALADIN_D20);
    await openSheet(bard, SANDBOX_USERS.bard.characterId);
    await attack(bard, BARD_WEAPON);
    await markHit(bard, SOLO_HIT);
    await paladin.getByRole("button", { name: "End Combat" }).first().click();
    await paladin
      .getByRole("alertdialog")
      .or(paladin.getByRole("dialog"))
      .getByRole("button", { name: "End Combat" })
      .click();
    // The band's initiative is cleared: the fight is over.
    await expect(
      paladin.getByRole("button", { name: "Roll initiative", exact: true }).first()
    ).toBeVisible();
  });

  let forgottenInitiative = 0;
  await test.step("a forgotten encounter: run, Bard rolls, the DM types Paladin's, nobody ends it", async () => {
    await openLiveTab(dm);
    await dm.getByRole("button", { name: "Run encounter" }).click();
    await expect(
      dm.getByRole("button", { name: /^Begin (turns|with)/ }).first()
    ).toBeVisible();
    await openSheet(bard, SANDBOX_USERS.bard.characterId);
    forgottenInitiative = await rollOwnInitiative(bard, BARD_D20);
    await rollEachHero(dm);
    await dm
      .getByRole("button", { name: /^Begin (turns|with)/ })
      .first()
      .click();
    await expect(dm.getByRole("button", { name: "Next turn" })).toBeVisible();
    // Paladin is done for the evening: an open sheet would catch up with the clock the
    // rest moves, and write those hours into the report after it.
    await expectNoCrash(paladin);
    await paladin.context().close();
  });

  await test.step("Bard takes a Long Rest with the encounter still open", async () => {
    await bard.getByRole("button", { name: "Rest", exact: true }).click();
    const dialog = bard.getByRole("dialog", { name: "Rest" });
    await dialog.getByRole("button", { name: /^Long Rest/ }).click();
    await dialog.getByRole("button", { name: "Complete rest" }).click();
    await bard.getByRole("button", { name: "Done" }).click();
    await expectNoCrash(bard);
  });

  await test.step("the DM's Journal: three encounters, only the solo one inferred, the rest after the open one", async () => {
    await expect(async () => {
      expectReport(lastEvening(await classicJournalReport(dm, SANDBOX_CAMPAIGN), 5), [
        { heading: "Outside combat", lines: [...savesLines(), levelUpLine()] },
        {
          // Started, so never «(inferred)».
          heading: "Encounter 1",
          lines: [
            ownInitiative(BARD_NAME, bardInitiative),
            ownInitiative(PALADIN_NAME, paladinInitiative),
            ...fightBlows(),
          ],
          rounds: ["Round 1", "Round 2"],
        },
        // The solo start makes one blow a fight.
        { heading: "Encounter 2 (inferred)", lines: soloLines() },
        // Never ended. The DM's typed roll for Paladin is a line too (#1162); the d20 is
        // the hub's, so only its shape is known. Written at once: in either order.
        {
          heading: "Encounter 3",
          lines: [
            ownInitiative(BARD_NAME, forgottenInitiative),
            dmInitiative(PALADIN_NAME),
          ],
          unordered: true,
        },
        // The rest leaves the forgotten encounter: after it, outside it.
        { heading: "Outside combat", lines: [`${BARD_NAME} takes a long rest`] },
      ]);
    }).toPass({ timeout: 120_000, intervals: [2_000, 5_000, 10_000] });
    expectNothingDangling(
      lastEvening(await classicJournalReport(dm, SANDBOX_CAMPAIGN), 5)
    );
  });

  await test.step("the table tidies up: the DM ends the forgotten encounter", async () => {
    await openLiveTab(dm);
    await endEncounter(dm);
  });

  for (const page of [dm, bard]) await expectNoCrash(page);
  expect.soft(errors.flat()).toEqual([]);
});
