# Combat automation continuation handoff

> **Branch-scoped handoff — 2026-08-04.** Read this before changing combat automation. This file
> records what is actually proved on the branch, what is still open, and the safest continuation
> path. It is deliberately more conservative than older "100% automation" wording: those claims
> are not a completion certificate.

## Where to continue

The application work is here:

```text
/Users/salvatoredicara/Workspace/d20-folio-combat-automation-gaps
branch: feat/combat-automation-gaps
remote: origin/feat/combat-automation-gaps
```

The matching private content-pack work is here:

```text
/Users/salvatoredicara/Workspace/d20-folio-content-automation-data
branch: feat/automation-data
remote: origin/feat/automation-data
```

Do not duplicate a mutable branch head in this document: `git rev-parse HEAD` and
`git rev-parse origin/feat/combat-automation-gaps` are the authorities. The paired pack checkpoint is
currently pushed at `4931c47a`; verify its branch before composed work.

The app worktree's `content-pack` symlink points at that pack worktree. Keep both branches paired.
The Codex-generated worktree at
`/Users/salvatoredicara/.codex/worktrees/d6a5/d20-folio` is on the older
`codex/fix-encounter-ui` branch; it is **not** the continuation worktree. The owner wants manually
created worktrees under `~/Workspace` from now on.

Neither branch has been merged into `main` or deployed. Do neither without the owner's explicit
approval. Do not modify or revert the AGPL/legal changes made by the other workstream.

### 2026-08-05 continuation checkpoint

The pushed app head has advanced locally to `ebc9359fd8896729f37b80c51d4d095844c7982b` and the paired
pack head to `2b2abeadcc5b76d1a3db38fcf8f9c4db6d66da91`. The working trees after those heads contain the
active physical-item resource slice described below; it is intentionally unpushed while the composed
catalogue wave, migration proof and complete dual-build gate are still in progress. Preserve both
working trees as one change set.

### 2026-08-12 canonical-engine checkpoint

The active continuation has ratified and implemented the first exact foundation for the one-model
cutover: monotonic material/entity/item/occurrence identity; one program-root authority receipt; direct
child effects; typed public command answers and trigger evidence; recoverable root/phase CAS frames; and
cause-complete terminal transactions. `MechanicsIntent` now contains only action guards plus that frame,
so program/source/roles/bindings cannot drift across command, suspension and execution. Root creation is
targetless and post-event derivation discriminates it from effects.

The operation layer has also stopped eagerly closing the world after ordinary damage, resource,
vitality or occurrence-create mutations. Ending sources must remain readable for the future coordinator;
Concentration replacement now requires an explicit end barrier. Exact inventory leases allow a final-use
tombstone only during its originating transaction, and final material cleanup cannot discover or end an
active occurrence. The focused foundation suites pass; no full branch gate was run, by owner rule.

Do not mistake this checkpoint for an executor. `planMechanicsAction` still fails closed on every typed
world operation, root/phase/register transition and ordered dependency. The next work is one causal
coordinator that compiles all triggered frames and end waves into one transaction/draft, followed by the
corpus and application cutover and deletion of every old effect-program/handwritten executor path.

### 2026-08-12 causal-kernel hardening — checkpoint closed

The operation cause no longer accepts an authority receipt. Installed authority is independently resolved
from a trusted immutable snapshot; program authority comes from the exact persisted root generation; the
kernel then binds the recomputed cause to the installation owner and adds definition/installation guards.
Resolution groups simulate one ordered atomic transaction and retain exact before/after world projections
for every applied operation so ordinary post-events are derived from exact stages; only the complete
transaction result is a reusable causal-state receipt.

The adversarial pass withheld closure until the final invariant became stricter:
the only hostile entry begins from a closed world; ending causes are latched as explicit pure transient
state on their exact occurrence generations; and only typed kernel-produced continuations may advance an
operation or table boundary. No self-declared history, hidden `WeakMap`, serialized continuation or
resolver-returned replacement world is authoritative. Suspensions replay their fenced inputs and answers
from the closed basis. Every mutable non-self `EntityRef` also carries its ordinal so a same-id replacement
cannot satisfy an old target, actor, owner, encounter participant, duration rule or event.

