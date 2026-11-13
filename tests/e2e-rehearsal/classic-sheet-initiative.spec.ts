/**
 * Rehearsal, classic UI: a member with an attached character rolls initiative from the
 * classic sheet's own initiative chip, on the real emulators and rules, and the DM's
 * encounter shows that hero at the same total, in order once turns begin (coordinator,
 * 2026-11-12: the owner's groups roll from the sheet every session). The classic UI
 * takes a sheet's roll into an encounter the DM runs.
 */
import { expect, type Browser, type Page } from "@playwright/test";
import {
  BARD_NAME,
  expectNoCrash,
  PALADIN_NAME,
  PLAYER_BARD,
  reseedHero,
  SANDBOX_CAMPAIGN,
  SANDBOX_USERS,
  signInAs,
  storedConcentration,
  test,
  watchErrors,
} from "./helpers";

const errors: string[][] = [];
const PLAYER_PALADIN = SANDBOX_USERS.paladin.uid;

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

/** The total an initiative chip reads («Initiative: 18»), or null before a roll. */
async function chipTotal(chip: ReturnType<Page["locator"]>): Promise<number | null> {
  const label = (await chip.getAttribute("aria-label")) ?? "";
  const total = label.match(/^Initiative: (\d+)$/)?.[1];
  return total === undefined ? null : Number(total);
}

/** Roll from the classic sheet's own initiative chip; returns the total it then reads. */
async function rollFromSheet(
  page: Page,
  characterId: string,
  d20: number
): Promise<number> {
  await page.goto(`/characters/${characterId}`);
  const chip = page.locator("button.vital-init").first();
  await expect(chip).toHaveAttribute("aria-label", "Roll initiative", {
    timeout: 60_000,
  });
  await chip.click();
  const input = page.locator("input.init-edit-input");
  await input.fill(String(d20));
  await input.press("Enter");
  await expect
    .poll(() => chipTotal(chip), { message: "the sheet's chip shows the total" })
    .not.toBeNull();
  return (await chipTotal(chip)) ?? Number.NaN;
}

/** A hero's card on the DM's hub, by the character's name (before turns begin the
 *  hub lists party cards, not the turn order's rows). */
const card = (dm: Page, name: string) =>
  dm.locator(".party-card").filter({ hasText: name }).first();

test("classic UI: members roll initiative from their sheets and land in the DM's encounter", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  // Bard holds Concentration (Heroism) while rolling into the fight: the fight's first
  // look must not read Bard's row as 0 HP and drop it (2026-11-13).
  reseedHero(SANDBOX_USERS.bard, {
    state: { concentration: "heroism", concentrationCastLevel: 1 },
  });
  reseedHero(SANDBOX_USERS.paladin);
  const dm = await seat(browser);
  const bard = await seat(browser, SANDBOX_USERS.bard.email);
  const paladin = await seat(browser, SANDBOX_USERS.paladin.email);

  await test.step("the DM runs an encounter", async () => {
    await openLiveTab(dm);
    const end = dm.getByRole("button", { name: "End encounter" });
    if (await end.isVisible()) {
      await end.click();
      await dm.getByRole("dialog").getByRole("button", { name: "Skip" }).click();
    }
    await dm.getByRole("button", { name: "Run encounter" }).click();
    await expect(
      dm.getByRole("button", { name: /^Begin (turns|with)/ }).first()
    ).toBeVisible();
  });

  const bardTotal = await test.step("Bard rolls 15 from the classic sheet", () =>
    rollFromSheet(bard, SANDBOX_USERS.bard.characterId, 15));
  const paladinTotal = await test.step("Paladin rolls 2 from the classic sheet", () =>
    rollFromSheet(paladin, SANDBOX_USERS.paladin.characterId, 2));

  await test.step("the DM's encounter shows each hero at the same total", async () => {
    for (const [name, total] of [
      [BARD_NAME, bardTotal],
      [PALADIN_NAME, paladinTotal],
    ] as const) {
      await expect
        .poll(
          async () =>
            (await card(dm, name).count()) === 0
              ? "no card"
              : ((await card(dm, name)
                  .locator(".vital-init")
                  .first()
                  .getAttribute("aria-label")) ??
                (await card(dm, name)
                  .locator(".vital-init")
                  .first()
                  .getAttribute("title")) ??
                "no label"),
          { message: "the roll reaches the DM's card", timeout: 30_000 }
        )
        .toBe(`Initiative: ${String(total)}`);
    }
  });

  await test.step("Bard still concentrates after rolling into the fight (on the server)", async () => {
    // The drop came on the fight's first look, so the roll above has passed it; check
    // over a few seconds that nothing writes it away later either.
    for (let read = 0; read < 3; read++) {
      expect(
        await storedConcentration(PLAYER_BARD, SANDBOX_USERS.bard.characterId),
        "Bard's Concentration"
      ).toBe("heroism");
      await bard.waitForTimeout(2_000);
    }
  });

  await test.step("turns begin in initiative order", async () => {
    await dm
      .getByRole("button", { name: /^Begin (turns|with)/ })
      .first()
      .click();
    await expect(dm.getByRole("button", { name: "Next turn" })).toBeVisible();
    const ids = await dm
      .locator("li[data-combatant-id^='pc-']")
      .evaluateAll((items) => items.map((li) => li.getAttribute("data-combatant-id")));
    const bardFirst = bardTotal >= paladinTotal;
    expect(ids.indexOf(`pc-${PLAYER_BARD}`) < ids.indexOf(`pc-${PLAYER_PALADIN}`)).toBe(
      bardFirst
    );
  });

  await test.step("the DM ends the encounter", async () => {
    await openLiveTab(dm);
    await dm.getByRole("button", { name: "End encounter" }).click();
    await dm.getByRole("dialog").getByRole("button", { name: "Skip" }).click();
    await expect(dm.getByRole("button", { name: "Run encounter" })).toBeVisible();
  });

  for (const page of [dm, bard, paladin]) await expectNoCrash(page);
  expect.soft(errors.flat()).toEqual([]);
});
