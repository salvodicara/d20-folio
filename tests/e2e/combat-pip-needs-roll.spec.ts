/**
 * combat-pip-needs-roll — PERMANENT proof of the topbar combat pip's per-encounter
 * roll-state (the two owner-reported bugs + the render-reconciliation). It drives the REAL
 * producer through the dev-bypass pip-scenario harness (`d20-dev-pip-scenario`, which seeds
 * shared campaigns where the bypass viewer is a PC + their per-encounter `combat/state`), so
 * the ACTUAL rendered pip reflects the resolved roll-state — reverting the per-encounter
 * producer wiring fails these tests.
 *
 * Scenarios:
 *   (i)   fresh   — the viewer owes a roll: pip is RED needs-roll, an ACTION with NO `→ dest`
 *                   arrow, and tapping OPENS THE ROLLER (the d20 input), never navigates.
 *   (ii)  rolled  — already rolled this epoch: pip is QUIET gathering, a navigating switch
 *                   WITH the `→ dest` arrow (NOT red) — no false red.
 *   (iii) multi   — two fights (one needs-roll, one rolled): the chooser shows EACH row's OWN
 *                   state, and the needs-roll row stays red whether it is the primary (pinned)
 *                   or a secondary row — switching the pin never bleeds one row into the other.
 */

import { test, expect, type Page } from "@playwright/test";
import { seedUI, seedLang, freezeMotion } from "./surfaces";

/** Seed a pip roll-state scenario (+ optional pinned encounter) before the app boots. */
async function seedPip(page: Page, scenario: string, pin?: string): Promise<void> {
  await page.addInitScript(
    ([s, p]) => {
      window.localStorage.setItem("d20-dev-pip-scenario", s);
      if (p) window.localStorage.setItem("d20-combat-pin", p);
    },
    [scenario, pin ?? ""] as const
  );
}

/** Boot the app on a topbar-bearing route and wait for the pip to resolve to `phase`.
 *  Waits for ATTACHED, not visible: the boot signal is the producer resolving the
 *  encounter to `phase` (the `data-phase` on the rendered pip). Visibility is a
 *  separate, responsive concern — on the PHONE a MULTI wrap deliberately hides the
 *  primary pill and stands the count chip alone (folio.css `:has(.cp-count) .combat-pip
 *  { display:none }`, owner 2026-07-11), so a visible-wait would hang there even though
 *  the state resolved correctly. Tests that TAP the primary pip (i, iv) still get full
 *  actionability (visibility) enforcement for free from Playwright's `.click()`. */
async function bootPip(page: Page, phase: string) {
  await seedUI(page, "dark", "play");
  await seedLang(page, "en");
  await page.goto("/characters/mock-1");
  const pip = page.locator(`.combat-pip[data-phase="${phase}"]`);
  await pip.waitFor({ state: "attached", timeout: 20_000 });
  await freezeMotion(page);
  return pip;
}

