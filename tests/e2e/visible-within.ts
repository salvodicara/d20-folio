import type { Locator } from "@playwright/test";

/**
 * Whether `locator` becomes visible within `ms`. Playwright's
 * `isVisible({ timeout })` ignores its timeout and answers at once, so an optional
 * control that renders a beat late reads as absent and the test races the app.
 * This waits for real (`isvisible-timeout.guard.test.ts` bans the old form).
 */
export function visibleWithin(locator: Locator, ms: number): Promise<boolean> {
  return locator
    .waitFor({ state: "visible", timeout: ms })
    .then(() => true)
    .catch(() => false);
}