Closure uses one bounded indexed worklist and one cumulative request for observed boundaries, explicit end
requests and leases. `beginMechanicsBoundary` / `advanceMechanicsBoundary` replace the deleted closure
callback: a completion is bound to the whole continuation; an empty wave retains its boundary; and any
wave created or extended while subscribers run becomes another source-readable checkpoint before removal.
Historical clock evidence remains valid only across the exact encounter hand-off owned by the cursor.

The authentic event census is closed: operation stages emit damage taken, zero HP and resource depletion;
re-proved end waves emit source ending. Finalization re-proves the exact wave, returns its resulting world
and does not fabricate generic change events with no authored consumer. The universal physical-D20 kernel
is included as a direct program-runtime dependency; it rejects non-canonical numeric aliases and records a
table-declared two-failure Death Save separately from a natural 1. Focused verification passed 408 tests
across the 20 directly affected suites. The active work now moves to the single `MechanicsProgram` step
compiler plus fixed-point coordinator, suspension replay and one final journal draft. By owner rule no
global branch gate ran for this checkpoint.

### 2026-08-12 exact physical operations — checkpoint closed

Every program/effect/entity/inventory create operation now carries its exact preallocated generation and
compares it with the material's monotonic allocator. Entity/item creation writes one dedicated
`material-lifecycle` atomically; validation rejects duplicate ownership. Allocators are identity
high-water state and therefore survive undo/redo even when ordinary timeline/encounter state reverses.
Inventory transition/end addresses one exact copy, holds exact causal leases and compare-and-swaps any
inbound enchantment bearer rather than relying on an order-sensitive world scan.

Availability/controller changes operate on exact generations, including dismissed entities. Dismissal of
a non-current participant atomically reconciles local/shared encounter membership before closed-world
validation and releases a character's final shared clock lease. Dismissal of the current participant
returns an exact `needs-boundary` continuation without mutation: only the authenticated end-turn
continuation may finish the removal, ordinary cleanup fails closed, and the future coordinator owns the
successor's start-turn observation. Controller validation spans the loaded world and rejects cycles,
so every controller rewrite (and controlled create) shares one semantic graph collision address. Encounter
membership has the same explicit semantic dependency; only allocator collisions are automatically ordered
by generation.

`turn-claim` authoring and terminal operations are now isomorphic to the claim-bearing canonical turn
commands. `start-turn`/`end-turn` remain exclusive to `beginMechanicsBoundary` /
`advanceMechanicsBoundary`. Exact hostile boundaries inspect only own enumerable data descriptors, so
array accessors are rejected and stateful proxy values are snapshotted once before conformance. Every
cause is pre-authorized against the common action basis, never against a world already mutated by an
earlier operation. Ordered steps expose only transaction-local world projections; one final causal rebase
preserves an existing latched wave and discovers the net new wave, making source-create + Temporary-HP
grant atomic. Timeline-bound creation reads the owning material's clock binding, and the closed parser
rejects a current combatant left in `between-turns`. Neither projection nor causal rebase can rewrite
protected journal epoch/revision/actions or character build revision. The independent P0/P1 review's remaining gaps are all
closed. The focused kernel proof is 401 tests across 14 suites; no global gate ran. Next: one
`compileMechanicsFrame` with a per-material allocation
ledger, one fixed-point subscriber/end-wave coordinator and one `planMechanicsWorldAction` call producing
one journal draft.

## Product doctrine

The target is a table companion, not a VTT:

- Automate every deterministic consequence that the app can know.
- Never invent spatial facts, hidden rolls, line of sight, table rulings, or other facts the app
  cannot observe. Ask for the minimum missing fact at the moment it matters.
- The app never rolls dice. It presents formulas and accepts physical-roll results.
- Use the same resolution behavior in solo play and encounters.
- Make every automatic result reviewable and reversible; DM/player correction and homebrew override
  are first-class behavior, not exceptional escape hatches.
- Persist state before navigation can erase it. Peer effects must work while the recipient is
  offline.
- Overview first, details on demand; expose only decision-relevant information.
- Public SRD and private pack are one product scope but remain a hard licensing partition. Update and
  test both in the same motion.

## Honest status

Automation is **materially better but not complete**, and the present architecture is **not yet the
state-of-the-art endpoint for corpus-wide automation**.

