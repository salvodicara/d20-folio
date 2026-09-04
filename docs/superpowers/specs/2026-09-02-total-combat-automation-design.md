# Total combat automation — target architecture

**Date:** 2026-09-02 · **Status:** reconciled to `PRODUCT.md` §Steering on 2026-09-03 (owner
approved the core direction in chat on 2026-09-02; the steering of 2026-09-03 bounds it) ·
**Owner of this fact:** this document owns the engine target for stages 1–4 of the
[stage-1 program plan](../plans/2026-09-03-new-app-stage-1.md) until its sections are folded
into `docs/ARCHITECTURE.md` and `docs/MECHANICS.md` in stage 7. The
[migration program](../plans/2026-09-02-total-combat-automation-migration.md) is history: its
phases P2–P5 are superseded by the stages.

Evidence: [audit](../status/2026-09-02-combat-automation-audit.md) ·
[rules surface](../status/2026-09-02-combat-rules-surface.md) ·
[classification](../status/2026-09-02-combat-rules-classification.md) ·
[authoring cost](../status/2026-09-02-mechanic-authoring-cost.md) · ADRs in
[`docs/adr/`](../../adr/README.md). Authoring contract:
[mechanics authoring spec](2026-09-02-mechanics-authoring-spec.md).

This document is written for a reader who has not seen the conversation that produced it.

## 0. What this replaces, in one paragraph

Today combat runs on three executors (a hand-written React provider, a 28k-line "mechanics world"
kernel that is switched off inside campaign encounters, and a dead command kernel), over a
character-centred state model in which monsters are prose and other creatures do not exist, with
one logical fact mirrored across several Firestore documents owned by different users, guarded by
security rules that re-implement game semantics. The target is one entity-generic reducer over one
**Encounter aggregate**, whose only persisted mutation is an **append-only action log** folded
deterministically by every client, with mechanics authored as data in **one format** shared by the
SRD, the private content pack and homebrew, and with Firestore rules reduced to identity,
membership, ownership and shape. Solo and shared play use the same aggregate; only its host
document differs.

**Bounded on 2026-09-03.** The scope is what the four acceptance stories of `PRODUCT.md`
§Steering need, in the order of the stage-1 program plan: stage 1 the dice seam, stage 2
positions and areas, stage 3 the reducer for Marco's first turn and Sara's ogre ambush, stage 4
the shared encounter document. Everything the earlier "total automation" phases planned beyond
those stories is tiered `later` in §4 and §7 — built when a story or a job in the jobs table
needs it, never early. The DM's last word, the three campaign automation levels and rolls with
provenance are first-class here, not features added after the engine.

## 1. Invariants this design keeps

> **Reconciled 2026-09-03 to the steering (`PRODUCT.md` §Steering, golden rule 29).** Two
> invariants below were reversed by the owner: the app now rolls dice by default (with manual entry
> and hidden DM rolls) and owns an Owlbear-level map with positions, measurement and area
> membership. The log-first, entity-generic, undoable reducer stays the target; the dice seam and
> map-derived facts join its vocabulary (see the steering's stage 1: dice seam, positions and areas
> in the aggregate).

- Dice are a logged action (ADR-0010): a `roll` action carries formula, faces, total, `seed`,
  roller, source (`app | manual`) and `hidden`; an `app` roll is reproducible from its seed and
  every client verifies it in the fold, a `manual` roll carries the faces a person read off real
  dice; a hidden roll shows its faces only to the DM and to the roller. The reducer computes and
  applies everything else from that action; randomness for dice exists only in `src/lib/dice.ts`.
- The DM has the last word (steering): `override` and `undo` are actions available on every
  surface for every applied action; a DM correction is a later action in the same log, never a
  different code path.
- Three campaign automation levels (ADR-0011): `full-auto`, `propose-and-confirm`, `log-only`
  are a table setting the reducer reads when it applies an action's outcome; the DM changes it
  mid-session; the roll and the verdict are the same at every level, only what happens after the
  verdict differs.
- The encounter log is the shared document of play: `campaigns/{id}/encounters/{eid}` is what
  every client folds, what the recap and the chronicle are assembled from, and what the DM
  reviews and corrects.
- Override-first: every derived value auto-computes and every derived value is overridable; an
  override is an action in the log, survives recomputation and is undone like any action.
- Bilingual by construction: the engine is locale-free; every label is an id resolved in
  `src/lib/views`.
- Licensing partition: the public tree carries only SRD 5.2.1; the pack ships new mechanics as
  data alone, and the engine never branches on a content id.
- Live users: every persisted-shape change ships with the snapshot → dry-run → idempotent apply →
  verify protocol as a release gate (owner ruling 2026-09-02; live hotfix on 2026-08-31 must
  never recur).
- Offline-first, zero cost: no gameplay Cloud Functions; fewer listeners than today; Firestore
  free-tier envelope.
- The map is part of the table: the app owns positions, distances, areas and simple fog on an
  Owlbear-level map, derives reach, range bands and area membership from them (provenance
  `derived`), and keeps declared relational facts (`declared`) for cover, most visibility, elevation
  and map-less play. Walls, dynamic vision and lighting are out of scope.

## 2. State model

### 2.1 The aggregate

```ts
interface Encounter {
  schema: 1;
  id: string; // stable; the campaign encounter doc id or "personal"
  epoch: number; // fight identity (start-encounter allocates)
  host:
    | { kind: "personal"; uid: string; characterId: string }
    | { kind: "campaign"; campaignId: string };
  settings: { revealMonsterHp: boolean }; // DM-owned table settings
  clock: Clock;
  entities: Record<EntityId, Entity>;
  relations: Relation[]; // declared tactical facts (D2)
  effects: Record<EffectId, Effect>;
  windows: ReactionWindow[]; // open interrupt windows (§3.4)
  log: Action[]; // THE persisted mutation surface (append-only)
  checkpoint: { through: Seq; state: FoldedState } | null; // compaction (§5.3)
}
```

Everything under `entities`, `relations`, `effects`, `windows`, `clock`, (from stage 5) `map` and
(from stage 6) `mechanics` is the **folded state**: derived by folding `log` from the last
checkpoint. It is persisted only inside `checkpoint` for compaction and boot speed; the log is
the truth.

`FoldedState.mechanics: Readonly<Record<MechanicId, Mechanic>>` (stage 6, initial `{}`,
checkpointed) is the table's own executable vocabulary: the definitions the three seat ops carry
(§3.1, §4). It is what makes the fold identical on a client that never loaded the bestiary and on
one running the public build against a private monster.

`map` (stage 5, `2026-09-04-v2-stage-5-minimum-map-design.md`) is
`{ background: MapBackground | null; fog: { covered: boolean; revealed: MapRect[] } }`: the
background image's Storage path, token URL, size and grid (cell side in image px, origin
offset), and rectangle fog in grid cells with one representation — when `covered`, everything is
hidden except `revealed`. Both are set by `table` ops (`map`, `fog`); positions are
`Entity.position`; a hidden token is `Entity.reveal.token === false`. Nothing ephemeral (the
in-flight ruler, the cursor, a rectangle being drawn) is persisted.

