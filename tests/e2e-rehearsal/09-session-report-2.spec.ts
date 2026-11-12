/**
 * Rehearsal 9 — the session report's second evening, on the new UI (coordinator's
 * request, 2026-11-12): the report features rehearsal 8 does not play. Two players, each
 * signed in on their own browser, and the DM on the campaign page play the five scenes
 * of `session-report-2.ts` in one evening: saves marked on the row, a level-up, a
 * campaign fight started by initiative and ended in round 2, a solo fight with a single
 * blow, and a campaign fight left open. Then the DM reads the Journal and copies the
 * report: every block, its heading and its lines, nothing dangling. The same evening on
 * the classic UI is `classic-session-report-2.spec.ts`.
 *
 * One evening, not one sitting per scene: each scene closes its fight before the next
 * starts, so the report must keep them apart by itself, as at a real table. The evening
 * starts a new sitting (`startNewSitting`), so the report holds only this spec's lines.
 *
 * The forgotten fight closes on an idle hour here, not on a rest: the new UI's sheet
 * refuses a rest while its campaign fight runs («No resting during a fight»,
 * PlayScreen). Bard's browser clock moves on 61 minutes (Playwright's clock), and the
 * next thing Bard does (a Bardic Inspiration spend) leaves the fight.
 */
import {
  expect,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import {
  actionRow,
  BARD_NAME,
  expectNoCrash,
  levelUp,
  openFightTab,
  PALADIN_NAME,
  reseedHero,
  SANDBOX_CAMPAIGN,
  SANDBOX_USERS,
  signInAs,
  spaced,
  startNewSitting,
  test,
  watchErrors,
} from "./helpers";
import {
  BARD_D20,
  BARD_WEAPON,
  blockHeading,
  dmInitiative,
  expectReport,
  FAILED_DAMAGE,
  FIGHT_HIT,
  fightBlows,
  journalBlocks,
  LEVEL_TO,
  levelUpLine,
  markMiss,
  markSave,
  ownInitiative,
  PALADIN_WEAPON,
  RESOURCE,
  SAVE_CANTRIP,
  SAVE_SPELL,
  SAVE_SPELL_SLOT,
  SAVED_DAMAGE,
  savesLines,
  SOLO_HIT,
  soloLines,
  spendLine,
  type ExpectedSection,
} from "./session-report-2";
import { expectNothingDangling, markdownSections, markHit } from "./session-report";
import { visibleWithin } from "../e2e/visible-within";

const errors: string[][] = [];

async function seat(
  browser: Browser,
  email?: string,
  options: BrowserContextOptions = {}
): Promise<Page> {
  const page = await (await browser.newContext(options)).newPage();
  errors.push(watchErrors(page));
  if (email) await signInAs(page, email);
  return page;
}

async function openSheet(page: Page, id: string): Promise<void> {
  await page.goto(`/characters/${id}`);
  await expect(page.locator(".f-char")).toBeVisible({ timeout: 60_000 });
}

/**
 * Answer what the Play screen asks after a tap, step by step: the slot (`slot`, when
 * given and offered), then on whom (no one), until no dialog is open.
 */
async function answerPrompts(page: Page, slot?: number): Promise<void> {
  const dialog = page.locator("dialog[open]");
  for (let step = 0; step < 4; step++) {
    if (!(await visibleWithin(dialog, 3_000))) return;
    if (slot !== undefined) {
      const tile = dialog.getByRole("button", { name: new RegExp(`^Lv\\s${slot}\\b`) });
      if ((await tile.count()) > 0) {
        if ((await tile.getAttribute("aria-pressed")) !== "true") await tile.click();
        await expect(tile).toHaveAttribute("aria-pressed", "true");
      }
    }
    const noOne = dialog.getByRole("button", {
      name: /^(Cast|Confirm) without choosing$/,
    });
    if ((await noOne.count()) > 0) await noOne.click();
    else await dialog.getByRole("button", { name: /^(Cast|Confirm)$/ }).click();
    await dialog.waitFor({ state: "detached", timeout: 2_000 }).catch(() => undefined);
  }
  await expect(dialog).toHaveCount(0);
}

async function cast(page: Page, spell: string, slot?: number): Promise<void> {
  await actionRow(page, spell)
    .getByRole("button", { name: /^Cast:/ })
    .click();
  await answerPrompts(page, slot);
}

/** The plain weapon row (the thrown one, if listed apart, is another row). */
async function attack(page: Page, weapon: string): Promise<void> {
  await page
    .locator(".f-act")
    .filter({ has: page.locator(".f-row-t", { hasText: new RegExp(`^${weapon}$`) }) })
    .first()
    .getByRole("button", { name: /^Attack:/ })
    .click();
  await answerPrompts(page);
}

function resourceButton(page: Page) {
  return page.getByRole("button", {
    name: new RegExp(`^${spaced(RESOURCE)}: \\d+ of \\d+`),
  });
}
async function usesLeft(page: Page): Promise<number> {
  const name = await resourceButton(page).getAttribute("aria-label");
  return Number(name?.match(/: (\d+) of/)?.[1]);
}

/** The Fight tab's live panel, by its title («Initiative · round 2»). */
function roundTitle(page: Page, round: number) {
  return page.getByText(new RegExp(`Initiative · round ${String(round)}`, "i")).first();
}

/** End the campaign fight from the DM's Fight tab, if one runs; then none does. */
async function endFight(dm: Page): Promise<void> {
  await openFightTab(dm);
  const end = dm.getByRole("button", { name: "End fight" });
  const idle = dm.getByText(/No fight running/i);
  await expect(end.or(idle).first()).toBeVisible({ timeout: 60_000 });
  if (await end.isVisible()) await end.click();
  await expect(idle).toBeVisible();
}

test("a second evening: saves, a level-up, a started fight, a solo fight and a forgotten one, read back from the Journal", async ({
  browser,
}) => {
  test.setTimeout(900_000);
  reseedHero(SANDBOX_USERS.bard);
  reseedHero(SANDBOX_USERS.paladin);

  const dm = await seat(browser, undefined, {
    permissions: ["clipboard-read", "clipboard-write"],
  });

  await test.step("no campaign fight is running; the evening starts a new sitting", async () => {
    await endFight(dm);
    // The end must be on the server before the evening starts.
    await openFightTab(dm);
    await expect(dm.getByText(/No fight running/i)).toBeVisible({ timeout: 30_000 });
    await startNewSitting();
  });

  const bard = await seat(browser, SANDBOX_USERS.bard.email);
  const paladin = await seat(browser, SANDBOX_USERS.paladin.email);
  await openSheet(bard, SANDBOX_USERS.bard.characterId);

  await test.step(`saves: Bard's ${SAVE_CANTRIP} fails (${String(FAILED_DAMAGE)} damage), ${SAVE_SPELL} is saved (${String(SAVED_DAMAGE)})`, async () => {
    await cast(bard, SAVE_CANTRIP);
    await markSave(bard, "Failed", FAILED_DAMAGE);
    await cast(bard, SAVE_SPELL, SAVE_SPELL_SLOT);
    await markSave(bard, "Saved", SAVED_DAMAGE);
  });

  await test.step(`level-up: Paladin reaches level ${String(LEVEL_TO)}`, async () => {
    await levelUp(paladin, SANDBOX_USERS.paladin.characterId, {
      level: LEVEL_TO,
      className: "Paladin",
    });
    await expectNoCrash(paladin);
  });

  let bardInitiative = 0;
  await test.step("a campaign fight: Bard rolls initiative, the DM rolls for the missing", async () => {
    await openFightTab(dm);
    await expect(dm.getByText(/No fight running/i)).toBeVisible({ timeout: 30_000 });
    await openFightTab(bard);
    await bard.getByRole("button", { name: "Roll initiative" }).click();
    const dialog = bard.locator("dialog[open]");
    await dialog
      .getByRole("spinbutton")
      .or(dialog.getByRole("textbox"))
      .first()
      .fill(String(BARD_D20));
    await dialog.getByRole("button", { name: "Confirm" }).click();
    // The roll's toast says the total: the d20 plus the sheet's bonus.
    const toast = bard
      .locator("[role=status]")
      .filter({ hasText: /Initiative \d+: you're in the fight/ })
      .first();
    await expect(toast).toBeVisible();
    bardInitiative = Number((await toast.innerText()).match(/Initiative (\d+):/)?.[1]);
    expect(bardInitiative, "the total is the d20 and a bonus").toBeGreaterThanOrEqual(
      BARD_D20 - 5
    );
    // The DM sees the fight Bard's roll started, with Paladin still to roll.
    await expect(roundTitle(dm, 1)).toBeVisible({ timeout: 30_000 });
    await dm.getByRole("button", { name: "Roll for the missing" }).click();
    await expect(dm.getByRole("button", { name: "Roll for the missing" })).toHaveCount(0);
  });

  await test.step(`round 1: Paladin hits with the ${PALADIN_WEAPON} (${String(FIGHT_HIT)} damage)`, async () => {
    await openSheet(paladin, SANDBOX_USERS.paladin.characterId);
    await actionRow(paladin, PALADIN_WEAPON)
      .getByRole("button", { name: /^Attack:/ })
      .click();
    await answerPrompts(paladin);
    await markHit(paladin, FIGHT_HIT);
  });

  await test.step("the DM passes the turns into round 2", async () => {
    for (let pass = 0; pass < 4; pass++) {
      if (await roundTitle(dm, 2).isVisible()) break;
      const next = dm.getByRole("button", { name: "Next turn" });
      await next.click();
      await dm.waitForTimeout(1_500);
    }
    await expect(roundTitle(dm, 2)).toBeVisible({ timeout: 15_000 });
  });

  await test.step(`round 2: Bard misses with the ${BARD_WEAPON}; the DM ends the fight`, async () => {
    await openSheet(bard, SANDBOX_USERS.bard.characterId);
    await expect(
      bard.getByText(/round 2/i).first(),
      "Bard's sheet is in round 2"
    ).toBeVisible({
      timeout: 30_000,
    });
    await attack(bard, BARD_WEAPON);
    await markMiss(bard);
    await openFightTab(dm);
    await dm.getByRole("button", { name: "End fight" }).click();
    await expect(dm.getByText(/No fight running/i)).toBeVisible();
  });

  await test.step(`a solo fight: Paladin starts it, Bard hits once (${String(SOLO_HIT)}), Paladin ends it`, async () => {
    await openSheet(paladin, SANDBOX_USERS.paladin.characterId);
    await paladin.getByRole("button", { name: "Start combat" }).click();
    await expect(paladin.getByRole("button", { name: "End fight" })).toBeVisible();
    await openSheet(bard, SANDBOX_USERS.bard.characterId);
    await attack(bard, BARD_WEAPON);
    await markHit(bard, SOLO_HIT);
    await paladin.getByRole("button", { name: "End fight" }).click();
    await paladin
      .locator("dialog[open]")
      .getByRole("button", { name: "End fight" })
      .click();
    await expect(paladin.getByRole("button", { name: "Start combat" })).toBeVisible();
  });

  await test.step("a forgotten fight: the DM rolls for everyone and nobody ends it", async () => {
    await openFightTab(dm);
    await dm.getByRole("button", { name: "Roll for the missing" }).click();
    await expect(roundTitle(dm, 1)).toBeVisible({ timeout: 30_000 });
    // Paladin is done for the evening.
    await expectNoCrash(paladin);
    await paladin.context().close();
  });

  await test.step(`an hour later, Bard spends a ${RESOURCE} die: the line leaves the fight`, async () => {
    await bard.clock.setFixedTime(new Date(Date.now() + 61 * 60_000));
    await openSheet(bard, SANDBOX_USERS.bard.characterId);
    const before = await usesLeft(bard);
    await resourceButton(bard).click();
    await expect.poll(() => usesLeft(bard), { timeout: 15_000 }).toBe(before - 1);
    await expectNoCrash(bard);
  });

  const journal: ExpectedSection[] = [
    { heading: blockHeading("Exploration", false), lines: savesLines() },
    // #1155: a level-up outside a fight is its own «Progress» block.
    { heading: blockHeading("Progress", false), lines: [levelUpLine()] },
    {
      // Started, so never «(inferred)»; ended, so a time span (#1142).
      heading: blockHeading("Fight · 2 rounds", true),
      lines: [
        ownInitiative(BARD_NAME, bardInitiative),
        dmInitiative(PALADIN_NAME),
        ...fightBlows(),
      ],
    },
    // #1155: the solo fight, worked out from one blow, says so.
    { heading: blockHeading("Fight (inferred)", true), lines: soloLines() },
    {
      // Never ended: its start time alone.
      heading: blockHeading("Fight · 1 round", false),
      lines: [dmInitiative(BARD_NAME), dmInitiative(PALADIN_NAME)],
      unordered: true,
    },
    { heading: blockHeading("Exploration", false), lines: [spendLine()] },
  ];

  await test.step("the DM's Journal: every block of the evening, in play order", async () => {
    await expect(async () => {
      await dm.goto(`/campaigns/${SANDBOX_CAMPAIGN}`);
      await dm.getByRole("tab", { name: "Journal" }).click();
      await expect(dm.locator("section.f-tl-block").first()).toBeVisible({
        timeout: 30_000,
      });
      expectReport(await journalBlocks(dm), journal);
    }).toPass({ timeout: 120_000, intervals: [2_000, 5_000, 10_000] });
    expectNothingDangling(await journalBlocks(dm));
  });

  await test.step("the copied report: three encounters, only the solo one inferred", async () => {
    await dm.getByRole("button", { name: "Copy", exact: true }).first().click();
    let markdown = "";
    await expect
      .poll(
        async () => {
          markdown = await dm.evaluate(() => navigator.clipboard.readText());
          return markdown;
        },
        { message: "the report reaches the clipboard", timeout: 15_000 }
      )
      .toMatch(/^## /m);
    const sections = markdownSections(markdown);
    expectReport(sections, [
      { heading: "Outside combat", lines: [...savesLines(), levelUpLine()] },
      {
        heading: "Encounter 1",
        lines: [
          ownInitiative(BARD_NAME, bardInitiative),
          dmInitiative(PALADIN_NAME),
          ...fightBlows(),
        ],
        rounds: ["Round 1", "Round 2"],
      },
      { heading: "Encounter 2 (inferred)", lines: soloLines() },
      {
        heading: "Encounter 3",
        lines: [dmInitiative(BARD_NAME), dmInitiative(PALADIN_NAME)],
        unordered: true,
      },
      { heading: "Outside combat", lines: [spendLine()] },
    ]);
    expectNothingDangling(sections);
  });

  await test.step("the table tidies up: the DM ends the forgotten fight", async () => {
    await endFight(dm);
  });

  for (const page of [dm, bard]) await expectNoCrash(page);
  expect.soft(errors.flat()).toEqual([]);
});
