/**
 * Rehearsal 15 — an edit from a tab closed offline survives another device's save
 * (#1414), on the real emulators, with two browsers as two devices of the same player.
 *
 * Device A edits offline and closes the tab while offline: the save waits in the
 * SDK's queue. Device B saves the sheet. A reopens online: the SDK replays the queued
 * save before any listener runs, the rules refuse it, and no refusal reaches the app.
 * Before, A's trace was retired because the stored sheet had reached its generation
 * (B's save looks the same), and the edit was lost. Now only the save's own write id
 * proves it landed: the strip offers A's edit, and Apply stores it.
 */
import { expect, test } from "@playwright/test";
import {
  ownerBuildString,
  quickBuild,
  savedLeft,
  setQuote,
  storedRevision,
  waitForStoredCharacter,
} from "./helpers";

test("an edit from a tab closed offline is offered after another device saved", async ({
  browser,
}) => {
  // Device B creates the sheet; device A opens it.
  const contextB = await browser.newContext({ locale: "en-US" });
  const pageB = await contextB.newPage();
  const id = await quickBuild(pageB, {
    className: "Fighter",
    species: "Human",
    name: "Rehearsal Closed Tab",
  });
  await expect(pageB.locator(".f-char")).toBeVisible({ timeout: 60_000 });
  await waitForStoredCharacter(id);
  const contextA = await browser.newContext({ locale: "en-US" });
  const pageA = await contextA.newPage();
  await pageA.goto(`/characters/${id}`);
  await expect(pageA.locator(".f-char")).toBeVisible({ timeout: 60_000 });
  const base = await storedRevision(id);

  // A edits offline, and the tab closes with the save still queued.
  await contextA.setOffline(true);
  await setQuote(pageA, "A closed-tab edit");
  await savedLeft(pageA, "A closed-tab edit");
  await pageA.close();

  // B saves: the stored generation is the one A's queued save claimed.
  await setQuote(pageB, "B online edit");
  await expect.poll(() => storedRevision(id), { timeout: 15_000 }).toBe(base + 1);

  // A reopens online: the queued save is replayed and refused; the edit is offered.
  await contextA.setOffline(false);
  const back = await contextA.newPage();
  await back.goto(`/characters/${id}`);
  await back.addStyleTag({ content: ".firebase-emulator-warning{display:none}" });
  const offer = back.getByRole("region", { name: /unsaved changes/i });
  await expect(offer).toBeVisible({ timeout: 60_000 });
  expect(await ownerBuildString(id, "quote")).toBe("B online edit");

  // Apply stores A's edit on top of B's sheet.
  await offer.getByRole("button", { name: /^apply$/i }).click();
  await expect
    .poll(() => ownerBuildString(id, "quote"), { timeout: 30_000 })
    .toBe("A closed-tab edit");

  await contextA.close();
  await contextB.close();
});
