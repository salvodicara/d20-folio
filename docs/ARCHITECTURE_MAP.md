# Architecture map — today's code against the VISION layers

Mapped 2026-10-08 on `main` @ b99d4c7a, read-only. Vocabulary: `codebase-design` (module, interface,
depth, seam, adapter, leverage, locality). Target: [VISION.md](VISION.md) (five layers, Phase 1 =
one shared session log and a deterministic per-round report). Governing rule: GOLDEN_RULES "Modo #9"
(optimal architecture, simplest way to reach it, one area at a time, the live app always working).

Diagrams (archify, open in a browser): [today](architecture/today.html) ·
[target](architecture/target.html). Sources: `docs/architecture/*.architecture.json`.

## Verdict

- **Catalogue and Grants are sound. Keep them.** This is where the project is strongest. The
  problem is the number of ways to describe an _active_ mechanic, not the data.
- **The play-state layer has to be redesigned.** This covers log, state, persistence of play and
  undo. Today state is mutated directly in several homes and kept in sync by copying. Logs are side
  records, and there are six of them. No layer owns "what happened".
  - The target is **event-sourced play state**: one session log is the record, state is a fold of
    it, and views (sheet, report) are pure functions of state and log.
  - Get there in steps, never in one rewrite:
    - Phase 1 makes the log the _record_ (dual-write next to today's state).
    - Phases 2 and 4 make timers, then HP and resources, _derived_ from it.
    - Only then do the `combat/state` subdoc and the `mechanics-*` world shrink to a cache, or go.
- **Repeating v2 is the main risk.** Its reducer modelled total automation before anything shipped.
  The log here records what players declare. It does not enforce rules.

## Current structure per layer

### 1. Catalogue: keep, with a dialect problem

- **Data:** `src/data/**` holds typed entries (`src/data/types.ts`, about 3k lines). The private
  pack is merged through a small, deep seam: `pack-merge.ts` (93 lines) and
  `pack-grant-extensions.ts`.
- **Passive effects:** a closed union of 127 Grant kinds (`grant-schema.ts`). This is good.
- **Active mechanics come in 8 dialects:**
  - flat spell fields (about 60 optional fields on `SrdSpellData`)
  - `SrdActionDef` (about 40 optional fields)
  - `mechanicsProgram` (about 16 entries)
  - active-ish Grants
  - Tracker/Resource/OnCast specs
  - `MonsterEntry` actions
  - Beast/Companion attacks
  - the prototype `Mechanic`

  `mechanics-transcription.ts` (3.6k lines) translates two of them into a third, whose cast UI is no
  longer mounted.

- **Monsters:** the 330 stat blocks are structured (AC, HP, scores, defenses, 422 attacks, 184
  saves). They are only displayed; nothing executes them.

### 2. Entities: PCs good, monsters partial, no common shape

- **PCs:**
  - `users/{uid}/characters/{id}` stores the build, with a revision compare-and-set. Keep it.
  - The `combat/state` subdoc stores play state as a whole-object, last-write-wins `setDoc`, with
    several writers (owner, DM, peers via transaction).
  - `Character` mixes build, play state, UI choices (`pinnedActions`) and a log (`logEntries`).
- **Monsters and NPCs:**
  - `EncounterMonster` is embedded in `campaigns/{id}.encounter`. An improvised NPC already works
    (only a name is required), but `ac` and the HP trio are typed as required.
  - `EncounterPc` is a pure reference. Keep that.
- **No common shape:** PCs and monsters never share one. The chronicle's combatant ids
  (`pc-<uid>`, `monster-<n>`) are the only common identity. Reuse them as the actor/target id.

### 3. Session event log: does not exist

There are six parallel records. The same hit can land in four of them.

| Record                      | Where                                         | Who/target/round?                 | Fate                       |
| --------------------------- | --------------------------------------------- | --------------------------------- | -------------------------- |
| `CombatEvent` / `LogEntry`  | per character, `combat/state` + IndexedDB     | none (only `turn-end{round}`)     | capped at 200              |
| Action journal (patches)    | `session.world`, `encounter.world`            | actor, before/after               | capped at 20, evicted      |
| `CombatChronicleEvent`      | `campaign.encounter.events` (DM only)         | target, round, attacker if tapped | **wiped at End encounter** |
| `RecentAttack` declarations | per character, `combat/state.recentActions`   | targets, hit/miss, round          | ring of 8                  |
| `effectOps`                 | `encounter.effectOps`                         | apply/revoke                      | folded into effects        |
| `lib/combat` `Action` log   | `campaigns/{c}/encounters/{e}` (`arrayUnion`) | full                              | **test-only, unwired**     |

**Key answer:** a shared encounter has no unified log.

- The DM's feed is joined to the players' `recentActions` **at render time**
  (`chronicle-reconcile.ts`), and nothing is written back.
- At End encounter, a markdown chapter is frozen into `chronicle/main` and the structured events
  are discarded.
- A player's own sheet gestures (manual −14 HP, self-heal, rest, slot spent) never reach the shared
  record.
- `sessions/{id}` (`Sessions.tsx`) holds hand-written notes. Its `logs` field is never written, and
  nothing carries a `sessionId`.

### 4. Derived state: partly derived, mostly mutated

- **Stats are derived, through a shallow interface:**
  - `evaluateGrants` returns about 130 fields.
  - `compute.ts` adds about 60 resolvers.
  - `smart-tracker.ts` (8.6k lines, 110 exports, with a 1,800-line `resolveActions`) adds trackers,
    action cards and riders.
  - `aggregate-character.ts` exists only because callers dropped arguments.
- **Play state is mutated directly.**
  - `characterStore.ts` (4.6k lines, about 80 rule-named actions, 72 importers) repeats the same
    steps in every action: guard → rule → world commit → legacy copy → set → persist → log → undo
    closure.
- **Facts with several homes:**

  | Fact               | Homes                                                                                   |
  | ------------------ | --------------------------------------------------------------------------------------- |
  | round              | 4: `combatStore`, `characterStore.combatRound`, `combat/state.round`, `encounter.round` |
  | initiative         | 3                                                                                       |
  | PC HP / conditions | 2 (`combat/state` fields + `world` vitals), plus staging in `memberEffects`             |
  | monster HP         | 2                                                                                       |
  | log                | 2 (Firestore + IndexedDB)                                                               |

- **`mechanics-*` (30k lines) is half-retired.**
  - Its cast executor is dead: `EngineCastFlow`, `EngineActionFlow`, `EnginePulseStrip`,
    `EngineConsumablesStrip`, `MechanicsCastModal`, `useMechanicsCast`, `useMechanicsPulse` and
    `engine-spell-gate` are about 1.8k lines that only import each other.
  - Its `world` is still the store of record for vitals, conditions, concentration, rest and DM
    adversary damage.
- **Undo is three mechanisms:** snapshot, hand-written inverse closure, and journal generation flip.
  It is forbidden in campaigns. Chronicle undo deletes the line.

### 5. Views: fine shape, wrong inputs

- `lib/views/*` are pure presenters (good).
- `combat-log-view` can't say who did what to whom.
- `combat-chronicle-view` builds a per-round chapter, but only from DM beats plus reconciled
  declarations, and it can't be regenerated afterwards.

## Keep / simplify / delete / build

**Keep**

- Catalogue data and the pack seam.
- The Grant union with `exact-schema`.
- The parent/child character split with revision compare-and-set.
- The ids-only `LocText` event style.
- `EncounterPc` as a reference.
- The chronicle's `round` and combatant ids.
- The `chronicle-reconcile` matching (it becomes a fold step).
- The append-only rules pattern of `campaigns/{c}/encounters/{e}` (firestore.rules:904).
- `lib/views` as pure presenters.
- `combat-resolution.ts`.
- Diagnostics.

**Simplify (later phases, not Phase 1)**

- `characterStore` becomes a thin store over `dispatch(event)` plus a pure reducer.
- Round, initiative and HP each get one home.
- `evaluateGrants`, `compute` and `smart-tracker` sit behind one `deriveCharacter` entry.
- The 8 active dialects become 1 Action shape (Phases 2 and 6).
- `ac` becomes optional on improvised NPCs.

**Delete (no behaviour change, early)**

- The dead cast UI (about 1.8k lines, listed above).
- The K1 kernel: `src/lib/command/*`, `types/command.ts`, `rule-definition.ts` and the functions
  bundle (about 1.5k lines). Removing its export from `functions/` takes effect at the next deploy
  the owner approves.
- `automation-compiler`/`automation-corpus` after checking CI.
- `src/lib/combat/*`, `combat-io.ts` and `prototype-catalogue.ts` (about 4.5k lines) _after_ the
  session log lifts its id/fold ideas.
- Later:
  - `mechanics-transcription` and the `mechanicsProgram` fields.
  - The IndexedDB log mirror.
  - `SessionLogDoc.logs`.

**Build: two deep modules and one seam**

1. **`SessionLog`** (`src/lib/session-log/`).
   - Interface: `record(draft)`, `correct(id, patch)`, `retract(id)`, `subscribe(sessionId)`.
   - Hidden behind it:
     - the id/sequence (collision-free, ordered across devices)
     - session resolution (open on first event, close after inactivity, DM override)
     - who-may-correct-what
     - offline append
   - A `SessionEvent` = `CombatEvent` kind, extended with **optional** `actor`, `target[]`,
     `source` (`LocText`), `amount`, `round`, `encounterId`, plus an envelope `{id, seq, at, by}`.
     A minimal event (`hp-damage 14`) is valid by itself.
2. **`SessionReport`**: a pure `buildReport(events) → Report` (chronicle by round), with a markdown
   renderer. The interface is the test surface: golden logs in, expected markdown out.
3. **Seam: `SessionLogStore`**, with two adapters (Firestore `arrayUnion` and in-memory for tests),
   so the seam is real.
   - Storage generalises the existing append-only `encounters/{eid}` rule to
     `campaigns/{c}/sessionLogs/{sid}` = `{schema, log[]}`. An encounter is a stretch of the log
     (between `encounter-start` and `encounter-end` events), not a document.
   - Rules enforce access only: members append events with `by == auth.uid`, members correct their
     own lines, the DM corrects all.
   - Budget: one listener per session. At about 200 B per event, 2,000 events fit well under 1 MB;
     a subcollection is the measured fallback.
   - Solo characters with no campaign keep their per-character log for now. It becomes a second
     `SessionLogStore` adapter later if needed.

**Taps, so emission needs no rewrite.** Two single writers already exist:

- `characterStore.logEvent` on the player side.
- `combat-chronicle.appendEvent` on the DM side.

Both also call `SessionLog.record`, enriched with actor, round and encounter. So does the
shared-effects transaction in `campaign-io.applyDeclaredCombatEffects`, the one place that knows
attacker, targets and outcome.

## Phase 1: ordered refactor areas (one session each, each shippable)

Each step is merged on its own with the app working. Steps 1–4 change nothing the players see.

0. **Done (#28).** Dead cast UI, K1, the `lib/combat` prototype and the unmounted
   `CombatResolver` deleted; chronicle id reuse fixed. Left unwired since 2026-09-21, recorded as
   open gaps: `self-heal-on-other`, `maximize-spell-healing`, `roll-die-adjustment` and the on-cast
   triggers in `src/lib/on-cast-effects.ts` (Arcane Ward, Expert Divination).
1. **Done (#29).** `src/lib/session-log/`: `PlayEvent`, `LogItem`, `foldSession`, `buildReport`.
   Order is the log's array order (`arrayUnion`); round and encounter come from markers, so no
   clock and no stamping on the recording device.
2. **Done.** `SessionLogStore` (memory + `src/lib/session-log-io.ts` Firestore adapter),
   `createSessionRecorder`, and the `campaigns/{c}/sessionLogs/{id}` rules (one own item per
   write, history immutable; the unused `encounters/{eid}` prototype block is gone). A session
   is named after the local day (`2026-10-08`, then `-2`) and closes after 6 h of silence
   (`SESSION_GAP_MS`), so every device computes the same id with no coordination. Caveat:
   `lastAt` is the recording device's clock. The rules reach production only with the next
   owner-approved deploy.
3. **Done.** `mirrorEncounter` + `createEncounterMirror` (`src/lib/session-log/`), mounted by
   `useSessionLogMirror` in the campaign hub on the DM's device. It derives encounter start,
   each round and every Combat Chronicle beat from the live encounter and appends only what the
   session lacks: new beats as events, a later attacker tap as a correction, an undone beat as a
   retraction. Ids come from the encounter epoch and beat id, so reloads never duplicate. Any
   failure is logged to diagnostics and never touches the fight.
4. **Done.** `characterStore` exposes one seam, `setPlayLogSink`: the owner's own appends
   and undos (never a clear, the cap, hydration or a read-only view). `useSessionLogPlayerRecorder`
   (cockpit) resolves the attached campaign on the first gesture and forwards each line through
   `createCharacterLogMirror` (`pc:<character>:<line>` ids; undo → retraction). None of these
   lines produce a Chronicle beat, so nothing duplicates the DM mirror. Found on the way:
   `applyDeclaredCombatEffects`, `applyResolvedCombatEffects` and `applySoloCombatEffects` had
   no production caller (dead since the resolver went) — deleted with their reducers.
5. **Done.** `useSessionReports` + `SessionDayReport`: each session page in the Journal joins the same local
   day's `SessionLogStore` logs as an "Automatic report" disclosure (an evening with a log but
   no page still lists, with "Write notes"), rendered by `renderSessionReport`
   (`src/lib/views/session-report-view.ts`, EN/IT) with "Copy".
   The encounter start line now carries the monsters' names so the report can name them after
   the fight. `session-log-source.ts` picks the store: Firestore, or memory under dev bypass, so
   the whole flow (DM mirror → log → report) runs locally with no backend. Manual session notes
   (`Sessions.tsx`) are untouched; merging the two is a later step.
6. **Done.** The Combat Chronicle feed is a view of the session log (`encounterFeed`), shown to every
   member. "Who struck?" appends a `correct` (the DM on any line; a player on a hit their character
   took, which the fold now allows); any line is struck with a `retract` by its author or the DM;
   the DM's undo on a monster line still restores it through the engine and the mirror retracts the
   line. Beats never change once mirrored, and a beat id reused after an undo is recorded as a new
   line (`…:g2`) instead of being dropped (it was silently lost before). "Save to Chronicle" also
   records the DM's note and the outcome in the log. The log carries no HP totals; the feed's
   readout comes from the live beat and follows the monster card's rule.
7. **Optional detail row (visible).** Per VISION's interaction decision: the tap records at once,
   and an inline, skippable row adds target, hit/miss and damage, now or later from the log.
8. **Retire the duplicates.**
   - Done: `chronicle-reconcile` (render-time fusion), the synthesized miss/multi/save chronicle
     kinds, `setEventAttacker`/`skipEventAttacker` and the dev declarations seed are gone;
     auto-attribution is `encounterFeed` over the log.
   - Left: `encounter.events` stays, because the DM's undo reverses a beat's engine action and the
     HP readout reads the beat; it goes when HP is derived from the log (Phase 4). The
     `RecentAttack` ring (`combat/state.recentActions`) has had no writer since the resolver went
     (`declareAttack` has no caller) and nothing reads it now; deleting it touches the
     combat-state codec, its strict-field check and stored subdocs, so it is its own step.
   - The character's log panel reads the session log when attached.
   - Delete the IndexedDB mirror and `src/lib/combat/*`.

## Phase 2: states and timers (one session each, each shippable)

Diagram: [status lifecycle](architecture/status-lifecycle.html).

Today (mapped 2026-10-08): about 8 parallel "effect active for a while" mechanisms; only five are
live — `session.activeFeatures` + `effectTimers` (round countdown, ticked only by the owner's End
Turn), `effectBoundaries` (turn edges: Shield, Reckless Attack), the `concentration` string (no
duration of its own) and potion timers (display only). The canonical live path is the
`while-active` grant → `sessionActiveKeys` → `evaluateGrants` gate, with lifecycle code in
`smart-tracker.ts` (≈7760–8070) and `activateActionState` in `TurnEconomyProvider`. Dead residue:
`CombatState.activeEffects`, encounter `effectOps` (no writer), `standingEffect` /
`combat-resolution` resolution, world buff standings. Durations are declared in 8 dialects.

Target: one `Status = { key, source, castLevel?, recipient, concentration, lifetime, endsOn[] }`
(`lifetime`: turn edge, rounds counted on the owner's turn start, rest, maintained, manual) and one
pure `expire(statuses, boundary)`; Grants keep gating on status keys; later statuses are a fold of
`status-start` / `status-end` log events (the rules-model "Stati" box).

0. **Done (#35).** Cast lights a self buff again (owner 2026-10-08).
1. `Status` type + a read-only derived view over today's fields; rail, `StatusLedge` and
   aggregation read it; concentration shows its remaining rounds.
2. Round timers count on the owner's turn start from the shared pointer, so they tick when the DM
   advances (today they only tick on the owner's own End Turn).
3. `session.statuses[]` written beside the old fields; idempotent migration (dry-run first).
4. Fold `effectTimers`, `effectBoundaries`, `activeSpellCastLevels` and the maintenance prompt into
   `expire`; delete the old fields after the migration is applied (owner yes).
5. Concentration becomes a flag on a status: dropping it ends its dependents in one place.
6. Delete the dead residue (`effectOps`, `CombatState.activeEffects`, standing resolution, world
   standings).
7. Selected-recipient statuses (Mage Armor, Bless on an ally) via the optional target detail.
8. Emit `status-start` / `status-end` into the session log, then derive statuses from the fold.

## Folio Core API (diagram: [core API](architecture/core-api.html))

Order: (1) a clean internal core the app uses, (2) an npm package of the engine, (3) the
SRD catalogue as static JSON. Only SRD material goes out.

- **(1) In progress.** The rules grammar (`src/lib/rules`) now covers senses, speeds,
  proficiencies, defenses, derived numbers, roll bonuses and blockers (#39–#49); the session log
  is the play record. `deriveCharacter(doc)` (`src/lib/views/derive-character.ts`) is the one
  stored-character → computed-sheet derivation (abilities, saves, skills, passives, AC, HP,
  initiative, speeds, senses, spell DC/attack, defenses), composed from the seams the player's
  sheet reads; the DM's party view is a projection of it. Next: the PDF and the cockpit rail read
  it too, then it becomes the npm package's main entry.
- **(3) Done.** `pnpm srd:catalogue` (`scripts/export-srd-catalogue.ts` →
  `src/lib/srd-catalogue.ts`) writes `dist/srd/v1/{index,spells,monsters,…}.json`: mechanics plus
  the English text, sorted and byte-stable, CC-BY-4.0 attribution in `index.json`. It runs
  SRD-only (refuses unless `VITE_CONTENT_PACK=0`) and rejects any non-SRD `source`. `pnpm build`
  runs it, so the next deploy serves it at `/srd/v1/`; CI runs it on every PR. The service worker
  never precaches it. Italian text is not exported yet (confirm its provenance first).

## From the archived `v2` (tag `archive/2026-10-08-v2`)

Recover ideas and tests, rarely files.

| Piece                                                                          | For       | How                                                                         |
| ------------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------- |
| `lib/combat/ids.ts` (sequence/hybrid clock, `sortBySeq`) and `fold.ts` pattern | Phase 1   | lift the pattern (sorted log, skip retracted ids), not the reducer coupling |
| `tests/unit/combat/replays/*.json` + `replays.test.ts`                         | Phase 1   | reuse the golden-log format for report tests                                |
| `tests/rules/encounter-two-clients.emulator.test.ts`                           | Phase 1   | adapt to the `sessionLogs` rules                                            |
| `lib/combat/checkpoint.ts`                                                     | later     | only if a session log outgrows one document                                 |
| `Lifetime` union + `effects.ts` `endEffects`                                   | Phase 2   | vocabulary for timers (turn edge, rounds, rest, source end)                 |
| `monster-entity.ts` + `monster-adapter.ts` (+ tests, custom entity)            | Phase 3   | retarget the output to main's shapes                                        |
| `lib/combat/dice.ts`                                                           | if needed | only if the log stores declared rolls (the app never rolls)                 |

**Do not recover:**

- the v2 reducer (`intent`, `table`, `resolve`, `windows`, map/position): total automation
- `features/play` (a VTT)
- `lib/homebrew`, `identity`, `library`: a different data model that needs a migration
- v2's "session", which is an auth session

## Open notes

- ADRs 0001–0006 are all "proposed" and none is implemented. This map takes these positions:
  - 0002 (append-only log): adopted, for the session log.
  - 0004 (delete K1): adopted.
  - 0001/0006 (total-automation reducer, one format): superseded by minimal declaration.
  - 0003: still valid. Salvage, don't adopt.

  Record this in the ADRs when step 1 starts.

- `docs/ARCHITECTURE.md` (3.6k lines) describes `mechanics-*` as the "canonical runtime cutover
  (active)". That is no longer true; fix it when the dead code is deleted (step 0).

## Owner decisions pending (2026-10-09)

Each needs the owner's explicit yes; agents prepare, never decide.

- **Deploy** of everything merged since the last release — judged from the demo videos.
- **`@d20-folio/core`**: publish to npm or not, and its licence (the repo is AGPL-3.0; a permissive
  core would let other apps use it freely).
- **Statuses migration** (Phase 2 steps 3–4, #61): ship the dual-write, then backfill, `--check`,
  switch readers, delete the old fields — one yes per step.
- **Read-only surveys of live data** (Phase 2 step 6, #62) before deleting world standings,
  `CombatState.activeEffects`, encounter `effectOps` and the `combat-resolution` resolver (the
  last also needs five private-pack tests removed).
- **Notes audiences** (campaign spec I-044–051: only me / me and the DMs / chosen people): a new
  permission model and a migration of the existing shared notes.
- **Italian SRD text** in the public catalogue: confirm its provenance before exporting it.
