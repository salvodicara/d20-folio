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
- Next session: the owner's screenshot verdict on `v2-stage6-play-surface` (stage 5's map and
  stage 6's play chrome, one verdict), then task 4's integration;
  `docs/superpowers/plans/2026-09-04-v2-stage-6-play-surface.md`.

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
- **A held reaction window at `log-only` commits nothing at all** — no window, no `declared` entry,
  no ordinal, no payment. This **reverses** the ruling taken in task 1's round 1 ("withholds its
  payment, but the window and the declaration still land, because opening a window is bookkeeping,
  not a verdict"). The branch review showed that half-measure is not a coherent state: the window
  survives an unpaid declaration, so a table that switches back to `full-auto` before resolving it
  gets the outcome without the cost, and the reaction the window invites would itself be withheld,
  leaving a window nobody can act on. A declaration is not bookkeeping about the log — it is the
  first half of an outcome, and `log-only` withholds outcomes whole. The receipt is unchanged and
  still records that the attack would be held.
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
- The authoring spec's §6 **Adapter** row was rewritten to describe shipped behaviour ( `attack`
  entries and damage-carrying `save` entries automate; every other entry, Multiattack included,
  degrades to `manual-table`) instead of the plan's "Multiattack and single attacks". A tier table
  states what the engine does, not what the plan hoped it would do.

The final whole-branch review added five more, applied in the closing fix wave:

- **An HP override to zero is coupled to the life state.** Dropping a creature to 0 by hand means
  the same thing as dropping it there by damage, so `patchDirectOverride` now takes `applyDamage`'s
  0-HP rule — `dying` for a PC, `dead` for anything else — leaving death saves untouched and not
  re-downing a creature already at 0. This closes the deferred "hp-0-but-alive" minor by coupling
  rather than by documenting: an impossible state the DM could reach in one click is a defect, not
  a nuance.
- **`answerNumber` is total.** `typeof null === "object"`, so a persisted `null` answer threw on
  `"roll" in value` instead of rejecting. Both it and `resolve.ts`'s `referencedRolls` (which the
  new test proved had the same hole, and is reached first) now read the answer as `unknown` and
  report `missing-answer`. The reducer's totality over a malformed log is a contract, not a hope.
- **The missing area tests were written, not cut.** Cube, cone and line membership, a caster inside
  their own blast, an eligibility predicate that excludes one, and a cone missing its aim are all
  pinned; each shape's probe pair differs only in the property that shape governs, so a geometry
  regression cannot hide behind a distance check.
- **Area targets are sorted before the eligibility filter.** Membership follows
  `Object.values(state.entities)`, and object-key enumeration order must never decide the order in
  which a fold applies per-target steps — every client folds the same log and must derive the same
  sequence. No replay expectation changed; the goblin ids were already in order, which is exactly
  why the hazard was invisible.
- **The authoring spec's §6 Costs and Inputs rows were read off the shipped unions**, not off the
  spec's own §1.2/§1.3 sketch: Costs gained `concentration` and the explicit `turn` claims; Inputs
  now list `d20`/`dice`/`choice`/`table`/`position`, and `damage-type` and `declare` left the table
  entirely because neither is a real planned `Input` kind (see the note under §6).

**Closed by the final fix wave** (raised as deferred minors by the task reviews, then fixed rather
than carried): the table settings op now spreads `state.settings`; `applyResolve` builds
`{ ...closed, declared: remaining }` once as `base`; a roll answered by a `log-only` intent is
pinned as consumed; the hp-0-but-alive state is coupled away; the `LIFE_STATES` whitelist has a
test and narrows through a predicate instead of an `as LifeState` cast; the missing area tests
(caster inside their own blast, an eligibility predicate excluding someone, cone/line membership,
a cone without `aim`) are written; the area tests no longer build the action before the state; and
two of the adapter's degrade paths (a use-time damage choice, `onSuccess: "special"`) are covered.
The prototype catalogue's hand-copied Ogre gained a drift guard against `src/data/monsters/n-p.ts`
(imported dynamically inside the test, so the lazy-only bundle guard stays green).

**Deferred minors still open** (triaged as non-blocking and recorded rather than fixed): a test
that calls `opened()` inside an assertion; the impossible-state guard for an area count without a
shape reports `unknown-mechanic`, and conformance checks `=== undefined` where the runtime checks
truthiness (a discriminated `TargetSpec` would remove both); the `const targets = program.targets`
narrowing alias would read better as `targetSpec`; the boundary guard derives the slot level from
the first `slot` cost only; the adapter's remaining degrade paths (melee-or-ranged, spellcasting)
are untested; duplicate monster entry ids yield shadowed programs with no uniqueness rule in
`conformMechanic`; the adapter's `damageParts` parameter is typed through
`MonsterAttackEntry["damage"]` although it also serves save entries (`readonly MonsterDamage[]`
would say what it means), and `labelFor(block, entry)` / `manualProgram(entry, block)` take the
same pair in opposite order; the adapter's end-to-end test injects `relations` directly instead of
through the log; and this ledger's stage-2 and stage-3 sections both end with the same `Next` line,
which is redundant — one of them should go when stage 4 rewrites the frontier. One further minor —
the adapter silently dropping `recharge` on structured entries — is not listed here because it
changes behaviour at the table and is recorded under "Out of stage 3" instead.

**Gates on `v2` at the close** (re-run after the final fix wave, all green): `just ci` 4 min 36 s
(828 files / 18,710 tests, Functions 129, plus typecheck, lint and the build); `pnpm test:rules`
15.1 s (113 cases on the emulator); `vite build` + `pnpm test:budget` 5 s (6 budget cases);
`just ci-srd-only` 2 min 19 s (651 files / 13,140 tests, 2 skipped — run because `src/lib/combat`
and `src/data/combat` are public/SRD modules, and green with the pack pinned to the empty stub).
Stage 2's baseline was 4 min 26 s / 15.3 s / ~2 s / 2 min 13 s; the combined `v2` gate is
7 min 15 s, well under the 15-minute target. `just ci` is what caught the two test-typing defects
the vitest run transpiled past, which is the reason the strict build stays in the gate.

**What the replays prove, exactly.** Marco's and Sara's replays are reducer-level acceptance: they
prove the **nouns** of the two stories at the engine layer, not the surfaces that will present
them. Sara's replay proves hidden rolls (stored with `hidden: true`, not suppressed), the monster's
action through the adapted ogre, an overridden result, the group's own homebrew weapon and the
automation-level switch. Tokens and fog are, at this stage, entity `position`s and declared
`visible` relations — there is no map, no token and no fog of war until stage 5, and no shared
document until stage 4.

