# Stage 6 — one play surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** The group plays one combat on staging without Owlbear: the DM opens the campaign's
table, seats monsters, the players seat their characters, everyone sees the same map, strip,
hotbar and log, every action is resolved by the reducer and undoable, the DM hides, fogs and
corrects.

**Architecture:** `docs/superpowers/specs/2026-09-04-v2-stage-6-play-surface-design.md` (the
spec; the plan argues from it). Every executable mechanic rides the encounter log (D2); the
projections build entities from characters and stat blocks (D3, D4); the personal `combat/state`
stays `CombatState` and the lease writes the trio back into it (D1, §5); one live table per
campaign (D5); the surface is dossier 14's chrome over stage 5's `MapCanvas`, on a proposal
branch until the owner's screenshot verdict (D9).

**Tech Stack:** TypeScript (strict), Vitest (fast + slow lanes), `@firebase/rules-unit-testing`
on the emulators, React 19 + Zustand, Playwright (real Chromium) for the screenshot lane. No new
dependencies.

**Spec:** `docs/superpowers/specs/2026-09-04-v2-stage-6-play-surface-design.md`

## Global Constraints

- Small Conventional Commits, owner sole author, no trailer; every commit carries one
  `.changeset/*.md` (empty frontmatter, one sentence) and reconciles the document that owns the changed fact. Never `--no-verify`.
- `main` and production are never touched. Branch `v2`; proposal branch `v2-stage6-play-surface`.
- Bilingual by construction: every string through the `play` i18n shard (EN + IT); never branch
  on display text. Tooltips on every icon button (rule 40).
- Licensing partition: `src/data` stays SRD 5.2.1; the pack twin (`content-pack/`, its own `v2`) moves in the same motion when `SrdSpellData` changes (rule 28).
- No RNG in `src/lib/combat` (the randomness guard); the only seed source is `src/lib/dice.ts`.
- Gate: `just ci`, `pnpm test:rules`, `pnpm build && pnpm test:budget`, `just ci-srd-only`; the pre-push hook on `v2` runs nothing (topic branch) — the plan's gate is the superset. Under
  15 minutes combined (stage 5 closed at ≈ 7 min 50 s).
- One writer per worktree: tasks 2 and 3 run in their own worktrees off `v2` after task 1 lands.

## Decisions taken by this plan

Recorded in `docs/PROGRAM_STATUS.md` by task 5; each is argued in the spec. 1. Mechanics ride the log (`add-entity` / `join` / `sync` carry `mechanics: Mechanic[]`); `FoldedState.mechanics`; the static catalogue is `core:*` only. 2. `combat/state` stays `CombatState`; `leaveTable` gains the `document` write-back; the personal `Encounter` moves to item 8 with the sheet. 3. Fixed numbers at projection (`bonus: 7`), refreshed by `sync`. 4. `SrdSpellData.areaShape` for area spells with damage, SRD and pack, guarded. 5. `campaigns/{id}/encounters/live` is the campaign's table; route `/campaigns/:id/play`. 6. Full-auto and log-only; `propose-and-confirm` stays deferred. 7. The DM's client compacts; `compact` prunes spent rolls. 8. The surface integrates only after the owner's screenshot verdict, together with stage 5's map.

## Task 1 — carried mechanics, the core catalogue, `dash`, bounded rolls (kernel, on `v2`) **Files:** modify `src/lib/combat/types.ts`, `table.ts`, `fold.ts`, `catalogue.ts`, `intent.ts`,

`windows.ts`, `checkpoint.ts`, `codec.ts`, `map.ts`; create `src/data/combat/core-catalogue.ts`;
modify `src/data/combat/prototype-catalogue.ts`, `tests/unit/combat/__helpers__/state.ts`,
`__helpers__/entities.ts`, the five replays and `replays.test.ts`, `codec.property.test.ts`,
`tests/rules/encounter-two-clients.emulator.test.ts`, `tests/unit/map-canvas.test.tsx` is on the
proposal branch (task 4 adapts it).