### 2.2 Entities

```ts
type EntityId = string; // PC: the character doc id; others: `${kind}-${ordinal}`

interface Entity {
  id: EntityId;
  kind: "pc" | "monster" | "npc" | "summon" | "companion" | "object" | "table";
  controllerUid: string; // who acts for it (a data fact, not a role)
  controlledBy: EntityId | null; // summoner / companion owner link
  origin:
    | { kind: "character"; uid: string; characterId: string; buildRevision: number }
    | { kind: "monster"; srdId: string } // catalogue reference, never a copy
    | { kind: "custom"; statline: CustomStatline }
    | { kind: "table" }; // an abstract creature the table names
  stats: DerivedStats; // ac, maxHp, speed, saves, skills, senses, size, type, PB,
  // spellSaveDc, attackBonus… — projected at join, refreshed by
  // the owner's client on build change; monsters from the block
  vitals: {
    hp: number;
    tempHp: { amount: number; source: EffectId } | null;
    deathSaves: { successes: number; failures: number };
    life: "alive" | "dying" | "stable" | "dead";
    exhaustion: number;
  };
  resources: Record<ResourceId, { current: number; max: number; recharge: RechargeRule }>;
  concentration: EffectId | null;
  turn: TurnLedger; // action/bonus/reaction/attacks/movement/free claims, reset at turn start
  //   — `movementExtra` (stage 6) is the movement a `dash` step
  //   granted this turn; the budget is speed + extra, and the
  //   fresh ledger zeroes it at turn start
  overrides: Record<OverridePath, { value: unknown; reason: string; by: string }>;
  reveal: { block: boolean; hp: boolean; token: boolean }; // player-facing visibility; token:false = hidden token (stage 5)
}
```

`kind: "table"` is how solo play models "the goblin the rest of the table is tracking": an
abstract entity with declared facts (AC if known, marks, conditions) and table-entered outcomes.
It is a first-class entity, so marks, riders, conditions and relations attach to it exactly as to
a modeled monster; this is what turns the "one character, no enemies" residuals into automation.

Conditions are not stored: they are the projection of `effects` whose payload is a condition,
plus exhaustion. Two sources of the same condition are two effects; the condition ends when the
last effect ends (SRD "Conditions", multiple sources).

### 2.3 Relations (D2)

```ts
type Relation =
  | { kind: "adjacent"; a: EntityId; b: EntityId } // within 5 ft / reach
  | { kind: "range"; a: EntityId; b: EntityId; band: "reach" | "near" | "far" | "out" }
  | { kind: "visible"; a: EntityId; b: EntityId; value: boolean } // a can see b
  | {
      kind: "cover";
      target: EntityId;
      from: EntityId | "all";
      degree: "half" | "three-quarters" | "total";
    }
  | { kind: "engaged"; a: EntityId; b: EntityId }
  | { kind: "aura-member"; effect: EffectId; member: EntityId }
  | { kind: "mark"; effect: EffectId; by: EntityId; on: EntityId };
```

Defaults are derived (visible defaults to true unless a condition or sense says otherwise;
range defaults to "near" for melee declarations); every relation is a declared fact with an
override, set by a `declare` action (§3.1). Everything derivable from relations is derived by the
reducer: cover bonus to AC and DEX saves, unseen attacker advantage, opportunity-attack eligibility
from `engaged` + leaving, aura effects from `aura-member`, marks feeding riders.

### 2.4 Effects and lifetimes

```ts
interface Effect {
  id: EffectId;
  kind:
    | "condition"
    | "standing"
    | "mark"
    | "aura"
    | "bond"
    | "transform"
    | "temp-hp"
    | "resource"
    | "ready";
  source: {
    entity: EntityId;
    mechanic: MechanicId;
    action: ActionId;
    castLevel?: number;
    program?: string;
  };
  target: EntityId | "encounter";
  payload: EffectPayload; // condition id | Grant[] | statline swap | readied intent…
  lifetime: Lifetime;
  concentration: boolean; // ends when the source's concentration ends
  endsOn: EventSelector[]; // e.g. "target-hp-zero", "source-incapacitated"
}

type Lifetime =
  | { kind: "manual" }
  | { kind: "turn-edge"; entity: EntityId; edge: "start" | "end"; round: number } // "until the start of X's next turn"
  | { kind: "rounds"; remaining: number } // 1 minute = 10 rounds
  | { kind: "seconds"; remaining: number } // outside encounters; 6 s per round inside
  | { kind: "rest"; rest: "short" | "long"; minimumOrdinal: number } // survives the boundary that created it
  | { kind: "day-phase"; phase: "dawn" | "dusk"; minimumOrdinal: number }
  | { kind: "until-event"; event: EventSelector }
  | { kind: "source-end"; effect: EffectId };
```

Temporary HP: one slot per entity; a new grant replaces only if larger (SRD); the source is
recorded so "expires with the spell" ends exactly that slot.

### 2.5 Durable versus transient

| Fact                                                                                       | Durable home                                                                                              | Transient                                   |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Character build, custom content, sharing                                                   | `users/{uid}/characters/{id}` (owner-only writes)                                                         | —                                           |
| A PC's live combat facts (hp, resources, conditions, concentration, effects, item charges) | `…/combat/state` as the personal `Encounter` (one entity: the PC, plus `table` entities the player names) | while leased to a campaign encounter (§5.2) |
| A campaign encounter                                                                       | `campaigns/{id}/encounters/{eid}`                                                                         | folded state in memory                      |
| Turn economy, reaction windows, initiative                                                 | inside the encounter's folded state                                                                       | reset by the clock                          |
| Overrides                                                                                  | actions in the log                                                                                        | —                                           |
| Undo                                                                                       | actions in the log                                                                                        | —                                           |

## 3. Execution model

### 3.1 Actions

```ts
type Action =
  | {
      kind: "intent";
      id;
      seq;
      by: uid;
      entity: EntityId;
      mechanic: MechanicId;
      program: string;
      choices: Choices;
      targets: EntityId[];
      answers: Answers;
      payment: PaymentChoice[];
      window?: WindowId;
      basedOn: Seq;
    }
  | { kind: "declare"; id; seq; by; relation: Relation | { remove: Relation } }
  | { kind: "override"; id; seq; by; entity; path: OverridePath; value; reason }
  | { kind: "resolve"; id; seq; by; window: WindowId } // close a reaction window
  | { kind: "undo"; id; seq; by; of: ActionId; reason?: string }
  | {
      kind: "table";
      id;
      seq;
      by;
      op:
        | "start"
        | "begin-turns"
        | "end-turn"
        | "end"
        | "join" // the lease (§5.2) — built in stage 4; carries `mechanics` from stage 6
        | "leave" // the lease (§5.2) — built in stage 4
        | "sync" // the lease (§5.2) — built in stage 4: write the entity back; carries `mechanics`
        | "add-entity" // carries `mechanics` from stage 6
        | "remove-entity"
        | "rest"
        | "day-phase" // later
        | "set-initiative"
        | "reorder" // later
        | "settings"
        | "map" // stage 5: the background reference (`MapBackground | null`)
        | "fog"; // stage 5: `{ kind: "cover", covered } | { kind: "reveal" | "hide", rect }`
      payload;
    }
  | {
      kind: "roll"; // stage 1 — ADR-0010
      id;
      seq;
      by;
      roll: {
        formula: string; // Foundry-grammar subset: "2d20kh1+5"
        faces: number[];
        total: number;
        seed: number | null; // uint32 for `app`, null for `manual`
        source: "app" | "manual";
        hidden: boolean;
        roller: EntityId | null;
        purpose:
          | "attack"
          | "damage"
          | "save"
          | "check"
          | "initiative"
          | "death-save"
          | "concentration"
          | "free";
        label: LabelId | null;
      };
    };

type Seq = { ms: number; counter: number; by: uid }; // hybrid logical clock; total order (ms, counter, by)
type Answer = number | string | boolean | number[] | { roll: ActionId }; // a `d20`/`dice` input is answered by a roll's id
```