**Out of stage 3.** `propose-and-confirm` automation (stage 6); upcast Fireball damage scaling
(needs `Input.dice.formula` to grow a `byLevel` variant); monster `traits`, `reactions`,
`legendaryActions` and `recharge`/`legendary` costs; death saves at turn start; any literal
map, fog or token UI (stage 5). Plus six seams this stage deliberately left open:

- **Per-target save-roll attribution.** `rollsUsable` binds a roll to the intent's entity, so a
  target's save inside a caster's intent is logged with `roller: null`. Stage 4 decides whether the
  shared document attributes it to the target.
- **`log-only` withholds `move` and run-internal reaction windows**, so a `log-only` table cannot
  move tokens through the reducer until position becomes a direct-patch override path — a stage-6
  concern, recorded here so it is not rediscovered.
- **Effect-only monster saves are DM-adjudicated** until conditions-on-save are authored.
- **`recharge` on structured monster entries is dropped** by the adapter, so such an entry is
  currently invokable every turn; the recharge task owns this.
- **An `override` emits no `CombatEvent`.** The same outcome reached by damage and by the DM's hand
  is not the same event stream: a DM-inflicted death fires no `hp-zero` subscriber, ends no
  concentration and clears no marks, while `deliverDamage` does all three. That is defensible while
  the DM is the one deciding — nothing should fire behind their back — but it is a real asymmetry
  and it must be a decision, not an oversight, once overrides reach a surface with subscribers
  behind it.
- **`intent.ts` (~1,200 lines) is the meeting point of everything** — payment, lifetimes, AC
  derivation, damage delivery, answer reading, area binding, the step runner, concentration, the
  automation gate, repositioning, overrides and checks. It is coherent but it is now the file every
  new capability touches. Splitting it (`answers.ts`, `override.ts`, `reposition.ts`) is stage 4's
  first task, before stage 4's own code lands on top of it.

Next: stage 4 (the shared encounter document) — closed; see the section below.

## `v2` — stage 4, the shared encounter document (2026-09-04)

Plan: `docs/superpowers/plans/2026-09-04-v2-stage-4-shared-encounter.md` (9 tasks, dispatched
sequentially — `types.ts`, `override.ts` and `firestore.rules` are touched by several of them).
Design: `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` §5 (all four
subsections: documents and owners, the lease, write mechanics, authorization) and §3.1 (the
`table` op vocabulary), `docs/adr/0005-rules-enforce-access-not-gameplay.md`,
`docs/adr/0010-dice-seam-rolls-are-log-actions.md`, `docs/adr/0011-campaign-automation-levels.md`.
All four spec sections, both ADR amendments and the access matrix in `docs/ARCHITECTURE.md` are
reconciled in this commit.

**Done.** The stage put stage 3's pure log in Firestore and made two authenticated clients fold
the same document to the same state.

- **`intent.ts` split first** (`answers.ts`, `override.ts`, `reposition.ts`), behaviour-preserving,
  before any stage-4 code landed on it: 1,216 → 955 lines, the same 722 tests green either side.
- **Per-target roll attribution** (`resolve.ts`): a roll answered under a per-target key
  `${input}:${entityId}` may carry `roller: entityId` — a target's save is the target's fact even
  inside the caster's intent. A plain key still binds to the acting entity. Marco's replay now
  attributes the three goblin saves. ADR-0010 amendment.
- **An HP override to zero has damage's tail** (`override.ts`): `settleZeroHp` is shared with
  `deliverDamage`, so an override that drops a creature from above 0 to 0 emits `hp-zero` and ends
  its concentration. An override of `vitals.life` to `dead` runs the same tail without `hp-zero`.
  The asymmetry stage 3 recorded as an open seam does not survive.
- **The lease table ops** (`table.ts`): `join`, `leave` and `sync` — `join`/`leave` reuse the
  extracted `addEntity`/`removeEntity` bodies with the same guards `add-entity`/`remove-entity`
  have; `sync` is an unconditional upsert that never touches the turn order.
- **The codec** (`src/lib/combat/codec.ts`): one closed-world `exact-schema` for the persisted
  `Encounter` (schema 1), `parseEncounter` / `encounterWriteData`, unknown top-level keys preserved
  in `Encounter.unknown` and written back verbatim, hostile or oversized documents quarantined with
  a typed reason instead of dropped (`__proto__`, unbounded depth, the 2,048-entry collection
  ceiling and — the binding one — `exact-schema`'s 50,000-node budget over the log and the
  checkpoint together, which is why the rules cap the stored log at 1,000 entries).
- **Compaction, pure** (`src/lib/combat/checkpoint.ts`): `shouldCompact` (200 actions or 512 KiB),
  `checkpointThrough` (the newest action outside a five-minute grace window), and `compact`, which
  folds the head **together with every `undo` in the log** so an undo that sits after the boundary
  and targets an action before it is honoured rather than reverted.
- **The Firestore adapter** (`src/lib/combat-io.ts`): refs for both hosts, `createEncounter`,
  `appendAction` (`updateDoc` + `arrayUnion`), `subscribeEncounter` (one `onSnapshot` with
  `includeMetadataChanges`, quarantine surfaced rather than thrown), `checkpointEncounter` (a
  transaction preconditioned on the stored `checkpoint.through`, merging interleaved appends and
  unknown keys), `deleteEncounter`, and the hybrid `seq` clock. It takes the `Firestore` instance
  explicitly, which is what lets the same functions run under two emulator identities.
- **The lease, owner-side** (`src/lib/combat-lease.ts`): `joinTable`, `leaveTable`, `readLease` —
  the character's `lease: { campaignId, encounterId, epoch }` marker is written and cleared by its
  own owner's client only, and it is named `lease` (not the spec's old `attached`) because the
  parent already carries `attachedCampaignId`.
- **`firestore.rules` reduced** from 984 to 548 lines: identity, membership, ownership and shape,
  and nothing that reads a game field. A member's encounter `update` is append-only **by prefix**
  (the stored log must be a byte-identical prefix of the written one), the admin is DM-level on
  every encounter and owner-level on every user path except `public/sheet`, and the membership
  paths (`removeMember`, `deleteCampaign`, `attachMemberCharacter`) stopped writing other users'
  documents.
- **The stage gate** (`tests/rules/encounter-two-clients.emulator.test.ts`): both golden replays
  driven action-by-action through two authenticated clients against the emulator, plus an override
  and an undo appended from each side, plus compaction across a leased PC's departure.

**Reviews.** Every task had an independent review before the next one started (no session
context). Tasks 1, 2, 3 and 6 were approved with no Important findings; tasks 4, 5, 7 and 8 each
needed exactly one fix round and closed clean at round 1.

