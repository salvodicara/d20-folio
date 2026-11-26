/**
 * Rehearsal 13 — an offline edit that another device overwrote is kept (#1403), on the
 * real emulators, with two browsers as two devices of the same player.
 *
 * Device A goes offline and changes the sheet twice (two saves wait in its queue).
 * Device B, online, saves the sheet twice, so the stored generation passes both of
 * A's. A comes back: the rules refuse both queued saves as conflicts. A shows B's
 * sheet, says its change is kept on this device, and the rescue strip offers it.
 * Apply stores A's newest edit.
 *
 * With FOLIO_SHOTS_DIR set, it also runs in Italian and at phone width and saves a
 * frame of the strip for each (the frames shown for review).
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  ownerBuildString,
  quickBuild,
  storedRevision,
  waitForStoredCharacter,
} from "./helpers";

/** Set the open sheet's quote through the live store, as the sheet's editors do. */
async function setQuote(page: Page, quote: string): Promise<void> {
  await page.evaluate(async (next) => {
    // The live store (the module URL the app loaded), as rehearsal 11 does.
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
    store.setCharacter({ ...doc, character: { ...doc.character, quote: next } });
  }, quote);
}

/** The save carrying `quote` has left the tab (its trace is on the device). */
async function savedLeft(page: Page, quote: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (text) =>
            Object.keys(localStorage).some(
              (key) =>
                key.startsWith("folio.unacked.") &&
                (localStorage.getItem(key) ?? "").includes(text)
            ),
          quote
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
}

const VARIANTS = [
  {
    name: "en-desktop",
    locale: "en-US",
    viewport: { width: 1280, height: 800 },
    kept: /kept on this device/i,
    strip: /unsaved changes/i,
    apply: /^apply$/i,
  },
  {
    name: "en-phone",
    locale: "en-US",
    viewport: { width: 390, height: 844 },
    kept: /kept on this device/i,
    strip: /unsaved changes/i,
    apply: /^apply$/i,
  },
  {
    name: "it-desktop",
    locale: "it-IT",
    viewport: { width: 1280, height: 800 },
    kept: /conservata su questo dispositivo/i,
    strip: /modifiche non salvate/i,
    apply: /^applica$/i,
  },
  {
    name: "it-phone",
    locale: "it-IT",
    viewport: { width: 390, height: 844 },
    kept: /conservata su questo dispositivo/i,
    strip: /modifiche non salvate/i,
    apply: /^applica$/i,
  },
] as const;

const SHOTS = process.env.FOLIO_SHOTS_DIR;

async function journey(browser: Browser, variant: (typeof VARIANTS)[number]) {
  // Device B creates the sheet (the builder's labels are English).
  const contextB = await browser.newContext({ locale: "en-US" });
  const pageB = await contextB.newPage();
  const id = await quickBuild(pageB, {
    className: "Fighter",
    species: "Human",
    name: `Rehearsal Conflict ${variant.name}`,
  });
  await expect(pageB.locator(".f-char")).toBeVisible({ timeout: 60_000 });
  await waitForStoredCharacter(id);

  // Device A opens the same sheet.
  const contextA = await browser.newContext({
    locale: variant.locale,
    viewport: variant.viewport,
  });
  const pageA = await contextA.newPage();
  await pageA.goto(`/characters/${id}`);
  await expect(pageA.locator(".f-char")).toBeVisible({ timeout: 60_000 });
  // The emulator's own warning bar (never in production) covers the strip on a phone.
  await pageA.addStyleTag({ content: ".firebase-emulator-warning{display:none}" });
  const base = await storedRevision(id);

  // A, offline, changes the sheet twice: two saves wait in its queue.
  await contextA.setOffline(true);
  await setQuote(pageA, "A first offline edit");
  await savedLeft(pageA, "A first offline edit");
  await setQuote(pageA, "A second offline edit");
  await savedLeft(pageA, "A second offline edit");

  // B, online, saves twice: the stored generation passes both of A's.
  await setQuote(pageB, "B first edit");
  await expect.poll(() => storedRevision(id), { timeout: 15_000 }).toBe(base + 1);
  await setQuote(pageB, "B second edit");
  await expect.poll(() => storedRevision(id), { timeout: 15_000 }).toBe(base + 2);

  // A is back: both saves are refused; A's change is kept and offered.
  await contextA.setOffline(false);
  await expect(pageA.getByText(variant.kept).first()).toBeVisible({ timeout: 30_000 });
  const offer = pageA.getByRole("region", { name: variant.strip });
  await expect(offer).toBeVisible({ timeout: 30_000 });
  expect(await ownerBuildString(id, "quote")).toBe("B second edit");
  // Both strip buttons read in sentence case («Applica» / «Scarta»), not one in capitals.
  for (const button of await offer.getByRole("button").all())
    expect(await button.evaluate((el) => getComputedStyle(el).textTransform)).toBe(
      "none"
    );
  // The notice rises above the strip instead of hiding under it (lanes, not layers).
  await expect
    .poll(async () => {
      const toast = await pageA.locator(".f-toast").first().boundingBox();
      const strip = await offer.boundingBox();
      return toast && strip ? toast.y + toast.height <= strip.y + 1 : false;
    })
    .toBe(true);
  if (SHOTS) await pageA.screenshot({ path: `${SHOTS}/${variant.name}.png` });

  // Apply stores A's newest edit over B's sheet.
  await offer.getByRole("button", { name: variant.apply }).click();
  await expect
    .poll(() => ownerBuildString(id, "quote"), { timeout: 30_000 })
    .toBe("A second offline edit");
  await expect(offer).toHaveCount(0);
  if (SHOTS) await pageA.screenshot({ path: `${SHOTS}/${variant.name}-applied.png` });

  await contextA.close();
  await contextB.close();
}

for (const variant of SHOTS ? VARIANTS : VARIANTS.slice(0, 1)) {
  test(`an offline edit another device overwrote is kept, then applied (${variant.name})`, async ({
    browser,
  }) => {
    await journey(browser, variant);
  });
}
