/**
 * E2E: Accessibility gate for the Phase-6 header HP control's interactive states.
 *
 * The manifest-driven `a11y.spec.ts` covers the cockpit's static surfaces (play +
 * edit, light + dark). HP relocated into the header in the IA revision adds two
 * INTERACTIVE states the static manifest can't reach: the damage/heal/temp popover
 * OPEN, and the 0-HP DYING affordance (death saves + quick heal). This drives each
 * and runs axe — both themes, desktop + mobile — and fails on serious/critical
 * WCAG 2.1 AA violations (same bar as a11y.spec).
 */

import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedUI, seedLang, freezeMotion, readyByName, type Theme } from "./surfaces";

const BLOCKING = new Set(["serious", "critical"]);
const THEMES: Theme[] = ["dark", "light"];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 900 },
] as const;

async function scan(page: Page): Promise<void> {
  await freezeMotion(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => typeof v.impact === "string" && BLOCKING.has(v.impact)
  );
  const summary = blocking
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})\n  ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join("\n  ")}`
    )
    .join("\n");
  expect(blocking, summary).toEqual([]);
}

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    test(`a11y: HP popover open [${theme}/${vp.name}]`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await seedUI(page, theme, "play");
      await seedLang(page, "en");
      await page.goto("/characters/mock-1", { waitUntil: "domcontentloaded" });
      await readyByName(page);
      await page.getByRole("button", { name: /hit points: open/i }).click();
      await page.getByRole("dialog", { name: /hit points/i }).waitFor();
      await scan(page);
    });

    test(`a11y: HP intake chips open (raging Barbarian) [${theme}/${vp.name}]`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await seedUI(page, theme, "play");
      await seedLang(page, "en");
      // The scenario seeds Rage ACTIVE (the rail toggle isn't mounted on the
      // mobile viewport), so the RA-05 chips render straight away.
      await page.goto("/characters/scn-raging-barbarian", {
        waitUntil: "domcontentloaded",
      });
      await page.getByText("Korga, Raging").first().waitFor({ timeout: 20000 });
      await page
        .getByRole("button", { name: /hit points/i })
        .first()
        .click();
      const dialog = page.getByRole("dialog", { name: /hit points/i });
      await dialog.waitFor();
      // A selected chip + the live math line + a staged part — the full surface.
      await dialog.getByRole("spinbutton", { name: /amount/i }).fill("12");
      await dialog.getByRole("button", { name: /^slashing$/i }).click();
      await dialog.getByText(/12 → 6/).waitFor();
      await scan(page);
    });

    test(`a11y: dying banner roll entry + at-0 popover crit toggle [${theme}/${vp.name}]`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await seedUI(page, theme, "play");
      await seedLang(page, "en");
      await page.goto("/characters/mock-1", { waitUntil: "domcontentloaded" });
      await readyByName(page);
      await page.getByRole("button", { name: /hit points: open/i }).click();
      const dialog = page.getByRole("dialog", { name: /hit points/i });
      await dialog.getByRole("spinbutton", { name: /amount/i }).fill("60");
      await dialog.getByRole("button", { name: /^Damage$/i }).click();
      // The banner (verdict + roll entry + pips) is up; reopen the at-0 popover
      // so its Critical-hit toggle is in the scanned tree too.
      await page
        .getByText(/death saves/i)
        .first()
        .waitFor();
      await page
        .getByRole("button", { name: /hit points/i })
        .first()
        .click();
      await page
        .getByRole("dialog", { name: /hit points/i })
        .getByRole("button", { name: /critical hit/i })
        .waitFor();
      await scan(page);
    });

    test(`a11y: HP dying state [${theme}/${vp.name}]`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await seedUI(page, theme, "play");
      await seedLang(page, "en");
      await page.goto("/characters/mock-1", { waitUntil: "domcontentloaded" });
      await readyByName(page);
      // Drop to 0 HP via the popover → the header becomes the dying affordance.
      await page.getByRole("button", { name: /hit points: open/i }).click();
      const dialog = page.getByRole("dialog", { name: /hit points/i });
      await dialog.getByRole("spinbutton", { name: /amount/i }).fill("60");
      await dialog.getByRole("button", { name: /^Damage$/i }).click();
      await page
        .getByText(/death saves/i)
        .first()
        .waitFor();
      await scan(page);
    });
  }
}
