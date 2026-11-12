/**
 * Rehearsal, classic UI: the session report, end to end (coordinator's request,
 * 2026-11-12). The classic sheet is what players use today, so the evening of
 * `08-session-report.spec.ts` is played here on it: two players, each signed in on
 * their own browser, and nobody starts a campaign fight (`session-report.ts` holds the
 * script and the lines it must leave). Then the DM opens the campaign hub's Journal and
 * the evening's automatic report: exactly one fight, «Encounter 1 (inferred)», holding
 * the blows in play order, the rest after it outside the fight, and nothing dangling.
 *
 * The evening starts a new sitting of the session log (`startNewSitting`), so its
 * report holds only this spec's lines, whatever the earlier rehearsals recorded today.
 */
import { expect, type Browser, type Page } from "@playwright/test";
import {
  expectNoCrash,
  reseedHero,
  SANDBOX_CAMPAIGN,
  SANDBOX_USERS,
  signInAs,
  startNewSitting,
  test,
  watchErrors,
} from "./helpers";
import {
  BARD_WEAPON,
  DAMAGE_TAKEN,
  expectEvening,
  expectNothingDangling,
  HIT_DAMAGE,
  HIT_DIE_HEAL,
  HIT_DIE_ROLL,
  INFERRED_HEADING,
  markHit,
  PALADIN_WEAPON,
  plain,
  RESOURCE,
  resultChips,
  UPCAST_SLOT,
  UPCAST_SPELL,
  type ReportSection,
} from "./session-report";
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

/** The optional «On whom?» step: outside a fight there is no foe, so no one. */
async function skipTargets(page: Page): Promise<void> {
  const picker = page.getByRole("dialog", { name: /on whom\?/i });
  if (await visibleWithin(picker, 3_000))
    await picker.getByRole("button", { name: /^Skip/ }).click();
  await expect(picker).toHaveCount(0);
}

/** The sheet's HP control ("15 of 24 hit points: open damage, …" → 15). */
const hpControl = (page: Page) =>
  page.getByRole("button", { name: /hit points: open damage/ }).first();
async function currentHp(page: Page): Promise<number> {
  const name = (await hpControl(page).getAttribute("aria-label")) ?? "";
  return Number(name.match(/^(\d+) of/)?.[1] ?? Number.NaN);
}

/** The evening's report in the hub's Journal: the newest sitting of the day is the
 *  last «Automatic report» of the day's row. Opens it and reads its sections. */
async function journalReport(dm: Page): Promise<ReportSection[]> {
  await dm.goto(`/campaigns/${SANDBOX_CAMPAIGN}`);
  await dm.getByRole("tab", { name: "Journal" }).click();
  const toggle = dm.getByRole("button", { name: /^Automatic report/ }).last();
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const body = dm.locator(".sess-report-body").last();
  await expect(body).toBeVisible();
  const raw = await body.evaluate((root) => {
    const out: Array<{ heading: string; lines: string[] }> = [];
    for (const el of Array.from(root.children)) {
      if (el.tagName === "H4") out.push({ heading: el.textContent, lines: [] });
      else if (el.tagName === "UL") {
        if (out.length === 0) out.push({ heading: "", lines: [] });
        out[out.length - 1]?.lines.push(
          ...Array.from(el.querySelectorAll("li")).map((li) => li.textContent)
        );
      }
    }
    return out;
  });
  return raw.map((s) => ({ heading: plain(s.heading), lines: s.lines.map(plain) }));
}