test.describe("combat pip — per-encounter roll-state", () => {
  test("(i) fresh fight → RED needs-roll: no dest arrow, tap opens the roller (not navigate)", async ({
    page,
  }) => {
    await seedPip(page, "fresh");
    const pip = await bootPip(page, "needs-roll");

    // The needs-roll pip is an ACTION, not a switch — a <button>, never a navigating <link>…
    await expect(pip).toHaveJSProperty("tagName", "BUTTON");
    // …and it carries NO destination chip (that belongs to the switch states).
    await expect(pip.locator(".cp-dest-chip")).toHaveCount(0);

    // Tapping OPENS THE INLINE ROLLER (the d20 roll-to-total input), not a navigation.
    const before = page.url();
    await pip.click();
    await expect(page.getByPlaceholder("d20")).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toBe(before); // never navigated
  });

  test("(ii) already rolled → QUIET gathering split switch (no false red)", async ({
    page,
  }) => {
    await seedPip(page, "rolled");
    const pip = await bootPip(page, "gathering");

    // A quiet gathering pip is the PORTRAIT-SOCKET split switch — a status segment + a
    // navigating destination chip (the link), never the loud red needs-roll roller…
    await expect(pip).toHaveClass(/combat-pip-split/);
    await expect(pip.locator("a.cp-dest-chip")).toHaveCount(1);
    // …and it is NEVER the loud red needs-roll (the rejected transient false-red).
    await expect(page.locator('.combat-pip[data-phase="needs-roll"]')).toHaveCount(0);
  });

  test("(iii) two fights → the chooser reflects EACH row's own state (secondary needs-roll, no bleed)", async ({
    page,
  }) => {
    // Default primary is the most-recent (the ROLLED fight) → quiet pill; the needs-roll fight
    // is a SECONDARY chooser row that STILL reads red (the old primary-only code forced it to
    // gathering — BUG 2).
    await seedPip(page, "multi");
    await bootPip(page, "gathering");

    // Open the multi-encounter chooser (the count chip).
    await page.locator(".cp-count").click();
    const rows = page.locator(".cp-chooser .cp-row");
    await expect(rows).toHaveCount(2);
    await expect(
      page.locator('.cp-chooser .cp-row[data-state="needs-roll"]')
    ).toHaveCount(1);
    await expect(page.locator('.cp-chooser .cp-row[data-state="gathering"]')).toHaveCount(
      1
    );
  });

  // The roll popover DISMISSES cleanly by all three paths — and clicking the trigger AGAIN
  // while open CLOSES it rather than dismiss-and-reopening (owner-reported: the second click
  // used to reopen, needing a third to close). The Radix trigger fully owns open/close; the
  // typed roll is committed ON CLOSE (from the current draft, not on a blur that raced the
  // popover teardown and LOST the value — the follow-up "roll no longer saves" regression,
  // pinned by tests/unit/init-vital-dismiss.tsx). So all four behaviours hold at once. (The
  // firebase-backed commit itself isn't observable under the dev-bypass — its round-trip is
  // pinned by the unit contract, which drives the real InitVital through a stateful harness.)
  test("(iv) roll popover: trigger toggle closes (no reopen) + outside-click + Escape dismiss", async ({
    page,
  }) => {
    async function open() {
      const pip = await bootPip(page, "needs-roll");
      await pip.click();
      await expect(page.getByPlaceholder("d20")).toBeVisible({ timeout: 10_000 });
      return pip;
    }

    // (a) Clicking the trigger a SECOND time closes it — never dismiss-and-reopen.
    await seedPip(page, "fresh");
    const pip = await open();
    await pip.click();
    await page.waitForTimeout(400); // give any spurious reopen a chance to happen
    await expect(page.getByPlaceholder("d20")).toHaveCount(0);

    // (b) Re-open and dismiss by clicking OUTSIDE (owner: must still work).
    await pip.click();
    await expect(page.getByPlaceholder("d20")).toBeVisible();
    await page.mouse.click(5, 400);
    await expect(page.getByPlaceholder("d20")).toHaveCount(0);

    // (c) Re-open and dismiss with Escape.
    await pip.click();
    await expect(page.getByPlaceholder("d20")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder("d20")).toHaveCount(0);
  });

  test("(iii-b) switching the pinned encounter never changes the other row", async ({
    page,
  }) => {
    // PIN the needs-roll fight (pip-multi-a) → it becomes the PRIMARY red pill; the rolled
    // fight (pip-multi-b) is the secondary. The needs-roll row reads red whether primary
    // (here) or secondary (previous test) — the pin never bleeds a row's state.
    await seedPip(page, "multi", "pip-multi-a");
    await bootPip(page, "needs-roll");

    await page.locator(".cp-count").click();
    // The OTHER fight (now secondary) is UNCHANGED — still quiet gathering.
    await expect(page.locator('.cp-chooser .cp-row[data-state="gathering"]')).toHaveCount(
      1
    );
    await expect(
      page.locator('.cp-chooser .cp-row[data-state="needs-roll"]')
    ).toHaveCount(1);
  });
});
