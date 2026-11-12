/**
 * Rehearsal 4 — a campaign fight with the DM. Three people, each in their own browser
 * with their own account: the DM on the campaign page, Bard (Lore Bard) and
 * Paladin (Paladin 5) on their sheets. Warding Bond cast before the fight, initiative,
 * Bless on an ally, a hit the DM calls landing through the bond, Cutting Words as a
 * reaction, the end of the fight; Warding Bond (1 hour, no Concentration) outlives it.
 */
import { expect, type Browser, type Page } from "@playwright/test";
import {
  BARD_NAME,
  BARD_FIRST,
  actionRow,
  expectNoCrash,
  openFightTab,
  reseedHero,
  SANDBOX_USERS,
  signInAs,
  spaced,
  test,
  watchErrors,
} from "./helpers";

const errors: string[][] = [];

async function seat(browser: Browser, email?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  errors.push(watchErrors(page));
  if (email) await signInAs(page, email);
  return page;
}

/**
 * Cast a spell from the Play screen on the named creatures. The cast dialog asks in
 * steps (the slot, when there is a choice, then the targets): answer what each step
 * shows, then press Cast, until the dialog closes.
 */
async function cast(page: Page, spell: string, targets: string[]): Promise<void> {
  await actionRow(page, spell).getByRole("button").click();
  const dialog = page
    .locator("dialog[open]")
    .filter({ hasText: new RegExp(`Cast\\s${spaced(spell)}`, "i") });
  await expect(dialog).toBeVisible();
  for (let step = 0; step < 4 && (await dialog.count()) > 0; step++) {
    const chips = dialog.locator(".f-chips button");
    if ((await chips.count()) > 0) {
      for (const target of targets) {
        // Finding (rehearsal 2026-11-06): in a fresh session an ally's chip can render
        // with no name. Recorded softly; the ally is then picked as the non-self chip.
        const named = dialog.getByRole("button", { name: target });
        expect
          .soft(await named.count(), `the "${target}" chip shows its name`)
          .toBeGreaterThan(0);
        const pick =
          (await named.count()) > 0
            ? named.first()
            : chips.filter({ hasNotText: /^Me / }).first();
        if ((await pick.getAttribute("aria-pressed")) !== "true") await pick.click();
      }
    }
    await dialog.getByRole("button", { name: /^Cast$/ }).click();
    await page.waitForTimeout(500);
  }
  await expect(dialog).toHaveCount(0);
  // The confirmation toast can be gone by the time a slow runner looks: the slot spent
  // and the effect on the target are what count; the toast is checked softly. A spell
  // with a costly component shows that note in the same toast slot instead.
  await expect
    .soft(
      page
        .locator("[role=status]")
        .filter({ hasText: new RegExp(`${spaced(spell)}\\s(used|needs)`) })
        .first()
    )
    .toBeVisible({ timeout: 3_000 });
}

/** Whether the sheet's Effects panel lists an effect by name (opens and closes it).
 *  What an ally cast on the character sits under «Effects» (#903). */
async function showsEffect(page: Page, name: string): Promise<boolean> {
  await page
    .getByRole("button", { name: /Effects/ })
    .first()
    .click();
  const panel = page
    .getByRole("dialog")
    .or(page.locator("[aria-label='Effects']"))
    .last();
  // `isVisible` never waits (its timeout is ignored): wait for the effect to arrive
  // from the other player's sheet, up to 10 s, before saying it is not there.
  const found = await panel
    .getByText(name)
    .first()
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  await page.keyboard.press("Escape");
  return found;
}

/** Wait up to 15 s for a value to reach the expected one, then check it softly. */
async function settles<T>(
  read: () => Promise<T>,
  expected: T,
  what: string
): Promise<void> {
  let value = await read();
  for (let i = 0; i < 30 && value !== expected; i++) {
    await new Promise((r) => setTimeout(r, 500));
    value = await read();
  }
  expect.soft(value, what).toBe(expected);
}

