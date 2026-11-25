/**
 * Rehearsal 2 — the level-up flow, 1 → 5, for the three quick-build characters:
 * the Bard takes the College of Lore (Cutting Words, used in the fight later), the
 * Barbarian and the Wizard take the first offer of every pick.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  classLevel,
  expectNoCrash,
  levelUp,
  openCharacter,
  storedHpInputs,
  watchErrors,
} from "./helpers";

/** The max HP on the sheet's HP control: the new UI's «…: 24 / 31» or the classic
 *  «24 of 31 hit points: …». 0 while it is not on screen. */
async function shownMaxHp(page: Page): Promise<number> {
  const control = page
    .locator(".f-char-hp-open")
    .or(page.getByRole("button", { name: /hit points: open damage/ }))
    .first();
  if (!(await control.isVisible().catch(() => false))) return 0;
  const label = (await control.getAttribute("aria-label")) ?? "";
  const match = /\/ (\d+)$/.exec(label) ?? /\d+ of (\d+) hit points/.exec(label);
  return Number(match?.[1] ?? 0);
}

for (const hero of [
  { name: "Rehearsal Bard", className: "Bard", prefer: ["College of Lore"] },
  // The Barbarian rolls the d12's maximum at level 2 (#1315): its stored build then
  // carries the roll's surplus over the fixed value, 12 − 7 = 5.
  { name: "Rehearsal Barbarian", className: "Barbarian", prefer: [], rollMaxAt: 2 },
  { name: "Rehearsal Wizard", className: "Wizard", prefer: [] },
]) {
  test(`${hero.className} levels from 1 to 5 with every pick`, async ({ page }) => {
    const errors = watchErrors(page);
    const id = await openCharacter(page, hero.name);
    // From the level the sheet is at (a rerun on kept emulator data picks up there).
    for (let level = (await classLevel(page, hero.className)) + 1; level <= 5; level++) {
      await test.step(`level ${level}`, async () => {
        await levelUp(page, id, {
          level,
          className: hero.className,
          prefer: hero.prefer,
          rollMax: "rollMaxAt" in hero && hero.rollMaxAt === level,
        });
        await expectNoCrash(page);
      });
    }
    await expect(page.getByText(new RegExp(`${hero.className} 5`)).first()).toBeVisible();
    // #1315 — the max HP the sheet shows after the level-ups is the one a reload
    // derives from the stored build (real emulator, real save).
    if ("rollMaxAt" in hero) {
      // The real save carried the roll (a rerun on kept data may have rolled earlier).
      await expect
        .poll(async () => (await storedHpInputs(id))?.rolled ?? 0, { timeout: 30_000 })
        .toBeGreaterThanOrEqual(5);
    }
    const shown = await shownMaxHp(page);
    expect(shown).toBeGreaterThan(0);
    await page.reload();
    await expect.poll(() => shownMaxHp(page), { timeout: 60_000 }).toBe(shown);
    expect(errors).toEqual([]);
  });
}
