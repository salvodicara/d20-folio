# Program Status

The execution ledger of the new app on the long-lived branch `v2`. Update it whenever a stage
opens or closes, a gate is run, an owner gate opens, or an integration SHA changes. It does not
own product/release status (`PROGRESS.md`), release history (`CHANGELOG.md`) or the test
portfolio (`docs/TEST_PORTFOLIO.md`); those owners are linked, never copied. Production facts
(deploys, live migrations) are owned by `main`'s copy of this file.

## Reconciliation snapshot

- Steering: `PRODUCT.md` §Steering (owner, 2026-09-03), the top of the authority stack.
- Program: `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` (stages U, 0–8 and their gates).
- Branch: `v2` (worktree `.claude/worktrees/d20-folio-combat-arch-db1941`), forked from `main` at
  `77ea77a`; `origin/main` `9b06b75` merged at `5d1e640`. `main` is production and receives fixes
  only; `v2` never merges into `main` before the milestone.
- Private twin: `d20-folio-content` branch `v2` (worktree
  `/Users/salvatoredicara/Workspace/d20-folio-content-v2`, forked from its `main` `5a428960`);
  this worktree's `content-pack` symlink points at it. Rule 28: every pack seam moves on both `v2`
  branches in the same motion.
- Next session: `docs/superpowers/plans/2026-09-03-v2-next-session-handoff.md`.

## Pending on `main`

The P1 data-safety deploy: both P1 migrations were applied to production on 2026-09-03 and are
`--check`-green; the deploy of `main` `9b06b75` waits for the owner's word (`docs/RELEASE.md` →
"Migrate before you deploy"). The scripts and their runbook live on `main` only.

## `v2` — stage 0, data safety gate (2026-09-03)

Owner plan: `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` (stage 0) and
`docs/superpowers/plans/2026-09-03-stage-0-data-safety-gate.md`. `v2` forked from `main` at
`77ea77a`, before the P1 data-safety commits; `origin/main` `9b06b75` was merged into `v2` at
`5d1e640` (no conflicts), so the closed-world codec, `instanceId` identity, per-domain
reconciliation, the legacy cutover, diagnostics and the reduced character-path rules are on the
branch. The stage-0 proof is `scripts/audit-codec-loss.ts` (read-only in every mode; counts,
hashed findings and codes only):

| Corpus                                         | Result                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Six team fixtures (portable exports, composed) | 6/6 byte-identical                                                                                                                                     |
| Production export 2026-09-03 (53 documents)    | 12 parents equal · 3 libraries equal · 12 combat states (8 equal, 4 conformed) · 26 snapshots (5 equal, 21 conformed) · **zero loss, zero quarantine** |
| Production backups of the two P1 migrations    | pre-migration shapes refused as designed (`malformed-entry` without `instanceId`, `invalid-v1-play-state` without a play state); not a gate input      |

"Conformed" means every changed path sits on a documented one-way read seam (`CODEC_READ_SEAMS`
in `character-codec.ts`, `SHED_COMBAT_STATE_KEYS` in `combat-state-codec.ts`): the retired solo
`state.round`, retired `build.overrides` language/tool label strings, tracker-id and
concentration-ref conforms, one legacy boolean initiative-advantage leg, and the retired
`initiativeEpoch` residue on four combat states. Snapshots are immutable (created, never
re-written), so nothing is written back; the seams are enumerated so the audit fails on any
change outside them. The export lives privately outside the repository. Gates on `v2` at
`e6f8797`: `just ci` 5 min 8 s (typecheck, lint, unit fast+slow lanes, Functions, build), `pnpm test:rules` 24 s (118 cases on the emulator), `vite build` + `pnpm test:budget` green (6 budget cases). The first `just ci` run on `v2` failed only the public-surface partition guard on research notes committed during stage U (product-identity terms); reworded in `3eb0795`. A code review of the audit commits (2026-09-03) found no critical issue; its three important points — the reader normalizes log rows in place, three seam patterns were broad enough to absorb an undocumented drop, the combat-state key list was untied from the writer — were fixed in `e6f8797` (deep copy before parsing, seams anchored to exact paths with negative tests, key list typed against `CombatState`); the export re-audited with the same counts.

Follow-ups recorded here (not stage 0): a pure `combatStateWriteData(state, updatedAt)` in `combat-state-codec.ts` so the audit diffs against the real writer and the migration script's parity copy dies (rule 10); a `skippedKinds` breakdown in the audit report; the library codec preserves `item` verbatim but drops an
unknown ENTRY-level key (`{ id, savedAt, kind, item }` only) — production carries none; a future
entry-level field needs an `unknown` bucket on `LibraryEntry` before an older client may write.

## `v2` — stage 1, architecture reset and dice seam (2026-09-03)

Plans: `docs/superpowers/plans/2026-09-03-v2-architecture-reset.md` (documents and deletions) and
`docs/superpowers/plans/2026-09-03-v2-stage-1-dice-seam.md` (the seam).

**Architecture reset (done).** The target spec and the authoring spec were reconciled with the
steering (rolls as log actions, three automation levels at outcome application, the DM's last
word, the shared encounter log, vocabulary and hard-case tiers bounded to the stories); ADR-0001…
0009 accepted with dated amendments, ADR-0010 (dice seam) and ADR-0011 (automation levels) added;
migration phases P2–P5 marked superseded. Deleted on `v2` because nothing read them (evidence in
the reset plan): K1 and its Functions bundle, the program supervisor core and the agent-first
operating model, the P1/P3 migration scripts with their script-only legacy readers, `combat-io.ts`,
`mechanics-trigger.ts`, 60 end-to-end specs with the pixel harnesses and the perf probe, and the
superseded Wayfinder/K1/P2 plans and status records. The mechanics kernel is frozen by
`tests/unit/mechanics-kernel-freeze.guard.test.ts` (37 pinned readers) until stage 6; the
migration kit keeps only what the audit reads (its apply path and CLI were unread and died too). The pack twin
dropped its item-resource migration test on the pack's `v2` branch. `ci.yml` now runs on pushes to
`v2`.

