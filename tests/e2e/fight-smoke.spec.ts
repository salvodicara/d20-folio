/**
 * Smoke: a character sheet opened inside a campaign fight renders and stays rendered,
 * on the live sheet (`chromium` project) and on the new UI's Play screen (`new-ui`).
 * No error boundary, no uncaught page error, no React update loop. Guards the class of
 * crash #682 shipped (every sheet in a fight hit «Maximum update depth exceeded»).
 * Runs on every pull request (ci.yml, design rules job) and in Verify's matrix.
 *
 * Two phases. READY: wait for a real signal (the old sheet's fight pill, which renders
 * only once the dev campaign fixture's live status is applied; the new Play screen's
 * root), with a budget for a cold dev-server compile; never the page title (a cold
 * compile once kept it at "d20 Folio" for 45 s, the flake this replaces). WATCH: a crash
 * fed by later listener updates needs a few seconds to surface, so the page is then
 * watched for a fixed window; it can only miss a bug, never fail a healthy page. The
 * #682 loop itself is pinned deterministically by tests/unit/global-combat.test.tsx.
 * Note: in this fixture the dev user is the campaign's DM, so the mount runs its
 * "no own fight" branch (the one #682 looped through), not a player's own status.
 */
import { test, expect } from "@playwright/test";
import { DESKTOP, seedLang, seedUI } from "./surfaces";

// A cold dev-server compile of the sheet route can take most of a minute on CI.
test.describe.configure({ timeout: 150_000 });

const READY_MS = 90_000;
/** Long enough for #682's loop to blow up on both projects (proven), after READY. */
const WATCH_MS = 10_000;

test("a sheet inside a campaign fight renders and settles", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /Maximum update depth/i.test(message.text()))
      errors.push(message.text());
  });

  await page.setViewportSize(DESKTOP);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.addInitScript(() => window.localStorage.setItem("d20-dev-encounter", "1"));
  await page.goto("/characters/team-bard");

  // A crash replaces the page with the error screen: fail on it at once, not on a timeout.
  const crashed = page.getByText("Qualcosa è andato storto");
  const ready =
    test.info().project.name === "new-ui"
      ? page.locator(".f-char")
      : page.locator(".cp-state", { hasText: /Turno di/ });
  await expect(ready.or(crashed).first()).toBeVisible({ timeout: READY_MS });
  await page.waitForTimeout(WATCH_MS);

  // Neither error boundary: the page's nor a section's; no uncaught error, no loop.
  await expect(crashed).toHaveCount(0);
  await expect(page.getByText(/^Impossibile mostrare questa sezione/)).toHaveCount(0);
  await expect(ready.first()).toBeVisible();
  expect(errors).toEqual([]);
});