What is good and worth preserving:

- typed source data flows through grants/resolved actions rather than English-regex interpretation;
- solo and encounter effects increasingly share the target-review and transaction path;
- effect provenance, timers, offline peer delivery, combat-state persistence and exact undo have
  reusable seams;
- the real six-character team fixtures now pin many high-frequency contracts;
- the branch contains 32 app feature commits and the paired pack branch contains 36 commits, all
  separated into small milestones before this handoff.

What is not yet good enough:

- authoring is split among `Grant`, `SrdActionDef`, `ActionData`, spell-specific fields, item charge
  fields and several one-off adapters;
- `src/lib/smart-tracker.ts` and `src/lib/grants.ts` are large compilers with growing conditional
  surfaces, while `CombatResolver.tsx` and `TurnEconomyProvider.tsx` still mix orchestration with UI;
- attack/save/damage-reduction receipts now preserve turn occurrence, target and honest exact-vs-aggregate
  instance identity, and their economy owner commits atomically; damage-dealt facts and an explicit
  critical-hit resolver input are still missing;
- the coverage matrices are manually curated and can be green while a declaration has no complete
  runtime consumer;
- older docs contain closed-audit language that proved too optimistic. Treat them as evidence and
  history, not as a substitute for code/data/source inspection;
- PC damage now has one pure `reducePcDamage` kernel for open-sheet and fresh-read peer state; multi-hit
  inputs cross it as ordered packets, so Death Ward, damage at 0 and retaliation are no longer action-total
  approximations. The own-sheet encounter adapter still stops at optimistic projection consumption: it does not yet
  apply/reverse returned Warding Bond partner transfers or transactionally revoke/restore the consumed
  campaign occurrence. Do not claim that local projection filtering is a reload-durable inverse;
- the current public + pack matrices still contain many `partial`/`narrative` rows. Some are correct
  table/VTT boundaries, but they have not all been reclassified clause by clause against the actual
  2024 source and runtime.

Therefore do not claim "all mechanics automated" until the generated coverage/conformance gate
described below exists and passes.

## What this branch implemented

The app history from `origin/main` through feature head is the authoritative detail:

```bash
git log --reverse --oneline origin/main..HEAD
```

The main delivered seams are:

- resilient encounter effect delivery, including offline party members and NPC allies;
- reactive hit and incoming-damage effects;
- one pure PC damage transition shared by character-store and peer-campaign reducers, including explicit
  raw/resolved intake, Temporary HP, dying/knockout/massive-death state and exact zero-HP-floor identity;
- persisted occurrence-based attack/save/damage-reduction facts with owner-validated hydration and exact
  action/Attack-swing/Reaction undo;
- variable-level charged-item casts and activated-item tracker/timer lifecycles;
- bounded free-cast spell pools routed through ordinary cast resolution;
- variable healing pools, deterministic condition cures and exact resource undo;
- generic feature-effect resolution, including physical rolled healing/temp-HP inputs;
- 2024 Rage lifecycle, maintenance, spell/concentration/equipment blockers and exact undo;
- Monk Focus/Mercy/Deflect/Uncanny Metabolism/Wholeness of Body contracts;
- Bardic Inspiration and Musician/Heroic Inspiration delivery;
- recorded physical-roll trackers such as Portent;
- the current team Wizard, Rogue/Assassin and Paladin/Vengeance combat contracts;
- condition/effect provenance, explicit lifetimes, rest reconciliation and exact-target occurrence
  expiry;
- selectable damage riders, activation-scoped resources and source-qualified condition immunity;
- equipment combat actions, inherited feat-spell-choice repair and Alert initiative swaps;
- Divine Fury on weapon or Unarmed Strike, including ranged weapons and per-hit damage-type choice;
- paired pack-side feature data for rolled healing/Temporary HP, condition removal and timed active
  states;
- one locale-free entered-D20 kernel with live-character adapters for Death Saves and damage-triggered
  Concentration saves, including exact physical-face input, natural-face policies, Exhaustion and
  Advantage/Disadvantage netting;
- a persisted per-character FIFO of Concentration saves (one row per authored damage packet), canonical
  failure teardown, malformed/stale prompt rejection and whole-command causal undo/replay.

This list means those specific regressions have structured implementations and tests. It does **not**
mean the entire D&D corpus has been certified.

