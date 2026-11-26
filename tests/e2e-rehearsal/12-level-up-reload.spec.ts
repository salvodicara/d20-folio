/**
 * Rehearsal 12 — a level-up is never lost silently (#1276), on the real emulators.
 *
 * The level shows at once and its save lands a moment later. A reload or a closed tab
 * in that moment must not drop it: either Firestore's queue still delivers it, or the
 * next load finds the level-up's trace, sees the stored sheet never reached it, and
 * offers it back («Unsaved changes … were kept on this device — Apply»).
 */
import { expect, test, type Page } from "@playwright/test";
import { ownerCharacterIds, quickBuild, storedLevel, storedRevision } from "./helpers";

const banner = (page: Page) => page.getByRole("region", { name: /unsaved changes/i });

/** A new level-1 Fighter, stored on the server, with its level-up screen open. */
async function freshFighter(page: Page, name: string): Promise<string> {
  const id = await quickBuild(page, { className: "Fighter", species: "Human", name });
  await expect(page.locator(".f-char")).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await ownerCharacterIds()).includes(id)).toBe(true);
  await expect.poll(() => storedLevel(id), { timeout: 30_000 }).toBe(1);
  await page.goto(`/characters/${id}/level-up`);
  await expect(page.getByRole("button", { name: "Confirm level 2" })).toBeVisible({
    timeout: 120_000,
  });
  return id;
}

async function confirmLevel2(page: Page, id: string): Promise<void> {
  await page.getByRole("button", { name: "Confirm level 2" }).click();
  await expect(page).toHaveURL(new RegExp(`/characters/${id}$`), { timeout: 30_000 });
  await expect(page.locator("main")).toContainText(/Fighter\s+2\b/);
}

test("online, a reload 0.3 s after «Confirm» never loses the level-up", async ({
  page,
}) => {
  const id = await freshFighter(page, "Rehearsal Reload");
  await confirmLevel2(page, id);
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.locator(".f-char")).toBeVisible({ timeout: 60_000 });
  // Either the queued write lands, or the kept level-up is offered and applied.
  await expect
    .poll(
      async () => {
        if ((await storedLevel(id)) === 2) return "stored";
        if (await banner(page).isVisible()) return "offered";
        return "waiting";
      },
      { timeout: 30_000 }
    )
    .not.toBe("waiting");
  const landed = (await storedLevel(id)) === 2;
  // Which way it went this run (both are correct): read in the rehearsal's log.
  test.info().annotations.push({
    type: "reload at +0.3 s",
    description: landed ? "the queued write landed" : "offered back, applied",
  });
  if (!landed) {
    await banner(page)
      .getByRole("button", { name: /^apply$/i })
      .click();
  }
  await expect.poll(() => storedLevel(id), { timeout: 30_000 }).toBe(2);
});

test("offline, a level-up whose queue was lost is offered back, and Apply stores it", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const id = await freshFighter(page, "Rehearsal Lost");
  await context.setOffline(true);
  await confirmLevel2(page, id);
  // The level-up has left the tab once its trace is written (it waits offline).
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some((key) => key.startsWith("folio.unacked."))
      )
    )
    .toBe(true);
  await page.close();
  // The tab closed before Firestore kept its queue: the queue is gone (the sign-in
  // and the level-up's trace, in other stores, are not). Back online, a plain file of
  // the app (no Firestore client runs there) clears it.
  await context.setOffline(false);
  const back = await context.newPage();
  await back.goto("/favicon.svg");
  await back.evaluate(async () => {
    const databases = await indexedDB.databases();
    await Promise.all(
      databases
        .map((db) => db.name ?? "")
        .filter((name) => name.startsWith("firestore/"))
        .map(
          (name) =>
            new Promise<void>((resolve) => {
              const request = indexedDB.deleteDatabase(name);
              request.onsuccess = () => resolve();
              request.onerror = () => resolve();
              request.onblocked = () => resolve();
            })
        )
    );
  });
  expect(await storedLevel(id)).toBe(1);

  await back.goto(`/characters/${id}`);
  await expect(banner(back)).toBeVisible({ timeout: 60_000 });
  await banner(back)
    .getByRole("button", { name: /^apply$/i })
    .click();
  await expect.poll(() => storedLevel(id), { timeout: 30_000 }).toBe(2);
  await expect(banner(back)).toHaveCount(0);
  await context.close();
});

test("a level-up the server acknowledged shows no banner after a reload", async ({
  page,
}) => {
  const id = await freshFighter(page, "Rehearsal Kept");
  const before = await storedRevision(id);
  await confirmLevel2(page, id);
  await expect.poll(() => storedLevel(id), { timeout: 30_000 }).toBe(2);
  await expect.poll(() => storedRevision(id)).toBeGreaterThan(before);
  await page.reload();
  await expect(page.locator("main")).toContainText(/Fighter\s+2\b/, { timeout: 60_000 });
  // Give the load's first stored sheet time to arrive and be compared.
  await page.waitForTimeout(3_000);
  await expect(banner(page)).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) => key.startsWith("folio.rescue."))
    )
  ).toBe(false);
});