- **Task 4** — Important: the codec had no _positive_ checkpoint round-trip case, so a checkpoint
  that failed to survive write → parse → write would not have been caught. Minors fixed in the
  same round: a top-level `__proto__` key was silently dropped instead of preserved, the recursive
  clone and freeze had no depth cap and could throw on a hostile document, and the 2,048-action
  ceiling was undocumented.
- **Task 5** — **Critical**: `compact` reverted an undo that crossed the checkpoint boundary. The
  head was folded with only its own actions, so an `undo` sitting in the tail and targeting a head
  action was lost and the compacted document folded to a _different_ state than the uncompacted
  one — the invariant compaction exists to preserve. The fix folds the head with every undo in the
  whole log. Also fixed: stored unknown top-level keys were lost on the rewrite, the subscribe
  contract did not state that a pending-only flip must not trigger a re-fold, and the grace-window
  horizon was undocumented.
- **Task 7** — Important twice: `proveClaimStale` treated _any_ read error as proof of a stale
  claim, so an offline client could talk itself into discarding a live claim (it now requires
  `permission-denied` specifically); and `removeMember`'s prune of the embedded encounter
  combatant still wrote `encounter.*`, a field the new rules deny, which would have failed the
  whole removal — `removeMember` became a plain `updateDoc` of the roster. The same round turned
  `logOnlyGrew` from "the log got longer" into a genuine append-only **prefix** fence and added an
  admin-stops-at-`public/sheet` test.
- **Task 8** — the gate did what a gate is for: it exposed a defect in task 7's rules. A Firestore
  rules slice `log[0:0]` **errors** instead of yielding an empty list, so the prefix fence denied
  every member append to an encounter whose stored log was empty — a freshly created one, or one
  just compacted to an empty tail. Fixed with a `resource.data.log.size() == 0 ||` guard; the
  review then required the dedicated rules test that pins it, rather than leaving the two-client
  gate as its only proof.
- Out of band, one guard commit (`6c91b0c`) repaired two repository guards the focused per-task
  gates had missed since tasks 5/6: `dice-randomness.guard` did not know `src/lib/combat-io.ts` is
  a legitimate id source, and `pure-modules-guard` saw `tests/unit/combat-lease.test.ts` pull
  Firebase in transitively.
- **The whole-branch review** (976807f → 32a447a, after task 9) returned no Critical finding and
  three Important ones, all fixed in the final wave: (1) the codec's binding ceiling is
  `exact-schema`'s 50,000-node `MAX_VALUES` over the log and the checkpoint together, not the
  2,048-entry collection cap, so the rules' 2,000-entry log cap could admit a document that
  quarantines on every client — and `checkpointEncounter` refuses to rewrite a quarantined
  document, so compaction, the only repair, is what stops working (the cap is now 1,000);
  (2) `checkpointThrough` measured the grace window off `newest.seq.ms`, a client-asserted wall
  clock, so one member's fast device could collapse the window and let the next checkpoint swallow
  appends other clients had queued (it now takes a required `nowMs` and uses
  `min(newest.seq.ms, nowMs)`); (3) `personalEncounterRef` aliases the live `CombatState` document
  of every existing character, and `leaveTable`'s `personal: null` contract did not say that a
  document which failed to parse is NOT `null` (both are now stated at the seam). The same wave
  took six Minors: the `fold.ts` cross-reference to the checkpoint's undo horizon, the corrected
  `Seq` comments, sorted `subscribersFor`/`dueAt` outputs, `isSelfJoin()` pinning the banner, the
  first `validEncounterShape` tests, and the adapters' import guard.

**Rulings during execution.** Decisions taken by the controller while the plan ran, each with the
reason it outranked the plan text. The first three are the plan's own decisions 2, 9 and 3,
recorded here by name because nothing else in this section carries them:

- **Hidden faces stay in the shared log, concealed by presenters** (plan decision 2). ADR-0010
  alternative 2 (a DM-private document) was rejected because the fold would diverge; the owner
  ratified "written in the log, not shown to players" on 2026-09-03. Stage 4 keeps the faces in
  the document and restates the accepted risk: a member who reads the raw document sees them,
  like forged actions. The codec stores `hidden` verbatim; nothing else changes.
- **The `checkpoint` action kind of §3.1 is not built** (plan decision 9). The checkpoint is the
  document field `Encounter.checkpoint` the fold already consumes; a log-level marker would carry
  the same `through` twice. §3.1 is reconciled.
