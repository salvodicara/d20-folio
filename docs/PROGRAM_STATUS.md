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
- Next session: `docs/superpowers/plans/2026-09-04-v2-next-session-handoff.md`.

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

Next: stage 4 (the shared encounter document), from
`docs/superpowers/plans/2026-09-04-v2-next-session-handoff.md`.

## `v2` — stage 3, the reducer for the two story encounters (2026-09-04)

Plan: `docs/superpowers/plans/2026-09-03-v2-stage-3-reducer.md` (8 tasks, dispatched sequentially —
`types.ts`, `intent.ts` and `mechanic.ts` are shared by several tasks). Design:
`docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` §3 (execution model and
outcome application by automation level), §4 (mechanics as data), §7 (the stage-3 tier of the
hard cases), `docs/adr/0011-campaign-automation-levels.md`, and the authoring spec's §6 vocabulary
tiers (reconciled in this same commit).

**Done.** The stage opened with a code-level gap analysis against the two acceptance stories
(`PRODUCT.md` §Steering) rather than a from-scratch build: the kept P2 prototype already executed
most step kinds, so only five gaps were real, and the fifth — 0 HP, dying and death — turned out
to be already correct in `damage.ts` and needed no task at all.

- **Campaign automation levels** (`intent.ts`, `table.ts`, `types.ts`): `full-auto` and `log-only`
  gate outcome application through one `commitAt` helper with an exhaustive switch;
  `FoldedState.settings.automation` is typed `Exclude<Automation, "propose-and-confirm">` while the
  table op keeps the full union and rejects the third level until stage 6. At `log-only` the
  reducer computes the same verdict and withholds the transition — including the cost — so the DM
  applies it by hand through `override`.
- **Overrides that change the fact** (`intent.ts`): an `override` on `vitals.hp` or `vitals.life`
  now patches the entity instead of only landing in the audit trail; HP clamps at 0 and, above
  zero, revives a downed entity.
- **Area targeting** (`mechanic.ts`, `intent.ts`): `TargetSpec.count: "area"` with an
  `AreaShapeSpec` parametrized by `position`-kind inputs, resolved against stage 2's
  `areaMembership` — the reducer derives the affected entities itself, never from a client-supplied
  list. A new `area-input-declared` conformance rule proves `origin`/`aim` name declared inputs at
  load, mirroring `move-input-declared`.
- **Fireball** (`src/data/combat/prototype-catalogue.ts`): a levelled area save-and-halve spell
  authored with no new step vocabulary — `save` + `damage` over the derived targets.
- **The monster adapter** (`src/lib/combat/monster-adapter.ts`, `monsterMechanics(block)`): the
  only module that understands `MonsterEntry`; its output is ordinary `Mechanic[]`. `attack`
  entries and `save` entries with damage automate; everything else degrades to `manual-table`.
  The real SRD Ogre and a homebrew blade joined the prototype catalogue as its consumers.
- **Both golden replays**: `tests/unit/combat/replays/marco-first-turn.json` (move within a
  budgeted 10 of 30 feet, Fireball on three goblins, one saves for half and lives, two die) and
  `tests/unit/combat/replays/sara-ogre-ambush.json` (`log-only`, a hidden DM roll, an `override`,
  the homebrew blade, the adapted ogre). They are the stage's acceptance gate and both pass
  against the pure reducer.

**Reviews.** Every task had an independent review before the next one started (opus or sonnet, no
session context); five needed one fix round each and all closed clean at round 1. Task 1 fixed the
log-only gate on the held-reaction-window path (payment was still being taken) plus a missing
`applyResolve` test; task 2 clamped a `vitals.hp` override at zero (a negative HP inflated
`applyDamage`'s massive-damage overflow and could fire an instant kill early); task 5 degraded an
effect-only monster save to `manual-table` instead of a save step that spends the action and
applies nothing; task 6 re-based Marco's replay fixture at (0,0) so the move exercises the
Chebyshev movement budget instead of being a free first placement; task 7 made Sara's homebrew
blade gate on `adjacent` like every other melee attack, raised the override value so a leaked hit
could not read as the expected result, and asserted the hidden roll's `hidden: true`. Tasks 3 and
4 were approved with no Important findings.

**Rulings during execution.** Decisions taken by the controller while the plan ran, each with the
reason it outranked the plan text:

- An area program whose shape contains no entity applies with no per-target steps — cost paid,
  receipt `applied`, nothing tried — rather than running once against a `null` target. Casting
  Fireball on empty ground is legal in the rules, and the cost is visible in the receipt and
  undoable.
- `boundary.guard.test.ts`'s payment test stays a full enumeration of the catalogue (its purpose
  is "no costed program applies unpaid" for _every_ mechanic); Fireball and the ogre widened its
  fixture instead of being excluded from it.
