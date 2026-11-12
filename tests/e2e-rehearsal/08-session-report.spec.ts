/**
 * Rehearsal 8 — the session report, end to end, on the new UI (coordinator's request,
 * 2026-11-12). Today's report features (a fight worked out from the blows, the attack's
 * result, the upcast slot, a hand spend, what a rest gave back) are unit-tested, but
 * nothing played them as a table does. Here two players, each signed in on their own
 * browser, play a short evening in which nobody starts a campaign fight
 * (`session-report.ts` holds the script and the lines it must leave); then the DM opens
 * the campaign's Journal and reads the automatic report: one fight, inferred, holding
 * the blows in play order, the rest after it, and nothing left dangling. The same
 * evening on the classic UI is `classic-session-report.spec.ts`.
 *
 * The evening starts a new sitting of the session log (`startNewSitting`), so the
 * report holds only this spec's lines, whatever the earlier rehearsals recorded today.
 */
import {
  expect,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import {
  actionRow,
  expectNoCrash,
  openFightTab,
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
  BARD_WEAPON,
  DAMAGE_TAKEN,
  expectEvening,
  expectNothingDangling,
  HIT_DAMAGE,
  HIT_DIE_HEAL,
  HIT_DIE_ROLL,
  INFERRED_HEADING,
  markdownSections,
  markHit,
  PALADIN_WEAPON,
  plain,
  RESOURCE,
  restLine,
  resultChips,
  UPCAST_SLOT,
  UPCAST_SPELL,
  type ReportSection,
} from "./session-report";
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
 * given and offered), then on whom (no one: outside a fight there is no foe to pick),
 * until no dialog is open. A use that asks nothing passes straight through.
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
    // The step closes, or the next one replaces it.
    await dialog.waitFor({ state: "detached", timeout: 2_000 }).catch(() => undefined);
  }
  await expect(dialog).toHaveCount(0);
}