**Seating an entity carries its mechanics (stage 6).** `add-entity`, `join` and `sync` each take
`mechanics: readonly Mechanic[]` — required, `[]` for an entity with nothing of its own, so there
is no optional field to forget. The fold conforms each definition and rejects the WHOLE op with
`invalid-table-op` if any is malformed; `add-entity` and `join` merge them into
`FoldedState.mechanics`, `sync` replaces the entity's set, and `remove-entity` / `leave` / `sync`
drop an id no other seated entity still lists (two ogres share one definition, so the drop is
conditional on the roster, never unconditional). §4 says why the definitions travel in the log
rather than being resolved from local data.

A roll is appended before the intent that consumes it; the fold rejects a roll whose faces do
not reproduce from its seed (`invalid-roll`), records every accepted roll in `state.rolls`, and
an intent whose roll was undone re-validates as `missing-answer`. This is what lets a hidden DM
roll, a physical die entered by hand and an in-app roll feed the same reducer, and what lets a
golden replay feed recorded faces.

The client never writes state. It appends actions. `seq` is a hybrid logical clock so that
actions from different clients, arriving in any order, fold in one deterministic total order.

`OverridePath` is open (`string`); the paths the reducer patches DIRECTLY rather than layering at
read time are `vitals.hp`, `vitals.life` (stage 4), and — from stage 5 — `position` (`{x, y}` or
`null`: a placement that recomputes `adjacent`/`range`, opens no opportunity-attack window and
spends no movement, which is how a `log-only` table moves tokens) and `reveal.token` /
`reveal.block` / `reveal.hp` (booleans). Every other path is recorded and read by the derived-stat
computation (`stats.ac`, `stats.speed`, …).

There is no `checkpoint` **action** (decision 9 of stage 4). A checkpoint is the document field
`Encounter.checkpoint` the fold already consumes; a log-level marker would carry the same
`through` twice, and the two could disagree.

### 3.2 The reducer

```ts
resolve(state: FoldedState, action: Action, catalogue: Catalogue):
  | { kind: "applied"; state: FoldedState; transitions: Transition[]; receipt: Receipt; events: Event[] }
  | { kind: "needs-input"; requests: InputRequest[] }      // only at the client before appending
  | { kind: "rejected"; reason: Rejection }               // typed; recorded in the fold
```

Properties, each enforced by a test class in §8:

- **Pure and total.** No clock, no RNG, no I/O, no locale. Every union is closed and every
  switch ends in `assertNever`, so a new step kind is a compile error until the reducer handles it.
- **Outcome-first.** A program's steps run only after every answer they need is present; each
  step carries a `when` predicate over answers and outcomes (`hit`, `crit`, `miss`, `save-fail`,
  `save-success`, …). Nothing caster-side (concentration, standing, log line, resource) is a
  standalone write: it is a step with the same `when` as the effect it serves. A save spell whose
  every target succeeds therefore yields an applied action whose transitions are only the payment,
  and a receipt marked `outcome: "negated"`.
- **Payment is part of the action.** `Mechanic.cost[]` plus `intent.payment[]` compile into
  `Transition[]` before any effect; an unaffordable or ambiguous payment is a `rejected`. A guard
  test folds the composed catalogue and asserts that every applied intent of a costed program
  carries a `paid` receipt. There is no second seam that could commit without paying.
- **Atomic per action.** One append is one causal action: multi-target area effects produce one
  action with N per-target sub-results and one undo.
- **Re-validated in the fold.** `basedOn` is advisory. The fold recomputes every action against
  the state it actually lands on; an action that is illegal there is recorded as rejected, and
  every client agrees.

**Outcome application by automation level (ADR-0011).** The table setting
`automation: "full-auto" | "propose-and-confirm" | "log-only"` is read when an applied
action's transitions would change state. `full-auto` applies them (stage 3). `log-only` records
the receipt — who did what, the verdict, what would have changed — and applies nothing; the DM
applies by hand through `override` (stage 3). `propose-and-confirm` holds the action as
`proposed` with its computed transitions until a `confirm` action by the DM (or by the actor,
when the campaign allows) applies them; a `reject` leaves the receipt in the log (stage 6, with
the surface that shows the proposal). At every level the roll, the verdict and the receipt are
identical; the level only decides whether the reducer or a person moves the state.

### 3.3 The fold

```
fold(checkpoint, log) = log.filter(not undone).sort(by seq).reduce(resolve)
```

Undo is an action referencing another; the fold skips undone actions and their dependents
(actions that answered a window opened by the undone action). Redo is a new intent. Because the
log is the truth, undo crosses devices and sessions by construction, and "whose ⌘Z" has a plain
answer: anyone may append an undo; the receipt records who.

### 3.4 Events, triggers and reaction windows

The reducer emits typed events per applied action: `turn-start(entity)`, `turn-end(entity)`,
`attack-declared`, `attack-resolved`, `save-resolved`, `damage-taken`, `hp-zero`, `effect-ended`,
`concentration-ended`, `entity-left-reach`, `rest-completed`, `day-phase`, `round-start`.
Programs with `trigger.kind = "event"` subscribe by data. Two delivery modes:

- **Automatic**: no input needed (Regeneration at turn start, exhaustion tick, effect expiry,
  Legendary uses reset, Bloodied). The reducer applies them inside the same action.
