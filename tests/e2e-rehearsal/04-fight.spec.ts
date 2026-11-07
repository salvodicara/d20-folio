/**
 * Rehearsal 4 — a campaign fight with the DM. Three people, each in their own browser
 * with their own account: the DM on the campaign page, Catalion (Lore Bard) and
 * Mandorlino (Paladin 5) on their sheets. Initiative, Bless on an ally, Warding Bond,
 * a hit the DM calls landing through the bond, Cutting Words as a reaction, the end
 * of the fight; Warding Bond (1 hour, no Concentration) outlives it.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  actionRow,
  expectNoCrash,
  openFightTab,
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

/**
 * Cast a spell from the Play screen on the named creatures. The cast dialog asks in
 * steps (the slot, when there is a choice, then the targets): answer what each step
 * shows, then press Cast, until the dialog closes.
 */
async function cast(page: Page, spell: string, targets: string[]): Promise<void> {
  await actionRow(page, spell).getByRole("button").click();
  const dialog = page
    .locator("dialog[open]")
    .filter({ hasText: new RegExp(`Cast ${spell}`, "i") });
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
  // and the effect on the target are what count; the toast is checked softly.
  await expect
    .soft(
      page
        .locator("[role=status]")
        .filter({ hasText: new RegExp(`${spell} used`) })
        .first()
    )
    .toBeVisible({ timeout: 3_000 });
}

/** Whether the sheet's Conditions panel lists an effect by name (opens and closes it). */
async function showsEffect(page: Page, name: string): Promise<boolean> {
  await page
    .getByRole("button", { name: /Conditions/ })
    .first()
    .click();
  const panel = page
    .getByRole("dialog")
    .or(page.locator("[aria-label='Conditions']"))
    .last();
  const found = await panel
    .getByText(name)
    .first()
    .isVisible({ timeout: 10_000 })
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
  const dm = await seat(browser);
  const bard = await seat(browser, SANDBOX_USERS.catalion.email);
  const paladin = await seat(browser, SANDBOX_USERS.mandorlino.email);

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
    if (await roll.isVisible()) {
      await roll.click();
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
      [bard, SANDBOX_USERS.catalion.characterId],
      [paladin, SANDBOX_USERS.mandorlino.characterId],
    ] as const) {
      await page.goto(`/characters/${id}`);
      await expect
        .soft(page.getByText(/Initiative · round 1/i).first())
        .toBeVisible({ timeout: 60_000 });
    }
  });

  await test.step("Mandorlino casts Bless on Catalion; Catalion's sheet shows it", async () => {
    await cast(paladin, "Bless", ["Catalion di Sancaldo"]);
    expect
      .soft(await showsEffect(bard, "Bless"), "Catalion's sheet lists Bless")
      .toBe(true);
  });

  await test.step("Mandorlino casts Warding Bond on Catalion", async () => {
    await cast(paladin, "Warding Bond", ["Catalion di Sancaldo"]);
    expect
      .soft(
        await showsEffect(bard, "Warding Bond"),
        "Catalion's sheet lists Warding Bond"
      )
      .toBe(true);
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
    const pcRow = dm.locator(".f-split").getByText("Catalion di Sancaldo").first();
    await expect
      .soft(
        dm
          .locator(".f-split")
          .filter({ has: pcRow })
          .getByRole("button", { name: /damage|danni/i })
          .first(),
        "the DM can damage a PC from the fight"
      )
      .toBeVisible({ timeout: 5_000 });
  });

  await test.step("a 10-damage hit the DM calls on Catalion lands through the bond", async () => {
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
    await settles(
      () => currentHp(bard),
      bardBefore - 5,
      "Catalion takes half (Resistance)"
    );
    await settles(
      () => currentHp(paladin),
      paladinBefore - 5,
      "Mandorlino takes the same 5"
    );
  });

  await test.step("Catalion answers an attack with Cutting Words (a Bardic Inspiration die)", async () => {
    const uses = bard.getByRole("button", { name: /Bardic Inspiration: \d+ of \d+/ });
    const left = async () =>
      Number((await uses.getAttribute("aria-label"))?.match(/(\d+) of/)?.[1]);
    const before = await left();
    await actionRow(bard, "Cutting Words").getByRole("button", { name: "React" }).click();
    const dialog = bard.locator("dialog[open]");
    if (await dialog.isVisible()) await dialog.getByRole("button").last().click();
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
