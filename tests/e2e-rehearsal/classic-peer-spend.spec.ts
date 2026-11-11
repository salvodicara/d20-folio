/**
 * Rehearsal, classic UI: a hit from the DM's device spends something on a player's
 * sheet, on the real rules (`VITE_PEER_SPENDS_LEDGER`, docs/architecture/
 * 2026-11-cross-device-hits.md). 2024 Rogue Uncanny Dodge: «When an attacker that you
 * can see hits you with an attack roll, you can take a Reaction to halve the attack's
 * damage against you». The player claimed it (the state is lit) and has their sheet
 * open, as at a real table. The DM's 10-damage hit lands as 5 and spends the dodge;
 * the player's sheet folds that spend, and the hit must still be on the server after
 * the fold; the next hit is not halved.
 *
 * Runs after the classic journey: it rewrites Catalion's sheet as a Rogue 5.
 */
import { expect, type Page } from "@playwright/test";
import {
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

const DODGE = "rogue-uncanny-dodge";
const CHARACTER = `http://127.0.0.1:8080/v1/projects/demo-d20folio/databases/(default)/documents/users/${PLAYER_BARD}/characters/${SANDBOX_USERS.catalion.characterId}`;
const OWNER = { headers: { Authorization: "Bearer owner" } };

/** The spends ledger as raw REST JSON (empty when the document does not exist). */
async function ledger(): Promise<string> {
  const response = await fetch(`${CHARACTER}/combat/spends`, OWNER);
  return response.ok ? await response.text() : "";
}

/** The Hit Points the server holds for Catalion (combat/state). */
async function serverHp(): Promise<number> {
  const body = (await (await fetch(`${CHARACTER}/combat/state`, OWNER)).json()) as {
    fields?: {
      hp?: { mapValue?: { fields?: { current?: { integerValue?: string } } } };
    };
  };
  return Number(body.fields?.hp?.mapValue?.fields?.current?.integerValue ?? Number.NaN);
}

const hpChip = (page: Page) =>
  page
    .locator(`li[data-combatant-id="pc-${PLAYER_BARD}"]`)
    .getByRole("button", { name: /hit points: open damage/ });

async function hit(page: Page, amount: number): Promise<void> {
  await hpChip(page).click();
  const dialog = page.getByRole("dialog", { name: "Hit Points" });
  await dialog
    .getByRole("spinbutton", { name: /Amount of damage, healing/ })
    .fill(String(amount));
  await dialog.getByRole("button", { name: "Damage", exact: true }).click();
}

/** The server value, held for a few seconds (a later overwrite would show). */
async function settledServerHp(): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  return serverHp();
}

test("classic UI: the DM's hit spends a claimed Uncanny Dodge, and the player's open sheet keeps the hit", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  reseedHero(SANDBOX_USERS.catalion, {
    fixture: "chiaviddu-rogue.json",
    level: 5,
    active: [DODGE],
  });
  const dm = await (await browser.newContext()).newPage();
  const errors = watchErrors(dm);
  const owner = await (await browser.newContext()).newPage();
  errors.push(...watchErrors(owner));

  await test.step("Catalion's player has their sheet open", async () => {
    await signInAs(owner, SANDBOX_USERS.catalion.email);
    await owner.goto(`/characters/${SANDBOX_USERS.catalion.characterId}`);
    await expect(owner.getByRole("button", { name: "Rest", exact: true })).toBeVisible({
      timeout: 60_000,
    });
  });

  await test.step("the DM starts an encounter and rolls each hero", async () => {
    await dm.goto(`/campaigns/${SANDBOX_CAMPAIGN}`);
    await dm.getByRole("tab", { name: "Live" }).click();
    const end = dm.getByRole("button", { name: "End encounter" });
    if (await end.isVisible()) {
      await end.click();
      await dm.getByRole("dialog").getByRole("button", { name: "Skip" }).click();
    }
    await dm.getByRole("button", { name: "Run encounter" }).click();
    await rollEachHero(dm);
    await dm
      .getByRole("button", { name: /^Begin (turns|with)/ })
      .first()
      .click();
  });

  await test.step("a 10-damage hit lands as 5, and stays after the sheet folds the dodge", async () => {
    const before = await serverHp();
    await hit(dm, 10);
    await expect
      .poll(serverHp, { message: "Uncanny Dodge halves the hit" })
      .toBe(before - 5);
    await expect
      .poll(ledger, {
        message: "the player's sheet folds the spent dodge",
        timeout: 30_000,
      })
      .not.toContain(DODGE);
    expect(await settledServerHp(), "the fold keeps the hit").toBe(before - 5);
  });

  await test.step("the next hit is not halved (nothing is used twice)", async () => {
    const before = await serverHp();
    await hit(dm, 4);
    await expect.poll(serverHp).toBe(before - 4);
    expect(await settledServerHp(), "the hit stays").toBe(before - 4);
  });

  await test.step("the DM ends the encounter", async () => {
    await dm.getByRole("button", { name: "End encounter" }).click();
    await dm.getByRole("dialog").getByRole("button", { name: "Skip" }).click();
  });

  await expectNoCrash(dm);
  await expectNoCrash(owner);
  expect.soft(errors).toEqual([]);
});