- **Windowed**: the subscriber needs a decision or a die (Shield, Counterspell, opportunity
  attack, a readied action, Legendary Action after another creature's turn, Uncanny Dodge). The
  reducer opens a `ReactionWindow { id; event; eligible: EntityId[]; opensAt: Seq }` and leaves the
  triggering action in state `declared`. Eligible controllers append intents with `window: id`;
  the actor (or any client, under trust) appends `resolve`. Resolution recomputes the declared
  action with the window's effects applied (Shield's +5 AC changes hit to miss; Counterspell
  negates the cast before payment of the countered spell's effects while its slot stays spent).
  A window with no eligible entity never opens, so the common case stays one tap.

Recharge is an input request at the monster's turn start (`d6` per spent recharge action);
Legendary Actions are a per-round resource restored at the monster's turn start and spendable in
the window opened by every other creature's `turn-end`.

### 3.5 Boundaries

`table` actions drive the clock: `begin-turns` freezes initiative (ties as a declared order),
`end-turn` emits `turn-end`, advances, emits `turn-start` and `round-start`, expires `turn-edge`
and `rounds` lifetimes exactly; `rest` allocates the next rest ordinal and ends `rest` lifetimes
whose `minimumOrdinal` is met, then applies recoveries; `day-phase` likewise; `end` releases every
lease. Outside an encounter the personal aggregate advances `seconds` lifetimes only through
explicit `rest`, `day-phase` and a declared `advance-time`.

## 4. Mechanics as data

**Vocabulary tiers (2026-09-03).** The authoring spec's §6 names, per trigger, cost, input,
step and lifetime kind, whether it is **stage 3** (what Marco's first turn and Sara's ogre
ambush need: `invocation` triggers, `turn`/`slot`/`resource` costs, `d20`/`dice`/`choice`/
`declare` inputs, `attack`/`save`/`damage`/`effect-start`/`condition`/`move` steps,
`turn-edge`/`rounds`/`manual`/`source-end` lifetimes, the opportunity-attack window, monster
multiattack through the adapter) or **later** (event triggers beyond `entity-left-reach`,
`recharge`/`legendary` costs, `summon`/`transform`/`aura`/`ready`/`move-mark` steps,
`rest`/`day-phase`/`seconds` lifetimes). A `later` kind conforms as `unsupported` with a path,
loudly, until its stage; it is never half-built.

The contract is the [authoring spec](2026-09-02-mechanics-authoring-spec.md). In one breath: a
`Mechanic` has `passive: Grant[]` (the existing 127 kinds, unchanged) and `active: Program[]`; a
`Program` has one trigger, typed costs, target selectors over entities and relations, inputs (dice,
choices, declared facts), and a list of steps each gated by a `when` predicate; effects created by
steps carry their lifetime. Monster stat blocks compile to `Mechanic[]` by a pure adapter from the
already-structured `MonsterEntry` data (`attack`/`save` variants), so Multiattack is a program
with N `attack` steps, Recharge is `cost: [{kind:"recharge"}]`, Legendary Actions are
`trigger: {kind:"event", event:"turn-end", scope:"others"}` with `cost: [{kind:"resource", id:"legendary"}]`.

Content ids never reach the engine: a mark is `{ kind: "mark", by: source }`, a rider references
`vs: { mark: "self" }`, an aura references `members-of: "self"`. The `"marked" | "cursed" | "vowed"`
union is deleted with the legacy grants that carry it.

**Mechanics ride the log (stage 6).** A catalogue resolved from each client's local data cannot
make the fold identical, in three ways: a private mechanic is `unknown-mechanic` on the public
build while the DM runs the monster that owns it; a lazily loaded bestiary makes the fold depend
on load order; and a PC's numbers come from a build document only its owner and co-members may
read. So the three seat ops carry the entity's definitions as data (§3.1), the fold keeps them in
`FoldedState.mechanics`, and `programOf(state, catalogue, …)` looks in the state FIRST and in the
static catalogue second. Ids are instance-scoped (`pc:<characterId>:<actionId>`,
`monster:<entityId>:<actionId>`) so two PCs' longswords never collide. The precedence shadows
completely — a carried definition with no programmes hides a static one that has them — which is
why no projection may emit an id in the `core:` namespace.

**The static catalogue shrinks to `core:*`** (`src/data/combat/core-catalogue.ts`): the ordinary
actions every creature has. `core:move`; `core:dash`, whose `dash` step adds the entity's speed
to `TurnLedger.movementExtra` so the movement budget and the ruler's "needs a Dash" tone follow
the rules; and `core:dodge`, `core:disengage`, `core:help`, `core:hide` as `manual-table`
programmes that claim the action and log it — advantage, disadvantage and stealth are not in the
stage-3 vocabulary, so they are adjudicated, never half-built.

**One structural vocabulary.** `conformMechanic` runs the codec's own `mechanicSchema` FIRST
(exported as `parseMechanicValue`) and only then its semantic rules. The hand-rolled structural
pass it used to carry was a second, weaker vocabulary: a definition the codec would quarantine
could pass fold-time conformance, and the two could drift. What the codec quarantines, the
fold-time check now rejects, pinned by a test that asserts exactly that on six malformed shapes.
The price is that a structural rejection reports no JSON path (`invalid-mechanic-shape`); the
semantic rules keep theirs. `conformMechanic` returns the schema's canonicalized, deep-frozen
clone, so `FoldedState.mechanics` holds exactly what the codec writes back.

## 5. Persistence, topology and authorization

### 5.1 Documents and owners

| Path                                                               | Owner / writers                                                                                                                   | Readers                           | Content                                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `users/{uid}`                                                      | self (create, telemetry); admin                                                                                                   | self, admin                       | status, role                                                                                               |
| `users/{uid}/characters/{id}`                                      | owner; admin                                                                                                                      | owner, admin, campaign co-members | build, custom content (every custom item has an `instanceId`), sharing, `lease` marker (§5.2)              |
| `…/public/sheet`                                                   | owner (same batch)                                                                                                                | anonymous when exact              | projection (unchanged)                                                                                     |
| `…/combat/state`                                                   | owner; admin                                                                                                                      | owner, admin, campaign co-members | the personal `Encounter` (schema 1)                                                                        |
| `…/library/index`                                                  | owner; admin                                                                                                                      | owner, admin                      | homebrew library; entries carry ids                                                                        |
| `diagnostics/{id}`                                                 | self (create only); admin                                                                                                         | admin                             | bounded error reports (§9)                                                                                 |
| `campaigns/{id}`                                                   | DM/admin (settings, membership, `dmUid` transfer, `joinsLocked`); member self-join; member own `memberDetails` presentation entry | members, admin                    | identity, settings, treasury, `members[]`, `memberDetails[uid]` = `{ displayName, photoURL, characterId }` |
| `campaigns/{id}/encounters/{eid}`                                  | **any member** (append to `log`, `arrayUnion` only); DM/admin (checkpoint, settings, delete)                                      | members, admin                    | the shared `Encounter`                                                                                     |
| `campaigns/{id}/dmNotes/*`, `notes/*`, `chronicle/*`, `sessions/*` | as today, enumerated explicitly                                                                                                   |                                   | no `{subcol}` wildcard                                                                                     |
| `bug_reports/{id}`, `admin_audit/{id}`                             | unchanged                                                                                                                         |                                   |                                                                                                            |
| Storage `campaigns/{id}/maps/{mapId}.jpeg`                         | DM/admin (create, update, delete)                                                                                                 | members, admin (read + list)      | the map background (stage 5): compressed JPEG ≤ 8 MiB; the encounter log carries its reference             |

Deleted: `memberDetails[uid].character` (snapshot cache), `memberDetails[uid].role`, the embedded
`encounter`, `encounterInit`, `encounterSkipped`, `memberEffects`, `effectOps`, `world`,
`playStateVersion`, `session.world`, `ref.charges`, item-id session trackers, `snapshots` shape
laxity (they get a shape), the peer-write paths into another user's subtree.

The DM's at-a-glance party stats come from live reads of members' character docs and `combat/state`
(one listener per member, as today's `usePartyCombatStates`), never from a cache; during an
encounter they come from the encounter itself (one listener replaces N).

### 5.2 The lease (solo and shared with one schema)

A PC joins a campaign encounter by a `table:join` action appended by its owner's client carrying
the entity projected from its personal aggregate (stats, vitals, resources, effects, concentration).
The owner's client also sets `lease: { campaignId, encounterId, epoch }` on its own character
doc — named `lease`, not `attached`, because the parent already carries `attachedCampaignId` (the
one-campaign claim the rules read for co-member access) and a sibling called `attached` would read
as the same fact. While leased: the campaign encounter owns the PC's combat facts; the personal
aggregate is read-only for those facts and the UI shows the encounter's. On `table:leave`,
`table:end`, or when the owner's client observes the encounter ended, the owner's client folds the
encounter, writes the entity back into its personal aggregate as a `table:sync` action, and clears
`lease`. An offline owner simply syncs later; nobody else ever writes the owner's documents. A DM acting on
an offline PC appends to the encounter log; the PC's owner folds it on reconnect (§7 hard cases).

**Stage 6 interlude — the personal document is not an `Encounter` yet.** While the old character
sheet lives (stage-6 design D1), `users/{uid}/characters/{id}/combat/state` stays a `CombatState`
carrying the character's whole play session, so `leaveTable` writes the fight's outcome BACK into
that document instead of storing an `Encounter` there: `personal` is `{ kind: "document"; data }`
with a branded payload only `encodeLegacyWriteBack` can mint (HP, temp HP, conditions and death
saves projected from the entity over a FRESH parse of the live document, everything else
preserved). Writing the personal `Encounter` is not merely unused in this stage but
**unrepresentable**: the `encounter` variant is deleted until item 8, because
`personalEncounterRef` aliases the live `CombatState` and one mistaken argument would leave a real
character's document unreadable to `parseCombatState` forever, with no repair path. The shape, the
brand and this paragraph die together at item 8, when the personal `Encounter`, its migration and
the rebuilt sheet land together.

The personal write-back is `table:sync`'s only intended use, but the fold accepts a `table:sync`
in ANY host — `FoldedState` carries no `host`, so the reducer cannot tell a campaign encounter
from a personal one — and it is an unconditional whole-entity upsert. That is deliberate under the
forged-action threat model of §5.4: a member who can append at all can already append anything the
rules do not shape, and the fence is the roster, not the action kind. It is also why the op cannot
be narrowed later without a signature change.

### 5.3 Write mechanics and cost

**Built in stage 4** as `src/lib/combat-io.ts` (the adapter) and `src/lib/combat/checkpoint.ts`
(the pure compaction), exactly as follows.

- Appending an action: `updateDoc(encounterRef, { log: arrayUnion(action) })`. Commutative,
  offline-queueable, latency-compensated; concurrent appends compose server-side. One write per
  action, one listener per client.
- Subscribing: one `onSnapshot` per client, with `includeMetadataChanges: true` — required, not
  decorative. A local append raises a snapshot with `hasPendingWrites: true` and then, once the
  server acknowledges it, an otherwise identical one with `false`; without the flag the appender
  never sees its own write settle. The cost is that the appending client receives the same
  encounter twice with only `pending` flipped, so a consumer treats `pending` as presentation
  state and skips re-folding when nothing else changed. A document that does not parse is
  surfaced as `quarantined` (§5.5), never thrown and never silently overwritten.
- Choosing the checkpoint: `checkpointThrough` picks the newest action at least `graceMs`
  (`CHECKPOINT_GRACE_MS`, 5 minutes) older than the newest action in the log, and returns `null`
  when nothing qualifies. The grace window is what keeps an offline client's queued appends —
  which carry older `seq`s — from being swallowed by a checkpoint that landed while it was away.
  An append older than the checkpoint is still skipped by the fold; the window makes that rare,
  not impossible. Accepted limit.
- Compacting: when `log.length > 200` or the document exceeds 512 KiB (`shouldCompact`), `compact`
  folds the head of the log into `checkpoint: { through, state }` and keeps only the tail. The head
  is folded together with **every** `undo` in the log, the tail's included, so an undo that sits
  after the boundary and targets an action before it is honoured rather than reverted. The residue
  is that redo across a checkpoint is impossible — an undo-of-undo appended after compaction cannot
  restore a target the checkpoint already skipped. Accepted; the grace window is the knob. From
  stage 6, `compact` also prunes the checkpoint's `rolls`: a roll RECORD (the fat part, ≈ 15
  nodes) is dropped when its spender is not an intent still held open in `declared`. The `spent`
  ledger is NEVER pruned — it is ADR-0010's "one roll, one verdict", so forgetting it would let an
  offline client's re-sent intent be accepted after the checkpoint and rejected before it, the two
  clients diverging on one log. `rollsUsable` therefore consults `spent` before it looks for the
  record. The residue is that `spent` grows monotonically for the encounter's lifetime, about one
  node per settled roll.
- Writing the compaction: `checkpointEncounter` is a Firestore transaction whose precondition is
  the **stored** `checkpoint.through` (`null` when there is none), so two clients cannot compact
  the same head twice. It merges every stored action after the new checkpoint that the caller did
  not fold (matched by id), and merges unknown top-level keys with the stored value winning, so
  neither an interleaved append nor a newer build's key is erased by the rewrite. Fights above the
  1 MiB document budget are a measured non-goal (a 300-action fight is ≈ 100 KB). The codec's
  binding ceiling is not its 2,048-entry collection limit but `exact-schema`'s 50,000-node budget
  counted over the log AND the checkpoint together, so `firestore.rules` caps the stored log at
  1,000 entries — a document past the node budget quarantines on every client, and
  `checkpointEncounter` refuses to rewrite a quarantined document, so compaction (the only
  repair) is exactly what would stop working.
- Personal aggregate: the same shape, single writer; the debounced writer is replaced by the
  append (each action is one small `updateDoc`); the parent build write keeps its debounce but
  gains a `revision` precondition and per-domain reconciliation (Codex's reconciler, reused).
- Listener budget: campaign hub 1 (campaign) + 1 (encounter) + N (members' live docs when the DM
  opens the party board); cockpit 2 (parent, combat/state) + 1 (encounter when attached). Fewer
  than today.

### 5.4 Authorization model

Actors: **owner** (of a user subtree), **member** (uid in `campaigns/{id}.members`), **DM**
(`dmUid`), **admin** (`users/{uid}.role`), **anonymous reader** (share links). "Controller" is a
data fact inside the encounter, not a role. Spectator = member without an attached character.

**Admin-supreme** (owner decision, ratified in stage 4): the admin has DM-level rights on **every**
encounter document — create, append, checkpoint, settings, delete — whether or not they are a
member of that campaign, and owner-level rights on **every** user path (`users/{uid}`,
`characters/{id}`, `combat/state`, `snapshots/*`, `library/*`). The one exclusion is
`characters/{id}/public/sheet`: it is an anonymous projection whose exactness invariant is atomic
with the owner's parent write, so a published character's build change and its deletion still
require the owner. Membership is **not** implicit: for the party board and the hub the owner's
account is added as a member of his group's campaign — the smaller of the two options and the way
he already plays. Setting the owner's `users/{uid}.role` to `admin` is a console action, not code.

Principle: rules enforce identity, membership, ownership and shape; the reducer enforces game
legality; the table enforces manners (attributed log + undo). Threat model, stated plainly: a
malicious campaign member can append any well-formed action to an encounter they are a member of,
including actions for entities they do not control. The fold applies it (trust), the receipt
names them, anyone can undo it, the DM can remove them. A malicious member cannot touch another
user's documents at all. A leaked invite link admits a stranger until `joinsLocked`; the DM removes
them and their actions are undoable. This is the owner's ruling (2026-09-02) and it is what makes
the rules small.

**Done in stage 4.** `firestore.rules` is now `isAuth`, `isNotBlocked`, `isAdmin`, `isMember`,
`isDm`, owner checks per user path, the public projection exactness (shape), campaign create/join/
membership/`dmUid` transfer shape, encounter access, diagnostics create-only and explicit
subcollection matches — 548 lines, comments included, down from 984. Every predicate that read a
game field is **gone**: `coreConditions`, `validPeerEffectState`, `validMember*`,
`validCombatEffectOpsChange`, `turnFieldsOnlyChanged`, `combatEffectFieldsOnlyChanged`,
`encounterInit*`, `isAttachedPeer`, `peer*`, `playStateVersion*`. The campaign model's fields are
enumerated, so the retired fields of §5.1 are un-writable by anyone without a migration.

A member's encounter `update` is **append-only by prefix**, not merely "the log grew": the stored
log must be a byte-identical prefix of the written one, so existing entries are frozen and only
the tail may grow. The one carve-out is an **empty** stored log — the state a freshly created
encounter is in, and the state a compacted one can be in — because a Firestore rules slice
`log[0:0]` errors instead of yielding an empty list; an empty stored log is trivially a prefix of
anything, so the guard weakens the fence by nothing. Threat-model note, stated plainly: an empty
stored log has nothing to protect, and any member may append to it in any case.

The character paths are owner/admin/co-member access plus the `revision` compare-and-set, an
EMPTY parent `state`, and the exact public sheet — nothing else; `combat/{stateId}` is the literal
`combat/state`, whose create is owner/admin only. `playStateVersion*`, `hasV1CombatOwnerAfter`,
`peerLegacyCoreCreate`, the unmarked-legacy escape hatch, the encounter/peer semantic predicates
and `isCampaignDmDetach` are all gone as of stage 4. Two membership paths were rewritten in the
same motion because they are not play: `removeMember` and `deleteCampaign` no longer write another
user's character documents (the roster alone is written; the leaving owner's client clears its own
claim), and `attachMemberCharacter` treats a claim on a campaign it can no longer **read** — a
`permission-denied`, never any error — as stale. The old campaign play surfaces are therefore
rule-denied on `v2`; the client code that writes those fields dies at stage 6 with the surfaces
that host it.

**Storage (stage 5).** `storage.rules` gains one block, `campaigns/{campaignId}/maps/{fileName}`,
built on the same cross-service `firestore.get` the admin rule already uses: the campaign's `dmUid`
or the admin may create, update and delete (image content type, ≤ 8 MiB); any campaign member or the
admin may read — which covers `list`, the per-campaign quota's source of truth. The 100 MiB
per-campaign quota is enforced by the adapter (`src/lib/map-io.ts`) from Storage's own metadata,
a client-side courtesy stated as such: rules cannot sum a prefix, and the £1 kill-switch is the
backstop. Display uses the token URL stored in the `map` action, so a member's `<img>` never
evaluates a rule.

### 5.5 Codec totality

One `exact-schema` per persisted document, versioned by `schema`. Reading: closed-world parse;
unknown top-level keys are preserved in `unknown: Record<string, unknown>` and written back
verbatim; a parse failure quarantines the document with a typed reason and a diagnostics report,
never a silent drop. Writing: `stripUndefined` only. Round-trip totality is a property test
(§8). Every item, feature, spell and entity carries an `instanceId` or stable id; nothing is
keyed by name.

## 6. Override model, undo, error containment

- **Override**: `override` action on `entity.overrides[path]` with reason and author; derived
  stats compute base → passive grants → effects → overrides, so an override survives every
  recomputation until undone or cleared. Table facts (relations) are declared, not overridden.
- **Undo**: any action; the fold skips it and its dependents; the receipt records who and why.
- **Fail-closed boundaries**: `parseEncounter` at every read (Firestore, checkpoint, IndexedDB);
  `conformMechanic` at catalogue load with path + reason; `resolve` rejects with a typed reason;
  a rejected action is visible in the log view and in diagnostics. No fallback path, no bridge,
  no "session wins".
- **Detectability**: every rejection, quarantine and denied write is a diagnostics event (§9).

## 7. Hard-case walkthroughs (§6 of the brief)

**Tiers (2026-09-03).** The walkthroughs stay as the design record; only these are built in
stage 3, because stories 1 and 2 need them: 3 (the opportunity-attack window only; Shield and
Counterspell are later), 5 (area effects — Fireball on three goblins), 6 (concentration), 7
(Multiattack only; Recharge and Legendary later), 9 (conditions with sources), 11 (damage
ordering), 12 (`hp-zero` and dying; death saves later), 15 (cover and range as map-derived
facts, stage 2), 16 (initiative, joining, leaving), 21 (two clients, DM override, undo). Cases
1, 2, 4, 8, 10, 13, 14, 17, 18, 19, 20 and 22 are `later`: scheduled by the story or job that
first needs them, never built ahead of it.

1. **Hunter's Mark / Hex** ★ — cast: one `intent` (bonus action, slot with upcast tier, target
   by `visible`+`range`), steps: `effect-start` `{kind:"mark", target, lifetime: minutes by cast
level, concentration:true, grants:[damage-rider vs mark:self]}`. Every weapon attack the caster
   makes resolves its riders by scanning effects with `mark.by = self` and `on = target`: the +1d6
   is a per-hit `dice` input the reducer requests (physical die). Moving the mark: a second program
   `trigger: event hp-zero of {markedBy: self}` opens a bonus-action window at the caster's next
   turn; `move-mark` step. Short rest: `lifetime.rest` is not used; the mark's `minutes` lifetime
   keeps counting through a rest via `advance-time`, so a 1-hour mark ends and an 8-hour one
   survives, from data alone.
