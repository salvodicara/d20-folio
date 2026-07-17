/**
 * E2E: a dialog interaction NEVER bounces the user off the character sheet.
 *
 * Regression guard for the owner-reported nav bug: on `/characters/:id`, closing
 * (or confirming) a flow-owned modal navigated the whole app to the "My Characters"
 * roster. Root cause (`src/lib/overlay-history.ts`): every ModalShell/Dialog pushes
 * a hardware-Back sentinel and RETIRES it on close with `history.back()`. A
 * setup→cleanup→setup remount of the `useOverlayBack` effect (React StrictMode /
 * Offscreen / Fast Refresh) leaves the browser sitting on a DIFFERENT same-URL entry
 * than the one the close means to retire, so the blind `history.back()` rewound a
 * REAL page entry — overshooting off the sheet (to `/` → the index redirect →
 * `/characters`). The fix gates the rewind on the LIVE entry being THIS cleanup's
 * own sentinel (`history.state.folioOverlay === id`).
 *
 * These pins prove the WHOLE CLASS is covered — three different modals, both mount
 * shapes (conditionally-mounted `open` and always-mounted `open` toggle) and three
 * close paths (Cancel, primary-commit, Esc). The invariant asserted is the crux:
 * after the interaction the URL is UNCHANGED — still the sheet, never the roster.
 *
 * Auth is bypassed by the webServer's `VITE_DEV_BYPASS_AUTH`; the Zealot barbarian
 * fixture (`team-santaera-barbarian`, has Warrior of the Gods) and the mock Lyra
 * Voss cockpit (`mock-1`) load with no sign-in. Desktop width — live play is
 * desktop-first (the action board / header controls are always visible there).
 */

import { test, expect } from "@playwright/test";

test.describe("a dialog interaction never bounces off the sheet", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // The overlay-history mechanism is width-invariant; the sheet UI these pins
    // drive (the action board, the header Rest control) is desktop-first, so run
    // the class-coverage sweep once at desktop width (mirrors `combat.spec.ts`).
    test.skip(
      testInfo.project.name === "mobile",
      "Width-invariant nav mechanism; desktop-first sheet UI (a11y/visual cover mobile)."
    );
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("A: the Warrior of the Gods pool-spend modal — Cancel AND Spend stay put", async ({
    page,
  }) => {
    await page.goto("/characters/team-santaera-barbarian");
    await page.getByRole("main").waitFor();
    const url = page.url();

    // Tapping the feature action opens the d12 pool-spend modal (a conditionally
    // MOUNTED ModalShell). Cancel it — the sheet must stay put.
    await page.getByRole("button", { name: "Use: Warrior of the Gods" }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(url);

    // Re-open and COMMIT (Spend) — committing a resource must not bounce either.
    await page.getByRole("button", { name: "Use: Warrior of the Gods" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Spend" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(url);
  });

  test("B: the combat-algorithm Import-from-JSON modal — Cancel stays put", async ({
    page,
  }) => {
    await page.goto("/characters/mock-1");
    await page.getByRole("main").waitFor();

    // Edit mode surfaces the Import-from-JSON action on the combat algorithm.
    await page.getByRole("button", { name: /edit/i }).first().click();
    const importBtn = page.getByRole("button", { name: "Import from JSON" });
    await importBtn.scrollIntoViewIfNeeded();
    const url = page.url();

    await importBtn.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(url);
  });

  test("C: the Rest modal — Esc-close stays put (always-mounted open-toggle shape)", async ({
    page,
  }) => {
    await page.goto("/characters/mock-1");
    await page.getByRole("main").waitFor();
    const url = page.url();

    // The header Rest button opens an ALWAYS-mounted ModalShell whose `open` prop
    // toggles (the other mount shape). Close it with Esc (Radix dismissal → the
    // same overlay-history retirement path).
    await page.getByRole("button", { name: "Rest", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(url);
  });
});
