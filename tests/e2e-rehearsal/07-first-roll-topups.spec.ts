/**
 * Rehearsal 7 — the new sheet's «Roll initiative» is the fight's first roll, so what
 * tops up on it comes back (#927). 2024 Bard Superior Inspiration (level 18): «When you
 * roll Initiative, you regain expended uses of Bardic Inspiration until you have two if
 * you have fewer than that». The sandbox Bard is rewritten at level 18 with every use
 * spent (the emulators only), then rolls from its own sheet with no fight running.
 */
import { expect } from "@playwright/test";
import {
  expectNoCrash,
  openFightTab,
  PLAYER_BARD,
  reseedHero,
  SANDBOX_USERS,
  signInAs,
  test,
  watchErrors,
} from "./helpers";

const STATE = `http://127.0.0.1:8080/v1/projects/demo-d20folio/databases/(default)/documents/users/${PLAYER_BARD}/characters/${SANDBOX_USERS.bard.characterId}/combat/state`;
const TRACKER = "bard-bardic-inspiration";
/** Bard's Charisma 17 gives 3 uses. */
const USES = 3;

type Fields = Record<string, Record<string, unknown>>;
const fieldsOf = (value: Record<string, unknown> | undefined): Fields =>
  (value?.mapValue as { fields?: Fields } | undefined)?.fields ?? {};

/** The uses spent the server holds (the compact state keeps a count or `{ used }`). */
async function usedInspiration(): Promise<number> {
  const response = await fetch(STATE, { headers: { Authorization: "Bearer owner" } });
  const fields = ((await response.json()) as { fields?: Fields }).fields ?? {};
  const state = fieldsOf(fieldsOf(fields.playState).state);
  const entry = fieldsOf(state.trackers)[TRACKER];
  const used = entry?.integerValue ?? fieldsOf(entry).used?.integerValue ?? 0;
  return Number(used);
}

test("the Bard's first roll from the new sheet regains Bardic Inspiration", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const dm = await (await browser.newContext()).newPage();
  const bard = await (await browser.newContext()).newPage();
  const errors = watchErrors(bard);

  await test.step("no fight is running", async () => {
    await openFightTab(dm);
    const end = dm.getByRole("button", { name: "End fight" });
    if (await end.isVisible()) await end.click();
  });

  await test.step("the Bard is level 18 with every use spent", async () => {
    reseedHero(SANDBOX_USERS.bard, {
      level: 18,
      state: { trackers: { [TRACKER]: USES } },
    });
    expect(await usedInspiration()).toBe(USES);
  });

  await test.step("the Bard rolls initiative from its own sheet", async () => {
    await signInAs(bard, SANDBOX_USERS.bard.email);
    await bard.goto(`/characters/${SANDBOX_USERS.bard.characterId}`);
    await expect(bard.locator(".f-char")).toBeVisible({ timeout: 60_000 });
    await bard.getByRole("button", { name: "Roll initiative" }).first().click();
    const dialog = bard.locator("dialog[open]");
    await dialog
      .getByRole("textbox")
      .or(dialog.getByRole("spinbutton"))
      .first()
      .fill("15");
    await dialog.getByRole("button", { name: "Confirm" }).click();
  });

  await test.step("two uses are back, and the fight started", async () => {
    await expect
      .poll(usedInspiration, {
        message: "Superior Inspiration: back to two uses",
        timeout: 15_000,
      })
      .toBe(USES - 2);
    await openFightTab(dm);
    await expect(dm.getByText(/INITIATIVE · ROUND/i).first()).toBeVisible();
  });

  await test.step("the DM ends the fight", async () => {
    await dm.getByRole("button", { name: "End fight" }).click();
  });

  await expectNoCrash(bard);
  expect.soft(errors).toEqual([]);
});