- **An override that revives emits nothing** (plan decision 3's other half). An HP override to 0
  runs `deliverDamage`'s tail — the `hp-zero` event and the concentration effect ended — but no
  `damage-taken` event and no concentration check, because no damage was taken; and an override
  that lifts a creature back above 0 emits no event at all.
- The plan was executed **autonomously** under the owner-approved handoff scope; owner-facing
  questions were deferred to the closing message rather than blocking a task. Cost if wrong:
  rework the owner can see.
- An override of `vitals.life` to `dead` from a non-dead state **also** runs `settleZeroHp`: a
  dead creature holds no concentration whatever its HP. Carried into task 3 with its own test
  rather than left as an inconsistency between the two override paths.
- **Compaction bounding undo to the actions after the checkpoint is inherent to §5.3**, not a
  defect of the implementation: a checkpoint declares the past closed, and truncation is the point.
  The five-minute grace window is the knob, not a wider fold.
- **Redo across a checkpoint is impossible** and is accepted (owner-visible): an undo-of-undo
  appended after compaction cannot restore a target the checkpoint already skipped, because the
  target is no longer in the log to re-apply. Documented in `checkpoint.ts`; `CHECKPOINT_GRACE_MS`
  is what decides how long a table keeps the right to change its mind.
- **The campaign's `allow delete` stays `isDm() || isAdmin()`**: admin-supreme means DM-level
  everywhere, and carving deletion out of it would make the rule say something the owner did not
  decide.
- **`removeMember`'s prune of the embedded encounter combatant was stripped**, not repaired: it
  targets a field the new rules deny, so keeping it would deny the entire removal whenever a stale
  embedded encounter names the member. Removing a member is a membership path, not play.
- **The encounter log is append-only by prefix, not merely longer.** The spec says "`arrayUnion`
  only"; "the log grew" would have let a member rewrite history as long as the list got longer,
  and the honest fence costs one list comparison.
- **The rules hunk inside the test-only task 8 was accepted** rather than deferred to a new task:
  the gate exists to find exactly that class of defect, `firestore.rules` is not `src/**`, and the
  hunk was reviewed as part of task 8.

**Deferred minors still open** (triaged as non-blocking and recorded rather than fixed):
`override.ts` carries a private two-line `rejected` helper duplicating `intent.ts`'s (a shared
`StepResult` module would remove it); `intent.ts` is still 955 lines with the ~300-line `runSteps`
switch intact; `resolve.ts`'s `referencedRolls` and `rollsUsable` each re-implement "is this a
`{roll}` reference" (an `isRollAnswer` type guard would share it); there is no test for an HP
override to 0 on an entity already at 0, nor for a non-finite override value (both safe by
inspection); `resolve.table.test.ts`'s "sync inserts when absent" case does not assert the receipt
summary and its `leave` case asserts folded state but not the `effect-ended` events; `freezeDeep`
is duplicated from `exact-schema` (private there) and the codec's schema-constant naming style
differs from `character-build-schema`; **the §8 codec round-trip property test over generated
encounters is still not written** (the codec has example-based round-trips only); `compact` does
not assert that `through` is after the existing checkpoint (`checkpointThrough` never produces one
that is not); `appendAction` treats a duplicate `arrayUnion` as a silent local no-op while the
rules reject it as a log that did not grow; there is no contended-retry test for
`checkpointEncounter` and no **concurrent-append** test for the same-round-trip race of the hybrid
clock (a rules-lane addition for stage 5); the two-client test helper carries a
`@firebase/rules-unit-testing` compatibility type cast; and a `v2` campaign that still carries a
legacy embedded encounter keeps an orphan `pc-<uid>` combatant row after `removeMember` until
stage 6, because the field is deliberately un-writable. The stage-4 re-review found four more:
`FoldedState.rolls` is never pruned, so a checkpoint's folded state grows by roughly 11 nodes per
accepted roll and the codec's 1,000-entry rules cap assumes a small checkpoint — measured at 1,000
realistic intents plus a populated checkpoint, the log sits near 34,200 of the 50,000-node budget,
and a bounded `rolls` decision belongs to stage 5/6; with `nowMs` far behind every stamp already in
the log, `checkpointThrough` returns `null` on that client until its own clock catches up — a
liveness cliff on the one client attempting to compact, resolved by any correctly-clocked peer
appending or compacting instead, so the stage-6 wiring must not make a single client the only
compactor; the adapters' import guard's regex sees only `from "…"` specifiers, so a bare
side-effect import or a dynamic `import()` would pass it unnoticed; and `ReactionWindow.eligible`
is now sorted, a property of persisted data rather than an implementation detail, noted on the
type. Closed by this commit: the task-6 note
that `docs/CHARACTER_SCHEMA.md` described the lease without reconciling the spec's old `attached`
name, and stage 3's note that the stage-2 and stage-3 sections ended with the same `Next` line.

The whole-branch review's final wave deliberately did **not** take these, which stay open for
stage 5/6: `rollsUsable`'s per-target relaxation keying off any colon — **rejected**, not
deferred, because an area intent carries an EMPTY `targets` (the derived membership is the target
list), so `action.targets.includes(perTarget)` would reject Marco's Fireball saves; the lease
write against a **shared** character is still untested on the emulator (the gate seeds an
owner-only parent, so `joinTable`'s `batch.update(characterRef, { lease })` is never exercised
against `publicSheetMatchesAfter()`, and it passes by inspection only); `override.ts`'s duplicated
`rejected` helper; the `runSteps` split; `resolve.table.test.ts`'s missing sync-receipt and
`leave` `effect-ended` assertions; the duplicated `freezeDeep`; and the §8 codec round-trip
property test.

**Gates on `v2` at the close** (run sequentially from the `v2` worktree — they share `dist/` and
the emulator port — all green): the controller's first run on the pre-closing tree caught one
false positive of the raw-text Firebase-import scan on the new adapter guard test, fixed in
`b6af71c`; the numbers below are the re-run after that fix. `just ci` 4 min 38 s (833 files /
18,796 tests, Functions 7 files / 129 tests, plus typecheck, lint and the build); `pnpm test:rules`
20 s (4 files / 119 cases on the emulator); `pnpm build` + `pnpm test:budget` 30 s (6 budget
cases); `just ci-srd-only` 2 min 20 s (656 files / 13,226 tests, 2 skipped — run because
`src/lib/combat` and `src/data/combat` are public/SRD modules, and green with the pack pinned to
the empty stub). Stage 3's baseline was 4 min 36 s / 15.1 s / 5 s / 2 min 19 s; the combined `v2`
gate is 7 min 48 s, under the 15-minute target.

**What the gate proves, exactly.** `tests/rules/encounter-two-clients.emulator.test.ts` is the
stage-1 plan's gate for stages 1–4: both golden replays are appended action by action to a real
`campaigns/{id}/encounters/{eid}` document through **two separately authenticated emulator
clients** (the DM and a player), each folding the document it reads back, and both reach the same
`FoldedState` as the pure in-memory replay — with an override and an undo appended from each side,
and a compaction in the middle. What it does **not** prove: any surface. There is still no screen,
no map, no token and no fog; the two clients are test code, not the app. It also does not prove
behaviour under a genuine same-round-trip race between two appends — the hybrid clock orders them
deterministically by construction, but no test contends for the document yet.

**Out of stage 4.** `propose-and-confirm` automation (stage 6, and `FoldedState.settings.automation`
stays narrowed to the two implemented levels so it widens by compile error). The cutover of the
live `users/{uid}/characters/{id}/combat/state` from `CombatState` to the personal `Encounter`
(stage 6, with the old cockpit that reads it, under the snapshot → dry-run → idempotent apply →
verify protocol) — stage 4 wrote the personal ref and the codec, not the migration. The old
campaign hub's encounter writers, which are now rule-denied and die at stage 6 with the surfaces
that host them; unplugging them first would be work on code that is being deleted. The campaign
`memberDetails[uid].character` / `.role` snapshot fields, which the spec deletes but which live
data still carries — stage 8, with `v2`'s first release migration. The `reorder` and `day-phase`
table ops, named in §3.1 and not built. And position as a direct-patch override path: `log-only`
still withholds `move` whole, so a `log-only` table cannot move tokens through the reducer — a
seam stage 5's map must design around rather than inherit.

Next: stage 5 (the minimum map) — closed below.

## `v2` — stage 5, the minimum map (2026-09-04)

Plan: `docs/superpowers/plans/2026-09-04-v2-stage-5-minimum-map.md` (8 tasks; 1–6 executed by the
controller in sequence, 7 on the proposal branch, 8 the handoff). Design:
`docs/superpowers/specs/2026-09-04-v2-stage-5-minimum-map-design.md`, reconciled into the target
spec (§2.1, §2.2, §3.1, §5.1, §5.4), `docs/ARCHITECTURE.md`, `docs/TEST_PORTFOLIO.md` and the
stage-1 plan in the same motion.

