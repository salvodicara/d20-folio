/**
 * Rehearsal 2 — the level-up flow, 1 → 5, for the three quick-build characters:
 * the Bard takes the College of Lore (Cutting Words, used in the fight later), the
 * Barbarian and the Wizard take the first offer of every pick.
 */
import { expect, test } from "@playwright/test";
import {
  classLevel,
  expectNoCrash,
  levelUp,
  openCharacter,
  watchErrors,
} from "./helpers";

for (const hero of [
  { name: "Rehearsal Bard", className: "Bard", prefer: ["College of Lore"] },
  { name: "Rehearsal Barbarian", className: "Barbarian", prefer: [] },
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
        });
        await expectNoCrash(page);
      });
    }
    await expect(page.getByText(new RegExp(`${hero.className} 5`)).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}
