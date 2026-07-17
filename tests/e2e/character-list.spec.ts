/**
 * E2E: Characters roster (the folio card grid).
 *
 * Dev-bypass loads MOCK_CHARACTER (Lyra Voss) at id "mock-1", so the roster
 * shows a single folio card. The card is the folio `.ch-*` recipe: a stretched
 * accessible <button> (primary activation — NOT the old master-detail dblclick)
 * that opens the cockpit at /characters/:id. Tabs are in-view state, so there is
 * no /combat sub-route (the URL is /characters/mock-1, not /characters/mock-1/combat).
 */

import { test, expect } from "@playwright/test";

test.describe("Characters roster", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/characters");
  });

  test("shows a folio card with the character's name, class and level", async ({
    page,
  }) => {
    await expect(page.locator(".ch-name", { hasText: "Lyra Voss" })).toBeVisible();
    // Class + level live in the `.ch-sub` lemma beneath the name.
    await expect(
      page.locator(".ch-sub").filter({ hasText: /Bard/ }).first()
    ).toBeVisible();
  });

  test("activating a card opens the cockpit at /characters/:id (no /combat segment)", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /open lyra voss/i }).click();
    await expect(page).toHaveURL(/\/characters\/mock-1(\?|$)/);
  });

  test("the Create CTA opens the creation wizard", async ({ page }) => {
    await page
      .getByRole("button", { name: /create character/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/characters\/new$/);
  });

  test("the root path redirects to the canonical /characters roster", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/characters$/);
    await expect(page.locator(".ch-name", { hasText: "Lyra Voss" })).toBeVisible();
  });
});

test.describe("Characters roster — card row-actions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/characters");
  });

  test("the kebab opens an overflow menu with the row-actions", async ({ page }) => {
    await page
      .getByRole("button", { name: /more actions/i })
      .first()
      .click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /export json/i })).toBeVisible();
    // P1 — the printable PDF export sits beside Export JSON.
    await expect(menu.getByRole("menuitem", { name: /export pdf/i })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /clone/i })).toBeVisible();
    // Lyra is active in dev-bypass → Retire (not Restore).
    await expect(menu.getByRole("menuitem", { name: /retire/i })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /delete/i })).toBeVisible();
  });

  test("Export PDF downloads a .pdf character sheet (official 2024 layout)", async ({
    page,
  }) => {
    await page
      .getByRole("button", { name: /more actions/i })
      .first()
      .click();
    // The browser download is the success feedback — wait for it to land.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: /export pdf/i }).click();
    const download = await downloadPromise;
    // Slugified `<name>.d20-folio.pdf` (Lyra Voss → lyra-voss.d20-folio.pdf).
    expect(download.suggestedFilename()).toMatch(/\.d20-folio\.pdf$/i);
    // The bytes are a real PDF (the %PDF- magic header).
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const head = Buffer.concat(chunks).subarray(0, 5).toString("latin1");
    expect(head).toBe("%PDF-");
  });

  test("Delete asks for confirmation and Cancel dismisses it", async ({ page }) => {
    await page
      .getByRole("button", { name: /more actions/i })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /delete/i }).click();

    // The destructive action routes through the shared confirm dialog (no undo).
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/delete lyra voss\?/i)).toBeVisible();

    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(dialog).toBeHidden();
  });

  test("the overflow menu PORTALS out of the card's overflow:hidden clip", async ({
    page,
  }) => {
    await page
      .getByRole("button", { name: /more actions/i })
      .first()
      .click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // The regression was a non-portaled menu clipped by `.ch-card { overflow:hidden }`.
    // The Radix Popover portals its content to <body>, so the menu must NOT be a
    // descendant of any card.
    const insideCard = await menu.evaluate((el) => el.closest(".ch-card") !== null);
    expect(insideCard).toBe(false);
  });

  test("Escape closes the menu", async ({ page }) => {
    await page
      .getByRole("button", { name: /more actions/i })
      .first()
      .click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
  });

  test("a card-body dismiss-click closes the menu without navigating", async ({
    page,
  }) => {
    await page
      .getByRole("button", { name: /more actions/i })
      .first()
      .click();
    await expect(page.getByRole("menu")).toBeVisible();

    // Click the lower-LEFT of the card — robustly clear of the top-right
    // (`data-align="end"`) menu regardless of card width/position. This must
    // dismiss the menu (Radix outside-pointerdown) WITHOUT triggering the
    // stretched `.ch-open` navigation: that button is `disabled` while the menu
    // is open, so a press over the card body can't arm a click on it.
    const card = page.locator(".ch-card").first();
    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.18, box.y + box.height - 10);
    }
    await expect(page.getByRole("menu")).toBeHidden();
    // Still on the roster — NOT navigated into a cockpit.
    await expect(page).not.toHaveURL(/\/characters\//);
  });
});