2. **Sneak Attack** ★ — passive `once-per-turn` rider with predicate `advantage || (ally
adjacent to target && !disadvantage)` over relations (`adjacent(ally,target)`), `finesse or
ranged` over the weapon, and a `turn-claim` step keyed `sneak-attack` on the **rogue's** ledger
   for the **current turn of the encounter**, not the rogue's turn. An opportunity attack on
   another creature's turn is an intent in a window; the claim key includes the round and the
   turn owner, so the rogue may sneak once on their turn and once on the opportunity attack in the
   same round (SRD: once per turn).
3. **Opportunity attacks, Shield, Counterspell** ★ — `entity-left-reach` (from a `declare`
   removing `engaged`/`adjacent`, or from a move step) opens a window for every entity with a
   reaction available and an opportunity-attack program (a core mechanic every creature has;
   Disengage sets a `standing` that filters it). Shield: `trigger: event attack-declared on self`,
   `cost: reaction + slot`, step `effect-start standing ac +5 until turn-edge start self`; on
   `resolve` the attack recomputes against the new AC. Counterspell: `event cast-declared within
range 60 & visible`, `cost: reaction + slot`, `save` input (CON) then `negate` step; the countered
   cast resolves as negated: its slot is spent, no effect, receipt `negated`.
4. **Readied actions** — `ready` effect holding an intent and a declared trigger; the trigger
   event opens a window for that entity only; the released intent spends the reaction; readied
   spells hold concentration from the ready.
