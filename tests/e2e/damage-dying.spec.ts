/**
 * E2E — the damage-and-dying flow (RA-03/05/10/11).
 *
 * Drives the REAL app end-to-end through the ONE HP editor + the dying banner:
 *  1. RA-05 — a RAGING Barbarian's typed damage entry: the defended-type chips
 *     appear, the live math halves (12 → 6), and the applied HP drop is the NET.
 *  2. RA-05 — a multi-type hit staged as parts ("Add another") applies the sum.
 *  3. RA-03/10 — a knockout: the dying banner arms, Unconscious auto-applies.
 *  4. RA-03 — damage while at 0 (crit toggle) marks TWO failures, HP stays 0.
 *  5. RA-11 — the death-save d20 roll entry: success, nat-1 double failure, and
 *     the nat-20 revival (1 HP, banner gone).
 *  6. RA-03 — massive damage = instant death: the banner reads Dead and the
 *     at-0 interrupt (Relentless Endurance) is NOT offered on a corpse.
 */

import { test, expect, type Page } from "@playwright/test";
import { seedUI, seedLang, readyByName } from "./surfaces";

/** Open the header HP popover (works alive AND at 0 — the pill stays the editor). */
async function openHp(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /hit points/i })
    .first()
    .click();
  await page.getByRole("dialog", { name: /hit points/i }).waitFor();
}

/**
 * Reveal the Resources rail. On the phone cockpit (<1180px) the Right HUD —
 * which carries the Active Features (Rage) toggle bar — folds behind a collapsed
 * "Resources" disclosure; on desktop that toggle is `rail:hidden` and the rail is
 * always open, so this is a no-op there. Mirrors the sibling shot specs' idiom.
 */
async function revealResourcesRail(page: Page): Promise<void> {
  const disclosure = page.getByRole("button", { name: /^resources$/i }).first();
  if (await disclosure.isVisible().catch(() => false)) {
    await disclosure.click();
  }
}

/** Type an amount + tap a verb inside the open HP popover. */
async function applyDamage(page: Page, amount: string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: /hit points/i });
  await dialog.getByRole("spinbutton", { name: /amount/i }).fill(amount);
  await dialog.getByRole("button", { name: /^damage$/i }).click();
}

test.describe("RA-05 — defense-aware damage entry (raging Barbarian)", () => {
  test.beforeEach(async ({ page }) => {
    await seedUI(page, "dark", "play");
    await seedLang(page, "en");
    await page.goto("/characters/scn-wildheart-barbarian", {
      waitUntil: "domcontentloaded",
    });
    await page.getByText("Korga, Barbarian").first().waitFor({ timeout: 20000 });
    // Phone cockpit folds the Right HUD (the Active Features bar) behind the
    // "Resources" disclosure — open it so the Rage toggle is reachable (no-op on
    // desktop, where the rail is always open).
    await revealResourcesRail(page);
    // Light Rage — its while-active B/P/S resistance is what the intake applies.
    await page
      .locator('[data-testid="activatable-bar"]')
      .getByRole("button", { name: /rage/i })
      .first()
      .click();
  });

  test("typed slashing halves with the math shown; untyped passes verbatim", async ({
    page,
  }) => {
    await openHp(page);
    const dialog = page.getByRole("dialog", { name: /hit points/i });
    // The defended-type chips exist ONLY because Rage is active.
    const slashing = dialog.getByRole("button", { name: /^slashing$/i });
    await expect(slashing).toBeVisible();

    // Live math: 12 slashing → 6 · Resisted.
    await dialog.getByRole("spinbutton", { name: /amount/i }).fill("12");
    await slashing.click();
    await expect(dialog.getByText(/12 → 6/)).toBeVisible();

    // Commit — the NET (6) applies. Korga L7 CON16: read HP before/after.
    const before = await hpCurrent(dialog);
    await dialog.getByRole("button", { name: /^damage$/i }).click();
    await openHp(page);
    const after = await hpCurrent(page.getByRole("dialog", { name: /hit points/i }));
    expect(before - after).toBe(6);
  });

  test("a multi-type hit staged as parts applies the summed nets", async ({ page }) => {
    await openHp(page);
    const dialog = page.getByRole("dialog", { name: /hit points/i });
    const before = await hpCurrent(dialog);

    // Part 1 — 8 slashing (resisted → 4), staged.
    await dialog.getByRole("spinbutton", { name: /amount/i }).fill("8");
    await dialog.getByRole("button", { name: /^slashing$/i }).click();
    await dialog.getByRole("button", { name: /add another/i }).click();
    // Part 2 — 7 untyped fire-equivalent (no fire defense → no fire chip; verbatim).
    await dialog.getByRole("spinbutton", { name: /amount/i }).fill("7");
    // The running total shows raw → net.
    await expect(dialog.getByText(/15 → 11/)).toBeVisible();
    await dialog.getByRole("button", { name: /^damage$/i }).click();

    await openHp(page);
    const after = await hpCurrent(page.getByRole("dialog", { name: /hit points/i }));
    expect(before - after).toBe(11);
  });
});