## Six live-team fixtures

The private fixtures are in `content-pack/fixtures/team/*.json`. They are the first conformance gate,
not the scope boundary. Their private names and non-SRD build details deliberately stay out of the
public repository. Inspect the fixtures and `content-pack/docs/AUTOMATION_COVERAGE.md` in the paired
worktree for the exact contracts.

One imported feat spell choice is intentionally incomplete. The UI offers **Complete choices**
repair; do not infer or write a spell choice the player did not make.

## First architecture proving case

The paired pack coverage matrix identifies an unimplemented active-state-gated, once-per-turn
on-hit rider. It is an excellent first proving case for the next architecture because it needs all
of these facts together:

- a parent state must be active;
- once per turn;
- trigger only after a successful attack;
- select the creature hit;
- adjudicate a WIS save against the actor's spell save DC;
- apply Frightened until the end of the actor's next turn;
- preserve exact log, undo and redo behavior.

The current receipt path does not represent generic attack/save success consistently, and grouped
multiattack receipts lose per-swing success. `SrdActionDef`/`ActionData` can express exact-action
prerequisites but not a generic "successful attack this turn" prerequisite. Adding a Warlock-specific
boolean would deepen the problem. Use this feature to prove the canonical intermediate
representation instead.

## Required architecture direction

Do this incrementally; do not rewrite the application in one pass.

1. Define one canonical, locale-free combat intermediate representation for author intent and the
   resolved plan. It must express actor, source, cost, targeting policy, observed inputs, attack/save
   outcome, deterministic effects, duration, cadence, provenance and override metadata.
2. Compile features, spells, weapons, items and homebrew into that representation with pure adapters.
   Existing data shapes may remain authoring conveniences temporarily, but consumers must stop
   learning each source dialect.
3. Produce one pure transaction plan from resolved action + current state. The plan should be a list
   of validated operations with an inverse/receipt; React renders and commits it but does not encode
   rules.
4. Use that same transaction runtime for own-sheet solo play, live encounter targets, offline peer
   delivery and encounter-owned NPCs/monsters.
5. Persist explicit outcome facts: per-attack/per-target success, save outcome, resource spend,
   applied occurrence ids, before/after values and source/action identity. Grouped UI may summarize
   events, but must not destroy the facts needed by cadence, logs or undo.
6. Represent table-only residuals explicitly (`manual-observation`, `spatial`, `narrative`, etc.). A
   manual boundary is valid; an unclassified prose fallback is not.
7. Generate clause-level coverage from the composed catalogues. A deterministic clause is green only
   when it has structured authoring data, a compiler, a runtime consumer and a conformance test.

Keep the existing stable seams while migrating: `ResolvedAction`, combat effect occurrence ids,
combat-state subdocs, target snapshots, `campaign-io` transactions and the current undo fence are
useful foundations.

### Proved first transaction slice: physical item resources

The current working tree proves the smallest version of that direction for one bounded domain rather
than beginning with a speculative whole-engine rewrite:

- every durable magic-item copy has a stable `instanceId`; a counter is addressed by
  item + copy + resource, never by catalogue item id alone;
- catalogue `ResourceSpec` data declares capacity, initial state, exact recovery events and depletion
  consequences, while `session.itemResources` is the only mutable owner for a migrated item;
- `lib/resources.ts` is a locale-free, roll-free planner. It either rejects, asks for irreducible
  physical-roll facts, or returns one compare-and-swap operation plus a serializable receipt;
- the shared provider collects every requested fact before mutation, revalidates the exact equipped /
  attuned / magical copy, and commits one operation or one whole recovery batch;
- undo is causal against the committed revision and redo replans the same entered facts against live
  state. Stale state, cancellation, an unequipped owner or a lost Reaction claim mutates nothing;
- Short Rest, Long Rest, Dawn and Dusk are distinct typed events. Dawn/Dusk are explicit Table Clock
  declarations, never device-time inference or a Long Rest alias;
- Inventory, the resource rail, rests, item casts, item actions and alternate action costs consume the
  same planner/commit seam; disposed copies stop supplying both actions and passive grants.

