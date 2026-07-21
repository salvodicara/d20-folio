/**
 * E2E: the session-summary read↔edit swap does NOT resize/jump the box (D28
 * edit-in-place).
 *
 * The owner's report: switching a session summary from its rendered read view to
 * the editor felt "traumatic" because the box RESIZED — the read view rendered
 * markdown up to the NoteClamp reading cap, then hard-swapped to a FIXED `rows=4`
 * (min-height 88px) textarea that bore no relation to the content. The fix makes
 * the editor CONTENT-SIZED (`field-sizing: content`, `.sess-notes-edit`) capped at
 * the SAME reading bound, so read and edit share one footprint.
 *
 * jsdom can't measure layout / `field-sizing`, so this lives here (golden rule 15).
 * Two platform-robust facts pin the fix (RELATIVE measurements, not pixel
 * baselines — no committed screenshots):
 *   1. The editor is content-sized: it shows the whole (under-cap) recap with NO
 *      internal scroll (`scrollHeight ≈ clientHeight`). The old fixed 88px box
 *      overflowed and scrolled — this assertion FAILS on it.
 *   2. No jump: the notes region's height barely changes read→edit (the action row
 *      is identical height in both states, so the delta is just the body delta).
 */

import { test, expect, type Page } from "@playwright/test";

async function seedHub(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "d20-folio-ui",
      JSON.stringify({ state: { theme: "dark", motion: "reduced" }, version: 0 })
    );
    localStorage.setItem("i18nextLng", "en");
  });
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto("/campaigns/DEVCAMPAIGN24");
}

test("the summary editor is content-sized and the read↔edit swap keeps one footprint", async ({
  page,
}) => {
  await seedHub(page);

  // The latest session (fixed panel, always visible) carries a multi-block recap.
  const item = page
    .locator('section[aria-labelledby="sessions-head"] .sess-item')
    .first();
  await item.waitFor();
  await item.locator(".sess-toggle").click();
  await item.locator(".sess-prose").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  const notes = item.locator(".sess-notes");
  const readRegion = await notes.evaluate((el) =>
    Math.round(el.getBoundingClientRect().height)
  );

  // Reveal the editor on intent (the single button in the read action row).
  await item.locator(".sess-notes-actions button").first().click();
  const editor = item.locator("textarea.sess-notes-edit");
  await editor.waitFor();

  const box = await editor.evaluate((el) => {
    const ta = el as HTMLTextAreaElement;
    return { scroll: ta.scrollHeight, client: ta.clientHeight };
  });
  const editRegion = await notes.evaluate((el) =>
    Math.round(el.getBoundingClientRect().height)
  );

  // 1. Content-sized: the whole under-cap recap fits with no internal scroll (the
  //    old fixed 88px box overflowed — this fails on it). Tiny box-model tolerance.
  expect(box.scroll - box.client).toBeLessThanOrEqual(4);

  // 2. No jump: the notes region's footprint barely changes across the swap (the
  //    raw markdown is a touch taller than the rendered prose, never the hundreds
  //    of px the old fixed-box swap moved).
  expect(Math.abs(editRegion - readRegion)).toBeLessThanOrEqual(70);
});
