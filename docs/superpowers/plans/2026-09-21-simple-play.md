# Simple play recovery implementation plan

> Execute inline using the Superpowers TDD, review and verification lifecycle.

**Goal:** Restore useful resource tracking without mandatory mechanics resolution.

**Approved design:** The owner approved selective recovery on 2026-09-21: casting
spends the chosen slot, without targets, dice, outcomes or automatic healing/damage.
Keep the existing sheet, content, inventory, casting-source choices, concentration
and undo. Retain initiative/turn tools as support. Do not roll back saved data.

**Architecture:** Reuse the provider-owned cast configuration and store resource
mutators. Both Spells and Play use that route. Remove the sheet's engine dispatch
and mandatory combat resolution. Keep persisted world compatibility in the stores;
this is a user-flow recovery, not a schema downgrade or a new engine.

**Tech stack:** Existing React, Zustand, TypeScript, Vitest and Playwright.

## Constraints

- Work from fresh origin/main in the isolated fix/simple-play worktree.
- No dependency, Firestore schema, rules or private runtime content changes.
- No production writes, migrations, release or deployment.
- Existing EN/IT strings and visual components; no new visual language.
- Snapshot-backed compatibility tests include existing world-owned slot counters.
- Owner visual review precedes integration; deploy is a separate owner gate.

## Review focus

- Repeated casts must not be blocked by stale combat turn bookkeeping.
- Pact slots, free casts, cantrips and rituals must pay the correct resource once.
- Cancelling a picker or concentration replacement must spend nothing.
- Undo/redo and persisted reload must retain the same slot count without healing.
- Play shortcuts must behave exactly like the spellbook.

## Task 1: Recover simple spell casting

Files: SpellsTab.tsx, PlayTab.tsx, TurnEconomyProvider.tsx, relevant unit tests.

- [x] Add regressions asserting an immediate slot debit, unchanged HP and no
      resolution dialog for Healing Word through both sheet surfaces.
- [x] Run the regressions and observe failure at the slot debit.
- [x] Route both surfaces through executeAction; keep configureSpellCast's source
      picker; make spell commits resource/concentration/log/undo only.
- [x] Verify repeated casts, slot choices, cancellation, concentration, cantrips,
      rituals, item/free casts and Pact slots; update superseded UI expectations.

## Task 2: Remove mandatory action resolution and verify recovery

Files: PlayTab.tsx, TurnEconomyProvider.tsx, tests/e2e, DESIGN.md,
PRODUCT.md, docs/MECHANICS.md, .changeset/simple-play-recovery.md.

- [x] Add a weapon/action regression that records use without a target/dice dialog.
- [x] Remove automatic engine dispatch and resolver mounting from normal sheet use.
- [x] Preserve explicit manual health controls, inventory and initiative tools.
- [x] Verify browser casting, undo and reload using local fixtures/emulators.
- [ ] Run focused tests, full repository checks and independent correctness review.
- [ ] Record exact results and present curated screenshots for the main visual gate.

## Evidence

- Baseline: spells-page.test.tsx, 37/37 passed on 2026-09-21.
- Historical interaction reference: a79bfd4f (12 August); persistence remains current.

- TDD: Healing Word initially failed to debit before resolution on both surfaces;
  resource-only flow now passes with and without persisted world state.
- Review regressions observed RED then GREEN: stale character/read-only after a
  confirmation, full engine-concentration inverse, inactive buff restoration,
  and Polymorph restoration preserving a completed item refund.
- Independent correctness review: initial findings and follow-up inverse findings
  addressed; final focused review has no remaining findings.
- Browser: 15/15 spell tests passed, including EN/IT × light/dark × desktop/mobile
  cast → exact slot debit → unchanged HP → undo → redo → persisted reload.
- Management controls: 12/12 applicable desktop/mobile tests passed; 7 project
  exclusions, including accessibility checks of both themes.
- Saved-data readers and deployment remain unchanged. Visual integration approval
  and any production deployment are pending the owner's review of this candidate.