**Dice seam (done).** `src/lib/combat/dice.ts` (grammar, seeded faces, evaluation,
verification; 24 tests), the `roll` action in the aggregate with single-use provenance
(`invalid-roll`, `roll-consumed`, `roll-roller-mismatch`; 8 tests), `src/lib/dice.ts` (the only
roller; 4 tests), `src/lib/views/roll-view.ts` with EN/IT keys (4 tests),
`tests/unit/dice-randomness.guard.test.ts` (13 pinned random sources) and the golden-replay
runner with `dice-provenance.json`. Two reviews (reset, seam) applied. Gates on `v2` at the
close: `just ci` 4 min 32 s (822 files / 18,621 tests, Functions 129), `pnpm test:rules` 113
cases, `vite build && pnpm test:budget` 6 cases, `just ci-srd-only` 2 min 20 s (645 files /
13,051 tests). Next: stage 2 (positions and areas).

## `v2` — stage 2, positions and areas in the aggregate (2026-09-03)

Design: `docs/superpowers/specs/2026-09-03-v2-stage-2-positions-areas-design.md`. Plan:
`docs/superpowers/plans/2026-09-03-v2-stage-2-positions-areas.md` (8 tasks, executed inline —
the pieces are too coupled across `types.ts`/`mechanic.ts`/`intent.ts` for independent subagent
tasks without merge conflicts).

**Done.** `Position` (a grid cell) and `Entity.position` (types.ts); `src/lib/combat/position.ts`
— pure geometry: Chebyshev ("chessboard", the SRD 2024 default) distance × 5 ft/cell, the kept
four-band range ladder (`reach|near|far|out`; the UI spec's unratified five-band proposal has no
stage-3 consumer yet, so it stays a documented future decision, not adopted), and
`areaMembership` for the five SRD area shapes (sphere, cylinder, cube, cone, line). The `move`
Step and a `position` Input joined the mechanics authoring contract (`mechanic.ts`); its handler
(`intent.ts`) spends the entity's movement budget (`turn.movementUsed` vs `stats.speed`, honoring
an `overrides["stats.speed"]` override the same way `effectiveAc` already does), updates
position, and recomputes derived `adjacent`/`range` relations against every other positioned
entity — opening the opportunity-attack window (`entity-left-reach`) for any pair that left
reach, through a helper (`openLeftReachWindow`) factored out of the pre-existing
`applyDeclare` path so a real move and a manually declared departure share one mechanism. A
universal `core:move` mechanic was added to the prototype catalogue so the step has a real
invokable consumer. Derived-vs-declared precedence needs no new `provenance` field: a later
action in the log wins, the same rule every other override in this engine already uses; `move`
never touches `engaged`, which stays a purely declared, sticky fact.

The golden-replay runner's pre-log `relations` fixture seed — flagged as temporary in `fold.ts`
since stage 1 — is retired: `dice-provenance.json`'s two `visible` facts are now `declare`
actions inside the replayed log, and a new replay, `position-and-reach.json`, proves a real
`move` (not a `declare`) drives `entity-left-reach` and the opportunity-attack window end to end,
closing the map-derived half of hard case 3 (cover/range/engagement/visibility).

An independent review (fresh subagent, no session context) found one Important issue — a
non-finite (`NaN`) move destination passed the answer guard and silently defeated the movement
budget check via `NaN`'s comparison semantics, corrupting position state in the append-only log —
fixed with a `Number.isFinite` guard and a regression test that fails without it; a Minor cost-id
naming nit (`turn:movement`, matching every sibling cost site) was also applied. Everything else
(relation-recompute symmetry across independently-moving entities, turn-gating, budget
accounting, the `Answer` union's `Position` variant, area-membership math, replay arithmetic) held
up under the reviewer's adversarial tracing.

**Gates on `v2` at the close:** `just ci` 4 min 26 s (824 files / 18,659 tests all green, plus
Functions and the build); `pnpm test:rules` 15.3 s (113 cases); `vite build` (3.1 s) +
`pnpm test:budget` (6 cases, 1.7 s); `just ci-srd-only` 2 min 13 s (the public composition, run
because `src/lib/combat` and `src/data/combat` are public/SRD modules). Combined `v2` gate well
under the 15-minute target.

**Out of stage 2** (unchanged from the design doc): no map, no `TargetSpec.count: "area"` wiring
(stage 3, with Fireball), no cover/visibility/elevation derivation, no difficult terrain, forced
movement or reach-weapon support, no fifth range band.

Next: stage 3 (the reducer for Marco's first turn and Sara's ogre ambush), from
`docs/superpowers/plans/2026-09-03-v2-next-session-handoff.md`.

## Delete zone

Nothing here may be deleted merely because it looks complete. `v2` owns two worktrees: this one
and the pack twin `d20-folio-content-v2`; neither is a candidate. The other worktrees `just
wt-list` shows (`Codex/*` program-control and Codex task trees, `d20-folio-tactical-codex-design-lab`,
`combat-p1-data-safety-*`) belong to `main`-era programs and are owned by `main`'s copy of this
ledger; `v2` neither uses nor removes them.