/** The HP the Play screen's hit-point block shows ("24 / 24" → 24). */
async function currentHp(page: Page): Promise<number> {
  const text = await page
    .getByRole("button", { name: /Damage and healing: \d+ \/ \d+/ })
    .getAttribute("aria-label");
  return Number(text?.match(/(\d+) \//)?.[1]);
}

/** The Bardic Inspiration uses left, from its tap-to-spend button on the left. */
function resourceButton(page: Page) {
  return page.getByRole("button", {
    name: new RegExp(`^${spaced(RESOURCE)}: \\d+ of \\d+`),
  });
}
async function usesLeft(page: Page): Promise<number> {
  const name = await resourceButton(page).getAttribute("aria-label");
  return Number(name?.match(/: (\d+) of/)?.[1]);
}

/** The Journal's automatic report as the DM sees it: each block's heading and lines. */
async function journalBlocks(dm: Page): Promise<ReportSection[]> {
  const raw = await dm.locator("section.f-tl-block").evaluateAll((blocks) =>
    blocks.map((block) => ({
      heading: block.querySelector("h4")?.textContent ?? "",
      lines: [...block.querySelectorAll("p.f-tl")].map((p) => p.textContent),
    }))
  );
  return raw.map((b) => ({ heading: plain(b.heading), lines: b.lines.map(plain) }));
}

test("an evening with no fight started: the DM's Journal tells it as one inferred fight and a rest", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  reseedHero(SANDBOX_USERS.bard);
  reseedHero(SANDBOX_USERS.paladin);

  await test.step("no campaign fight is running; the evening starts a new sitting", async () => {
    // A fight an earlier rehearsal left open would take every line into it.
    const dm = await seat(browser);
    await openFightTab(dm);
    const end = dm.getByRole("button", { name: "End fight" });
    const idle = dm.getByText(/No fight running/i);
    await expect(end.or(idle).first()).toBeVisible({ timeout: 60_000 });
    if (await end.isVisible()) await end.click();
    await expect(idle).toBeVisible();
    // The end must be on the server, not only on this page, before it closes.
    await openFightTab(dm);
    await expect(idle).toBeVisible({ timeout: 30_000 });
    await dm.context().close();
    await startNewSitting();
  });

  const bard = await seat(browser, SANDBOX_USERS.bard.email);
  const paladin = await seat(browser, SANDBOX_USERS.paladin.email);
  await openSheet(bard, SANDBOX_USERS.bard.characterId);
  await openSheet(paladin, SANDBOX_USERS.paladin.characterId);

  await test.step(`Paladin attacks with the ${PALADIN_WEAPON} and marks the hit and its damage`, async () => {
    await actionRow(paladin, PALADIN_WEAPON)
      .getByRole("button", { name: /^Attack:/ })
      .click();
    await answerPrompts(paladin);
    await markHit(paladin, HIT_DAMAGE);
  });

  await test.step(`Bard attacks with the ${BARD_WEAPON} and ignores the result chips`, async () => {
    const row = bard
      .locator(".f-act")
      .filter({
        has: bard.locator(".f-row-t", { hasText: new RegExp(`^${BARD_WEAPON}$`) }),
      })
      .first();
    await row.getByRole("button", { name: /^Attack:/ }).click();
    await answerPrompts(bard);
    await expect(resultChips(bard), "the attack offers its result").toBeVisible();
  });

  await test.step(`Bard casts ${UPCAST_SPELL} from a level ${String(UPCAST_SLOT)} slot (the chips go)`, async () => {
    await actionRow(bard, UPCAST_SPELL)
      .getByRole("button", { name: /^Cast:/ })
      .click();
    await expect(
      bard.locator("dialog[open]").filter({
        hasText: new RegExp(`Cast\\s${spaced(UPCAST_SPELL)}`, "i"),
      })
    ).toBeVisible();
    await answerPrompts(bard, UPCAST_SLOT);
    await expect
      .soft(resultChips(bard), "another action retires the unanswered chips")
      .toHaveCount(0);
  });

  await test.step(`Bard spends a ${RESOURCE} die by hand`, async () => {
    const before = await usesLeft(bard);
    await resourceButton(bard).click();
    await expect.poll(() => usesLeft(bard), { timeout: 15_000 }).toBe(before - 1);
  });

  await test.step(`Bard takes ${String(DAMAGE_TAKEN)} damage from the sheet's Damage button`, async () => {
    const before = await currentHp(bard);
    await bard.getByRole("button", { name: "Damage", exact: true }).click();
    const tray = bard.locator("dialog[open]");
    await tray
      .getByRole("spinbutton")
      .or(tray.getByRole("textbox"))
      .first()
      .fill(String(DAMAGE_TAKEN));
    await tray
      .getByRole("button", { name: /^(Apply|Damage|Take)/ })
      .first()
      .click();
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
    await bard.getByRole("button", { name: "Short rest" }).first().click();
    const dialog = bard.locator("dialog[open]");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "d8" }).first().click();
    await dialog.getByRole("textbox").fill(String(HIT_DIE_ROLL));
    await dialog.getByRole("button", { name: "Complete rest" }).click();
    const summary = bard
      .locator("dialog[open]")
      .filter({ hasText: /Short\sRest\sSummary/ });
    await expect(summary).toBeVisible();
    await summary.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);
    await expect
      .soft(bard.getByRole("button", { name: /Damage and healing: \d+ \/ \d+/ }))
      .toHaveAttribute("aria-label", new RegExp(`: ${String(before + HIT_DIE_HEAL)} /`));
    await expectNoCrash(bard);
  });

  const dm = await seat(browser, undefined, {
    permissions: ["clipboard-read", "clipboard-write"],
  });

  await test.step("the DM's Journal: one fight (Fight, no foes) with the blows, then the rest", async () => {
    // The players' lines reach the server on their own time: read again until they do.
    await expect(async () => {
      await dm.goto(`/campaigns/${SANDBOX_CAMPAIGN}`);
      await dm.getByRole("tab", { name: "Journal" }).click();
      await expect(dm.locator("section.f-tl-block").first()).toBeVisible({
        timeout: 30_000,
      });
      const blocks = await journalBlocks(dm);
      expectEvening(blocks, { isFight: (heading) => /^Fight\b/.test(heading) });
      // The rest is its own block, its line first.
      expect(blocks.find((b) => /^Rest\b/.test(b.heading))?.lines[0]).toBe(restLine());
    }).toPass({ timeout: 120_000, intervals: [2_000, 5_000, 10_000] });
    expectNothingDangling(await journalBlocks(dm));
  });

  await test.step("the copied report names the fight as inferred", async () => {
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
    expectEvening(sections, {
      isFight: (heading) => /^Encounter \d+/.test(heading),
      fightHeading: INFERRED_HEADING,
    });
    expectNothingDangling(sections);
  });

  for (const page of [dm, bard]) await expectNoCrash(page);
  expect.soft(errors.flat()).toEqual([]);
});
