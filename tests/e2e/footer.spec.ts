/**
 * E2E: the sticky-footer shell layout.
 *
 * Reversed D40 (owner 2026-06-07): the legal footer used to be forced below the
 * fold by a `min-h-[100svh-topbar]` content wrapper, so you only met it by
 * scrolling. That manufactured scroll is gone — the shell is now a sticky-footer
 * flex column, so on a SHORT page the footer rides to the bottom of the viewport
 * and is visible without scrolling (and is still pushed below the fold on tall
 * pages, by content alone).
 *
 * Guard: on a guaranteed-short page (the not-found route), the footer is fully in
 * the viewport at load — no scroll needed.
 */

import { test, expect, type Page } from "@playwright/test";

test("the legal footer is visible without scrolling on a short page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  // A guaranteed-short page that still renders inside the AppShell (so the footer
  // is present). The roster/cockpit can be tall; the not-found page never is.
  await page.goto("/__no_such_route__");

  const footer = page.getByRole("contentinfo");
  await expect(footer).toBeVisible();
  // The decisive check: the footer sits within the initial viewport — the old
  // forced-min-height layout pushed it out, so this fails before the fix.
  await expect(footer).toBeInViewport();
});

/**
 * Regression (owner, 2026-06-10): the viewport-fixed PWA dock (offline strip /
 * install prompt) OVERLAPPED the footer, leaving its colophon half-unreadable.
 * The fix: PWABanner publishes its measured height as `--pwa-banner-h` and the
 * AppShell reserves matching bottom padding — so when the dock is up, the
 * footer rides fully ABOVE it. Pinned as a bounding-box non-overlap.
 */

/** Flip the app offline through the real seam: saveStore subscribes to the
 *  window offline/online events (src/lib/online-status.ts). */
async function goOffline(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
}

/** Arm the install prompt exactly like the unit seam: a synthetic
 *  `beforeinstallprompt` that usePWAInstall captures. */
async function armInstallPrompt(page: Page): Promise<void> {
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt") as Event & {
      prompt?: () => Promise<void>;
      userChoice?: Promise<{ outcome: string; platform: string }>;
    };
    e.prompt = () => Promise.resolve();
    e.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
    window.dispatchEvent(e);
  });
}

/** The footer's box must sit entirely ABOVE the dock's box — no occlusion. */
async function expectFooterClearsDock(page: Page): Promise<void> {
  const footer = page.getByRole("contentinfo");
  const dock = page.locator(".pwa-dock");
  await expect(dock).toBeVisible();
  // Deterministic: wait until the published clearance matches the dock's
  // CURRENT height (ResizeObserver updates are async after a content change).
  await page.waitForFunction(() => {
    const el = document.querySelector<HTMLElement>(".pwa-dock");
    if (!el) return false;
    const v = document.documentElement.style.getPropertyValue("--pwa-banner-h");
    return v === `${el.offsetHeight}px`;
  });
  // Read the footer where users read it: at the TRUE document bottom. (The
  // reserved padding can grow the page past the viewport; scrollIntoViewIfNeeded
  // stops as soon as the footer is "visible" — i.e. still behind the dock.)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const footerBox = await footer.boundingBox();
  const dockBox = await dock.boundingBox();
  expect(footerBox).not.toBeNull();
  expect(dockBox).not.toBeNull();
  if (!footerBox || !dockBox) return;
  expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(dockBox.y + 0.5);
  // And the clearance pushed the footer UP, not out of the viewport.
  await expect(footer).toBeInViewport({ ratio: 1 });
}

test("the offline strip never occludes the footer", async ({ page }) => {
  await page.goto("/__no_such_route__");
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await goOffline(page);
  await expectFooterClearsDock(page);
});

test("the install prompt never occludes the footer", async ({ page }) => {
  await page.goto("/__no_such_route__");
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await armInstallPrompt(page);
  await expectFooterClearsDock(page);
});

test("offline strip + install prompt TOGETHER never occlude the footer", async ({
  page,
}) => {
  await page.goto("/__no_such_route__");
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await goOffline(page);
  await armInstallPrompt(page);
  await expectFooterClearsDock(page);
});
