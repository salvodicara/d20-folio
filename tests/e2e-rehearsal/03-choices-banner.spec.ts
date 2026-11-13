/**
 * Rehearsal 3 — «Scelte da completare» and the Paladin's level 5. Paladin (a real
 * sandbox player, signed in with his own account) opens his sheet in Italian, sees the
 * banner for the choices his sheet still owes, finishes them, and the banner goes. He
 * then levels 3 → 5 and prepares Warding Bond, which the fight needs (2nd-level slots).
 */
import { expect } from "@playwright/test";
import {
  classLevel,
  expectNoCrash,
  levelUp,
  reseedHero,
  SANDBOX_USERS,
  signInAs,
  test,
  watchErrors,
} from "./helpers";

const { email, characterId } = SANDBOX_USERS.paladin;

// Paladin as the seed made him (level 3, his choices still owed), every run.
test.beforeEach(() => reseedHero(SANDBOX_USERS.paladin));

test("«Scelte da completare» lists the owed choices and clears once they are made", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => window.localStorage.setItem("i18nextLng", "it"));
  await signInAs(page, email);
  await page.goto(`/characters/${characterId}`);
  const banner = page.getByText("Scelte da completare");
  await expect(banner).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Completa" }).click();
  // Each ask takes as many picks as it names ("Scegli 2 …"), one otherwise: the first offers.
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  // An option is a chip or, for a class pick, a slot of the level-up's pick grid.
  const options = ".f-chips button, .f-pick button.f-slot";
  for (const ask of await dialog.locator(".f-ask").all()) {
    const chips = ask.locator(options);
    if ((await chips.count()) === 0) continue;
    // The pick grid says it: «Scelte: 0 di 2»; a chip ask names its count, else one.
    const text = await ask.innerText();
    const need = Number(
      text.match(/Scelte: \d+ di (\d+)/)?.[1] ?? text.match(/\b(\d+)\b/)?.[1] ?? 1
    );
    const picked = await ask
      .locator(
        ".f-chips button[aria-pressed=true], .f-pick button.f-slot[aria-pressed=true]"
      )
      .count();
    const open = ask.locator(
      ".f-chips button[aria-pressed=false], .f-pick button.f-slot[aria-pressed=false]"
    );
    for (let i = picked; i < need; i++) await open.first().click();
  }
  await dialog.getByRole("button", { name: "Salva" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(banner).toHaveCount(0);
  await expectNoCrash(page);
  expect(errors).toEqual([]);
});

test("Paladin levels 3 → 5 and prepares Warding Bond", async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, email);
  await page.goto(`/characters/${characterId}`);
  await expect(page.locator(".f-char")).toBeVisible({ timeout: 60_000 });
  const hp = async () => {
    const label = await page
      .getByRole("button", { name: /Damage and healing: \d+ \/ \d+/ })
      .getAttribute("aria-label");
    const [, cur, max] = label?.match(/(\d+) \/ (\d+)/) ?? [];
    return { cur: Number(cur), max: Number(max) };
  };
  expect(await classLevel(page, "Paladin"), "he starts at level 3").toBe(3);
  for (let level = 4; level <= 5; level++) {
    await test.step(`level ${level}`, async () => {
      const before = await hp();
      await levelUp(page, characterId, {
        level,
        className: "Paladin",
        prefer: ["Warding Bond"],
      });
      // A level raises current HP with the maximum, and it stays (rehearsal finding 7:
      // the clock projection's write loop put the old HP back on a campaign sheet).
      await page.waitForTimeout(3000);
      const after = await hp();
      expect(after.cur - before.cur).toBe(after.max - before.max);
    });
  }
  await expect(page.getByText(/Paladin 5/).first()).toBeVisible();
  await expect(page.locator(".f-act", { hasText: "Warding Bond" }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