**Interfaces (produces):**

````ts
// types.ts
| { op: "add-entity"; entity: Entity; mechanics: readonly Mechanic[] }
| { op: "join";       entity: Entity; mechanics: readonly Mechanic[] }
| { op: "sync";       entity: Entity; mechanics: readonly Mechanic[] }
FoldedState.mechanics: Readonly<Record<MechanicId, Mechanic>>   // initial {}
TurnLedger.movementExtra: number                                // initial 0, reset at turn start
Step | { kind: "dash" }                                          // adds stats.speed (override-aware) to movementExtra
// catalogue.ts
programOf(state: FoldedState, catalogue: Catalogue, mechanic: MechanicId, program: string): Program | null
mechanicOf(state: FoldedState, catalogue: Catalogue, id: MechanicId): Mechanic | null
// core-catalogue.ts
export const CORE_MECHANICS: readonly Mechanic[]   // core:move, core:dash, core:dodge, core:disengage, core:help, core:hide
export const CORE_MECHANIC_IDS: readonly MechanicId[]
// checkpoint.ts
compact(encounter, catalogue, through)  // now prunes rolls: keep a roll iff unspent, or spent by an intent still in state.declared
// map.ts
movementBudget(entity) = (stats.speed override-aware) + turn.movementExtra
``` - [ ] TDD `table.ts`: `add-entity`/`join`/`sync` conform each carried mechanic (`conformMechanic`); a non-conforming one rejects the op (`invalid-table-op`, detail names the id and path); definitions land in `state.mechanics`; `sync` replaces the entity's ids (drop ids no longer carried by that entity); `remove-entity`/`leave` drop the departing entity's ids unless another entity lists them. Tests in `resolve.table.test.ts`.
- [ ] `catalogue.ts`: `programOf`/`mechanicOf` read `state.mechanics` first; update the callers (`intent.ts` ×2, `windows.ts` `subscribersFor`, `coverage.ts` keeps the catalogue-only signature). `emptyCatalogue()` stays for tests.
- [ ] TDD the `dash` step (`intent.ts` `runSteps`): `movementExtra += speed`; `startTurn` (`table.ts`) resets it; `movementBudget` in `map.ts` adds it; `planDrop`'s budget test and the `move` step's budget test read `movementBudget`. Tests: `resolve.move.test.ts` (a Dash then a move over the base speed applies; the ruler's `remainingMovement` doubles).
- [ ] `src/data/combat/core-catalogue.ts`: `core:move` (moved from the prototype catalogue), `core:dash` (`invocation` action, `cost: turn action`, steps `[dash]`), `core:dodge`, `core:disengage`, `core:help`, `core:hide` (`invocation` action / `manual-table` with labels `core:dodge` …). `prototype-catalogue.ts` imports `CORE_MECHANICS` and stops defining `move`. `mechanic.ts` conformance accepts `dash`.
- [ ] TDD `compact` roll pruning (`checkpoint.test.ts`): after compaction the checkpoint's `rolls`/`spent` hold only unspent rolls and rolls spent by an id in `state.declared`; the
      fold of the compacted document equals the uncompacted fold (extend
      `codec.property.test.ts`'s generator with `roll` + consuming `intent` pairs and assert `fold(compact(e)) ≡ fold(e)` on `entities`, `clock`, `effects`, `windows`).
- [ ] Codec: `mechanicSchema` (the authoring spec §1 shape at the stage-3 tier plus `dash`;
      closed unions for trigger, cost, input, step, lifetime, predicate, expr), the three ops'
      `mechanics`, `FoldedState.mechanics`, `TurnLedger.movementExtra`; property test round-trips
      generated mechanics.
- [ ] Helpers and replays: `openingActions(by, seq, entities, initiative, order, mechanics?)` carries every mechanic the entities list, looked up in `PROTOTYPE_MECHANICS ∪
  CORE_MECHANICS`; `replays.test.ts` and the emulator gate do the same; the five replay JSONs stay valid (their `entities[].mechanics` ids resolve). `rules` lane green.
- [ ] Guard: `tests/unit/combat/boundary.guard.test.ts` still passes (`core-catalogue.ts` is data, imports only `@/lib/combat/mechanic` types).
- [ ] Commit(s) with changesets; docs reconciled by task 5 (spec §2.1/§3.1/§4, ARCHITECTURE).

## Task 2 — projections and the PC mechanics adapter (worktree off `v2` after task 1) **Files:** create `src/lib/combat/monster-entity.ts`, `src/lib/combat-projection.ts`,
`tests/unit/combat/monster-entity.test.ts`, `tests/unit/combat-projection.test.ts`,
`tests/unit/spell-area-shape.guard.test.ts`; modify `src/data/types.ts` (`SrdSpellData.areaShape`),
the SRD spell files under `src/data/spells/` (55 `area: true` rows: fill `areaShape` for those
with `damageDice`), the pack twin's `content-pack/data/spells.ts` (27 rows, same rule, same
motion, pushed to the pack's `v2`), `src/data/combat/prototype-catalogue.ts` (Fireball's
prototype reads the shape from the data), `tests/unit/combat/replays/pc-projection.json` (new).

**Interfaces (produces):**

```ts
// src/lib/combat/monster-entity.ts (pure; kernel)
export interface MonsterSeat { readonly id: EntityId; readonly label: LabelId; readonly controllerUid: string; readonly ordinal: number }
export function projectMonster(block: MonsterStatBlock, seat: MonsterSeat): { entity: Entity; mechanics: Mechanic[] }
// mechanics = monsterMechanics(block) re-keyed `monster:<seat.id>:<action>` + CORE_MECHANICS ids in entity.mechanics
// src/lib/combat-projection.ts (app lib; may import the character engine)
export interface CharacterSeat { readonly uid: string; readonly characterId: string; readonly buildRevision: number }
export function projectCharacter(doc: CharacterDoc, seat: CharacterSeat): { entity: Entity; mechanics: Mechanic[]; coverage: CoverageRow[] }
// entity.id = seat.characterId; label = `character:${characterId}`; mechanics ids `pc:<characterId>:<actionId>`
// src/data/types.ts
areaShape?: { kind: "sphere" | "cube" | "cone" | "line" | "cylinder"; sizeFt: number; widthFt?: number }
``` - [ ] TDD `projectMonster` over `ogreStatBlock` (prototype) and a goblin: AC, average HP, walk speed, PB from CR (`Math.max(2, 2 + Math.floor((cr - 1) / 4))`), modifiers, saves (proficient = mod + PB, overrides win), defenses, `attacksPerAction: 1`, `reveal.token: true`, `position: null`, `turn` zeroed, mechanics re-keyed and conforming.
- [ ] `areaShape`: add the field; fill the SRD area spells that carry `damageDice` (Fireball
      sphere 20, Burning Hands cone 15, Lightning Bolt line 100 × 5, Thunderwave cube 15, …—
      from the SRD 5.2.1 text of each spell); the guard test asserts every `area: true` + `damageDice` SRD spell declares it. Pack twin: same rule over its 27 rows, committed on the pack's `v2` in the same motion (a pack spell left without it must be listed in the commit message as degrading to `manual-table`).
- [ ] TDD `projectCharacter` over the six team fixtures (`tests/e2e/team-fixture.ts` names the loader; fixtures by role, never by file name in prose): every fixture projects; `stats` equal the sheet's values (`effectiveAC`, `effectiveMaxHp`, PB, spell DC); each weapon row of `resolveActions(doc, "combat")` becomes an `attack` program whose `bonus` equals the row's `attackBonus` and whose damage parts equal the row's typed `damage`; a save-damage spell with `areaShape` becomes `count: "area"`; a heal row becomes `heal`; every other row a `manual-table` with the row's `nameLoc` key as label; slot costs from `slotLevel` (`upcast: true` when `damageDicePerUpcast`); resources `slot:<n>` from `session.spellSlots` and the character's slot table, trackers by id; vitals from `session`; `life` from HP and death saves; `coverage` = `coverageFor` over the emitted mechanics.
- [ ] `pc-projection.json`: Marco projected from the beginner fixture, a longsword attack and a Fireball fold end to end through `replays.test.ts` (the runner seeds the carried mechanics).
- [ ] `boundary.guard.test.ts`: `src/lib/combat-projection.ts` is outside the kernel and the
      kernel does not import it.
- [ ] Commits with changesets; `pnpm typecheck`, both lanes, `just ci-srd-only` green (the
      SRD build has no pack spells).

## Task 3 — the client: table store, dispatch, lease write-back, log presenter (worktree off `v2` after task 1) **Files:** create `src/features/play/table/table-store.ts`, `use-table.ts`, `dispatch.ts`,
`src/lib/combat-state-writeback.ts`, `src/lib/views/encounter-log-view.ts`,
`src/i18n/{en,it}/ui/play.json`, `tests/unit/table-store.test.ts` (slow lane; fake `subscribe`),
`tests/unit/encounter-log-view.test.ts`, `tests/unit/combat-state-writeback.test.ts`; modify
`src/lib/combat-lease.ts` (`PersonalWriteBack`), `tests/unit/combat-lease.test.ts`,
`tests/rules/encounter-two-clients.emulator.test.ts` (the `document` write-back case).

**Interfaces (produces):**

```ts
// table-store.ts
export interface TableState {
  snapshot: EncounterSnapshot | null;           // from subscribeEncounter
  fold: FoldResult | null;                      // memoised: re-folded only when the log/checkpoint changed
  role: { uid: string; dm: boolean };
  dispatch(body: ActionBody): Promise<void>;    // ActionBody = Action without id/seq; stamped here
  undo(of: ActionId, reason: string | null): Promise<void>;
}
export function createTableStore(deps: { db: Firestore; ref: DocumentReference; role; catalogue: Catalogue; seq: () => Seq; now: () => number }): StoreApi<TableState>
// dispatch.ts — pure builders, no I/O
export function planIntent(state: FoldedState, args: { entity; mechanic; program; targets; answersSoFar; castLevel? }): { inputs: PendingInput[] } | Rejection
export function rollsFor(inputs: PendingInput[], mode: "app" | "manual", faces?: Record<string, number[]>): PendingRoll[]   // through src/lib/dice.ts
export function intentBody(args, rollIds: Record<string, ActionId>): ActionBody
// combat-lease.ts
export type PersonalWriteBack = { kind: "encounter"; encounter: Encounter | null } | { kind: "document"; data: Record<string, unknown> }
leaveTable({ …, personal: PersonalWriteBack })
// combat-state-writeback.ts (dies at item 8)
export function projectCombatState(previous: CombatState, entity: Entity, effects: readonly Effect[]): CombatState
// encounter-log-view.ts
export interface LogLine { id: ActionId; at: Seq; author: "dm" | "you" | "auto" | { uid: string }; kind: "action" | "roll" | "rejected" | "undo"; text: string; undoable: boolean; hidden: boolean }
export function buildLogLines(encounter: Encounter, fold: FoldResult, viewer: { uid; dm }, t: TFunction, names: (uid) => string, labels: (label: LabelId) => string): LogLine[]
``` - [ ] TDD the store: a snapshot with `pending` only flipped does not re-fold; `dispatch` stamps `id`/`seq`/`by` and calls `appendAction`; `undo` appends `{ kind: "undo" }`; a DM store attempts `checkpointEncounter` when `shouldCompact` (with `checkpointThrough(…, CHECKPOINT_GRACE_MS, now())`); a player store never does; teardown unsubscribes.
- [ ] TDD `dispatch.ts`: `planIntent` lists the `d20`/`dice` inputs (per-target keys for `perTarget` inputs over the resolved targets — area targets resolved through `areaShapeFrom` + `areaMembership` exactly as `applyIntent` does), `rollsFor` builds `roll` actions (`roller` = entity, or the target for per-target saves; `hidden` for the DM's hidden mode), `intentBody` answers each input with `{ roll }` and sets `basedOn`.
- [ ] TDD `leaveTable`'s `document` variant (unit with a fake batch; emulator case: seed a `CombatState` at `combat/state`, leave, read back: HP/temp/conditions/death saves from the entity, `playState` untouched).
- [ ] TDD `projectCombatState`: HP and temp from `vitals`, `conditions` = the ids of condition effects on the entity, `deathSaves`, `round` and `playState` preserved.
- [ ] TDD the log presenter over every receipt summary the reducer emits (grep `summary:` in `intent.ts`, `override.ts`, `reposition.ts`, `table.ts`) in EN and IT; a hidden roll masks faces and total for a non-DM viewer; a rejected action renders as `rejected`; undo lines. Keys in `play.json` (`play.log.*`).
- [ ] Commits with changesets.

## Task 4 — the surface (proposal branch `v2-stage6-play-surface`) Branch from `origin/v2-stage5-map-surface` rebased onto `v2` after tasks 1–3 integrate. **Files:** create `src/features/play/PlayScreen.tsx`, `play.css`, `SceneHeader.tsx`,
`InitiativeStrip.tsx`, `TargetBlock.tsx`, `ViewControls.tsx`, `ToolRail.tsx`, `Hotbar.tsx`,
`EconomyPill.tsx`, `RollPanel.tsx`, `ReactionCard.tsx`, `ProseLog.tsx`, `DmDrawer.tsx`,
`HpEditor.tsx`, `TokenPill.tsx`, `AddCreature.tsx` (bestiary picker over the existing
`encounter-bestiary` data path), `src/app/routes/play-dev.tsx` (`/_play`, replaces `map-dev.tsx`),
`tests/unit/play-screen.test.tsx`, `tests/visual/play.spec.ts`; modify `src/app/router.tsx`
(`/campaigns/:campaignId/play`, lazy, full-window), `src/features/play/map/MapCanvas.tsx` (token
portraits, `onSelect`, `selected`), `src/i18n/{en,it}/ui/play.json`, `src/assets/icons` (the
sprite symbols the screen uses, from the licensed sets — attribution in the credits).

- [ ] Port the approved rendition's grammar and tokens (`v8.css`, `v8-play*.html` outside the repository) onto `src/index.css` tokens: gold `#c9a35a`/`#e6cc8a`, cyan `#62d4e8`, danger `#d8635a`, vitality `#5fb08a`, economy colours, the framed panel with bracket corners, the
      44 px tile, the pill tabs, the ring button. One border weight; depth by tone.