**Done (engine, integrated on `v2`).** The map's persisted facts are log actions folded into
`FoldedState.map`; nothing ephemeral is persisted.

- **`map` and `fog` table ops** (`table.ts`, `map.ts`): the background reference (Storage path,
  token URL, image size, grid cell side and origin, bytes) replaced or cleared without touching
  fog or positions; fog with ONE representation — covered except `revealed` rectangles in grid
  cells — `cover` on/off, `reveal` (normalised against containment), `hide` (rectangle difference,
  at most four pieces each), both rejected while fog is off, and a 256-rectangle cap that bounds
  the checkpoint by construction. Malformed numbers (NaN, fractions, out-of-range) are rejected,
  never folded.
- **`override position`** (`override.ts`, `reposition.ts`): a placement sets or clears the cell,
  recomputes `adjacent`/`range` through the recompute half of `repositionRelations` (split so only
  the `move` step opens opportunity-attack windows), spends no movement. Overrides apply at every
  automation level, so this closes the stage-4 seam: a `log-only` table moves its tokens through
  placements. `reveal.token` / `reveal.block` / `reveal.hp` are direct-patch paths too;
  `Entity.reveal.token === false` is a hidden token.
- **`planDrop`** (`map.ts`): the one place the surface asks which action a dropped token becomes —
  the controller on its turn within the budget moves (`core:move`); the DM places in every other
  case; the controller places while turns are not running or on a `log-only` table; out of turn or
  over budget is refused so the surface snaps the token back. **`mapView`**: the viewer projection —
  hidden tokens only for the DM and the controller, tokens under fog invisible to a player except
  their own, HP numbers only where the table reveals them, tokens sorted by id.
- **The codec** carries the new shapes closed-world, and the **§8 round-trip property test** is
  finally written (`codec.property.test.ts`: a seeded generator over every action kind and table
  op, populated checkpoints with a map, unknown keys; 300 cases; two negative properties).
- **A golden replay** (`map-fog-and-hidden.json`) folds the minimum map end to end.
- **The Storage seam** (`storage.rules`, `src/lib/map-io.ts`): `campaigns/{campaignId}/maps/
{mapId}.jpeg`, DM/admin write, member read and list, cross-service membership lookup, 8 MiB and
  `image/*` ceilings; the adapter uploads and returns the `MapBackground` reference, sums usage from
  Storage metadata against a 100 MiB per-campaign courtesy quota, refuses before sending a byte,
  deletes idempotently; `compressImage` moved to the pure `image-compress.ts`. Pinned by the adapter
  boundary guard and the randomness guard.
- **The contended-append proof** the stage-4 handoff asked for: two clients appending in the same
  round-trip and one client's burst of ten all land, and both clients fold the same state.

**Review.** One independent whole-diff review (no session context) after task 5: no Critical,
three Important, six Minor — all taken in one fix wave (`fix(combat): take the stage-5 review's
findings`). Important: (1) the Storage map rule evaluated `isAdmin()` first — a rules evaluation
may touch two Firestore documents and `isAdmin()` ERRORS for a uid without a `users/{uid}`
document, so a DM whose profile document was missing would have been locked out of the maps; the
campaign predicate now comes first, pinned by a test that deletes the DM's users document. (2)
`uploadMapBackground` sent the bytes before anything validated the grid, so a `map` op the reducer
then rejected would have left an orphan in Storage; `isMapGrid` now refuses before the upload.
(3) `planDrop` could plan a `move` the reducer rejects — its budget test was "distance ≤
remainder" (wrong once a speed override drops the budget below what the turn already spent) and
it ignored whether the entity has `core:move`; it now applies the step's own test and requires
the mechanic. Minor, taken: relations recomputed in sorted entity order (a compacted and an
uncompacted fold agree on `relations` order), an upper bound on image and cell sizes, the
check-then-act quota and the `mapId`/immutable-cache consequence stated in `map-io`, deletion
named as the surface's, nested-key quarantine in the property test, an undo in the map replay,
the DM of another campaign and a member's `getDownloadURL` in the rules lane, a 2,000-case
seeded oracle sweep over `subtractRect`. Recorded, not taken: `reveal.token` has no production
default yet — stage 6's PC/monster projections must set `token: true` or every token starts
hidden (carried into the handoff); the rules language's wildcard binding for `list` is proved by
the emulator only (the documentation is silent).

**Rulings during execution.**

- **The map lives on the encounter document** (design §2): ~15 nodes per fog rectangle, ~14 per
  placement, ~270 nodes for a realistic table against the 50,000-node budget; a sibling document
  earns its place only if fog becomes brush-painted.
- **One fog representation.** `reveal`/`hide` on an uncovered map are rejected rather than
  inverted into a "hidden rectangles" list; the surface never offers them while fog is off.
- **A placement is forced movement**: relations recomputed, no opportunity-attack window (UI spec
  §5c), no budget consulted. The `overrides.position` record is kept like every other override —
  attribution — and goes stale the moment the entity `move`s, exactly as `overrides["vitals.hp"]`
  does after damage.
- **`FEET_PER_CELL` stays 5 ft, chessboard only, no token footprint** (design §10): a per-map
  scale would have to flow into distance, budget and area membership, and no acceptance story
  needs it; the grid panel's "Lato di una casella" reads 1,5 m read-only at stage 6.
- **The quota is a client-side courtesy**, stated as such in the rule, the adapter and the spec.
- **Per-test Storage prefixes** in `map-io.emulator.test.ts`: `clearStorage()` did not remove the
  previous test's objects on this emulator, and a usage sum is per-campaign by contract.
