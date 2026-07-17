/**
 * E2E: Combat live-play loop (the cockpit Play tab + center This-Turn meter).
 *
 * Restored at Phase 4 (quarantined through Phase 3): the action economy is
 * promoted into the persistent center `ThisTurnTracker` and the Play-tab action
 * cards are the commit surface; both dispatch through the one shared economy owner.
 * Drives the REAL flow against the dev server (VITE_DEV_BYPASS_AUTH=true, mock
 * Lyra Voss at /characters/mock-1 — Bard 9, mid-combat: 38/62 HP + 5 temp,
 * concentrating on Hypnotic Pattern, round 5).
 *
 * Desktop-only: live play is desktop-first (Constitution §3); the Resources rail
 * (conditions, slots) is always visible at desktop width, but lives behind the
 * mobile "Resources" disclosure on the phone band (covered by the a11y + visual
 * surfaces). Mirrors `abilities.spec.ts`.
 */

import { test, expect, type Page, type Locator } from "@playwright/test";

/** The CONCENTRATION banner specifically — not the sibling B3 "what's limiting
 *  you this turn" banner that shares the `.conc-banner` register. The
 *  concentration banner is the one announcing "Concentrating on …" (the limiter
 *  read-out never carries that copy), so this stays a single, stable element. */
function concentrationBanner(page: Page): Locator {
  return page.locator(".conc-banner").filter({ hasText: /Concentrating on/i });
}

