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
feature head before this handoff commit: 0034c99346e0b674e2df791950f9ffeb15d5683c
```

The matching private content-pack work is here:

```text
/Users/salvatoredicara/Workspace/d20-folio-content-automation-data
branch: feat/automation-data
remote: origin/feat/automation-data
head: 81adb11b
```

The app worktree's `content-pack` symlink points at that pack worktree. Keep both branches paired.
The Codex-generated worktree at
`/Users/salvatoredicara/.codex/worktrees/d6a5/d20-folio` is on the older
`codex/fix-encounter-ui` branch; it is **not** the continuation worktree. The owner wants manually
created worktrees under `~/Workspace` from now on.

Neither branch has been merged into `main` or deployed. Do neither without the owner's explicit
approval. Do not modify or revert the AGPL/legal changes made by the other workstream.

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
- success receipts are not uniformly modeled for attacks, saves and per-swing multiattacks;
- the coverage matrices are manually curated and can be green while a declaration has no complete
  runtime consumer;
- older docs contain closed-audit language that proved too optimistic. Treat them as evidence and
  history, not as a substitute for code/data/source inspection;
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
  states.

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
