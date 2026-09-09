# Mechanics

How rules automation works on **v2**: what a mechanic is, the format it is authored in, what the
reducer executes today, and what it honestly does not. This document is the owner of the
mechanics authoring format — it absorbs
[`superpowers/specs/2026-09-02-mechanics-authoring-spec.md`](superpowers/specs/2026-09-02-mechanics-authoring-spec.md),
which stays as the historical design record. Where that spec and the code disagree, the code is
what is written here and the difference is named.

Boundaries, layers and persistence are [`ARCHITECTURE.md`](ARCHITECTURE.md); stored character
shapes are `CHARACTER_SCHEMA.md`; the delivery order is
[`program/PROGRAM.md`](program/PROGRAM.md). The v1 mechanics document is history at
[`archive/v1/MECHANICS.md`](archive/v1/MECHANICS.md).

## 1. What a mechanic is on v2

A mechanic is **typed data**, never prose. Nothing in the engine parses a description, and no
engine file names a spell, a feature or a monster: content ids are opaque, and a program refers to
creatures only through the bindings `$self`, `$target` and `$event.entity`
(`src/lib/combat/mechanic.ts`).

Two halves, two seams:

- **Passive facts** — what a character _is_ — are `Grant`s. A mechanic-bearing source declares
  them (`src/lib/grant-schema.ts`), `aggregateCharacterGrants` (`src/lib/aggregate-character.ts`)
  folds every grant the character currently receives, and the sheet reads the aggregate. This is
  the `Grant` seam of golden rule 5.
- **Active behaviour** — what a creature _does_ — is a `Program` on a `Mechanic`
  (`src/lib/combat/mechanic.ts`), executed by the reducer over the append-only encounter log
  (ADR-0001, ADR-0002). The reducer is pure: no clock, no randomness, no locale, no I/O.

The two meet at the projection, not inside the engine: `src/lib/combat-projection.ts` reads the
sheet's already-aggregated action rows (`resolveActions(doc, "combat")`) and emits an `Entity`
plus the executable mechanics it carries into the log, with **numbers fixed at projection time**
(`bonus: 7`, not an expression over stats). The consequence is stated rather than hidden: an
ability override made _inside_ an encounter does not move a projected attack bonus; the DM
overrides the outcome, and a `table:sync` refreshes the whole projection when the build changes.

Adding a mechanic is adding data. Adding a new _kind_ of mechanic is a change to the closed
unions in `src/lib/combat/mechanic.ts` and their mirror in `src/lib/combat/codec.ts`, plus a
handler the compiler demands (`assertNever`).

## 2. The authoring format

```ts
interface Mechanic {
  schema: 1;
  id: MechanicId; // "srd:spell:hunters-mark" | "monster:goblin:scimitar" | "homebrew:<uid>:<slug>"
  source: "srd" | "pack" | "homebrew" | "monster";
  label?: LabelId;
  active?: Program[];
}
interface Program {
  id: string; // unique within the mechanic
  trigger: Trigger;
  cost?: Cost[];
  targets?: TargetSpec;
  inputs?: Input[];
  steps: Step[]; // ordered; each gated by an optional `when`
}
```

`MECHANIC_SCHEMA_VERSIONS = [1]`. The single entry point is `conformMechanic(value)`
(`src/lib/combat/mechanic.ts`): the codec's structural schema first, then the semantic rules the
schema cannot express, each failure carrying a rule id and a JSON path — never a bare `null`.
`buildCatalogue` (`src/lib/combat/catalogue.ts`) conforms every value once at load and returns the
failures as `CatalogueError`s, so a mechanic can never be counted as working by omission.

**Triggers** (`Trigger`). `{ kind: "invocation", economy: "action" | "bonus" | "reaction" |
"free" | "none" }`, or `{ kind: "event", event: EventSelector, scope: "self" | "controlled" |
"others" | "any", window: boolean }` — `window: true` means the event needs a decision or a die
from the reacting player.

**`EventSelector`** — the closed set the code accepts: `turn-start`, `turn-end`, `round-start`;
`attack-declared` (`target: "self" | "any"`); `damage-taken` (`of: "self" | "controlled"`);
`hp-zero` (`of: "self" | "controlled" | { markedBy: "self" } | "any"`); `entity-left-reach`
(`of: "self"`); `concentration-ended` (`source: "self"`); `rest-completed`
(`rest: "short" | "long"`).

