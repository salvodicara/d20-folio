/**
 * Rehearsal 11 — the forced reload and the rescue copy (#1320), on the real emulators.
 *
 * A player edits offline and closes the tab with the save still queued. A migration
 * then raises the sheet's shape number. When the player comes back, the queued old
 * write is refused by the shape fence, the app stops writing and asks for a reload,
 * and the edit is kept on the device. After the reload (the app now knows the shape),
 * the player applies the kept edit and it reaches the stored sheet.
 */
import { expect, test } from "@playwright/test";
import {
  ownerBuildString,
  ownerCurrentHp,
  quickBuild,
  setOwnerCharacterInt,
  setOwnerPlayVersion,
} from "./helpers";

test("an offline edit survives a migration: kept, reload, apply", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const id = await quickBuild(page, {
    className: "Fighter",
    species: "Human",
    name: "Rehearsal Rescue",
  });
  await expect(page.locator(".f-char")).toBeVisible({ timeout: 60_000 });

  // Offline: the edit waits in the write queue; then the tab closes.
  await context.setOffline(true);
  await page.evaluate(async () => {
    // The live store (the module URL the app loaded; a variable so tsc does not
    // resolve the browser URL), as `add-item-scroll-preserve.spec.ts` does.
    const loadedUrl = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .find((name) => name.includes("/src/stores/characterStore.ts"));
    const specifier = loadedUrl ?? "/src/stores/characterStore.ts";
    const mod = (await import(
      specifier
    )) as typeof import("../../src/stores/characterStore");
    const store = mod.useCharacterStore.getState();
    const doc = store.character;
    if (!doc) throw new Error("no character in store");
    store.setCharacter({
      ...doc,
      character: { ...doc.character, quote: "kept offline edit" },
    });
  });
  // The save has left the tab once its trace is written (it waits offline).
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Object.keys(localStorage).some((key) => key.startsWith("folio.unacked."))
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
  await page.close();

  // A migration raises the stored shape while the player is away.
  await setOwnerCharacterInt(id, "schema", 4);

  // Back online: the queued write is refused, the screen says the edit is kept.
  await context.setOffline(false);
  const back = await context.newPage();
  await back.goto(`/characters/${id}`);
  const gate = back.getByRole("alertdialog", { name: /new version/i });
  await expect(gate).toBeVisible({ timeout: 60_000 });
  await expect(gate).toContainText(/kept on this device/i, { timeout: 30_000 });
  expect(await ownerBuildString(id, "quote")).not.toBe("kept offline edit");

  // The new client is deployed (here: the shape goes back to what this app knows).
  await setOwnerCharacterInt(id, "schema", 3);
  await gate.getByRole("button", { name: /^reload$/i }).click();
  const offer = back.getByRole("region", { name: /unsaved changes/i });
  await expect(offer).toBeVisible({ timeout: 60_000 });
  await offer.getByRole("button", { name: /^apply$/i }).click();
  await expect
    .poll(() => ownerBuildString(id, "quote"), { timeout: 30_000 })
    .toBe("kept offline edit");
  await expect(offer).toHaveCount(0);

  await context.close();
});

test("an offline play edit survives a play-shape migration: kept, reload, apply", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const id = await quickBuild(page, {
    className: "Fighter",
    species: "Human",
    name: "Rehearsal Play Rescue",
  });
  await expect(page.locator(".f-char")).toBeVisible({ timeout: 60_000 });
  const before = await ownerCurrentHp(id);
  if (before === null) throw new Error("no stored HP");

  // Offline: an HP change (a play write) waits in the queue; then the tab closes.
  await context.setOffline(true);
  await page.evaluate(async () => {
    const loadedUrl = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .find((name) => name.includes("/src/stores/characterStore.ts"));
    const specifier = loadedUrl ?? "/src/stores/characterStore.ts";
    const mod = (await import(
      specifier
    )) as typeof import("../../src/stores/characterStore");
    mod.useCharacterStore.getState().setHP(1);
  });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Object.keys(localStorage).some((key) => key.startsWith("folio.unackedPlay."))
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
  await page.close();

  // A play-shape migration (M3) while the player is away.
  await setOwnerPlayVersion(id, 2);

  await context.setOffline(false);
  const back = await context.newPage();
  await back.goto(`/characters/${id}`);
  const gate = back.getByRole("alertdialog", { name: /new version/i });
  await expect(gate).toBeVisible({ timeout: 60_000 });
  await expect(gate).toContainText(/kept on this device/i, { timeout: 30_000 });
  expect(await ownerCurrentHp(id)).toBe(before);

  // The new client is deployed (here: the play shape goes back to what this app knows).
  await setOwnerPlayVersion(id, 1);
  await gate.getByRole("button", { name: /^reload$/i }).click();
  const offer = back.getByRole("region", { name: /unsaved changes/i });
  await expect(offer).toBeVisible({ timeout: 60_000 });
  await offer.getByRole("button", { name: /^apply$/i }).click();
  await expect.poll(() => ownerCurrentHp(id), { timeout: 30_000 }).toBe(1);

  await context.close();
});
