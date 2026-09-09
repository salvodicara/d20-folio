# Stage 6 design — one play surface

Addendum to `2026-09-02-total-combat-automation-design.md` (§2, §3, §4, §5) and to the stage-5
addendum (`2026-09-04-v2-stage-5-minimum-map-design.md`). Scope: item 6 of the stage-1 program
plan — dossier 14 as approved in direction: initiative strip, map, hotbar of the selected entity,
log with undo, DM drawer with hidden/fog/HP editor. The UI contract is
`2026-09-03-ui-redesign-design.md` §5f (rules 28–34), §8f (rules 39–44) and §10a (the Owlbear
ledger). Written 2026-09-04 under the owner's standing mandate for `v2` ("fai quello che devi
fare"); every decision below is argued from evidence and recorded in `docs/PROGRAM_STATUS.md` so
the owner can overturn it from the closing message.

## 1. Evidence (giants' shoulders)

- **Baldur's Gate 3** — the HUD grammar the owner approved from images (dossier 14, `v8-play*`
  renditions outside the repository): portrait with HP pill and level, weapon-set tiles, the
  economy pill, the hotbar of 44 px tiles split by red dividers, the pill tabs, the End turn ring,
  the initiative strip on top, the target block beneath it, the roll panel with the die, the
  formula and a one-word verdict.
- **Owlbear Rodeo 2** — the map's chrome (ledger §10a): a tool rail on the left, view controls
  top-right with the DM's player-view eye, the hidden-token eye, fog as a mode with "fill" and
  shapes, the DM drawer as the one docked panel.
- **Foundry VTT / D&D Beyond** — the log as prose with authors and per-line undo; the DM's HP
  editor as damage / heal / temp / max with a condition picker (component 18).
- **This engine** — everything the surface shows is `FoldedState`; everything it does is an
  `Action` appended to `campaigns/{id}/encounters/{eid}` (stage 4) and folded by every client;
  the map is stage 5's `MapCanvas` (proposal branch `v2-stage5-map-surface`), mounted under the
  HUD unchanged.

## 2. Decisions

### D1 — the personal `combat/state` stays `CombatState` in this stage