test("classic UI: an evening with no fight started reads as one inferred fight and a rest", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  reseedHero(SANDBOX_USERS.bard);
  reseedHero(SANDBOX_USERS.paladin);

  await test.step("no encounter is running; the evening starts a new sitting", async () => {
    // An encounter an earlier rehearsal left open would take every line into it.
    const dm = await seat(browser);
    await dm.goto(`/campaigns/${SANDBOX_CAMPAIGN}`);
    await dm.getByRole("tab", { name: "Live" }).click();
    const end = dm.getByRole("button", { name: "End encounter" });
    const run = dm.getByRole("button", { name: "Run encounter" });
    await expect(end.or(run).first()).toBeVisible({ timeout: 60_000 });
    if (await end.isVisible()) {
      await end.click();
      await dm.getByRole("dialog").getByRole("button", { name: "Skip" }).click();
    }
    await expect(run).toBeVisible();
    await dm.reload();
    await expect(run, "the end is on the server").toBeVisible({ timeout: 30_000 });
    await dm.context().close();
    await startNewSitting();
  });

  const bard = await seat(browser, SANDBOX_USERS.bard.email);
  const paladin = await seat(browser, SANDBOX_USERS.paladin.email);
  await openSheet(bard, SANDBOX_USERS.bard.characterId);
  await openSheet(paladin, SANDBOX_USERS.paladin.characterId);

  await test.step(`Paladin attacks with the ${PALADIN_WEAPON} and marks the hit and its damage`, async () => {
    await paladin
      .getByRole("button", { name: new RegExp(`^Attack: ${PALADIN_WEAPON}$`) })
      .first()
      .click();
    await skipTargets(paladin);
    await markHit(paladin, HIT_DAMAGE);
  });

  await test.step(`Bard attacks with the ${BARD_WEAPON} and ignores the result chips`, async () => {
    await bard
      .getByRole("button", { name: new RegExp(`^Attack: ${BARD_WEAPON}$`) })
      .first()
      .click();
    await skipTargets(bard);
    await expect(resultChips(bard), "the attack offers its result").toBeVisible();
  });

  await test.step(`Bard casts ${UPCAST_SPELL} from a level ${String(UPCAST_SLOT)} slot (the chips go)`, async () => {
    await bard
      .getByRole("button", { name: new RegExp(`^Cast: ${UPCAST_SPELL}`) })
      .first()
      .click();
    // The cast-level picker: a tile commits the cast at that level.
    await bard
      .getByRole("button", { name: new RegExp(`^Level ${String(UPCAST_SLOT)} slot`) })
      .click();
    await skipTargets(bard);
    await expect
      .soft(resultChips(bard), "another action retires the unanswered chips")
      .toHaveCount(0);
  });

  await test.step(`Bard spends a ${RESOURCE} die by hand (a pip on the resource rail)`, async () => {
    // A lit pip spends; an empty one restores, under another name.
    const lit = bard.getByRole("button", { name: `Spend ${RESOURCE}`, exact: true });
    const before = await lit.count();
    expect(before, `${RESOURCE} has a use to spend`).toBeGreaterThan(0);
    await lit.first().click();
    await expect(lit).toHaveCount(before - 1);
  });

  await test.step(`Bard takes ${String(DAMAGE_TAKEN)} damage from the sheet's own control`, async () => {
    const before = await currentHp(bard);
    await hpControl(bard).click();
    const dialog = bard.getByRole("dialog", { name: "Hit Points" });
    await dialog
      .getByRole("spinbutton", { name: /Amount of damage, healing/ })
      .fill(String(DAMAGE_TAKEN));
    await dialog.getByRole("button", { name: "Damage", exact: true }).click();
    if (await visibleWithin(dialog, 1_000)) await bard.keyboard.press("Escape");
    await expect
      .poll(() => currentHp(bard), { timeout: 15_000 })
      .toBe(before - DAMAGE_TAKEN);
    // Paladin is done for the evening: an open sheet would catch up with the clock the
    // rest moves, and write that hour into the report after it.
    await expectNoCrash(paladin);
    await paladin.context().close();
  });

  await test.step("Bard takes a Short Rest on one Hit Die", async () => {
    const before = await currentHp(bard);
    await bard.getByRole("button", { name: "Rest", exact: true }).click();
    await bard
      .getByRole("dialog", { name: "Rest" })
      .getByRole("button", { name: /^Short Rest/ })
      .click();
    const dialog = bard
      .getByRole("dialog")
      .filter({ has: bard.getByRole("button", { name: "Complete rest" }) });
    await dialog.getByRole("button", { name: "Use one more Hit Die" }).click();
    await dialog
      .getByRole("spinbutton", { name: "Dice total" })
      .fill(String(HIT_DIE_ROLL));
    await dialog.getByRole("button", { name: "Complete rest" }).click();
    await bard.getByRole("button", { name: "Done" }).click();
    await expect
      .poll(() => currentHp(bard), { timeout: 15_000 })
      .toBe(before + HIT_DIE_HEAL);
    await expectNoCrash(bard);
  });

  const dm = await seat(browser);

  await test.step("the DM's Journal: «Encounter 1 (inferred)» with the blows, then the rest", async () => {
    // The players' lines reach the server on their own time: read again until they do.
    await expect(async () => {
      const sections = await journalReport(dm);
      expectEvening(sections, {
        isFight: (heading) => /^Encounter \d+/.test(heading),
        fightHeading: INFERRED_HEADING,
      });
    }).toPass({ timeout: 120_000, intervals: [2_000, 5_000, 10_000] });
    expectNothingDangling(await journalReport(dm));
  });

  for (const page of [dm, bard]) await expectNoCrash(page);
  expect.soft(errors.flat()).toEqual([]);
});
