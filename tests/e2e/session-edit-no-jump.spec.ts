/**
 * E2E: the live-session summary is a durable, directly editable document.
 *
 * jsdom can pin the save calls, but only a browser can prove the real workflow:
 * write during play, jump to the character realm through the global header, then
 * return without losing a keystroke. The editor also stays content-sized so the
 * live desk remains compact rather than becoming a nested scrolling trap.
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
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.goto("/campaigns/DEVCAMPAIGN24");
}

test("the live recap survives a campaign → character → campaign round trip", async ({
  page,
}) => {
  await seedHub(page);

  const editor = page.getByRole("textbox", { name: /session summary/i });
  await editor.waitFor();
  await expect(editor).toHaveValue(/The party crossed at dawn/);

  const recap = "The party reached the sealed gate; Bren is holding the key.";
  await editor.fill(recap);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("d20.sessionDraft.DEVCAMPAIGN24.sess-7"))
    )
    .toBe(recap);

  const box = await editor.evaluate((el) => {
    const textarea = el as HTMLTextAreaElement;
    return { scroll: textarea.scrollHeight, client: textarea.clientHeight };
  });
  expect(box.scroll - box.client).toBeLessThanOrEqual(4);

  // This is the owner's real route: use the global header to consult the character,
  // then return. The campaign component unmounts, but the local draft must restore.
  await page.locator('a[href="/characters"]').first().click();
  await expect(page).toHaveURL(/\/characters$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/campaigns\/DEVCAMPAIGN24$/);
  await expect(page.getByRole("textbox", { name: /session summary/i })).toHaveValue(
    recap
  );
});