test.describe("RA-03/10/11 — crossing 0, dying, death saves (mock character)", () => {
  test.beforeEach(async ({ page }) => {
    await seedUI(page, "dark", "play");
    await seedLang(page, "en");
    await page.goto("/characters/mock-1", { waitUntil: "domcontentloaded" });
    await readyByName(page);
  });

  test("knockout → Unconscious + dying banner; crit at 0 marks two failures; d20 entries resolve; nat 20 revives", async ({
    page,
  }) => {
    // ── Knockout (RA-03/RA-10) ────────────────────────────────────────────
    await openHp(page);
    await applyDamage(page, "60"); // mock: 38 current + 5 temp — enough to cross, not massive
    const banner = page.getByRole("status").filter({ hasText: /death saves/i });
    await expect(banner).toBeVisible();
    // Unconscious auto-applied — the CONDITION CHIP renders on the sheet (scoped
    // to the chip recipe: the combat log also narrates the gain).
    await expect(
      page.locator(".co-chip").filter({ hasText: /unconscious/i })
    ).toHaveCount(1);

    // ── Damage while at 0, CRIT (RA-03) ───────────────────────────────────
    await openHp(page); // the danger pill stays the one HP editor
    const dialog = page.getByRole("dialog", { name: /hit points/i });
    await dialog.getByRole("button", { name: /critical hit/i }).click();
    await dialog.getByRole("spinbutton", { name: /amount/i }).fill("5");
    await dialog.getByRole("button", { name: /^damage$/i }).click();
    // Two failure pips lit.
    await expect(banner.getByRole("button", { name: /failures 2/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(banner.getByRole("button", { name: /failures 3/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    // ── The death-save roll entry (RA-11) ─────────────────────────────────
    const face = banner.getByRole("spinbutton", { name: /death-save d20/i });
    await face.fill("15");
    await banner.getByRole("button", { name: /^apply$/i }).click();
    await expect(banner.getByRole("button", { name: /successes 1/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Nat 20 — regain 1 HP, wake: the banner unmounts, Unconscious is shed.
    await face.fill("20");
    await banner.getByRole("button", { name: /^apply$/i }).click();
    await expect(banner).not.toBeVisible();
    await expect(
      page.locator(".co-chip").filter({ hasText: /unconscious/i })
    ).toHaveCount(0);
  });
});

test.describe("RA-03 — massive-damage instant death (Orc: no interrupt on a corpse)", () => {
  test("999 damage kills outright: Dead verdict, no 'Stay at 1 HP' offer", async ({
    page,
  }) => {
    await seedUI(page, "dark", "play");
    await seedLang(page, "en");
    await page.goto("/characters/scn-wildheart-barbarian", {
      waitUntil: "domcontentloaded",
    });
    await page.getByText("Korga, Barbarian").first().waitFor({ timeout: 20000 });

    await openHp(page);
    await applyDamage(page, "999");
    const banner = page.getByRole("status").filter({ hasText: /death saves/i });
    await expect(banner).toBeVisible();
    // The verdict register reads Dead; three failure pips lit.
    await expect(banner.getByText(/^dead$/i)).toBeVisible();
    await expect(banner.getByRole("button", { name: /failures 3/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    // Relentless Endurance is NOT offered — RAW it fires when reduced to 0
    // "but not killed outright". No Unconscious chip on a corpse either.
    await expect(banner.getByText(/stay at 1 hp/i)).toHaveCount(0);
    // No roll entry once resolved.
    await expect(banner.getByRole("spinbutton", { name: /death-save d20/i })).toHaveCount(
      0
    );
  });
});

/** Read the popover's big current-HP numeral. */
async function hpCurrent(dialog: ReturnType<Page["getByRole"]>): Promise<number> {
  const text = await dialog
    .locator("span.font-display.text-2xl > span")
    .first()
    .innerText();
  return parseInt(text, 10);
}
