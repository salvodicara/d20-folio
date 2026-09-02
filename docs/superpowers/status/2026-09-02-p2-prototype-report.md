# P2 prototype vertical — what it is, how to run it, what it proves

**Date:** 2026-09-02 · **Branch:** `claude/d20-folio-combat-arch-db1941` · **Status:** green under the
gates listed at the end. The prototype is a pure module with no production reach: no UI imports it,
no store folds it, no visual changes. It exists to prove the
[target architecture](../specs/2026-09-02-total-combat-automation-design.md) on the hard slice the
brief demanded before the owner commits to the migration.

## Where

| Path                                                                                 | Role                                                                                                                                                            |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/combat/ids.ts`                                                              | entity/action ids, the hybrid logical clock `Seq` and its total order                                                                                           |
| `src/lib/combat/types.ts`                                                            | the Encounter aggregate: entities, relations, effects, lifetimes, windows, checks, actions, receipts, rejections                                                |
| `src/lib/combat/mechanic.ts`                                                         | the authoring contract v1 and `conformMechanic` (path + rule id on failure)                                                                                     |
| `src/lib/combat/catalogue.ts`                                                        | `buildCatalogue` (conform once at load), `programOf`                                                                                                            |
| `src/lib/combat/predicates.ts`                                                       | predicate and expression evaluation, bindings (`$self`, `$target`, `$event.entity`)                                                                             |
| `src/lib/combat/damage.ts`                                                           | SRD 5.2.1 damage order, temp HP, dying/dead, massive damage, healing from 0                                                                                     |
| `src/lib/combat/effects.ts`                                                          | ending effects with cascade (dependents, concentration groups, marks, temp HP)                                                                                  |
| `src/lib/combat/table.ts`                                                            | clock and boundaries: start, initiative, begin-turns, end-turn, rest, end, settings                                                                             |
| `src/lib/combat/intent.ts`                                                           | intents: typed costs paid first, per-target outcomes, riders, concentration as a consequence, windows, declare, override, checks                                |
| `src/lib/combat/windows.ts`                                                          | who may react to an event, from data                                                                                                                            |
| `src/lib/combat/resolve.ts`                                                          | the reducer entry, exhaustive over action kinds                                                                                                                 |
| `src/lib/combat/fold.ts`                                                             | the fold: sort by `Seq`, skip undone, re-validate, collect rejections                                                                                           |
| `src/lib/combat/coverage.ts`                                                         | coverage rows derived from the catalogue                                                                                                                        |
| `src/lib/combat/state.ts`                                                            | invariant accessors (fail loudly)                                                                                                                               |
| `src/lib/combat-io.ts`                                                               | Firestore adapter: `appendAction` (`arrayUnion`), `subscribeEncounter` (fail-closed parse)                                                                      |
| `src/data/combat/prototype-catalogue.ts`                                             | six mechanics authored purely as data: longbow, shortsword (+ opportunity attack), goblin scimitar, Hunter's Mark, Shield, a Hideous-Laughter-shaped save spell |
| `docs/automation-coverage.prototype.json`                                            | the derived coverage record (guarded against drift)                                                                                                             |
| `firestore.rules` `match /campaigns/{campId}/encounters/{eid}`                       | members append-only, DM/admin rewrite; excluded from the member wildcard                                                                                        |
| `tests/unit/combat/*.test.ts`, `tests/rules/firestore-rules.test.ts` (last describe) | the proofs                                                                                                                                                      |

## How to run

```bash
pnpm test --run tests/unit/combat/
```

```bash
pnpm test:rules
```

Regenerate the coverage record after changing the prototype catalogue:

```bash
WRITE_COMBAT_COVERAGE=1 pnpm test --run tests/unit/combat/coverage.guard.test.ts
```

## What it proves (mapped to §9.8 of the brief)

| Requirement                                                     | Proof                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One PC and one monster acting against each other                | `resolve.intent.test.ts`: the ranger's longbow vs the goblin, the goblin's scimitar vs the ranger; the same reducer, entity-generic                                                                                                                                                                         |
| A reaction triggered on another creature's turn                 | `resolve.window.test.ts`: the goblin's attack opens a window on the goblin's turn; the ranger casts Shield inside it; on `resolve` the held attack is recomputed against AC 20 and misses; a second Shield is rejected (reaction spent); a declared departure from reach opens an opportunity-attack window |
| A per-target effect                                             | Hunter's Mark: a `mark` effect with a `mark` relation; the +1d6 rider is requested only on a hit against the marked target (`missing-answer: rider:<effect>`) and added to the damage                                                                                                                       |
| A concentration effect that ends and cascades                   | the goblin damages the concentrating ranger → a pending concentration check with DC 10; a failed `check` ends the concentration effect, the mark and its relation in one action; a target that drops to 0 ends its own concentration                                                                        |
| Outcome-first (Incident 1 class)                                | `proto:spell:giggle`: every target succeeds → receipt `negated`, slot spent, **no** concentration, **no** effect; a failed save establishes two conditions under one concentration                                                                                                                          |
| Payment cannot be bypassed (Incident 3 class)                   | costs compile before any effect; an unaffordable intent is `rejected` and nothing changes; `boundary.guard.test.ts` proves every costed program reports `paid`                                                                                                                                              |
| Shared encounter, two clients, one offline, reconnect           | `fold.test.ts`: the same set of actions folds identically in 25 seeded permutations; an offline player's earlier-stamped actions merge with the DM's later ones; an action that became illegal (target removed) is rejected identically on both sides                                                       |
| A DM write onto a player-owned fact under the new authorization | `fold.test.ts` (DM override wins by fold order, both actions kept) + `firestore-rules.test.ts`: the DM appends an override on the player's entity to the encounter document; the DM still cannot touch the player's character subtree                                                                       |
| Undo across the log                                             | `fold.test.ts`: undoing the cast restores the slot and removes the effect and its relation                                                                                                                                                                                                                  |
| A mechanic authored purely as data                              | all six; nothing under `src/lib/combat` names any of them (`boundary.guard.test.ts` also proves no React/Firebase/i18n/Zustand/clock/RNG import)                                                                                                                                                            |
| Coverage derived, not hand-kept                                 | `coverage.guard.test.ts`: the committed JSON must equal the regenerated one                                                                                                                                                                                                                                 |

## What it does not do yet (P2 proper)

The full authoring vocabulary (areas, summons, transforms, auras, readied actions, day phases,
monster adapter from `MonsterStatBlock`), checkpoints, the personal-aggregate host, exact-schema
codecs with unknown-key preservation, and the JSON golden replays. These are listed in the
[migration program](../plans/2026-09-02-total-combat-automation-migration.md) P2.

## Gates

`pnpm test --run tests/unit/combat/` (38 tests), `pnpm test:rules` (encounter block: 5 cases), `just ci`
(recorded in the handoff).