5. **Area effects** ★ — one intent with N targets (declared area membership); per target: save
   input, per-target outcome, damage step with `half-on-success`, then per-target damage
   application in the SRD order (type → resistance/immunity/vulnerability → flat reduction →
   temp HP → HP); one action, N sub-results, one undo.
6. **Concentration** ★ — `damage-taken` on a concentrating entity emits an automatic input
   request `d20` with DC `max(10, floor(damage/2))` (cap 30); failure ends the concentration
   effect; `hp-zero`/`incapacitated` end it automatically; casting another concentration program
   ends the previous one first inside the same action (explicit `replace` in the receipt). Ending
   emits `concentration-ended`; every effect with `concentration:true` and the same source ends in
   the same action; every `source-end` dependent ends recursively; summons with `bond` to the
   effect are dismissed. All in one action, one undo.
7. **Multiattack, Recharge, Legendary** — §3.4 and §4.
8. **Summons** ★ — `summon` step creates entities `controlledBy: caster`, `controllerUid` = caster's
   controller, own initiative (SRD 2024 summons act right after the summoner unless the block
   says otherwise, as a declared order), statline from the catalogue by cast level; a `bond`
   effect ties them to the concentration effect; `concentration-ended` or the summoner's death
   dismisses them (`entity-end`), removing their relations and effects.
