/**
 * Rehearsal 3 — «Scelte da completare» and the Paladin's level 5. Mandorlino (a real
 * sandbox player, signed in with his own account) opens his sheet in Italian, sees the
 * banner for the choices his sheet still owes, finishes them, and the banner goes. He
 * then levels 3 → 5 and prepares Warding Bond, which the fight needs (2nd-level slots).
 */
import { expect, test } from "@playwright/test";
import {
  classLevel,
  expectNoCrash,
  levelUp,
  SANDBOX_USERS,
  signInAs,
  watchErrors,
} from "./helpers";

const { email, characterId } = SANDBOX_USERS.mandorlino;

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
  for (const ask of await dialog.locator(".f-ask").all()) {
    const chips = ask.locator(".f-chips button");
    if ((await chips.count()) === 0) continue;
    const need = Number((await ask.innerText()).match(/\b(\d+)\b/)?.[1] ?? 1);
    const picked = await ask.locator(".f-chips button[aria-pressed=true]").count();
    const open = ask.locator(".f-chips button[aria-pressed=false]");
    for (let i = picked; i < need; i++) await open.first().click();
  }
  await dialog.getByRole("button", { name: "Salva" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(banner).toHaveCount(0);
  await expectNoCrash(page);
  expect(errors).toEqual([]);
});

test("Mandorlino levels 3 → 5 and prepares Warding Bond", async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, email);
  await page.goto(`/characters/${characterId}`);
  await expect(page.locator(".f-char")).toBeVisible({ timeout: 60_000 });
  for (let level = (await classLevel(page, "Paladin")) + 1; level <= 5; level++) {
    await test.step(`level ${level}`, async () => {
      await levelUp(page, characterId, {
        level,
        className: "Paladin",
        prefer: ["Warding Bond"],
      });
    });
  }
  await expect(page.getByText(/Paladin 5/).first()).toBeVisible();
  await expect(page.locator(".f-act", { hasText: "Warding Bond" }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