- The plan was executed **autonomously** under the owner-approved handoff scope; owner-facing
  questions (Blaze on staging, the surface's verdict) went to the closing message.

**Deferred, with the measurement.** Bounded `rolls` in the checkpoint (stage 6, with the
compaction wiring; the safe pruning — drop at compaction every roll whose spender is not a
still-open `declared` intent — is known); a per-map scale and measurement type; token footprints
(Large = 2 × 2) once stage 6's projection puts a size on the entity; fog shapes beyond rectangles,
multi-layer fog and "remember explored"; a personal-host map (the upload path needs a campaign).
The stage-4 minors not taken here stay open: `override.ts`'s duplicated `rejected` helper, the
`runSteps` split, `resolve.table.test.ts`'s missing sync-receipt and `leave` assertions, the
duplicated `freezeDeep`, `checkpointThrough`'s single-client liveness cliff, the adapters' import
guard's regex scope, and the lease write against a shared character untested on the emulator.

**Gates on `v2` at the close** (sequential from the `v2` worktree): `just ci` 4 min 47 s (836 files / 18,854 tests, Functions 7 files / 129 tests, plus typecheck, lint and the build); `pnpm test:rules` 23 s (5 files / 133 cases on the emulator); `pnpm build` + `pnpm test:budget` 33 s (6 budget cases); `just ci-srd-only` 2 min 6 s (13,287 tests, 6 skipped — run because `src/lib/combat`, `src/lib/map-io.ts` and `storage.rules` are public modules, and green with the pack pinned to the empty stub). Stage 4 closed at 4 min 38 s / 20 s / 30 s / 2 min 20 s; the combined `v2` gate is about 7 min 50 s, under the 15-minute target. All four ran once more on the final tree after the review's fix wave.

**What the gate proves, exactly.** The engine folds a map: the golden replay and the property test
in the unit lane, the Storage matrix and the adapter on the emulator, and the contended-append
case. It does **not** prove a surface: no screen is integrated on `v2`. The surface exists on the
proposal branch and is proved by the owner's eyes (golden rule 25), not by a test.

**Out of stage 5.** The surface's integration (after the screenshot verdict); the play screen's
chrome around the map (stage 6: rail, sub-toolbars, grid panel, token pill, drawer); the
`propose-and-confirm` level; the `combat/state` cutover; the old campaign hub's encounter writers;
`memberDetails[uid].character` / `.role`; the `reorder` and `day-phase` ops.

**Staging.** `firestore.rules` did not change in this stage, so nothing is pending on staging's
Firestore. `storage.rules` did, and the staging project has NO Storage bucket
(`gcloud storage buckets list --project d20-folio-staging` lists none; billing is not enabled):
Firebase Storage default buckets on projects created after October 2024 need the Blaze plan. The
map plays on the emulator (`pnpm dev:emulators`) until the owner links a billing account to
`d20-folio-staging` with a £1 budget alert like production; then
`firebase deploy --only storage -P staging`. Production is untouched. **Done in stage 6** — see
its Staging paragraph below: the plan is linked, the bucket exists and both rule sets are
deployed.

Next: the surface's screenshot verdict — which stage 6 folded into its own proposal branch, so the
map and the play chrome are one verdict — then stage 6, closed below.

## `v2` — stage 6, one play surface (2026-09-04)

Plan: `docs/superpowers/plans/2026-09-04-v2-stage-6-play-surface.md` (5 tasks; 1 executed in this
worktree, 2 and 3 in their own worktrees off `v2`, 4 on the proposal branch, 5 this
reconciliation). Design: `docs/superpowers/specs/2026-09-04-v2-stage-6-play-surface-design.md`,
reconciled in the same motion into the target spec (§2.1, §2.2, §3.1, §4, §5.2, §5.3), the
authoring spec (§6), `docs/ARCHITECTURE.md`, `docs/MECHANICS.md`, `docs/CHARACTER_SCHEMA.md`,
`docs/TEST_PORTFOLIO.md` and the stage-1 plan. Tasks 1–3 reached `v2` at `5519c5b9` (30 commits
since `39212349`); the whole-branch review's cross-task fix wave lands on top of that before the
push, so the integrated head is later than the range this section names.

**Done (integrated on `v2`).** Everything a client needs to play the table, and nothing the owner
has not yet seen.

- **Task 1 — every executable mechanic rides the log.** `add-entity`, `join` and `sync` each carry
  `mechanics: readonly Mechanic[]` (required, `[]` for an entity with nothing of its own); the
  fold conforms each definition and rejects the WHOLE op if any is malformed, keeps them in
  `FoldedState.mechanics`, and `programOf` reads the state first and the static catalogue second.
  `sync` replaces an entity's set and `remove-entity` / `leave` / `sync` drop an id no other
  seated entity still lists (two ogres share one definition). The static catalogue shrinks to
  `core:*` (`src/data/combat/core-catalogue.ts`): `core:move`, the new `core:dash` — a `dash` step
  adding the entity's speed to `TurnLedger.movementExtra`, so the budget, the ruler and the drop
  policy follow a Dash for free — and `core:dodge` / `core:disengage` / `core:help` / `core:hide`
  as `manual-table`, because advantage, disadvantage and stealth are not in the stage-3
  vocabulary. The codec gained a closed-world `mechanicSchema` mirroring the authoring vocabulary
  field for field, and `conformMechanic` now runs it FIRST, so the codec and the fold share ONE
  structural vocabulary. `compact` prunes the checkpoint's roll RECORDS.
- **Task 2 — projections and the PC mechanics adapter.** `projectMonster`
  (`src/lib/combat/monster-entity.ts`, inside the kernel, pure over a stat block: AC, average HP,
  speed, PB from CR, saves with overrides, typed defenses, condition immunities, hidden block and
  HP but a visible token) and `projectCharacter` (`src/lib/combat-projection.ts`, deliberately
  OUTSIDE the kernel so it never imports the sheet's engine, pinned by the boundary guard). The
  adapter emits one mechanic per `resolveActions(doc, "combat")` row with the sheet's own numbers
  fixed at projection; what the tier cannot express degrades to `manual-table`, which still spends
  the economy and reaches the log. `SrdSpellData.areaShape` types the printed area of every
  damage-dealing SRD area spell whose shape is one of the five, with a guard test and the private
  twin in the same motion (rule 28). Two pure helpers moved down out of `lib/views`
  (`src/lib/defense-sets.ts`, `mergeSaveProficiencies` into `compute.ts`) rather than forking the
  sheet's formulas.
- **Task 3 — the client.** `src/features/play/table/`: the table store over
  `campaigns/{campaignId}/encounters/live` (fold memoised on a fingerprint of the log and the
  checkpoint so a pending-only snapshot re-uses the same object; `dispatch` stamps `id`/`seq`/`by`;
  the DM's client alone compacts, single-flight; `connect()` opens the one listener and returns its
  teardown), the tile's three pure builders (`planIntent` — which also picks the slot pool from
  the entity's resources and plans a damage die only for a step that can actually run, so a
  versatile swing rolls one — `rollsFor` through the dice seam and `intentBody`), `leaveTable`'s
  `document` write-back for the legacy `combat/state`, now its ONLY shape, and the log
  presenter `src/lib/views/encounter-log-view.ts` over a new `play` i18n shard in EN and IT. No
  reducer rule was re-implemented client-side: `preflightIntent`, `riderAnswers`,
  `isPerTargetAnswer` and `answerKeyFor` were EXTRACTED from the reducer and are shared, which is
  why the 888 pre-existing kernel tests passed unchanged through both edits.
- **Not integrated: task 4, the screen.** It is built on the proposal branch
  `v2-stage6-play-surface` (`origin/v2-stage5-map-surface` rebased onto `v2` at `5519c5b9`), so
  the owner gives ONE screenshot verdict on the map and the play chrome together.

**Review.** Each task got an independent review of its own diff, and each needed one fix round:
task 1 four Important and five Minor, task 2 two Critical and four Important, task 3 three
Important and seven Minor. All were closed in a single round each and re-reviewed clean. The two
Criticals are worth naming because both were silent-wrong-number defects a type could not catch:
the Pact Magic pool was read under the wrong session key (a Warlock would have seated phantom
slots), and every projected save step hard-coded the caster's primary DC (a multiclass caster's
second class and a feat-granted cantrip both print a different one; on a character with no
spellcasting DC the symbolic value would have resolved to 0 and auto-succeeded every target).