9. **Conditions with sources** — two effects, one projected condition; ending one leaves the
   other; exhaustion is a level on vitals with the 2024 −2×level / −5 ft×level derivations.
10. **Temp HP** — single slot, max wins, source recorded, distinct expiry from the source effect.
11. **Damage ordering** — one `applyDamage(entity, packets[])` in the reducer, per component
    type; chosen types are answers; order as SRD (adjustments → resistance → vulnerability).
12. **Death** — `hp-zero` sets `dying`; death saves are `d20` inputs at turn start; 20 → 1 HP; 1 →
    two failures; damage while dying adds failures (crit two); healing from 0 resets; massive
    damage = instant death from the damage step; stabilise via Medicine input or spare the dying.
13. **Contested actions** — 2024 grapple/shove: target save vs `8 + STR + PB`; escape is a
    check input vs the same DC; one intent, one answer each, one outcome.
14. **Auras** — `aura` effect with `aura-member` relations declared by the table (who is within);
    membership changes are `declare` actions; the reducer recomputes aura grants per member on
    every fold.
15. **Cover, range, engagement, visibility** — relations with defaults and overrides (§2.3). RA-31
    is re-adjudicated: today's resolver already asks cover per attack (`CombatResolver.tsx:1265-1334`)
    and applies +2/+5 AC; the target keeps that declaration, makes it a retained per-pair relation
    (until re-declared), and consumes it for DEX saves too — not a sheet toggle with an
    unenforceable lifetime.
16. **Surprise, initiative, joining, leaving** — surprise = Initiative disadvantage flag on the
    initiative input; ties resolved by a declared order (`reorder`); `join` inserts at a declared
    position; `leave` removes the entity and its relations, ends effects it sourced unless they
    are independent.
17. **Rage, Wild Shape, Bladesong** — `standing` effects whose payload is `Grant[]` (Rage's
    resistances and damage bonus), `transform` effects swapping the statline while keeping the
    entity id and controller; `endsOn` carries the 2024 end conditions as events
    (`turn-end without attack or damage`, `heavy armor equipped`, `incapacitated`).
18. **Extra Attack, War Magic** — `attackBudget` on the turn ledger from passive grants; an
    `attack` step consumes one attack claim; War Magic's cantrip is a program whose cost is
    `{kind:"turn", claim:"attack"}` instead of an action; the grammar is data, not UI.
19. **Items** — item charges are entity resources keyed by `instanceId`, with `recharge: dawn |
dusk | short | long | never` and consumption steps; attunement is a passive gate.
20. **Rests** — `rest` actions allocate ordinals; `lifetime.rest.minimumOrdinal` decides survival
    (§2.4); a short rest between encounters is the same action on the personal aggregate.
21. **Two clients, one offline, DM override, cross-device undo** ★ — all four are appends. The
    offline client's appends carry earlier `seq`s; on reconnect they merge; every client re-folds
    and reaches the same state; an action that is now illegal is `rejected` identically
    everywhere and surfaces in the log view. A DM override arriving after a player's commit is a
    later `seq` and wins by fold order; the player's action is still in the log. An undo from
    another device is an append.
22. **Homebrew and pack mechanics** — the same `Mechanic` format, loaded from the library doc or
    the pack, conformed at load; zero engine change.

Added §7 cases: DM condition on an offline player → append; player's local changes → their own
appends; both fold. DM HP override mid-commit → two appends, fold order decides, both visible.
Player leaves / DM transfers mid-encounter → `leave` action; `dmUid` change is a campaign-doc
write; the encounter's `controllerUid`s stay data. Same-second writes from a stale snapshot →
`seq` order plus re-validation. Character detached while its effects are active → `leave` ends
effects it sourced (data-declared exceptions stay). Leaked link / removed member → membership
rule; their past actions remain attributed and undoable.

## 8. Test strategy (owner: fewer, professional)