The proof catalogue began with Wand of Magic Missiles, Winged Boots and the paired-pack Spirit Board.
It now also contains the first 24-item source-verified public scalar wave plus the pack Mythallar Cloak,
Niko's Mace and Wave: 30 physical-resource items in all. Wave proves two independent pools on one copy;
the pack trio also proves entered d10/d6/d3 Dawn recovery without a false Long-Rest alias. The composed
migration catalogue fingerprint is pinned to the reviewed resource set, so adding or changing any item
fails before a live document can be planned. That proves counter ownership/payment only for properties
that already have structured executable authoring; several non-spell properties on the same items remain
open and must not inherit a false green status from the counter. No legacy item-id tracker,
`ref.charges` owner or Dawn/Long-Rest compatibility path may be deleted until the one-off migration has
converted and verified every live current character **and every saved snapshot**. Complex item
collections, linked meters, elapsed-time cooldowns and table-conditioned spends remain explicitly open;
do not force them into the scalar counter merely to make a matrix green.

The one-off is prepared at `scripts/migrate-item-resources.ts` but has **not** touched production. Its
contract is deliberately fail-closed: it loads the pinned SRD-only or composed resource catalogue,
discovers both current character documents and every `snapshots` subcollection, preserves unrelated raw
Firestore values, reuses valid identities, assigns missing ids deterministically, rejects ambiguity, and
plans the entire corpus before a write is possible. The modes are:

```sh
# read-only plan (default)
node --import ./scripts/alias-loader.mjs scripts/migrate-item-resources.ts

# read-only completion/idempotency assertion
node --import ./scripts/alias-loader.mjs scripts/migrate-item-resources.ts --check

# apply only after a green dry-run: fresh absolute directory, recoverable tagged backup first
node --import ./scripts/alias-loader.mjs scripts/migrate-item-resources.ts \
  --apply --backup /absolute/fresh/private/item-resource-backup
```

Production access requires an explicit service-account credential for exactly `d20-folio`; apply also
requires a fresh `0700` backup directory, writes `0600` tagged-value documents plus hashes/update times,
uses one ≤500-document batch with `lastUpdateTime` preconditions, then rereads every changed document and
reruns global plus idempotency verification. After the owner runs apply and `--check` succeeds, remove the
legacy owners/read paths and delete the spent script in the same closure wave (golden rules 10 and 22).

### Current execution/persistence diagnosis

The physical-item seam is not yet the application-wide transaction runtime. Production execution is
still divided among four paths:

1. `cost-engine.ts` plans serializable scalar mutations but is used mainly by conversions/tests;
2. `TurnEconomyProvider` is the primary combat executor and hand-orchestrates payment, action economy,
   effects, logs and closure-based undo;
3. `SpellsTab` duplicates substantial cast/payment/concentration behavior outside combat;
4. `characterStore` owns many composite resource/rest/state mutations and broad snapshot inverses.

The first generic command member is now proved for `resource-conversion`. It captures only stable
source/conversion ids plus the player's selected level or amount; every execute/redo re-resolves the live
grant and legal option, canonicalizes every touched normal-slot/Pact-slot/tracker owner, and commits them
through one whole-character Zustand compare-and-swap. One stale leg means zero mutation, notification or
persistence flush. The serializable receipt supplies the exact reverse plan; source removal does not block
undo, while any intervening owner/capacity change leaves undo retryable. `ResourceConversions` no longer
calls the sequential low-level mutators or stores stale `CommitOp[]` closures.

The first source-authored spell correction wave is also deliberately narrow and proved in both build
modes: Feather Fall, Hold Person and Slow now carry exact target-cardinality facts; Conjure Barrage and
Conjure Volley carry exact Force-damage/save facts and Barrage's upcast packet. This closes those data
defects only. Reactive eligibility, repeat saves, geometry/materials and delayed or phased effects still
require the shared cast/effect transaction architecture below.

Owner-character autosave, the combat subdocument, local logs and campaign-owned peer/NPC effects also
have different persistence boundaries, so a logical action cannot yet honestly claim cross-document
atomicity. Extend the proved locale-free `MechanicsCommand` union incrementally: a future member may
return `needs-input`, `rejected` or a serializable plan with expected state, owner operations, turn
operations, log facts and explicit external intents. Local owner state must keep committing as one checked
mutation and emitting a causal receipt. Campaign-owned external effects require idempotent intent delivery
and compensation; they must not be described as a Firestore transaction with an unrelated owner doc.