A **whole-branch review** (the most capable model, read-only over the full 30-commit diff, the
ledger, the six task reviews and the head of every seam) then found what a task-scoped review
structurally cannot: **four Important CROSS-TASK seam defects**, where task 2's projected data and
task 3's client planner disagreed. Two made ordinary casts impossible — a Pact Magic caster's slot
pool was never chosen, and a slot cost was upcastable only when the spell's dice scale, so any
caster paying with a higher slot was refused before a die was rolled. One was a live-data hazard:
the write-back's unused `encounter` variant could have written an `Encounter` over a real
character's `combat/state`, which `parseCombatState` would then refuse forever. The fourth was
visible on every swing — a versatile weapon planned two damage rolls, one of which was never read,
was still marked spent and still appeared in the shared log. All four were closed in ONE fix wave
before the push, and each is now recorded on the seam it belongs to (design D4, §4 and §5; target
spec §5.2). The review's own minor finding is in the deferred list below; it confirmed the fold's
determinism across builds and across the checkpoint boundary, that the rules files are untouched,
and that no client write in the range reaches another user's document.

**Rulings during execution.**

- **Tasks 1–3 integrate on `v2`; the surface waits.** With no verdict yet on the stage-5 map
  surface, the non-visual half of stage 6 goes onto `v2` behind review and gates while task 4 goes
  to a proposal branch built on the map's, so the owner sees map and chrome as one screen (rule
  25). Cost if wrong: a rebase of the proposal branch.
- **One writer per worktree.** Task 1 ran in the `v2` worktree itself; tasks 2 and 3 got their own
  worktrees off `v2` once it landed, and were rebased back in that order. The hazard the stage
  found: all worktrees share ONE content-pack checkout through the symlink, so task 2's pack-side
  test made full-mode typecheck red in the other trees until its public half landed — transient
  by construction, and a reason to read a gate result knowing which worktrees are live.
- **A carried definition may never use the `core:` namespace.** `state.mechanics` shadows the
  static catalogue completely, so a projection emitting `core:*` could silently disable an
  ordinary action for that entity. Carried by both projections.
- **A roll stays consumed across a checkpoint.** Compaction prunes the roll RECORD and keeps the
  `spent` verdict, and `rollsUsable` consults `spent` before the record — otherwise an offline
  client's re-sent intent would be accepted after the checkpoint and rejected before it, and two
  clients would diverge on one log. Cost: about four nodes per settled roll, forever.
- **One structural vocabulary, not two.** `conformMechanic` runs the codec's `mechanicSchema`
  first; the hand-rolled structural pass it used to carry was a weaker duplicate that could accept
  what the codec would quarantine. Cost: a codec import inside the conform path (both pure), and a
  structural rejection that no longer carries a JSON path.
- **The node budget is accepted, with its number recorded.** A six-PC party seated and
  checkpointed alongside 1,000 intents measures 44,032 of the codec's 50,000 nodes. It fits, and
  compaction fires at 200 actions, so the realistic document is far smaller; the dominant term is
  the rules' 1,000-entry log cap, not the mechanics. "Compact on node count, or lower the log cap"
  is recorded as the remedy if either half grows.
- **The lease's write-back payload is branded.** `PersonalWriteBack`'s `document` variant carries a
  value only `encodeLegacyWriteBack` can mint, so a hand-rolled object that skipped the play-state
  encoder — on a write that replaces the whole document — is a compile error. Cost: one module
  move.
- **Coverage stays catalogue-only in the kernel**; the projection builds a temporary catalogue from
  what it emitted to report the per-character split, rather than the kernel gaining a second entry
  point.
- **The projected numbers are the sheet's printed numbers.** The row's own save DC as a number
  (the symbolic caster DC only when they are equal), the reducer's own slot keys `slot-<n>` /
  `pact-<n>` through `slotUsageKey`, the weapon's structured range for melee versus ranged, and a
  row that promises more than the vocabulary expresses degrading whole — never half-built. A
  versatile weapon is the one shape expressed rather than degraded: a grip choice with the
  one-handed step ungated, so an unanswered swing is still correct.
- **`MonsterSeat.ordinal` dropped**, unread: the caller mints the id and the label from it.
- **Every projected slot cost is upcastable, and the planner picks the pool.** The SRD lets any
  spell be cast from a higher slot; a projected programme's numbers are fixed, so the cast level
  feeds only provenance. Gating `upcast` on "does the damage scale" refused ordinary play, and a
  Pact Magic pool — one level, always — refused it hardest. The slot pool is chosen from the
  entity's own resources rather than by every caller of every tile: one home, and the reducer
  still judges the payment.
- **The lease's `encounter` write-back variant is deleted, not deprecated.** Nothing calls it,
  D1 forbids what it does, and the personal ref aliases the live `CombatState` — so keeping it
  would leave one mistaken argument between a live character and a permanently unreadable
  document. It returns at item 8 with the sheet (rule 10; the owner's "no dead weight").
- The plan ran **autonomously** under the owner's standing `v2` mandate; owner-facing questions
  (the staging sign-in provider, the screenshot verdict) go to the closing message.
- Process, recorded: a reviewer wrote a temporary probe test inside an implementer's worktree and
  aborted one of its gate runs. Reviewers are read-only; a gate result taken while a tree is being
  written to is not evidence.

**Deferred, with the measurement.**

- **Budget and diagnostics (task 1).** `spent` is monotonic for an encounter's lifetime (about one
  node per settled roll against the ~12 % headroom the ceiling test measures), which is the second
  half of the "compact on node count" deferral. A structural mechanic rejection reports
  `invalid-mechanic-shape` with an empty path; re-conforming one program at a time would localise
  it, at the cost of a second conformance pass.
