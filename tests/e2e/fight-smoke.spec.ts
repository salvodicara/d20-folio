/**
 * Smoke: a character sheet opened inside a campaign fight renders and stays rendered,
 * on the live sheet (`chromium` project) and on the new UI's Play screen (`new-ui`).
 * No error boundary, no uncaught page error, no React update loop. Guards the class of
 * crash #682 shipped: every sheet in a fight hit «Maximum update depth exceeded», and
 * no completed run opened a sheet inside an encounter to see it. Runs on every pull
 * request (ci.yml, design rules job) and in Verify's sharded matrix.
 *
 * The dev campaign fixture's encounter (`d20-dev-encounter`) is the one that feeds the
 * live status the way a real campaign does; the team bard is its own PC.
 */
import { test, expect } from "@playwright/test";
import { DESKTOP, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 90_000 });

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
  await page.goto("/characters/team-catalion-bard");
  await expect(page).toHaveTitle(/·/, { timeout: 45_000 });
  // A render loop needs a few seconds of listener updates to blow up.
  await page.waitForTimeout(10_000);

  // Neither error boundary: the page's («Qualcosa è andato storto») nor a section's.
  await expect(page.getByText("Qualcosa è andato storto")).toHaveCount(0);
  await expect(page.getByText(/^Impossibile mostrare questa sezione/)).toHaveCount(0);
  expect(errors).toEqual([]);
});