- Area shapes get their own `area-input-declared` conformance rule, matching the existing
  `move-input-declared`: the authoring spec promises authoring mistakes surface at load, not at
  the table.
- A held reaction window at `log-only` withholds its payment too — the plan's contract "applies
  nothing" outranks its own "held branch unchanged" parenthetical.
- Windows opened _inside_ a withheld run (a `log-only` `move` leaving reach) are withheld with the
  run: the departure never committed, so a reaction to it would be incoherent. Only the held
  branch's own window opens at `log-only`.
- `FoldedState.settings.automation` is narrowed to the two implemented levels so stage 6 widens it
  by compile error rather than by discovery.
- A `vitals.hp` override clamps at 0 with no upper clamp, overruling the plan's "no clamping, like
  AC": nothing in the rules needs negative HP, while a DM raising HP above max is intent.
- A monster `save` entry with no damage parts degrades to `manual-table`, overruling the task
  brief's "harm only when there are damage parts" — the spec's "a later kind conforms as
  unsupported, never half-built" wins. Roughly 30 corpus save entries (paralysing rays and the
  like) stay DM-adjudicated, which is the honest state until conditions-on-save are authored.
- Marco's replay fixture was moved rather than the plan's prose corrected: the story says he
  moves, so the fixture makes it a real budgeted move.
- Sara's blade gates on `adjacent`, not `visible`: the plan's predicate contradicted its own
  comment and every other melee attack.
- Two minors in Sara's replay were plan defects in the acceptance proof itself and were fixed in
  the same round rather than deferred: the override value became 17, so a leaked `log-only` hit
  (30 − 12 = 18) could not be mistaken for the expected result, and `rolls.r-ogre-atk.hidden: true`
  is now asserted.

**Deferred minors** (raised by task reviews, triaged as non-blocking and recorded rather than
fixed): the table settings op replaces the settings object instead of spreading it; a duplicated
`{ ...closed, declared: remaining }` in `applyResolve`; a test that calls `opened()` inside an
assertion; no test pinning that a roll answered by a `log-only` intent still lands in `state.spent`;
an HP override to 0 on an alive creature leaves `life: "alive"` (hp-0-but-alive) — document or
couple; no test for the `LIFE_STATES` whitelist rejecting a bad string, and its `as LifeState`
cast; the impossible-state guard for an area count without a shape reports `unknown-mechanic`, and
conformance checks `=== undefined` where the runtime checks truthiness (a discriminated
`TargetSpec` would remove both); missing area tests (a caster inside their own blast, the
eligibility filter actually excluding someone, cone/line without `aim`); area tests call `cast()`
before `opened()`; the `const targets = program.targets` narrowing alias would read better as
`targetSpec`, and area targeting added ~120 lines to `intent.ts`, which is now past 1,000 and
trending toward a catch-all (`areaShapeFrom` is a candidate for `position.ts`); the boundary guard
derives the slot level from the first `slot` cost only; the adapter's degrade paths (damage choice,
`onSuccess: "special"`, melee-or-ranged, spellcasting) are untested beyond `narrative`; duplicate
monster entry ids yield shadowed programs with no uniqueness rule in `conformMechanic`; the
adapter's `damageParts` parameter is typed through `MonsterAttackEntry["damage"]` although it also
serves save entries (`readonly MonsterDamage[]` would say what it means), and `labelFor(block,
entry)` / `manualProgram(entry, block)` take the same pair in opposite order; and the adapter's
end-to-end test injects `relations` directly instead of through the log. One further minor — the
adapter silently dropping `recharge` on structured entries — is not listed here because it changes
behaviour at the table and is recorded under "Out of stage 3" instead.

