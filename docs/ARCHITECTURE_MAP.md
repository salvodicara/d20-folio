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
2. **`SessionLogStore` + rules + session lifecycle.**
   - Firestore and memory adapters.
   - The `sessionLogs` rules block with emulator tests: two clients appending, a member blocked from
     editing others' lines.
   - Auto-open/close of a session, linked to the existing `sessions/{id}` entry.
3. **Wire the DM side.** `appendEvent` and encounter start, round advance and end also record into
   the session log. Dual-write; the chronicle UI is unchanged.
4. **Wire the player side.**
   - `logEvent` records into the session log when the character is attached to a campaign, with
     actor = `pc-<uid>`.
   - The shared-effects transaction records one declaration event: actor, targets, hit/miss and
     amounts.
   - A player's manual −14 HP, rests and slots now reach the shared record.
5. **Report in the app (visible: owner approval with screenshots).**
   - The Sessions page shows the per-round report, regenerated from the log, with "copy for AI".
   - End-encounter's chapter is built from the log, not from the reconciled DM feed.
6. **Corrections as events (visible).** Each player corrects their own lines and the DM corrects all
   of them. Corrections are appended `correct`/`retract` events, and the report recomputes.
   Chronicle undo stops deleting history.
7. **Optional detail row (visible).** Per VISION's interaction decision: the tap records at once,
   and an inline, skippable row adds target, hit/miss and damage, now or later from the log.
8. **Retire the duplicates.**
   - `encounter.events`, `chronicle-reconcile`-at-render and the `RecentAttack` ring become views
     of the log, or are deleted.
   - The character's log panel reads the session log when attached.
   - Delete the IndexedDB mirror and `src/lib/combat/*`.

Phase 2 then derives timers (Rage, concentration, durations) from the log. That is the first step
where state stops being mutated directly, and the moment to start thinning `characterStore` and the
`mechanics-*` world.

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
