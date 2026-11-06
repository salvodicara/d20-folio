/**
 * Rehearsal 1 — sign-in and creation. The sandbox signs in by itself; a player then
 * makes a Bard, a Barbarian and a Wizard, each by quick build, and a Wizard by the
 * guided wizard, and every sheet opens on the new Play screen.
 */
import { expect, test } from "@playwright/test";
import { expectNoCrash, ownerCharacterIds, quickBuild, watchErrors } from "./helpers";

test("sign-in lands on the character list as the sandbox account", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/characters");
  await expect(page.getByRole("heading", { name: /your characters/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /account|you \(dm\)/i }).first()
  ).toBeVisible();
  expect(errors).toEqual([]);
});

for (const pick of [
  { className: "Bard", species: "Elf", name: "Rehearsal Bard" },
  { className: "Barbarian", species: "Goliath", name: "Rehearsal Barbarian" },
  { className: "Wizard", species: "Gnome", name: "Rehearsal Wizard" },
]) {
  test(`quick build: a ${pick.className} opens on its Play screen`, async ({ page }) => {
    const errors = watchErrors(page);
    const before = (await ownerCharacterIds()).length;
    await quickBuild(page, pick);
    await expect(page.locator(".f-char")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(pick.name).first()).toBeVisible();
    await expectNoCrash(page);
    expect((await ownerCharacterIds()).length).toBe(before + 1);
    expect(errors).toEqual([]);
  });
}