**Gates on `v2` at the close:** `just ci` 4 min 38 s (828 files / 18,695 tests, Functions 129, plus
typecheck, lint and the build); `pnpm test:rules` 15.2 s (113 cases on the emulator); `vite build` +
`pnpm test:budget` 4.8 s (6 budget cases); `just ci-srd-only` 2 min 24 s (651 files / 13,125 tests,
2 skipped — run because `src/lib/combat` and `src/data/combat` are public/SRD modules, and green
with the pack pinned to the empty stub). Stage 2's baseline was 4 min 26 s / 15.3 s / ~2 s /
2 min 13 s; the combined `v2` gate is 7 min 22 s, well under the 15-minute target.

**Out of stage 3.** `propose-and-confirm` automation (stage 6); upcast Fireball damage scaling
(needs `Input.dice.formula` to grow a `byLevel` variant); monster `traits`, `reactions`,
`legendaryActions` and `recharge`/`legendary` costs; death saves at turn start; any literal
map, fog or token UI (stage 5). Plus four seams this stage deliberately left open:

- **Per-target save-roll attribution.** `rollsUsable` binds a roll to the intent's entity, so a
  target's save inside a caster's intent is logged with `roller: null`. Stage 4 decides whether the
  shared document attributes it to the target.
- **`log-only` withholds `move` and run-internal reaction windows**, so a `log-only` table cannot
  move tokens through the reducer until position becomes a direct-patch override path — a stage-6
  concern, recorded here so it is not rediscovered.
- **Effect-only monster saves are DM-adjudicated** until conditions-on-save are authored.
- **`recharge` on structured monster entries is dropped** by the adapter, so such an entry is
  currently invokable every turn; the recharge task owns this.

Next: stage 4 (the shared encounter document), from
`docs/superpowers/plans/2026-09-04-v2-next-session-handoff.md`.

## Owner confirmations, recorded ahead of their stage (2026-09-03)

Two product decisions the owner gave at the stage-3 handoff, not yet implemented — recorded here
so they are not lost before their stage lands.

- **Admin-supreme account.** Owner (2026-09-03): wants everything a DM can do to extend to his own
  account, since — at least at first — he has to guide the actual DM the way he already does
  today. The design doc already has the actor (§5.1, §5.4): `users/{uid}.role === "admin"` gets
  owner-level access on every user path (`users/{uid}`, `characters/{id}`, `combat/state`) and
  DM-level rights on an encounter's checkpoint and settings. What it does not say is that an admin
  may append actions to a campaign encounter they are not a member of (encounter `update` =
  member and the log grew). Stage 4, which writes those rules, decides between "admin is an
  implicit member of every campaign" and "the owner's account is added as a member of his group's
  campaign" — the second is smaller and matches how he plays today — and sets the owner's `role`
  to `admin`.
- **Out-of-combat mechanical freedom.** Owner (2026-09-03): players need the same freedom D&D
  2024 actually gives them — casting spells and doing other mechanically-resolved things outside
  a formal combat encounter, not only inside one. The reducer is already entity-generic and not
  combat-specific by construction (ADR-0001; `Encounter.host: {kind: "personal"} | {kind:
"campaign"}`), so this needs no re-architecture — it needs mechanics authored against the same
  seams for non-combat use, plus confirming whether the personal `Encounter` aggregate is meant to
  be usable independent of any campaign lease (open question, not yet verified against §5.2). The
  current design's `later`-tiered "narrative clauses, no mechanical consequence to compute" (§7
  residuals) describes illusions/social effects, not a player's mechanically resolved spellcast
  outside initiative — that distinction needs its own design pass before item 8 ("the rest of the
  session") in the stage-1 plan.

## Delete zone

Nothing here may be deleted merely because it looks complete. `v2` owns two worktrees: this one
and the pack twin `d20-folio-content-v2`; neither is a candidate. The other worktrees `just
wt-list` shows (`Codex/*` program-control and Codex task trees, `d20-folio-tactical-codex-design-lab`,
`combat-p1-data-safety-*`) belong to `main`-era programs and are owned by `main`'s copy of this
ledger; `v2` neither uses nor removes them.