**Costs** (`Cost`). `{ kind: "slot", level, upcast? }`, `{ kind: "resource", id, amount }`,
`{ kind: "turn", claim: "action" | "bonus" | "reaction" | "attack" | "free" }`,
`{ kind: "concentration" }`. A costed program cannot commit unpaid: payment is computed in
`src/lib/combat/intent.ts` before a step runs and reported in the receipt's `paid`.

**Targets** (`TargetSpec`). `count: number | "area"`, an `eligibility: Predicate` over the
candidate and the declared relations, and — for `count: "area"` — an `AreaShapeSpec` of
`sphere`, `cylinder`, `cube`, `cone` or `line`, authored against `position` inputs. The reducer
binds the origin (and the aim, for a cone or a line) from the caster's answers and derives the
affected entities itself (`areaShapeFrom` in `src/lib/combat/answers.ts`, `areaMembership` in
`src/lib/combat/position.ts`).

**Inputs** (`Input`). `d20` (`for: "attack" | "save" | "check" | "concentration"`, optional
`ability`, optional `perTarget`), `dice` (a formula in the seam's grammar), `choice`, `table`,
`position`. A `d20` or `dice` input is answered by the **id of a `roll` action already in the
log** (`answers[input.id] = { roll: ActionId }`, ADR-0010); the reducer reads the total from
`state.rolls`. A per-target answer is keyed `${input}:${target}`.

**Predicates and expressions.** `Predicate` covers `outcome`, `answer … equals`, `relation …
between`, `condition … on … present`, `is`, `hp … op … value | "half-max"`, and `all`/`any`/`not`.
`Expr` is a number, `{ byLevel }`, `{ ability }`, `{ stat: "spellSaveDc" | "spellAttack" |
"proficiency" }` or `{ sum }`. Both are evaluated in `src/lib/combat/predicates.ts`, pure and
locale-free.

**Provenance.** `Mechanic.source` records where a definition came from; a projected character's
entity carries `origin: { kind: "character", uid, characterId, buildRevision }`
(`src/lib/combat/types.ts`), an `Effect` carries its `source: { entity, mechanic, action,
castLevel }`, and a homebrew copy carries `Provenance` (source entry, version, sender, offer,
grant — `src/lib/library/model.ts`). Nothing is anonymous.

**`core:*` versus projected ids.** The only _static_ catalogue in the running app is
`CORE_MECHANICS` — `core:move`, `core:dash`, `core:dodge`, `core:disengage`, `core:help`,
`core:hide` (`src/data/combat/core-catalogue.ts`), built once in
`src/features/play/table/use-table.ts`. Every other executable mechanic is **carried into the log**
by the `table:add-entity` / `join` / `sync` op that seats its owner, and
`mechanicOf` reads `FoldedState.mechanics` before the static catalogue
(`src/lib/combat/catalogue.ts`). That is what makes the fold identical on a client that never
loaded the bestiary, or that runs the SRD-only build while the DM runs a pack monster.
`src/data/combat/prototype-catalogue.ts` is test-only data, not shipped content.

**Semantic rules, and what a mistake looks like** (`checkProgram`, `src/lib/combat/mechanic.ts`):

| Rule id                                               | The mistake it names                                            |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| `invalid-mechanic-shape`                              | unknown key, wrong enum, missing field (the structural parse)   |
| `invalid-id`                                          | an empty mechanic id                                            |
| `cost-claim-matches-trigger`                          | a reaction cost on a trigger that is not a reaction or a window |
| `area-required-by-count` / `area-requires-area-count` | `count: "area"` without a shape, or a shape without it          |
| `area-input-declared`                                 | an area naming an origin or aim the program never asks for      |
| `input-referenced-by-when`                            | a `when` referencing an input the program never declares        |
| `roll-input-declared`                                 | an `attack` or `save` whose `roll` is not a declared input      |
| `move-input-declared`                                 | a `move` whose destination is not a declared input              |
| `once-per-turn-needs-key`                             | a `turn-claim` with an empty key                                |
| `targets-required-by-step`                            | a step writing to `$target` in a program with no `targets`      |

A step kind the reducer does not handle is a **compile** error, not a runtime one.

## 3. The vocabulary the reducer executes today

Steps, with the file that implements each. Handlers live in `runSteps`
(`src/lib/combat/intent.ts`) unless noted.

| Step           | Status                     | Implemented in                                                                    |
| -------------- | -------------------------- | --------------------------------------------------------------------------------- |
| `attack`       | executed                   | `intent.ts` (d20 answer → outcome, then the damage parts)                         |
| `save`         | executed                   | `intent.ts` (`onSuccess: "half" \| "negate"`)                                     |
| `damage`       | executed                   | `intent.ts` → `src/lib/combat/damage.ts`                                          |
| `heal`         | executed                   | `intent.ts` (`amount` is an `Expr` — a flat heal only, see §9)                    |
| `effect-start` | executed                   | `intent.ts` → `src/lib/combat/effects.ts` (standing facts and marks)              |
| `condition`    | executed                   | `intent.ts`, lifetime settled by `effects.ts`                                     |
| `move-mark`    | executed                   | `intent.ts`                                                                       |
| `turn-claim`   | executed                   | `intent.ts` (`TurnLedger.claims`, once-per-turn keys)                             |
| `move`         | executed                   | `intent.ts` → `src/lib/combat/position.ts`, `reposition.ts`, `map.ts`             |
| `dash`         | executed                   | `intent.ts` (`TurnLedger.movementExtra`)                                          |
| `manual-table` | **no-op by design**        | `intent.ts` — spends the economy, writes a log line, table adjudicates            |
| `negate`       | **declared, not executed** | `intent.ts` accepts it and does nothing (`case "negate": return { stop: false }`) |

Costs (`payFor`, `intent.ts`): `turn` claims (`action`, `bonus`, `reaction`, `attack`, `free`
against `TurnLedger`), `slot` (standard and pact pools, upcast), `resource` (named pools with a
`recharge` of `short`/`long`/`dawn`/`dusk`/`turn`/`round`/`never`), `concentration`. An
unaffordable cost rejects with `unaffordable` before any step runs.

Reactions: `subscribersFor` (`src/lib/combat/windows.ts`) opens a `ReactionWindow` only when an
entity both subscribes to the event through a `window: true` program **and** still has its
reaction. Today `matches` recognises `attack-declared`, `entity-left-reach` and `hp-zero`; the
other `EventSelector` members are accepted by the format and by conformance but open no window.
`applyIntent` holds the declared action open and `applyResolve` settles it.

Effects and lifetimes. The runtime `Lifetime` (`types.ts`) has seven kinds — `manual`,
`turn-edge`, `rounds`, `seconds`, `rest`, `day-phase`, `source-end` — of which an author may
write five: `LifetimeSpec` (`mechanic.ts`) omits `day-phase` and `source-end`, which the reducer
creates itself. Ending an effect (`src/lib/combat/effects.ts`) ends its
dependents — source-end lifetimes, marks, the temporary HP it granted — and, when it was the
caster's concentration effect, everything that concentration held.

Conditions: the fifteen SRD conditions of `ConditionId` (`types.ts`), imposed by the `condition`
step, cleared by lifetime or `override`.

Temporary HP: **stored and spent, but not granted by a step.** `Entity.vitals.tempHp` exists,
`src/lib/combat/damage.ts` absorbs damage against it before hit points, `effects.ts` clears it
when its source effect ends, and `override.ts` lets the DM set it directly at
`vitals.tempHp`. There is a `temp-hp` `EffectPayload` but no `temp-hp` step, so the 2024
keep-or-replace choice is not automated.

Areas: derived, not declared — `AreaShapeSpec` → `areaShapeFrom` (`answers.ts`) →
`areaMembership` (`position.ts`), over a 5 ft Chebyshev grid (`FEET_PER_CELL`, `cellDistance`).
An area program runs once per derived target and not at all on empty ground — which is legal and
still costs the action.

Damage order (`src/lib/combat/damage.ts`): flat adjustment → immunity → resistance (halve, round
down) → vulnerability (double) → temporary HP → hit points → 0-HP consequences (dying for PCs,
dead otherwise, massive damage kills).

## 4. Rolls

Every roll is a `roll` action in the log (ADR-0010, golden rule 32), carrying
`{ formula, faces, total, seed, source, hidden, roller, purpose, label }`
(`RollRecord`, `src/lib/combat/dice.ts`) plus the envelope every action has.

- **One seam.** `src/lib/dice.ts` is the only module in the app that draws randomness for a die;
  `tests/unit/dice-randomness.guard.test.ts` pins every other random source in `src/` as an id or
  a non-dice seed, and `src/lib/combat` is free of randomness entirely.
- **Grammar.** `NdS` with `S ∈ {2, 3, 4, 6, 8, 10, 12, 20, 100}`, `khN`/`klN`, signed integers;
  at most 100 dice and a flat term bounded at 1,000; a formula with no dice is not a roll
  (`no-dice`). The Foundry/Roll20 subset the table needs.
- **App rolls are verifiable.** An `app` roll draws one 32-bit seed (`cryptoSeed`) and derives its
  faces with the pinned pure generator `facesFromSeed`; every client re-derives them in the fold
  and rejects a mismatch with `invalid-roll`.
- **Manual entry.** A `manual` roll carries the faces the person read off physical dice and
  `seed: null` — the same action, the same log line, the same provenance.
- **Purposes.** `attack`, `damage`, `save`, `check`, `initiative`, `death-save`, `concentration`,
  `free`.
- **Hidden DM rolls.** `hidden: true` is concealed **by the presenter only**:
  `rollLine` (`src/lib/views/roll-view.ts`) shows the faces to the DM and to the person who
  rolled, and the summary line to everyone else. A player's own roll is never hidden from them
  (constitution §2.2). There is no blind roll.
- **Spent once.** `state.spent` maps a roll to the action that consumed it, and `rollsUsable`
  (`src/lib/combat/resolve.ts`) rejects a second use with `roll-consumed` and a roll used by the
  wrong entity with `roll-roller-mismatch`. One natural 20 never yields two verdicts.
- **Rolls are never spent to learn a rejection.** `planIntent`
  (`src/features/play/table/dispatch.ts`) runs the reducer's own `preflightIntent` before any die
  is rolled, so a refused tile is refused for exactly the reason the fold would record.

## 5. Automation levels and the DM's last word

ADR-0011 defines three campaign levels. In code:

| Level                 | In the reducer today                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `full-auto`           | `commitAt` (`src/lib/combat/intent.ts`) lands the applied state. The default (`initialState()`, `fold.ts`).     |
| `log-only`            | `commitAt` lands the bookkeeping state only: the verdict runs, the receipt reports it, nothing is applied.      |
| `propose-and-confirm` | **Not built.** `applyTable` rejects it at `src/lib/combat/table.ts:365` — "not built until stage 6 (ADR-0011)". |

The type system says the same: `Automation` has three members, but
`FoldedState.settings.automation` is `Exclude<Automation, "propose-and-confirm">`
(`src/lib/combat/types.ts`). **This is the one place where an accepted ADR describes more than the
code does**, and it is deliberate — ADR-0011 assigns the third level to a later stage.

The level never changes the verdict, only whether the receipt is applied. The map policy follows
the same rule: on a `log-only` table `dropPlan` (`src/lib/combat/map.ts`) withholds `move` and
offers `place` instead.

**The DM's last word is the same mechanism at every level.** `override`
(`src/lib/combat/override.ts`) corrects a persisted fact — HP, temporary HP, life state,
conditions, position — with a mandatory `reason` and the author's uid recorded on the entity.
`undo` reverses an action and everything that depended on it (§8). Both exist whatever the level.

The **manual-resolution contract** is program-owned:
[`program/PROGRAM.md`](program/PROGRAM.md) requires, for each of the eight bounded outcomes of
P14a/b/c, "the contextual manual counterpart on the same facts, costs, receipt and undo" — a
manual path is not an escape from the model, it applies the same declared costs and consequences
and produces the same receipt. P15 owns the player-facing digital/physical dice choice and the
hidden-roll presenter.

## 6. Homebrew as first-class input

The engine has one vocabulary. SRD data, the private content pack and in-app homebrew all write
against the format of §2 and all reach the reducer through `buildCatalogue`; nothing gives
public content a path homebrew lacks (ADR-0006). The licensing split is legal, not mechanical
([`ARCHITECTURE.md`](ARCHITECTURE.md) §10).

**The eleven families** (`LIBRARY_FAMILIES`, `src/lib/library/model.ts`) and who delivered their
authoring:

| Families                                  | Block  | Authoring lives in                                                            |
| ----------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `weapon`, `equipment`, `spell`, `feature` | P05    | `src/lib/homebrew/model.ts`, `conformance.ts`; `src/features/library/*`       |
| `monster`, `campaign-rule`                | P06    | `src/lib/homebrew/advanced.ts`, `preparation.ts`, `preparation-repository.ts` |
| `species`, `feat`, `background`           | P07    | `src/lib/homebrew/origins.ts`, `origin-build.ts`, `choice-pools.ts`           |
| `class`, `subclass`                       | P08a–c | `src/lib/homebrew/classes.ts`, `class-build.ts`, `class-composition.ts`       |

All four blocks are closed on `v2` ([`PROGRAM_STATUS.md`](PROGRAM_STATUS.md)). What they deliver
is **vocabulary, schema, conformance, versions, sharing, import/export and print** — never engine
execution: an editor contains no engine, and charges and preparation stay instance-owned
(`src/lib/homebrew/instances.ts`) instead of being copied into the template. Execution of what
they author is P14a/b/c.

The owner contract in [`../PRODUCT.md`](../PRODUCT.md) is that custom content must be automatable
on the same terms as printed content, and that everything is editable in combat. The format keeps
both promises structurally: a homebrew `Mechanic` is the same object a monster stat block compiles
to (`src/lib/combat/monster-adapter.ts`), and `override` reaches every persisted fact. What a
homebrew author cannot express is exactly what nobody can express — the closed unions of §2 — and
the conformer says so with a path and a rule id rather than half-building it.

## 7. The E01–E22 families

The exception catalogue's twenty-two families are assigned to P14a/b/c in eight bounded outcomes
by [`program/PROGRAM.md`](program/PROGRAM.md) § "E01–E22 assigned to P14a/b/c", which owns that
assignment; the group names below are its rows. **P14 has not started** — the frontier is PD, and
P11a is next ([`PROGRAM_STATUS.md`](PROGRAM_STATUS.md)) — so no family is delivered. What exists
today is the stage-3 engine primitives each family will compose.

| Families      | Group (PROGRAM.md)          | Status today | Primitives in place / where the work lands                                                                                                                                                           |
| ------------- | --------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E08, E12, E17 | priority regressions        | pending      | `negate` is accepted but a no-op (`intent.ts`); temp HP has no granting step (§3). P14a red tests, then P14b.                                                                                        |
| E01–E04       | composed economy            | partial      | Turn claims, slot/pact pools, `attack` claims and once-per-turn keys execute (`intent.ts`); composition is P14.                                                                                      |
| E05–E07       | resources and clocks        | partial      | `Resource.recharge`, `table:rest` (it bumps `restOrdinal` and ends rest-scoped effects) and the `Lifetime` kinds execute (`table.ts`, `effects.ts`); `dayPhaseOrdinal` exists but no op advances it. |
| E09, E10, E13 | ready, roll, concentration  | partial      | Concentration costs, `PendingCheck` and `applyCheck` execute (`intent.ts`); **ready** has no step. Roll lineage is ADR-0010.                                                                         |
| E11, E21, E22 | damage and vital state      | partial      | Damage order, resistances, 0 HP, dying/stable/dead and death saves execute (`damage.ts`); exhaustion is a number, not a rule.                                                                        |
| E14–E16       | areas, control and monsters | partial      | Five area shapes, marks, auras-as-relations and the monster adapter execute; summon, transform and bonds do not.                                                                                     |
| E18, E19      | derived values and homebrew | partial      | The whole `Grant` pipeline and the eleven-family authoring of §6; execution of what they author is P14b.                                                                                             |
| E20           | cross-cutting verification  | pending      | Golden replays exist (`tests/unit/combat/replays/`); the three-mode, apply-once closing suite is P14b/c.                                                                                             |

"Partial" means the reducer executes some primitive the family needs, not that the family is
delivered. A family is delivered only with the ordinary, boundary, composition and manual cases
PROGRAM.md requires.

## 8. Undo and correction

- **Undo is causal and lives in the fold.** `resolve` deliberately rejects an `undo` with
  `unknown-action` (`src/lib/combat/resolve.ts`); `undoneIds` (`src/lib/combat/fold.ts`) collects
  every live undo and the fold skips its target. Anything that depended on that target — an intent
  answering a window it opened, an intent answering a roll it undid — is **recorded as rejected**,
  not silently dropped, so every client computes the same rejections. An undo may itself be undone.
- **Costs come back with the action.** Undo is a replay, not a compensating write: the state is
  recomputed without the action, so the slot, the resource, the claim and the reaction return by
  construction, and a re-run cannot double-spend.
- **Rolls.** Undoing a roll makes the dependent intent re-validate as `missing-answer`. `spent`
  is rebuilt by the same replay.
- **Correction.** `override` (`src/lib/combat/override.ts`) is the DM's direct edit of a persisted
  fact, with a `reason` and the author recorded. A direct HP override to 0 runs the same tail a
  0-HP-crossing hit runs (`settleZeroHp`), so concentration ends the same way whichever path got
  there.
- **Checkpoints bound how far back undo reaches.** `src/lib/combat/checkpoint.ts` compacts past
  `COMPACT_ACTIONS = 200` or `COMPACT_BYTES = 512 KiB`, never inside the newest
  `CHECKPOINT_GRACE_MS = 5 min`. Compaction folds the head together with **every** undo in the
  log, so an undo already appended is honoured; an undo appended after the cut targets an action
  the log no longer holds and is a no-op, and redo across a checkpoint is impossible for the same
  reason. The grace window is the knob that decides how long a table keeps the right to change
  its mind.
- **`spent` survives compaction.** `pruneRolls` drops a settled roll's record but keeps its
  `spent` entry, and `rollsUsable` reads `spent` first — so a verdict outlives the record that
  produced it.

## 9. What is not automated, and why

Every item is a deliberate boundary, each visible in `coverageFor`
(`src/lib/combat/coverage.ts`), which classifies each step as `automated`, `physical-input`,
`window`, `table` or `unsupported`. A program whose every step is `manual-table` is reported as
`table`, never as automated.

- **`propose-and-confirm`** — declared in ADR-0011, refused by `table.ts:365` (§5).
- **`negate`** — accepted by the format and by conformance, executed as a no-op
  (`intent.ts`). Counterspell and Shield's miss therefore do not automate.
- **Granting temporary HP** — no `temp-hp` step, so the 2024 keep-or-replace choice is manual
  (§3).
- **Advantage, disadvantage, stealth** — not in the vocabulary. `core:dodge`, `core:disengage`,
  `core:help` and `core:hide` are therefore `manual-table` programs: they spend the action, write
  a log line, and the table decides the rest (`src/data/combat/core-catalogue.ts` says so in its
  own header). Half-building them would be worse than saying so.
- **Ready, summon, transform, aura-as-object, effect-end-by-selector, resource deltas as steps** —
  absent from the `Step` union. The authoring spec lists them as later tiers; the exact codec
  rejects them today, so a document using one quarantines rather than half-running.
- **Character rows the vocabulary cannot express** become `manual-table` programs that still
  spend their economy and land in the log — never a half-built program. `src/lib/combat-projection.ts`
  enumerates the classes in its header: a damage amount the grammar cannot roll (`3×(1d4+1)`, a
  flat 2024 Unarmed Strike), several damage instances or simultaneous types, a use-time damage-type
  choice, an area whose printed shape is not one of the five, a **rolled** heal (`heal.amount` is
  an `Expr`, which has no dice — a flat heal does automate), and a row that promises more than the
  program would deliver.
- **Conditional on-hit riders** (Sneak Attack, Divine Smite, a Psi Warrior die) are the player's
  election at the table, not something the program produces: the base attack and its typed weapon
  damage automate, the rider stays declared.
- **Monster entries beyond structured actions** — `src/lib/combat/monster-adapter.ts` automates a
  structured `attack`, and a `save` **only when it carries damage**. An effect-only save (a
  paralysing gaze), prose-only entries, Multiattack, spellcasting, `onSuccess: "special"`, traits,
  reactions, legendary actions and recharge costs all become `manual-table` or are out of scope.
  Automating a roll that then applies nothing would spend the action and deliver nothing.
- **Firestore rules never adjudicate rules** (ADR-0005): a malicious member can append a
  well-formed action; the fold attributes it, anyone can undo it, the DM removes the member. That
  is the accepted threat model, not a gap in automation.

Distinguish four different claims before writing "supported" anywhere: the **target**, **schema
acceptance**, an **implemented handler**, and a **verified scenario**. Only the last is coverage.
