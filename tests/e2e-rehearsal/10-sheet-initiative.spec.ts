/**
 * Rehearsal 10: a member with an attached character rolls initiative from the new Play
 * sheet, on the real emulators and rules, and lands in the campaign fight's order the
 * DM sees (coordinator, 2026-11-12: the board's row C2 showed the dev campaign failing
 * here; production must not). Bard's roll starts the fight, Paladin's lower roll joins
 * it below, each at the total its dialog announced (the d20 plus the sheet's bonus).
 */
import { expect, type Browser, type Page } from "@playwright/test";
import {
  BARD_NAME,
  expectNoCrash,
  openFightTab,
  PALADIN_NAME,
  reseedHero,
  SANDBOX_USERS,
  signInAs,
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

/** Roll from the Play sheet's «Roll initiative»; returns the d20 plus the bonus the
 *  dialog states. */
async function rollFromSheet(
  page: Page,
  characterId: string,
  d20: number
): Promise<number> {
  await page.goto(`/characters/${characterId}`);
  await expect(page.locator(".f-char")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Roll initiative" }).first().click();
  const dialog = page.locator("dialog[open]");
  // «Type the number the die shows: the sheet adds your bonus (+3).»
  const help = await dialog.getByText(/adds your bonus/).innerText();
  const bonus = Number(help.match(/\(([+\u2212-]?\d+)\)/)?.[1]?.replace("\u2212", "-"));
  expect(Number.isFinite(bonus), "the dialog states the bonus").toBe(true);
  await dialog
    .getByRole("textbox")
    .or(dialog.getByRole("spinbutton"))
    .first()
    .fill(String(d20));
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog).toHaveCount(0);
  const total = d20 + bonus;
  return total;
}

/** The DM's order: each row's name and initiative, top to bottom. */
async function order(dm: Page): Promise<string[]> {
  const out: string[] = [];
  for (const row of await dm.locator(".f-row.f-fight").all()) {
    const name = (await row.locator(".f-row-t").innerText())
      .replace(/\u00a0/g, " ")
      .trim();
    out.push(`${name}:${(await row.locator(".f-init").innerText()).trim()}`);
  }
  return out;
}

test("members roll initiative from the new Play sheet and land in the DM's order", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  reseedHero(SANDBOX_USERS.bard);
  reseedHero(SANDBOX_USERS.paladin);
  const dm = await seat(browser);
  const bard = await seat(browser, SANDBOX_USERS.bard.email);
  const paladin = await seat(browser, SANDBOX_USERS.paladin.email);

  await test.step("no fight is running", async () => {
    await openFightTab(dm);
    const end = dm.getByRole("button", { name: "End fight" });
    if (await end.isVisible()) await end.click();
    await expect(dm.getByText(/No fight running/i)).toBeVisible();
  });

  const bardTotal =
    await test.step("Bard rolls 15 from the sheet: the fight starts", () =>
      rollFromSheet(bard, SANDBOX_USERS.bard.characterId, 15));
  const paladinTotal = await test.step("Paladin rolls 2 from the sheet: he joins", () =>
    rollFromSheet(paladin, SANDBOX_USERS.paladin.characterId, 2));

  await test.step("the DM's order holds both, at their totals, highest first", async () => {
    await openFightTab(dm);
    const expected = [
      { name: BARD_NAME, init: bardTotal },
      { name: PALADIN_NAME, init: paladinTotal },
    ]
      .sort((a, b) => b.init - a.init)
      .map((r) => `${r.name}:${String(r.init)}`);
    await expect
      .poll(() => order(dm), {
        message: "both rolls reach the DM's order",
        timeout: 30_000,
      })
      .toEqual(expected);
  });

  await test.step("the DM ends the fight", async () => {
    await dm.getByRole("button", { name: "End fight" }).click();
    await expect(dm.getByText(/No fight running/i)).toBeVisible();
  });

  for (const page of [dm, bard, paladin]) await expectNoCrash(page);
  expect.soft(errors.flat()).toEqual([]);
});