The entered-D20 kernel is intentionally below that future transaction runtime and never rolls dice.
`lib/d20-test.ts` validates the exact one/two physical faces required by the net roll mode and resolves
the selected natural face, total and policy outcome; `lib/character-d20-tests.ts` rebuilds Death Save or
Concentration facts from the live character at commit/replay. Solo damage persists one
`PendingConcentrationSave` for each ordered damage packet and resolves the FIFO head with causal undo.
Campaign-target damage still needs the shared resolver to load the target PC's parent character session,
enqueue the same prompt in that target's combat subdocument and include it in the campaign inverse; do
not duplicate a second Concentration-save implementation inside `campaign-io`.

Migration order is deliberately narrow: rail slots/trackers/inspiration and conversions first; then one
Cast command shared by Spells and combat; then action-economy claims, attacks and Reactions; then combat
outcome/external-effect intents; finally rests and turn boundaries. Delete each handwritten path only
after parity tests prove the new consumer in SRD-only and composed builds.

## Corpus audit method

Do not trust `docs/AUTOMATION_BACKLOG.md` or either coverage matrix as the initial input. Regenerate
truth from the actual composed data and the 2024 source, then reconcile the docs.

For every rule-bearing clause:

1. classify it as deterministic, requires physical roll/input, requires table observation/spatial
   knowledge, or narrative only;
2. for deterministic clauses, trace authoring data → compiler → consumer → persisted result → undo;
3. for physical input, verify the app asks only for the irreducible value and then applies all known
   consequences;
4. for table-only clauses, provide a concise reminder or override at the decision point;
5. test SRD-only and composed builds, solo and encounter modes where applicable;
6. update the generated matrix and canonical docs from the same truth source.

Prioritize the six team fixtures for regression risk, then finish the whole corpus. "Team-first" must
never become "team-only."

## Verification performed

At feature head `0034c99`:

- targeted feature/smart-tracker suites: 366 tests passed;
- pre-commit fast gate: 496 files / 15,671 tests passed;
- the first full pre-push attempt timed out in three cases in
  `content-pack/tests/unit/turn-economy-undo.test.tsx` while waiting for `combat-resolver`;
- that file passed alone, 45/45, in 12.61 seconds;
- the repeated full pre-push gate completed and the remote app branch reached `0034c99`.

Treat the timeout as a real test-harness reliability issue, not proof of a product defect and not
something to bypass. Never use `--no-verify`.

Useful starting commands:

```bash
cd /Users/salvatoredicara/Workspace/d20-folio-combat-automation-gaps
git status --short --branch
git fetch origin
git log --oneline --decorate -12
readlink content-pack
pnpm test --run content-pack/tests/unit/turn-economy-undo.test.tsx
pnpm tsc -b
```

Before eventual integration, both build modes and the full local gate must pass, then run the
independent ponytail convergence review, rebase on current `origin/main`, and ask the owner before
merging. Do not deploy until the owner separately approves it.

## UI/dogfood status

This branch also contains earlier dogfood work around encounter persistence, healing, initiative,
custom combatants, target context, Chronicle output, legal textures, dev/prod parity and the zombie
crop. Some pieces were owner-tested, but this handoff does **not** certify every visual request as
complete. In particular, do not conflate engine closure with approval of the encounter summary,
target selector, custom-monster dialog or other visual polish. Golden rule 25 still requires owner
screenshot approval for visual changes.

## Definition of done

The automation epic is done only when all of the following are true:

- the canonical IR and one transaction runtime serve features, spells, weapons, items and homebrew;
- every composed-catalogue deterministic clause is generated-green with a real consumer and test;
- every residual manual/table boundary is explicitly classified and minimally presented;
- solo, online encounter, offline peer and NPC paths share conformance behavior;
- resource, Temporary HP, HP, conditions, durations, concentration, equipment and cadence remain
  consistent through navigation, reload, undo and stale redo;
- the six live fixtures and corpus-wide SRD + pack suites pass;
- UX is owner-approved in both themes and responsive layouts;
- full hooks pass without bypass, the branches are rebased, and the owner explicitly authorizes the
  merge and later deployment.