test.describe("Combat live-play loop (cockpit)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "Desktop-first gameplay: the Resources rail is behind the mobile disclosure (a11y/visual cover it)."
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/characters/mock-1");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
  });

  // ── Display (the legacy combat-page readouts, re-homed to the cockpit) ──────

  test("the header HP control shows current / max / temp HP", async ({ page }) => {
    // HP relocated into the header (Phase-6 IA revision): a slim bar trigger.
    const hp = page.getByRole("button", { name: /hit points: open/i });
    await expect(hp).toContainText("38");
    await expect(hp).toContainText("62");
    await expect(hp).toContainText("+5");
  });

  test("the This-Turn meter shows the round, hydrated from the session", async ({
    page,
  }) => {
    // The mock is mid-combat at round 5 (MOCK_COMBAT_ROUND): production hydrates the
    // solo round from the `combat/state` subdoc; dev-bypass seeds the turn engine from
    // that same value at load. Either way the meter reads it, never the round-1 default.
    await expect(page.getByText(/^round$/i).first()).toBeVisible();
    await expect(page.locator(".r-ring")).toHaveText("5");
  });

  test("the concentration banner names the active spell", async ({ page }) => {
    // `.conc-banner` is a shared register: the concentration banner AND the B3
    // "what's limiting you this turn" banner (`.turn-limiters`, surfaced here by
    // the mock's Frightened → netted attack-disadvantage) both use it. Scope to
    // the concentration banner — the one carrying the clear-concentration drop
    // control (the limiter read-out has no action) — so the strict locator is
    // unambiguous.
    await expect(concentrationBanner(page)).toContainText(/Hypnotic Pattern/i);
  });

  test("the Resources rail shows active conditions and spell slots", async ({ page }) => {
    // Frightened is active in the mock → a "Remove Frightened" control surfaces.
    await expect(
      page.getByRole("button", { name: /remove frightened/i }).first()
    ).toBeVisible();
    // Bard 9 has spell slots — each cell is an img with an availability label.
    await expect(
      page.getByRole("img", { name: /level-1 slots available/i }).first()
    ).toBeVisible();
  });

  test("the action log shows recent entries", async ({ page }) => {
    await expect(page.getByText(/Hypnotic Pattern/i).first()).toBeVisible();
  });

  // ── Live-play loop (the Phase-4 economy) ────────────────────────────────────

  test("commit an action: the whole action group disables to 'Used'; the snackbar's Undo reverses", async ({
    page,
  }) => {
    const actionToken = page.locator('.econ-tok[data-kind="action"]');
    await expect(actionToken).toHaveAttribute("data-state", "open");

    // Mage Hand is a cantrip (no slot, no concentration) → commits directly.
    await page.getByRole("button", { name: "Cast: Mage Hand" }).click();

    // The Action economy slot fills (data-state → spent). The committed action's
    // name is ON-DEMAND detail (B6 declutter): it lives in the disc's `title`
    // tooltip + the sr-only slot status, not as a visible text node.
    await expect(actionToken).toHaveAttribute("data-state", "spent");
    await expect(actionToken.locator(".econ-disc")).toHaveAttribute("title", "Mage Hand");

    // THE CTA GRAMMAR (owner-ratified 2026-07-11): the committed card's CTA
    // DISABLES to "Used" (no inline Undo toggle exists)…
    const used = page.getByRole("button", { name: "Used: Mage Hand", exact: true });
    await expect(used).toBeDisabled();
    // …and EVERY action-slot card reads the same spent contract (the reaction
    // contract generalized) — e.g. the base Dash card…
    await expect(
      page.getByRole("button", { name: "Used: Dash", exact: true })
    ).toBeDisabled();
    // …while the bonus board stays live (its own token is unspent).
    await expect(
      page.getByRole("button", { name: "Use: Bardic Inspiration", exact: true })
    ).toBeEnabled();

    // REVERSAL lives on the undo system alone: the act's snackbar carries the
    // one visible Undo (`exact` — the masthead command reads "Undo: Mage Hand
    // used", so the bare "Undo" is the toast button).
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(actionToken).toHaveAttribute("data-state", "open");
    await expect(page.getByRole("button", { name: "Cast: Mage Hand" })).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Use: Dash", exact: true })
    ).toBeEnabled();
  });

  test("a bonus action spends only the bonus token; a reaction spends only the reaction token — each undoable via the snackbar", async ({
    page,
  }) => {
    const bonusToken = page.locator('.econ-tok[data-kind="bonus"]');
    const reactionToken = page.locator('.econ-tok[data-kind="reaction"]');

    // BONUS — Bardic Inspiration (a fixed-cost bonus-action feature).
    await page.getByRole("button", { name: "Use: Bardic Inspiration" }).click();
    await expect(bonusToken).toHaveAttribute("data-state", "spent");
    await expect(
      page.getByRole("button", { name: "Used: Bardic Inspiration", exact: true })
    ).toBeDisabled();
    // The action board is untouched by a bonus spend.
    await expect(page.getByRole("button", { name: "Cast: Mage Hand" })).toBeEnabled();
    // Undo via the snackbar → the bonus token re-arms and the card returns live.
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(bonusToken).toHaveAttribute("data-state", "open");
    await expect(
      page.getByRole("button", { name: "Use: Bardic Inspiration", exact: true })
    ).toBeEnabled();

    // REACTION — the base Opportunity Attack card (always present). Spending it
    // disables EVERY reaction CTA to "Used" (the round's one Reaction is gone).
    await page.getByRole("button", { name: "React: Opportunity Attack" }).click();
    await expect(reactionToken).toHaveAttribute("data-state", "spent");
    await expect(
      page.getByRole("button", { name: "Used: Opportunity Attack", exact: true })
    ).toBeDisabled();
    // Undo via the snackbar → the reaction re-arms.
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(reactionToken).toHaveAttribute("data-state", "open");
    await expect(
      page.getByRole("button", { name: "React: Opportunity Attack", exact: true })
    ).toBeEnabled();
  });

  test("End Turn advances the round and clears the economy (pure bookkeeping)", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Cast: Mage Hand" }).click();
    const actionToken = page.locator('.econ-tok[data-kind="action"]');
    await expect(actionToken).toHaveAttribute("data-state", "spent");

    await page.getByRole("button", { name: /end turn/i }).click();

    // Round advanced (5 → 6); the spent slot is cleared (nothing to "forget").
    await expect(page.locator(".r-ring")).toHaveText("6");
    await expect(actionToken).toHaveAttribute("data-state", "open");
  });

  test("a blocking condition gates the economy", async ({ page }) => {
    // Add Incapacitated via the Resources rail condition picker (the in-app
    // picker uses canonical lowercase ids, so the gate resolves).
    await page
      .getByRole("button", { name: /add condition/i })
      .first()
      .click();
    await page.getByRole("option", { name: /^Incapacitated$/i }).click();

    // An Action can no longer be committed — the gate blocks it (slot stays open).
    await page.getByRole("button", { name: "Cast: Mage Hand" }).click();
    await expect(page.getByText(/a condition prevents this/i)).toBeVisible();
    await expect(page.locator('.econ-tok[data-kind="action"]')).toHaveAttribute(
      "data-state",
      "open"
    );
  });

  test("casting a 2nd concentration spell prompts to break, and undo restores it", async ({
    page,
  }) => {
    const banner = concentrationBanner(page);
    await expect(banner).toContainText(/Hypnotic Pattern/i);

    // Bane is a L1 concentration spell that costs a slot → the cast-level picker
    // opens first; pick the base level.
    await page.getByRole("button", { name: "Cast: Bane" }).click();
    await page.getByText(/Level 1 \(base\)/i).click();

    // The branded concentration-break confirm appears; cast anyway.
    await expect(page.getByText(/break concentration/i)).toBeVisible();
    await page.getByRole("button", { name: /cast anyway/i }).click();

    // Concentration swapped to Bane; the committed card disables to "Used".
    await expect(banner).toContainText(/Bane/i);
    await expect(
      page.getByRole("button", { name: "Used: Bane", exact: true })
    ).toBeDisabled();

    // Undo via the cast's snackbar (the one visible Undo — the CTA grammar):
    // concentration is restored.
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(banner).toContainText(/Hypnotic Pattern/i);
  });

  // ── Extra Attack (the double-attack answer) — scn-barbarian-extra-attack ─────
  test("Extra Attack: swings stay LIVE gold; full spend disables ALL attack CTAs; the one evolving snackbar undoes the last swing", async ({
    page,
  }) => {
    await page.goto("/characters/scn-barbarian-extra-attack?tab=play");
    await expect(page.getByText("Vokka, Berserker").first()).toBeVisible();

    const actionToken = page.locator('.econ-tok[data-kind="action"]');
    const greataxe = page.getByRole("button", { name: /^(Attack|Used): Greataxe/ });
    const handaxe = page.getByRole("button", { name: /^(Attack|Used): Handaxe/ });

    // Swing 1 — the Action coin spends fully (plain action semantics)…
    await greataxe.click();
    await expect(actionToken).toHaveAttribute("data-state", "spent");
    // …but EVERY attack-capable CTA stays LIVE + struck gold (BG3 grammar), the
    // count discoverable on the CTA's hover title only.
    await expect(greataxe).toBeEnabled();
    await expect(handaxe).toBeEnabled();
    await expect(greataxe).toHaveAttribute("title", /1 of 2 attacks remaining/i);
    expect(await page.locator(".uc-cta.is-emphasis").count()).toBeGreaterThanOrEqual(2);

    // Swing 2 (the last) — the Attack action is fully swung: the gold drops and
    // every attack CTA disables to "Used" like any spent action (ONE rule).
    await greataxe.click();
    await expect(greataxe).toBeDisabled();
    await expect(handaxe).toBeDisabled();
    await expect(page.locator(".uc-cta.is-emphasis")).toHaveCount(0);

    // ONE evolving snackbar covers the whole Attack action; its Undo pops the
    // LAST swing → back to mid-action: CTAs re-kindle, count returns.
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(greataxe).toBeEnabled();
    await expect(greataxe).toHaveAttribute("title", /1 of 2 attacks remaining/i);
  });

  // ── HP control (the header slim-bar → popover, Phase-6 IA revision) ──────────

  /** Open the header HP popover and return its dialog locator. The trigger is
   *  matched on its full "… hit points: open …" name — a bare /hit points/i is
   *  ambiguous while the popover (or its exit animation) is up, because the P2
   *  "Learn about Hit Points" glossary trigger lives inside the popover body. */
  async function openHpPopover(page: import("@playwright/test").Page) {
    await page.getByRole("button", { name: /hit points: open/i }).click();
    return page.getByRole("dialog", { name: /hit points/i });
  }

  test("HP damage applies with temp absorbing first; heal restores", async ({ page }) => {
    // 10 damage: 5 temp absorbs first, then 5 to HP → 38 - 5 = 33 (NOT 28).
    let dialog = await openHpPopover(page);
    await dialog.getByRole("spinbutton", { name: /amount/i }).fill("10");
    await dialog.getByRole("button", { name: /^Damage$/i }).click();
    // Applying closes the popover; the header readout updates to 33 (temp spent).
    await expect(page.getByRole("button", { name: /hit points: open/i })).toContainText(
      "33"
    );

    // Heal 5 → 33 + 5 = 38.
    dialog = await openHpPopover(page);
    await dialog.getByRole("spinbutton", { name: /amount/i }).fill("5");
    await dialog.getByRole("button", { name: /^Heal$/i }).click();
    await expect(page.getByRole("button", { name: /hit points: open/i })).toContainText(
      "38"
    );
  });

  test("dropping to 0 HP surfaces the header dying state + death saves", async ({
    page,
  }) => {
    // 5 temp + 38 HP = 43 effective; 60 damage drops to 0 → the header becomes the
    // dying affordance (death saves), visible on every tab.
    const dialog = await openHpPopover(page);
    await dialog.getByRole("spinbutton", { name: /amount/i }).fill("60");
    await dialog.getByRole("button", { name: /^Damage$/i }).click();

    await expect(page.getByText(/death saves/i).first()).toBeVisible();
  });

  test("a fresh knockout starts a clean 0/0 dying track (stored marks don't carry over)", async ({
    page,
  }) => {
    // The mock carries deathSucc=2 / deathFail=1 from a PRIOR episode while still
    // alive. RAW: dropping to 0 starts a FRESH dying state — so when the tracker
    // surfaces, NO pips are filled (the lingering 2/1 was reset on the knockout).
    const dialog = await openHpPopover(page);
    await dialog.getByRole("spinbutton", { name: /amount/i }).fill("60");
    await dialog.getByRole("button", { name: /^Damage$/i }).click();

    const dying = page.getByRole("status").filter({ hasText: /death saves/i });
    await expect(dying).toBeVisible();
    // Filled pips carry the bg-success / bg-error fill; a fresh 0/0 has none.
    // Scope to the bordered pips (`.border-2`) so the banner's decorative danger
    // beacon (a borderless `.rounded-full.bg-error` dot) isn't miscounted as a pip.
    await expect(dying.locator(".rounded-full.border-2.bg-success")).toHaveCount(0);
    await expect(dying.locator(".rounded-full.border-2.bg-error")).toHaveCount(0);
  });

  // ── Action-card accordion (single-open, consistent with Spells/Inventory/Features) ──

  test("opening one action card collapses the previously-open one", async ({ page }) => {
    // The board's UniversalCard rows expose aria-expanded; the whole tab shares one
    // expandedId, so expanding a second card must collapse the first (owner-reported
    // inconsistency vs the other tabs — now a single-open accordion everywhere).
    // Scoped to the card ROW-TOGGLES (combat cards use the stretched
    // `.uc-row-toggle`; library cards use `.uc-chevron`): a bare [aria-expanded]
    // also matches the P2 glossary triggers inside the card bodies (Radix
    // popover triggers carry it).
    const toggles = page.locator(
      ".uc-stack :is(button.uc-row-toggle, button.uc-chevron)[aria-expanded]"
    );
    await expect(toggles.first()).toBeVisible();
    expect(await toggles.count()).toBeGreaterThanOrEqual(2);

    await toggles.nth(0).click();
    await expect(toggles.nth(0)).toHaveAttribute("aria-expanded", "true");

    await toggles.nth(1).click();
    await expect(toggles.nth(1)).toHaveAttribute("aria-expanded", "true");
    await expect(toggles.nth(0)).toHaveAttribute("aria-expanded", "false");
  });
});