| Class                      | What it proves                                                                                              | Where                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Golden replays             | a log folds to an expected state; every hard case is one replay                                             | `tests/unit/combat/replays/*.json` + one runner  |
| Property: fold determinism | any permutation of a concurrent log folds to the same state                                                 | seeded shuffler (no dependency), 1 test          |
| Property: codec totality   | `parse(serialize(x)) ≡ x` for generated documents incl. unknown keys; hostile inputs quarantine, never drop | 1 test per codec                                 |
| Exhaustiveness             | every step/event/lifetime kind has a reducer handler (compile-time `assertNever`) and a coverage row        | type-level + 1 guard                             |
| Payment guard              | every costed program in the composed catalogue produces a `paid` receipt in its replay                      | 1 guard                                          |
| Coverage drift guard       | regenerated coverage JSON equals the committed one                                                          | 1 guard                                          |
| Rules                      | 4 emulator files, 116 cases: owner/member/DM/admin/anonymous per path, the adapter, the two-client gate     | `tests/rules`                                    |
| Accessibility sweep        | axe serious/critical zero on every surface, both themes                                                     | `tests/e2e/a11y*.spec.ts` (two specs, one sweep) |
| Screenshot lane            | the owner's visual gate (rule 25); no pixel assertions in CI                                                | `tests/visual/*` (by hand until stage 6)         |

Representation-pinning tests are deleted with their representations (the stage 6–7 cuts). No
end-to-end journey runs on `v2` (steering, 2026-09-03): the sweep and the screenshot lane are
the only browser suites, and the `v2` gate stays under 15 minutes. Target order of magnitude:
hundreds of tests, not eighteen thousand.

## 9. Diagnostics (professional, zero cost)

Two layers. The **domain log** (§3) is the forensic record of play: replayable, attributed. The
**technical layer** is `src/lib/diagnostics`: a structured logger (`level`, `event`, correlation
ids: session, uid, characterId, campaignId, encounterId, actionId, buildSha), an IndexedDB ring
buffer of the last 500 breadcrumbs, and an automatic report on `error`-level events (fold
rejection, quarantine, denied write, unhandled rejection, console error) written to
`diagnostics/{id}` (≤ 32 KiB, client caps at 50 per user per build + 10 per session, create-only
rule), surfaced in the existing admin inbox. No user report is needed. Sentry remains a possible
sink swap; not adopted (third party, cost, friends' data).

## 10. Coverage, machine-derived

`scripts/coverage` (run by a guard test, no env flag): load the composed catalogue (public + pack
when present) → conform every `Mechanic` → for every program and step derive a status from the
data alone: `automated` (reducer handles it), `physical-input` (dice/answer), `declared-fact`
(relation), `table` (a `manual-table` step), `unsupported` (conformance failure, with path).
Output `docs/automation-coverage.json`; `docs/AUTOMATION_COVERAGE.md` becomes a generated
rendering or is deleted. The guard fails when the committed JSON differs from the regenerated
one. Per-kind exposure is exhaustiveness, not a token search.

## 11. Layering and boundary rules

`src/data` + `src/types` → `src/lib/combat` (pure: no React, Firebase, i18n, Zustand, clock,
RNG — enforced by an import guard) → `src/lib/views` (labels) → `src/stores` (fold + append
adapters) → `src/features`/`src/components`. The Firestore adapters were written in stage 4:
`src/lib/combat-io.ts` (refs, create, append, subscribe, checkpoint, delete, the seq clock) and
`src/lib/combat-lease.ts` (`joinTable`, `leaveTable`, `readLease` — the owner's client's two
motions of §5.2); the compaction itself stays pure in `src/lib/combat/checkpoint.ts` and the codec
in `src/lib/combat/codec.ts`. Those two modules are the only writers of the encounter document and
of the lease. The pack and homebrew supply `Mechanic[]` through the existing `@pack` seam and the
library; nothing else.

## 12. Constitution and document conflicts (proposed wording for ratification)

**Done on 2026-09-03:** `PRODUCT.md` §Steering, constitution §2.2/§2.9 and golden rules 30–32
now carry the ratified wording; `CLAUDE.md`'s direction block routes to the steering and the
stage-1 program plan. The items below are kept as the record of what was proposed.

- `PRODUCT.md`: superseded 2026-09-03 by the steering (the app owns the map and the dice; the DM
  has the last word). No wording from this section applies any more.
- `docs/PRODUCT_CONSTITUTION.md` §2.9, second bullet: keep; add "The DM may run every creature's
  turn in the app; monsters are executable stat blocks, not reference text. What the app cannot
  observe (position, range, cover, who entered an area) is declared once, with a default and an
  override, and everything else follows." Third bullet ("compute live … never a denormalized
  copy") becomes an enforced rule: the campaign document carries no member snapshot.
- `docs/MECHANICS.md` §"Non-automatable residuals": replace the per-target, targeted-buff and
  geometry entries with the residual list of §13; cover (RA-31) moves to "declared relation".
- `docs/AUTOMATION_BACKLOG.md` RA-31: verdict reversed under D2, with the reasoning of §7.15.
- `CLAUDE.md` §"Architecture in one breath": "Mechanics are typed data, never prose parsing: a
  source declares a `Mechanic` (passive `Grant`s and active `Program`s); the pure combat reducer
  folds an append-only action log into an entity-generic `Encounter`; presenters localize; UI
  appends actions and renders the fold. Dependencies point data/types → lib/combat → views →
  stores → features, never backwards. One aggregate owns a fight; the character document owns
  the build and, between fights, the personal aggregate."

## 13. Residuals (structural, never to be rediscovered)

| Residual                                                                                                                        | Structural reason                             | What the app still does                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Every die face (only when the roller chooses real dice)                                                                         | per-person dice mode (steering)               | asks once, validates range, applies everything                                                          |
| Cover, most visibility, elevation (position, distance, area membership and who left reach are map-derived when a map is loaded) | no walls/vision/lighting by steering          | declared relations with defaults and overrides; consequences derived                                    |
| DM rulings (surprise, tie order, Influence, Legendary Resistance spend, THP keep/replace, knock-out, simultaneous ordering)     | the SRD delegates them                        | a typed input with a default                                                                            |
| Lair actions                                                                                                                    | not in SRD 5.2.1; 2024 uses "in Lair" bonuses | `usesInLair` modeled; homebrew may author an initiative-count trigger                                   |
| Narrative clauses (illusions, social effects, out-of-combat utility)                                                            | no mechanical consequence to compute          | `manual-table` step with the text                                                                       |
| Pack/homebrew mechanics that exceed the step vocabulary                                                                         | closed world                                  | conform fails with a path; the vocabulary grows by a versioned schema change, never by a content branch |

## 14. Risk register

| Risk                            | Mitigation                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Fold cost on long fights        | checkpoints every 200 actions; measured budget in the prototype                                                             |
| `arrayUnion` ordering surprises | `seq` total order; property test; never rely on array order                                                                 |
| Trust abused at a table         | attributed log, undo, DM removal; documented threat model                                                                   |
| Migration of live characters    | Phase 1 runs the protocol against the six fixtures and a production snapshot before any deploy; rollback = restore snapshot |
| Authoring vocabulary too small  | the classification record enumerates every SRD clause; the vocabulary is derived from it, and `unsupported` is loud         |
| Bundle budget                   | the reducer replaces ≈40k lines of executors; budgets re-measured per phase                                                 |
| Scope creep beyond the stories  | the tier lists of §4 and §7; a mechanic outside the current tier is `later` and stays unsupported, never half-built         |