- [ ] `PlayScreen`: `useTable(campaignId)` → fold; the viewer's seat (DM: the selected
      creature; player: their character); the four edges (rule 28); the map as the ground.
      Spectators see map, strip and log only.
- [ ] `Hotbar`: tiles from `state.mechanics` filtered by the seated entity's `mechanics` ids, grouped weapons/common · spells (by level, slot diamonds from `resources`) · items; usable now at 100 %, otherwise 40 % with the reason in the tooltip (`planIntent` rejection); tabs; the economy pill from `turn`; End turn appends `end-turn`; the dice medallion opens `RollPanel` in manual mode (a free roll); the reaction medallion lists open windows.
- [ ] Target flow (D7): tile → target(s) → rolls (mode from `localStorage` `d20-dice-mode`, default `app`) → intent; the area preview on the map (tinted circle, caption with spell,
      radius and count — rule 33) before commit.
- [ ] `DmDrawer`: Registro (filters Tutto · Tiri · Ferite · Solo DM · Rifiutate; Annulla per line; Modifica opens `HpEditor`), Nascosti (per-token hide switches → `override reveal.token`; "PF dei mostri" → `settings.revealMonsterHp`; "Tiri del DM" → the DM's
      hidden mode), Nebbia (Copri tutto / Nebbia via / Scopri / Nascondi modes driving
      `MapCanvas`'s fog tools; the per-DM opacity slider is local), Regole (automation full-auto / log-only → `settings`), Scene and Note labelled empty.
- [ ] `HpEditor` (component 18): Danno / Cura / temp / max / condition → `override vitals.hp`, `override vitals.tempHp`, `override stats.maxHp`, a `condition` effect through `override`… (the reducer's direct-patch paths; a condition is an `effect-start` override
      path added in this task if none exists — TDD it in the kernel first).
- [ ] `TokenPill`: initiative (`set-initiative`), hide (DM), remove (`remove-entity`, DM) /
      leave (owner).
- [ ] `AddCreature` (DM): search the composed bestiary, pick, `projectMonster` → `add-entity`; a player's "Siediti al tavolo" → `projectCharacter` → `joinTable`; "Alzati" → `leaveTable` with the `document` write-back.
- [ ] `/_play` DEV harness on the ambush fixture (DM/player/spectator switch, dark/light, IT/EN through the app's own toggles); `tests/visual/play.spec.ts` captures the matrix (1440 × 900 and 1024 × 768; dark + light; IT + EN; DM + player) into `tests/visual/__artifacts__/play/`.
- [ ] jsdom: who sees what; tile → target → intent through a fake store; drawer undo; HP editor.
- [ ] Screenshots to the owner as chat images (curated: DM with drawer, player, roll panel,
      reaction card, fog, area preview, HP editor). Push `HEAD:refs/heads/v2-stage6-play-surface`.

## Task 5 — review, documents, gates, integration of tasks 1–3, staging

- [ ] Independent whole-diff review of tasks 1–3 (reviewer subagent, no session context; lenses:
      determinism of the fold across clients, node budget, the lease write-back's data safety,
      rules); fix Important findings.
- [ ] Reconcile: target spec §2.1/§2.2/§3.1/§4/§5.2 (carried mechanics, `movementExtra`, `dash`, the write-back), `docs/ARCHITECTURE.md` (the play feature, the projection module, the table store), `docs/MECHANICS.md` (`areaShape`, the adapter), `docs/TEST_PORTFOLIO.md` (counts, new files), `docs/CHARACTER_SCHEMA.md` (`combat/state` unchanged, the write-back), the stage-1 plan item 6 status, `docs/PROGRAM_STATUS.md` → "`v2` — stage 6".
- [ ] Gates: `just ci`, `pnpm test:rules`, `pnpm build && pnpm test:budget`, `just ci-srd-only`; record the numbers. Push `HEAD:refs/heads/v2` and the pack's `v2`; verify with `git ls-remote`.
- [ ] Staging (D10, owner-authorised): `gcloud billing accounts list` → link `d20-folio-staging`; create the default bucket (`europe-west1`) and add it to Firebase (`firebasestorage.googleapis.com/v1beta/projects/d20-folio-staging/buckets/…:addFirebase`); a £1 budget with 50 % and 100 % alerts; `firebase deploy --only firestore,storage -P
  staging`; seed the campaign fixture if absent. Never `-P default`.

## Task 6 — handoff

- [ ] Rewrite `docs/superpowers/plans/2026-09-04-v2-next-session-handoff.md` for the surface's
      verdict (map + chrome, one verdict) and what follows (stage 7 cuts); paste its prompt block
      as the last message.
````
