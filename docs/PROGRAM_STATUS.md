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
- Next session: `docs/superpowers/plans/2026-09-04-v2-next-session-handoff.md` (stage 5, the
  minimum map).

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
stage 6, because the field is deliberately un-writable. Closed by this commit: the task-6 note
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
the emulator port — all green): `just ci` 4 min 41 s (831 files / 18,787 tests, Functions 7 files
/ 129 tests, plus typecheck, lint and the production build); `pnpm test:rules` 20 s wall clock,
15.0 s inside vitest (4 files / 116 cases on the Firestore and Storage emulators); `pnpm build` +
`pnpm test:budget` 29 s (6 budget cases); `just ci-srd-only` 2 min 23 s (654 files / 13,217 tests,
2 skipped — run because `src/lib/combat` and `src/data/combat` are public/SRD modules, and green
with the pack pinned to the empty stub). Stage 3's baseline was 4 min 36 s / 15.1 s / 5 s /
2 min 19 s; the third number is not comparable, because stage 3 timed `vite build` alone while
this close timed `pnpm build`. The combined `v2` gate is 7 min 53 s, inside the 15-minute
target.

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

Next: stage 5 (the minimum map), from
`docs/superpowers/plans/2026-09-04-v2-next-session-handoff.md`.

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
