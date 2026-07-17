/**
 * E2E: the full Settings page + the topbar dropdown bridge (Phase 6).
 *
 * Drives the REAL flow against the dev server (VITE_DEV_BYPASS_AUTH=true): open
 * the account dropdown → Settings → land on /settings, then flip each control and
 * assert it drives the SAME global state the dropdown uses — data-theme on <html>
 * and the i18n locale (a visible string flips) — with theme persisting across a
 * reload (one source of truth: the persisted uiStore). Motion has no in-app
 * toggle: data-motion mirrors the OS prefers-reduced-motion setting.
 *
 * Desktop-only: the account dropdown lives in the desktop topbar; the new
 * /settings surface is axe + visual covered at mobile width by the surface matrix.
 */

import { test, expect } from "@playwright/test";

test.describe("Settings page + dropdown bridge", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "Account dropdown is a desktop-topbar surface; mobile /settings is covered by a11y/visual."
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.getByText(/your characters/i).first()).toBeVisible();
  });

  async function openSettingsFromDropdown(page: import("@playwright/test").Page) {
    await page
      .getByRole("button", { name: /account/i })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /settings/i }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: /appearance/i })).toBeVisible();
  }

  test("the gear dropdown's Settings link lands on the full /settings page", async ({
    page,
  }) => {
    await openSettingsFromDropdown(page);
    // The reconcile: the dropdown's redundant "Characters" entry is gone.
    await page
      .getByRole("button", { name: /account/i })
      .first()
      .click();
    await expect(page.getByRole("menuitem", { name: /^characters$/i })).toHaveCount(0);
  });

  test("toggling Theme drives data-theme and persists across a reload", async ({
    page,
  }) => {
    await openSettingsFromDropdown(page);
    const html = page.locator("html");

    await page.getByRole("button", { name: "Light" }).click();
    await expect(html).toHaveAttribute("data-theme", "light");

    // Persistence (one source of truth — the persisted uiStore): survive a reload.
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: "Dark" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");
  });

  test("motion follows the OS prefers-reduced-motion (no in-app toggle)", async ({
    page,
  }) => {
    // The animations toggle was removed (Owner-feedback 2026-06-07): data-motion is
    // a pure mirror of the OS setting. There must be NO motion switch on /settings,
    // and emulating the OS preference must drive data-motion on <html>.
    await openSettingsFromDropdown(page);
    await expect(
      page.getByRole("switch", { name: /enable animations|animations/i })
    ).toHaveCount(0);

    const html = page.locator("html");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(html).toHaveAttribute("data-motion", "reduced");

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    await expect(html).toHaveAttribute("data-motion", "auto");
  });

  test("switching Language flips a visible string (EN → IT)", async ({ page }) => {
    await openSettingsFromDropdown(page);

    // EN: the danger action reads "Sign Out".
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();

    await page.getByRole("button", { name: "IT" }).click();

    // IT: nav.signOut → "Esci" (an authoritative existing translation).
    await expect(page.getByRole("button", { name: /esci/i })).toBeVisible();
  });
});