/** The HP the Play screen's hit-point block shows ("24 / 24" → 24). */
async function currentHp(page: Page): Promise<number> {
  const text = await page
    .getByRole("button", { name: /Damage and healing: \d+ \/ \d+/ })
    .getAttribute("aria-label");
  return Number(text?.match(/(\d+) \//)?.[1]);
}

test("a campaign fight, from initiative to the end, with the DM and two players", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  // Bard as the seed made him; Paladin comes from 03 (level 5, Warding Bond).
  reseedHero(SANDBOX_USERS.bard);
  const dm = await seat(browser);
  const bard = await seat(browser, SANDBOX_USERS.bard.email);
  const paladin = await seat(browser, SANDBOX_USERS.paladin.email);

  await test.step("before the fight, Paladin casts Warding Bond on Bard", async () => {
    // Warding Bond lasts an hour, so players cast it before the fight. In a fight it
    // would share the Paladin's turn with Bless, and a turn holds one Magic action.
    await paladin.goto(`/characters/${SANDBOX_USERS.paladin.characterId}`);
    await bard.goto(`/characters/${SANDBOX_USERS.bard.characterId}`);
    await cast(paladin, "Warding Bond", [BARD_NAME]);
    expect
      .soft(await showsEffect(bard, "Warding Bond"), "Bard's sheet lists Warding Bond")
      .toBe(true);
  });

  await test.step("the DM can start the fight (Roll for the missing)", async () => {
    await openFightTab(dm);
    const end = dm.getByRole("button", { name: "End fight" });
    if (await end.isVisible()) await end.click(); // a leftover from a previous run
    const missing = dm.getByRole("button", { name: "Roll for the missing" });
    await expect.soft(missing, "the DM's button to start a fight").toBeVisible();
    if (await missing.isVisible()) await missing.click();
  });

  await test.step("a player rolls initiative (and starts the fight if the DM could not)", async () => {
    await openFightTab(bard);
    const roll = bard.getByRole("button", { name: "Roll initiative" });
    // The DM's «Roll for the missing» may roll for Bard first: the button then
    // goes away between the look and the click, and there is nothing left to roll.
    const opened =
      (await roll.isVisible()) &&
      (await roll.click({ timeout: 5_000 }).then(
        () => true,
        () => false
      ));
    if (opened) {
      const dialog = bard.locator("dialog[open]");
      await dialog
        .getByRole("textbox")
        .or(dialog.getByRole("spinbutton"))
        .first()
        .fill("15");
      await dialog.getByRole("button", { name: "Confirm" }).click();
    }
    await openFightTab(dm);
    await expect(dm.getByText(/INITIATIVE · ROUND 1/i)).toBeVisible();
  });

  await test.step("each player's sheet shows the fight's order", async () => {
    for (const [page, id] of [
      [bard, SANDBOX_USERS.bard.characterId],
      [paladin, SANDBOX_USERS.paladin.characterId],
    ] as const) {
      await page.goto(`/characters/${id}`);
      await expect
        .soft(page.getByText(/Initiative · round 1/i).first())
        .toBeVisible({ timeout: 60_000 });
    }
  });

  await test.step("Paladin casts Bless on Bard; Bard's sheet shows it", async () => {
    await cast(paladin, "Bless", [BARD_NAME]);
    expect.soft(await showsEffect(bard, "Bless"), "Bard's sheet lists Bless").toBe(true);
  });

  await test.step("the DM has the tools to run the fight (finding 2, open)", async () => {
    // Until the new campaign page carries DM tools, the fight holds PCs only and the
    // DM's hit is typed by the player on their own sheet (the step below). These two
    // soft checks keep the gap on every run's list; their names follow the UI that lands.
    await openFightTab(dm);
    await expect
      .soft(
        dm
          .getByRole("button", { name: /add (a )?monster|aggiungi (un )?mostro/i })
          .first(),
        "the DM can add a monster to the fight"
      )
      .toBeVisible({ timeout: 5_000 });
    await expect
      .soft(
        dm
          .getByRole("button", { name: new RegExp(`^Damage and healing: ${BARD_FIRST}`) })
          .first(),
        "the DM can damage a PC from the fight"
      )
      .toBeVisible({ timeout: 5_000 });
  });

  await test.step("a 10-damage hit the DM calls on Bard lands through the bond", async () => {
    const bardBefore = await currentHp(bard);
    const paladinBefore = await currentHp(paladin);
    await bard.getByRole("button", { name: "Damage", exact: true }).click();
    const tray = bard.locator("dialog[open]");
    await tray.getByRole("spinbutton").or(tray.getByRole("textbox")).first().fill("10");
    await tray
      .getByRole("button", { name: /^(Apply|Damage|Take)/ })
      .first()
      .click();
    // Warding Bond: Resistance to all damage halves the 10; the caster takes the same 5.
    await settles(() => currentHp(bard), bardBefore - 5, "Bard takes half (Resistance)");
    await settles(
      () => currentHp(paladin),
      paladinBefore - 5,
      "Paladin takes the same 5"
    );
  });

  await test.step("Bard answers an attack with Cutting Words (a Bardic Inspiration die)", async () => {
    const uses = bard.getByRole("button", { name: /Bardic Inspiration: \d+ of \d+/ });
    const left = async () =>
      Number((await uses.getAttribute("aria-label"))?.match(/(\d+) of/)?.[1]);
    const before = await left();
    await actionRow(bard, "Cutting Words").getByRole("button", { name: "React" }).click();
    // Cutting Words asks on whom and which roll (#852): an enemy, the attack roll, then
    // the Reaction. Without a fight to target it spends straight away.
    const dialog = bard.getByRole("dialog", { name: "Cutting Words" });
    const asks = await dialog
      .waitFor({ timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (asks) {
      const enemy = dialog.locator('.cl-target[data-side="enemy"]').first();
      if (await enemy.isVisible()) await enemy.click();
      await dialog.getByRole("button", { name: "Attack roll" }).click();
      await dialog.getByRole("button", { name: "Use Reaction" }).click();
    }
    await settles(left, before - 1, "Cutting Words spends one Bardic Inspiration die");
  });

  await test.step("the DM ends the fight; Warding Bond outlives it", async () => {
    await openFightTab(dm);
    await dm.getByRole("button", { name: "End fight" }).click();
    await expect(dm.getByText(/No fight running/i)).toBeVisible();
    await bard.reload();
    await expect(bard.locator(".f-char")).toBeVisible({ timeout: 60_000 });
    expect
      .soft(await showsEffect(bard, "Warding Bond"), "Warding Bond outlives the fight")
      .toBe(true);
  });

  await test.step("after the fight the DM can start a new one", async () => {
    await expect
      .soft(dm.getByRole("button", { name: "Roll for the missing" }))
      .toBeVisible();
  });

  for (const page of [dm, bard, paladin]) await expectNoCrash(page);
  expect.soft(errors.flat()).toEqual([]);
});