- **Vocabulary and data (task 2).** Recharge is still typed as an ordinary recovery rule rather
  than a cost; defense casts are unchecked; a projected item action's instance-bound resource
  payment does not become a cost, so those rows adjudicate; two label namespaces now coexist (the
  monster's block-scoped keys and the character's `srd:` / `ui:` / `custom:` / `action:`
  references) and the DM drawer must resolve both; the spellcasting DC and attack bonus are
  assembled a third time from the same shared seams, where one exported helper is the real fix.
  The measurement that matters: a wizard fixture automates 2 of 25 steps, because nearly all of
  its damage spells name a target shape or establish a standing state — the vocabulary needs a
  grant-bearing effect start and a target spec richer than one-or-area before the group's wizard
  plays automated.
- **Surface wiring (tasks 2 and 3).** The versatile grip needs chrome i18n keys and a tile choice
  in task 4, or every versatile swing silently takes the one-handed default; `join` and `leave`
  are task 4's to wire; exhaustion is not projected back by the write-back, and the decision
  belongs in that module's header.
- **Client refinements (task 3), all minor:** export the fold fingerprint for the presenter's own
  memo; a dead re-test in the skip set; `undoneIds` duplicated from the fold; a `connect()`
  teardown shared across owners; the roll context's author versus the store's stamp; a synthetic
  action id for engine-consequence lines. Two guard tightenings are recorded rather than done: the
  boundary guard's type-only allowlist should forbid a VALUE import of the same specifier, and the
  emulator's shape assertion must stay paired with the strict re-parse.
- **Reducer totality (whole-branch review).** `removeEntity` prunes an entity's effects, relations
  and place in the order, but not `checks`, `windows` or `declared`: a later `check` for the
  departed entity, or a `resolve` whose declared target has gone, would reach `mustEntity` and
  THROW — a fold exception on every client, which `checkpointEncounter` cannot repair.
  Unreachable with the projected vocabulary, and that is the measurement: projected programmes
  open no reaction windows and establish no concentration, so neither a window nor a check for a
  removed entity can exist today. Prune the three in `removeEntity` when the vocabulary grows an
  `effect-start` or an event trigger. Recorded alongside it, as the shape the surface now relies
  on: `planIntent` plans a `dice` input only when a step that reads it can run (no gate, or a gate
  of answer predicates that holds), which is what keeps a versatile weapon to one damage die.
- **Carried forward unchanged** from stage 5: `override.ts`'s duplicated `rejected` helper, the
  `runSteps` split, the missing sync-receipt and `leave` assertions, the duplicated `freezeDeep`,
  `checkpointThrough`'s single-client liveness cliff, the adapters' import-guard regex scope, and
  the lease write against a shared character untested on the emulator.

**Staging.** The stage-5 blocker is cleared. The owner's billing account is linked to
`d20-folio-staging` (Blaze); the default bucket `d20-folio-staging.firebasestorage.app` exists in
`europe-west1`, created through the Firebase Storage API because `gcloud` cannot create a bucket
with that name; a £1 budget with 50 % and 100 % alerts mirrors production's; and
`firebase deploy --only firestore:rules,storage -P staging` released both rule sets. Identity
Platform is initialised, but the Google sign-in provider needs an OAuth client only the console
creates (the API refuses with an empty client id). **Owner action pending:** Firebase console →
`d20-folio-staging` → Authentication → Sign-in method → Google → Enable → Save. Production was
never touched.

**Gates on `v2` at the close.** Gates: filled by the controller.

**What the gate proves, exactly.** The table folds identically on every client from the log alone:
carried mechanics resolved with no local catalogue, the compaction property (fold unchanged by
pruning, on a generator of tables that actually apply), the six-PC node ceiling as a number, a
character projected and folded end to end through a generated replay, and — on the emulator — the
lease's write-back landing on a real `combat/state` that the app's own strict reader still
accepts. It does **not** prove a screen: no play surface is integrated on `v2`, the component and
screenshot lanes of design §6 belong to task 4, and the surface is proved by the owner's eyes
(rule 25), not by a test.

**Out of stage 6.** Everything design §7 lists — solo play and the personal `Encounter` (item 8,
with the sheet), `propose-and-confirm`, scenes and the drawing/pointer/text/layer tools, structured
Multiattack, Recharge and Legendary Actions, token footprints (`Entity` still carries no size),
monster token portraits beyond the tinted initial, the phone second screen, the old surfaces'
deletion (stage 7), `memberDetails[uid].character` / `.role` — plus the surface's own integration,
which happens after the owner's screenshot verdict and not before.

Next: the owner's screenshot verdict on `v2-stage6-play-surface` (map and play chrome together),
the whole-branch review's findings, then stage 7's cuts.

## Owner confirmations, recorded ahead of their stage (2026-09-03)

Two product decisions the owner gave at the stage-3 handoff — the first is now decided and built,
the second is still open and recorded here so it is not lost before its stage lands.

- **DECIDED IN STAGE 4 — Admin-supreme account.** Stage 4 wrote the access matrix and chose the
  smaller of the two options: the admin is **not** an implicit member of every campaign; the
  owner's account is added as a member of his group's campaign, while `users/{uid}.role == "admin"`
  carries DM-level rights on every encounter document and owner-level rights on every user path
  except `public/sheet`. See "`v2` — stage 4" above, `docs/adr/0005-rules-enforce-access-not-gameplay.md`
  (2026-09-04 amendment) and design §5.4. Setting the owner's `role` to `admin` remains a console
  action on the user document (production already grants it; staging gets it when Auth is enabled).
  The original wording follows.
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
- **STILL OPEN — Out-of-combat mechanical freedom.** It needs its own design pass before item 8
  of the stage-1 plan; stage 4 neither answered it nor foreclosed it (the personal `Encounter` ref
  and codec exist, but whether the personal aggregate is usable independent of any campaign lease
  is still unverified against §5.2). Owner (2026-09-03): players need the same freedom D&D
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

Stage 6's two task worktrees, `v2-stage6-t2-projections` and `v2-stage6-t3-client`, ARE
candidates: both were rebased onto `v2` and fast-forwarded, so their branches hold nothing `v2`
does not. The controller removes them — worktree and branch — once the whole-branch review's fix
wave is integrated and the gates are green on the pushed head, and not before: a worktree whose
work has not yet survived review is the cheapest place to fix it. The stage-6 surface worktree
`v2-stage6-t4-surface` and its branch `v2-stage6-play-surface` are NOT candidates; they hold the
unintegrated surface and live until the owner's screenshot verdict.