Evidence: the live `combat/state` document carries not only the combat trio (HP, temp, conditions,
death saves, initiative, round) but the character's WHOLE play session under `playState`
(spell slots, trackers, item resources, currency, pinned actions, active features, companions,
the engine world — `docs/ARCHITECTURE.md` → "Combat-mutable state lives in a per-character
subdoc"). The old sheet (`CharacterCockpit` and its HP header, rest, spells, inventory) reads and
writes all of it and stays the character screen until item 8 rebuilds the sheet in the
Baldur's Gate 3 grammar (dossier 15). Writing a personal `Encounter` over that document now would (a)
quarantine the sheet on `v2` (`missing-combat-state`), and (b) force the session model of a screen
whose design does not exist yet (UI first, golden rule 25).

Therefore: stage 6 does **not** write `users/{uid}/characters/{id}/combat/state` as an
`Encounter`, and `leaveTable` is never called with `personal: null` (stage 4's contract). The
personal `Encounter` and its migration (snapshot → dry-run → idempotent apply → verify) move to
item 8 with the sheet, where the non-combat session facts get their home. Recorded as a named
fate, not a deferral by omission: `personalEncounterRef` stays what it is (a live alias), and
`leaveTable` gains the write-back described in §5.

### D2 — every executable mechanic rides the encounter log

The fold must be identical on every client, including a member on the public SRD build while the
DM runs a content-pack monster, and including a client that never loaded the lazy bestiary. A
catalogue resolved from local data breaks that in three ways: a pack-only mechanic is
`unknown-mechanic` on the SRD build (the DM's ogre attack applies on the DM's client and is
rejected on a player's), a lazily loaded monster catalogue makes the fold depend on load order,
and a PC's weapon numbers depend on a build document only its owner and co-members may read and
that changes between sessions.

Therefore the three table ops that seat an entity (`add-entity`, `join`, `sync`) carry the
entity's mechanics as data:

```ts
| { op: "add-entity"; entity: Entity; mechanics: readonly Mechanic[] }
| { op: "join";       entity: Entity; mechanics: readonly Mechanic[] }
| { op: "sync";       entity: Entity; mechanics: readonly Mechanic[] }
```

The fold keeps them in `FoldedState.mechanics: Record<MechanicId, Mechanic>` (conformed by
`conformMechanic` at fold time; a malformed definition rejects the op with `invalid-table-op`);
`remove-entity` and `leave` drop the definitions whose ids the departing entity alone lists;
`sync` replaces them. `programOf` looks in `state.mechanics` first and in the static catalogue
second. The static catalogue shrinks to `core:*`, the ordinary actions every creature has,
authored once in `src/data/combat/core-catalogue.ts`: `core:move` (stage 2), `core:dash` (the one
vocabulary addition of this stage — a `dash` step that adds the entity's speed to a new
`TurnLedger.movementExtra`, reset at turn start, so `remainingMovement` and the ruler's "needs a
Dash" tone follow the rules), and `core:dodge`, `core:disengage`, `core:help`, `core:hide` as
`manual-table` programs that claim the action and log it — advantage, disadvantage and stealth
are not modelled by the stage-3 vocabulary, so they are adjudicated, never half-built.

`Entity.origin.monster.srdId` stays "a catalogue reference, never a copy" for what it names — the
stat block the drawer shows and the compendium link — while the executable programs are the
projection's, refreshed by `sync` exactly as `stats` is.

**Measured cost (2026-09-04, tasks 1–2; the estimate this paragraph first carried was ≈ 400 nodes
per PC and is superseded).** A projected PC carries ≈ 1,200 JSON nodes, not ≈ 400: the honest
degrade of D4 emits about 31 `manual-table` programs per sheet, and those — not the seven or
eight automated ones — dominate the count. Six PCs are ≈ 7,250 nodes. The ceiling test
(`codec.test.ts`, "a six-PC party, seated and checkpointed, parses alongside 1,000 intents")
measures **44,032 of the codec's 50,000-node budget**, about 88 %: ≈ 34,000 of it is the 1,000
intents the rules' log cap allows, the party's definitions are counted twice (once in the seat
ops, once in `checkpoint.state.mechanics`), and the rest is the populated checkpoint. It fits,
and compaction fires at 200 actions, so the realistic document is far smaller — but the dominant
term is the log cap, not the mechanics, and the assertion carries the measured number so a fatter
projection fails the test rather than quarantining a live document. Compacting on node count (or
lowering the rules' log cap) is the recorded remedy if either half grows.

Mechanic ids are instance-scoped so two PCs' longswords never collide:
`pc:<characterId>:<actionId>` (the sheet's stable action id: `weapon-<instanceId>`,
`spell-<id>`, …) and `monster:<entityId>:<actionId>`.

### D3 — projections

- **`projectMonster(block, seat)`** (`src/lib/combat/monster-entity.ts`, pure over
  `MonsterStatBlock`): AC, average HP, walking speed, PB from CR, ability modifiers, saves with
  proficiencies and overrides, defenses, `attacksPerAction` 1 (structured Multiattack is `later`),
  `reveal: { block: false, hp: false, token: true }`, `position: null`, mechanics =
  `monsterMechanics(block)` re-keyed per entity plus `core:*`. The DM's "Aggiungi" picks from the
  composed bestiary (the existing encounter picker's data path) and appends `add-entity`.
- **`projectCharacter(doc, seat)`** (`src/lib/combat-projection.ts`, over the character engine —
  outside the kernel so `src/lib/combat` never imports the sheet's engine): stats from the same
  functions the sheet uses (`effectiveAC`, `effectiveMaxHp`, speed, `effectiveProficiencyBonus`,
  ability modifiers, `savingThrowBonus`, `effectiveSpellSaveDc`, `effectiveSpellAttackBonus`,
  `attacksPerAction`, the typed defense sets), vitals from `doc.session` (HP, temp, death saves,
  exhaustion, `life` derived), resources = spell slots and trackers, a character `origin` carrying
  the uid, the character id and the `buildRevision`, `reveal.token: true`, and the mechanics of §D4.
  `reveal.token` has a production default from here on (the stage-5 handoff's open seam).
  **As built (2026-09-04):** the slot resource keys are the reducer's own, `slot-<n>` and
  `pact-<n>` (`intent.ts`, read through `slotUsageKey`), not this section's first sketch
  `slot:<level>` — a Pact Magic pool stays a separate pool from the standard one at the same
  level, and the projection must key what the reducer spends. Two pure helpers moved down out of
  `src/lib/views` so the projection could reuse the sheet's formulas rather than fork them:
  `applySetOverride` / `deriveDefenseKind` to `src/lib/defense-sets.ts`, and
  `mergeSaveProficiencies` to `src/lib/compute.ts` (`src/lib/**` outside `lib/views` may not
  import `lib/views`; the guard's own remedy is to move the shared code down).

### D4 — the PC mechanics adapter, bounded to the stage-3 vocabulary

`src/lib/combat-projection.ts` reads `resolveActions(doc, "combat")` — the sheet's own action
rows, override-first, one source of numbers — and emits one `Mechanic` per row:

| Row                                                                      | Program                                                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| weapon attack (melee or ranged, `attackBonus`, `damage`)                 | `attack` step with the fixed bonus, typed damage; `cost: turn attack`; 1 target         |
| spell attack with damage (Fire Bolt, Guiding Bolt)                       | `attack` step; `slot` cost for levelled spells, always `upcast: true` (see below)       |
| save spell with damage, single target (Toll the Dead)                    | `save` step (`dc`, see below) + `damage`; per-target `d20` input                        |
| save spell with damage and a typed `areaShape` (Fireball, Burning Hands) | `targets: { count: "area", area }` + `save` + `damage`                                  |
| heal spell (`heal` summary)                                              | `heal` step                                                                             |
| anything else the sheet lists as an action                               | `manual-table` with the row's label: it spends the economy and logs, the DM adjudicates |

The area shape is typed data the SRD set does not carry today: `SrdSpellData.areaShape?:
{ kind: "sphere" | "cube" | "cone" | "line" | "cylinder"; sizeFt: number; widthFt?: number }`,
filled for the public SRD area spells that carry damage, pinned by a guard test (every `area:
true` spell with `damageDice` declares `areaShape`). The private pack's area spells receive the
same field in the same motion (rule 28); a pack spell without it degrades to `manual-table`,
loudly in the coverage report, never silently.

Numbers are fixed at projection (`bonus: 7`, not an `Expr` over `stats`): the sheet's engine
already folds fighting styles, magic bonuses and overrides into them, and `sync` refreshes them.
The consequence is stated: a `stats.abilities` override inside the encounter does not move a
projected attack bonus; the DM overrides the outcome instead (rule 41, "modify any automatic
outcome in place"). Coverage (`coverage.ts`) reports the automated / manual split per character.

**As built (2026-09-04), three amendments this section did not anticipate.**

- **The save DC is the ROW's, not always the caster's.** A `save` step carries the row's own
  printed DC as a numeric `Expr` and keeps the symbolic `"spell"` only when that number equals
  the projected `stats.spellSaveDc`. The sketch's unconditional `dc: "spell"` was wrong for two
  reachable sheets: a multiclass caster whose second class prints a lower DC than the primary
  one, and a feat-granted cantrip on a character whose `stats.spellSaveDc` is `null` — where
  `"spell"` would have resolved to 0 and every target would have auto-succeeded.
- **What "anything else" means, named.** A row degrades to `manual-table` when it promises more
  than the stage-3 vocabulary can express, and the classes are enumerated on the module
  (`promisesMore`): a damage amount the kernel's dice grammar cannot roll (a flat amount, a
  multiplied formula); more than one damage instance, more than one simultaneous type, or a
  secondary damage component; an area whose printed shape is not one of the five; a rolled heal
  (a heal amount is an `Expr`, which has no dice); a row that also activates or maintains a keyed
  effect, carries a standing effect, deals damage on a miss, adds a one-roll damage bonus, gates
  its damage behind its own resolution rule, re-applies on a cadence, or does not resolve at
  cast; and a targeting shape richer than one enemy-or-any target (an ally or self affinity,
  several targets, self-exclusion, a creature-type limit, per-upcast growth). Two deliberate
  NON-degrades: a player-elected on-hit rider (a sneak-attack or smite die) is not part of the
  emitted attack, because the vocabulary cannot gate on "once per turn, if the player chooses";
  and a condition the caster ENDS does not block automation (the flat heal applies, the cure is
  the DM's), while a condition the save INFLICTS does.
- **Every projected slot cost is `upcast: true`.** The first sketch set it only for a spell whose
  dice scale, which made the reducer refuse the ordinary case the SRD allows: any spell may be
  cast from a higher slot, and a caster out of 1st-level slots casting a non-scaling 1st-level
  spell with a 2nd is playing correctly, not cheating. A Pact Magic caster, whose pool sits at one
  level only, could otherwise never cast a non-scaling spell at all. Nothing is lost by allowing
  it: a projected programme's numbers are already fixed, so the cast level feeds only provenance
  (the effect's `byLevel` lifetime and the log line), never a damage figure.
- **The tile need not name the slot pool.** `planIntent` chooses `standard` or `pact` from the
  seated entity's own resources when the intent does not say — the pool that holds a slot at, or
  above, the cost's level. The rule has one home and the reducer still judges the payment; the
  alternative was every caller of every hotbar tile knowing which pool a Warlock spends.
- **A versatile weapon is expressed, not degraded.** The row emits a `choice` input
  (`grip:one-handed` / `grip:two-handed`) and a second `attack` step gated on it. One-handed is
  the default — only the two-handed step carries the gate — so a swing with no grip chosen deals
  the printed one-handed damage. The two label ids need chrome i18n keys and a tile choice on the
  surface (task 4); without them the tile silently takes the one-handed default.

### D5 — one live table per campaign

`campaigns/{campaignId}/encounters/live` is the campaign's table. No pointer field on the
campaign document (its fields are enumerated by the rules; a pointer would be a second listener
and a rules change), no encounter list: the DM opens the table once (`createEncounter`), `start`
begins a fight with a new epoch, `end` ends it, compaction keeps the document small. Scenes and
multiple encounters are the "Scene" drawer tab of a later stage and re-open this decision then.

### D6 — the route and who sees what

`/campaigns/:campaignId/play` (lazy, inside the auth guard, outside the app shell's page
chrome: the play screen is full-window). Access is the rules' (members, DM, admin). The role is
data: `dm = uid === campaign.dmUid || profile.role === "admin"`; a member whose
`memberDetails[uid].characterId` is set may seat that character (`join`); a member without one is
a spectator. Solo play (`/characters/:id/play`) waits for D1's cutover at item 8.

### D7 — the automation flow of a hotbar tile

Full-auto and log-only only (`propose-and-confirm` stays deferred, ADR-0011). Tapping a tile:

1. targets — `count: 1`: tap a token (the map's select tool) or the target block's creature;
   `count: "area"`: tap the origin cell, the area preview shows members and count (rule 33);
   `count: 0` (self): none;
2. inputs — the client rolls every `d20` and `dice` input in the person's dice mode: `app` (the
   seam `src/lib/dice.ts`, one `roll` action each, `roller` = the acting entity, or the target for
   a per-target save) or `manual` (the roll panel asks for the faces, one field per die, and
   appends the same `roll` action with `source: "manual"`); the DM's `hidden` rolls carry
   `hidden: true` and players see "?" faces (rule 34);
3. the intent — one `intent` action answering each input with `{ roll }`, `basedOn` the folded
   revision; a `rejected` fold result surfaces as a log line marked _rifiutata_ (the log filter of
   the drawer), never a modal.

Dice mode is per person, kept in `localStorage` (`d20-dice-mode`) until settings land at item 8.
The reaction window (component 10) renders from `state.windows`: the eligible entity's controller
sees the card with Attacca / Lascia andare; Attacca appends the reaction intent with
`window: id`; Lascia andare appends `resolve`.

### D8 — the DM's compaction and bounded rolls

The DM's client (and only a client the rules allow to checkpoint: DM or admin) runs
`shouldCompact` on every settled snapshot and attempts `checkpointEncounter` with
`checkpointThrough(encounter, CHECKPOINT_GRACE_MS, Date.now())`. Two DM-capable clients may race;
the transaction's compare-and-set makes the loser `stale`. The liveness cliff stage 4 recorded
(a compactor whose clock is behind the log's stamps never finds a candidate) stays: any other
DM-capable client resolves it, and the document's growth is bounded by the rules' 1,000-entry cap
long before quarantine. `compact` now prunes `rolls`: at compaction, every roll whose id is
neither still unspent nor spent by an intent held open in `declared` is dropped from the
checkpoint's state (the safe pruning stage 4 named). A property test extends §8's generator with
rolls and asserts the fold is unchanged by the pruning.

**As built (2026-09-04) — what is pruned is the `rolls` RECORD, never the `spent` ledger.**
Dropping both would have made a checkpoint forget that a roll was already consumed, so an offline
client re-sending the same intent with a fresh action id would have been ACCEPTED after the
checkpoint and REJECTED before it — the two clients diverging on the same log. The fat part (a
roll record, ≈ 15 nodes) is dropped; the verdict (`spent[id]`, two ids, ≈ 4 nodes) is kept,
because it is the "one roll, one verdict" ledger of ADR-0010. `rollsUsable` therefore reads
`state.spent[id]` BEFORE looking for the record, so the guard does not depend on which side of a
checkpoint a client folds from. The residue is that `spent` is monotonic for the encounter's
lifetime — about one node per settled roll, against the ~12 % headroom the ceiling test measures;
it is the second reason "compact on node count" is the recorded remedy.

### D9 — the surface, on a proposal branch

`src/features/play/` — `PlayScreen` composes: `SceneHeader` (title, round, whose turn),
`InitiativeStrip`, `TargetBlock`, `ViewControls` (zoom, centre, the DM's player-view eye),
`ToolRail` (select, pan, ruler, add; DM: fog), `Hotbar` (portrait with HP pill and level, weapon
tiles, the economy pill and slot diamonds, tiles by group with the red dividers, the pill tabs,
the dice and reaction medallions, the End turn ring), `RollPanel` (the newest roll: die, formula,
total, verdict, Annulla), `ReactionCard` (component 10), `ProseLog` (the last lines, prose with
party colours and the author), `DmDrawer` (tabs Registro · Nascosti · Nebbia · Regole; Scene and
Note are labelled and empty with one sentence each, never fake controls), the `HpEditor`
(component 18, opened from the drawer's Registro tab for the selected creature) and the
`TokenPill` (initiative, hide, remove; ownership-scoped). `MapCanvas` from stage 5 is the ground,
unchanged except for the props the pill and the tool rail need.

Tokens and strip cells carry portraits (the character's portrait, the monster's tinted initial)
— stage 5's initials give way here. Every icon button and non-obvious control has a tooltip
(rule 40); the four button kinds only (rule 39); explain-on-demand for CR, CA, INIT, the economy
signs and the verdicts (memory: unexplained jargon is a defect).

Localised through a new `play` i18n shard (EN + IT). Log lines are prose from a presenter
(`src/lib/views/encounter-log-view.ts`) over the fold's receipts and actions: label ids and
numbers in, sentences out; the author is the campaign's `memberDetails[uid].displayName`, "DM"
for the DM, "tu" for the viewer, "auto" for the engine's own consequences.

DEV route `/_play` mounts `PlayScreen` on the folded ambush fixture (stage 5's `/_map` grows into
it; `/_map` is deleted) for the screenshot gate and the screenshot lane. The proposal branch
`v2-stage6-play-surface` starts from `origin/v2-stage5-map-surface` rebased on `v2`, so the owner
gives ONE verdict on the map and its chrome together.

### D10 — staging and the Blaze plan

The owner authorised the Blaze plan on `d20-folio-staging` (2026-09-04). Linking the billing
account, creating the default Storage bucket in `europe-west1`, and a £1 budget alert like
production's are done by the agent through `gcloud` in the staging task; then `firebase deploy
--only firestore,storage -P staging`. Production is never touched.

## 3. Model changes (kernel)

- `TableOp`: `add-entity` / `join` / `sync` gain `mechanics: readonly Mechanic[]` (required —
  an entity without mechanics is `[]`; there is no optional field to forget).
- `FoldedState.mechanics: Readonly<Record<MechanicId, Mechanic>>` (initial `{}`), checkpointed.
- `programOf(catalogue, state, mechanic, program)`: state first, catalogue second.
- `TurnLedger.movementExtra` and the `dash` step (D2); `movementBudget` = speed + extra.
- `compact`: prunes `rolls` (D8).
- Codec: `Mechanic` as a closed-world schema (the authoring spec §1's shape, stage-3 tier);
  unknown step kinds quarantine the document as today's codec would for an unknown action kind.
- `src/data/combat/core-catalogue.ts`: the `core:*` mechanics; `prototype-catalogue.ts` keeps
  the test-only mechanics and imports `core` from there (one definition of `core:move`).

## 4. The client (`src/features/play/table/`)

- `tableStore` (Zustand, one per mounted play screen): `snapshot`, `fold` (memoised on the
  encounter's content, skipping pending-only changes), `dispatch(body)` (stamps `id`/`seq`/`by`,
  `appendAction`), `roll`, `undo`, the DM's compaction (D8), `join`/`leave`.
- `useTable(campaignId)`: subscribes once; exposes the fold, the viewer's role, the seated
  character; tears down on unmount (one listener, golden rule 24).
- `joinTable` (stage 4) with the projected entity and mechanics; `leaveTable` gains the
  write-back of §5.

**As built (2026-09-04) — `src/features/play/table/{table-store,use-table,dispatch}.ts`.** The
interfaces below are what task 4 codes against; each deviation from this section's sketch is
recorded on the function it belongs to.

- **`TableState.connect()` opens the listener and returns its teardown.** The store does NOT
  subscribe when it is created. Subscribing in the constructor made a StrictMode remount
  unrecoverable: React keeps `useMemo` state across the double mount, so the first cleanup left a
  permanently stopped store. `use-table.ts` creates in `useMemo` and connects in `useEffect`, and
  it is the ONE file that binds the singletons (`db`, `Date.now`, the seq clock, the catalogue);
  `table-store.ts` imports Firestore types only. `LIVE_ENCOUNTER_ID = "live"` and
  `liveTableRef(db, campaignId)` address D5's document. A `missing` snapshot clears the fold; a
  `quarantined` or errored one keeps the last fold, because one unreadable snapshot is not proof
  the table changed.
- **The tile's three pure builders.** `planIntent` takes the folded state, the catalogue and the
  tile's arguments, and returns either the inputs the intent still needs or the reducer's own
  rejection. `rollsFor` turns those inputs into rolls or a roll error, through `src/lib/dice.ts`,
  the one randomness seam. `intentBody` takes the state (`basedOn = state.revision`), the
  arguments and the roll ids, and returns the intent action's body. A `PendingInput` carries `target: EntityId | null` beside its key
  and input, so `rollsFor` knows who rolls without re-parsing a composed key. `planIntent` plans a
  `dice` input only when a step that reads it can actually run — no gate, or a gate whose leaves
  are all answer predicates and that holds under the answers so far — so a versatile weapon rolls
  ONE damage die, not one per grip with the unread one still marked spent and still shown in the
  shared log. It also chooses the slot pool (`standard` or `pact`) from the entity's resources
  when the intent does not name one.
- **No roll is spent to learn a rejection, and no client re-implements a reducer rule.** Rather
  than mirroring the reducer's pre-roll checks, three derivations were EXTRACTED from the reducer
  and are now shared by both sides: `preflightIntent(state, action, catalogue)` (the pre-roll
  block `applyIntent` already ran), `riderAnswers(state, entity, target)` (the mark/rider walk
  the attack step already did — one answer per mark, however many riders it carries) and
  `answerKeyFor(program, inputId, target)` with `isPerTargetAnswer` (only a `d20` input declared
  `perTarget` gets a per-target key). Each has one home; the client calls it.
- **`buildLogLines(args)`** takes one args object carrying the catalogue and the campaign's
  `dmUid`, and returns structured `LogLine[]` — it resolves no display name, because the UI owns
  that fact. An undone action renders no line: a `LogLine` has no struck-through state, and the
  `undo` action's own line already records that the table changed its mind.

## 5. The lease write-back while D1 holds

`leaveTable` takes `personal` as ONE shape while D1 holds:

```ts
type PersonalWriteBack = { kind: "document"; data: LegacyCombatStateWrite };
```

The union this section first proposed also carried stage 4's `encounter` variant (an `Encounter`
or `null` written to the personal ref), and it is **deleted, not deprecated** (rule 10, and the owner's
standing "no dead weight"): D1 forbids writing the personal document as an `Encounter` in this
stage, `personalEncounterRef` is an alias of the live `CombatState`, and a variant nothing calls
was one mistaken argument away from writing an `Encounter` over a live character's play session —
after which `parseCombatState` would refuse that document forever. It returns at item 8, with the
sheet, the personal `Encounter` and its migration.

The batch `set`s the personal ref to `data` verbatim. The caller builds `data`
with `projectCombatState(previous: CombatState, entity: Entity)`: the trio (HP current and temp,
conditions from the entity's condition effects, death saves) written over the previous document,
everything else (`playState`, `round`, `recentActions`, …) preserved. The old sheet therefore
shows the fight's outcome as it does today. This variant dies with the sheet at item 8; the
fate is named in `docs/PROGRAM_STATUS.md` and on the type.

**As built (2026-09-04) — `data` is branded, and only one encoder can mint it.** The sketch's
`Record<string, unknown>` would have let a caller hand the lease a hand-rolled payload that
skipped the play-state codec, and the write is a whole-document overwrite, so that payload would
have destroyed `playState`. The type is therefore `LegacyCombatStateWrite` — a branded record
with exactly one cast, inside `src/lib/combat-state-writeback.ts` — and the only way to obtain
one is `encodeLegacyWriteBack(previous, entity, effects)`, which composes `projectCombatState`
with the sanctioned `combatStateWriteData` (moved to that pure home and re-exported from
`combat-state-io.ts`, which cannot be imported here because it binds the app's `db` singleton at
module scope). A hand-built payload is now a compile error. `previous` MUST be a fresh parse of
the live document, for the same reason: the write replaces the document, so anything the caller
did not read is lost. The rules lane proves the round trip end to end — the trio written,
`playState`/`round`/`initiativeRoll` untouched, and the stored document accepted by
`parseCombatState`, the app's own read edge.

## 6. Tests

- Unit (fast): carried mechanics (add/join/sync/remove/leave; malformed rejected; `programOf`
  precedence); `compact`'s roll pruning (property: fold unchanged); `projectMonster` over the
  ogre and a pack-shaped block; `projectCharacter` and the adapter over the six team fixtures
  (every fixture projects; attack bonuses equal the sheet's rows; the coverage split is
  reported, not asserted to a number); the `areaShape` guard; the log presenter (EN/IT lines for
  every receipt kind, hidden rolls masked for players); the store's fold memo and dispatch
  stamping; `projectCombatState`.
- Replays: `marco-first-turn.json` and `sara-ogre-ambush.json` re-expressed with carried
  mechanics (the replay runner seeds `add-entity` with the definitions); a new
  `pc-projection.json` folds Marco's projected mechanics end to end.
- Rules lane: the two-client gate re-run with carried mechanics; `leaveTable`'s `document`
  write-back against a seeded `combat/state`; the DM's compaction from the store on the
  emulator.
- Component (slow, jsdom): `PlayScreen` renders the ambush for the DM and a player (who sees what);
  a tile → target → intent round trip through a fake store; the drawer's undo appends `undo`;
  the HP editor appends `override vitals.hp`.
- Screenshot lane: `tests/visual/play.spec.ts` captures `/_play` across theme × locale × viewport
  × role (DM, player); the artefacts are the owner's gate (rule 25), never pixel-asserted.

**As built (2026-09-04), tasks 1–3.** The first three bullets landed, with these differences; the
component and screenshot lanes belong to task 4 and are not on `v2`.

- Unit: `tests/unit/combat/monster-entity.test.ts`, `tests/unit/combat-projection.test.ts`,
  `tests/unit/spell-area-shape.guard.test.ts`, `tests/unit/table-store.test.ts`,
  `tests/unit/table-dispatch.test.ts`, `tests/unit/combat-state-writeback.test.ts`,
  `tests/unit/encounter-log-view.test.ts`, plus new blocks in `resolve.table.test.ts`,
  `resolve.move.test.ts`, `mechanic.test.ts`, `checkpoint.test.ts`, `codec.test.ts`,
  `codec.property.test.ts` and `coverage.guard.test.ts`. Four of them are fast-lane (no DOM), so
  the whole client half of the stage costs the gate nothing.
- The six team fixtures are projected **pack-side**
  (`content-pack/tests/unit/team-combat-projection.pack.test.ts`, with the twin
  `spell-area-shape.pack.test.ts`), because the fixtures are private; the public suite projects
  the public mock character instead, so the SRD-only composition proves the same code.
- The presenter's test uses the real merged catalogues and a translator that THROWS on a missing
  key or interpolation, and a `covering<U>()` helper makes every union member (rejection reason,
  table op, relation kind, receipt outcome) a compile error until it is listed — so a new union
  member cannot ship without its EN and IT line.
- `pc-projection.json` is **generated from `projectCharacter`**, not hand-copied, and carries a
  `generated` field saying so; the unit suite deep-equals the projection's output against the
  JSON, so the replay cannot drift from the adapter it is supposed to prove.
- The codec property test grew a SECOND, playable generator: the adversarial one rejects almost
  every action it emits, so folding it would prove nothing about compaction. The playable one
  produces tables that apply, compacts each at a random cut, and asserts the fold is unchanged on
  `entities`, `clock`, `effects`, `windows`, `mechanics`, `relations` and `revision`, with two
  counters proving the corpus really exercises both sides of the pruning.

## 7. Out of stage 6

Solo play and the personal `Encounter` (item 8, with the sheet); `propose-and-confirm`; scenes,
drawing, pointer, text, per-item layers (later; rows in ledger §10a); structured Multiattack,
Recharge, Legendary Actions; token footprints (Large = 2 × 2: `Entity` still carries no size —
recorded again); portraits on tokens for monsters beyond the tinted initial; the phone second
screen; the old surfaces' deletion (stage 7); `memberDetails[uid].character` / `.role`.
