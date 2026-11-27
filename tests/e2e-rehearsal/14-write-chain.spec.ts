/**
 * Rehearsal 14 — a queued offline save never overwrites another device's (#1413), on
 * the real emulators, with two browsers as two devices of the same player.
 *
 * Device A goes offline and changes the sheet twice (two saves wait in its queue).
 * Device B, online, saves the sheet ONCE: the stored generation is A's first, not its
 * second. Before the write chain, A's first save was refused on reconnect and its
 * second passed (the revision numbers lined up), silently replacing B's change. Now
 * the rules refuse both: B's change stays stored, A's newest edit is kept on A's
 * device and offered by the strip, and Apply stores it.
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

test("a queued offline save never overwrites another device's change", async ({
  browser,
}) => {
  // Device B creates the sheet; device A opens it.
  const contextB = await browser.newContext({ locale: "en-US" });
  const pageB = await contextB.newPage();
  const id = await quickBuild(pageB, {
    className: "Fighter",
    species: "Human",
    name: "Rehearsal Write Chain",
  });
  await expect(pageB.locator(".f-char")).toBeVisible({ timeout: 60_000 });
  await waitForStoredCharacter(id);
  const contextA = await browser.newContext({ locale: "en-US" });
  const pageA = await contextA.newPage();
  await pageA.goto(`/characters/${id}`);
  await expect(pageA.locator(".f-char")).toBeVisible({ timeout: 60_000 });
  // The emulator's own warning bar (never in production) can cover the strip.
  await pageA.addStyleTag({ content: ".firebase-emulator-warning{display:none}" });
  const base = await storedRevision(id);

  // A, offline, changes the sheet twice: two saves wait in its queue.
  await contextA.setOffline(true);
  await setQuote(pageA, "A first offline edit");
  await savedLeft(pageA, "A first offline edit");
  await setQuote(pageA, "A second offline edit");
  await savedLeft(pageA, "A second offline edit");

  // B, online, saves ONCE: the stored generation is the one A's first save claimed.
  await setQuote(pageB, "B online edit");
  await expect.poll(() => storedRevision(id), { timeout: 15_000 }).toBe(base + 1);

  // A is back: both queued saves are refused. B's change is never overwritten.
  await contextA.setOffline(false);
  const offer = pageA.getByRole("region", { name: /unsaved changes/i });
  await expect(offer).toBeVisible({ timeout: 30_000 });
  await expect(pageA.getByText(/kept on this device/i).first()).toBeVisible();
  expect(await ownerBuildString(id, "quote")).toBe("B online edit");
  expect(await storedRevision(id)).toBe(base + 1);

  // Apply stores A's newest edit, on top of B's sheet.
  await offer.getByRole("button", { name: /^apply$/i }).click();
  await expect
    .poll(() => ownerBuildString(id, "quote"), { timeout: 30_000 })
    .toBe("A second offline edit");

  await contextA.close();
  await contextB.close();
});
