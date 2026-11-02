# Simplifying the core (lane 1: engine and data flow), 2026-11-02

Read-only review of `src/lib` (non-UI), `src/domains/*`, `src/stores`, the play log, encounter and
campaign logic, the codecs and the new-UI view models, done before the new UI is built. The lane is
about 134k lines. An export scan (every `export` in `src/lib`, `src/stores`, `src/domains`, checked
against every importer) found 90 exports used nowhere else and 332 used only by tests. Some of those
test-only exports are reader-first seams the new UI will call (`docs/design/new-ui-wiring.md`); they
stay.

Ranked by value against risk. Each item ships as small, behaviour-preserving PRs, tests first where
behaviour changes, with the composed suite (fresh pack) run before every merge. Stored-data readers
are never deleted; any change to a stored shape goes through `live-data-migration`.

## Ranked findings

1. **Undo of an older action wipes later changes (owner gate).** In production, `dispatch`'s undo
   restores the whole pre-event character (`characterStore.ts:3136`); only development uses the
   play log's causal `undoFrom`, where only that event goes. `docs/architecture/play-log.md`
   step 4: production keeps the snapshot "until the owner turns it on". Asked the owner
   (2026-11-02). If yes: about 10 lines; test: dispatch A, then B, undo A, B survives.
2. **About 6.5k source lines (plus about 8k test lines) of the mechanics stack have no production
   caller.** `mechanics-transcription.ts` (3.6k), `automation-corpus.ts` + `automation-compiler.ts`,
   and the spell, feature-action, weapon and conjured-item capability builders in
   `mechanics-world-store.ts` (`:385–465`, `:640–1280`). Their UI wiring went with #28. They read no
   stored shape. Delete them and their tests.
3. **Dead and over-exported code.** About 25 real dead functions (for example
   `resolveActiveSpeedRiderBonus`, `trackerTotalBreakdown`, `resolveTempHp`, cost-engine's
   `planCommit`/`applyCommitOps`/`CommitStore`, `combatStore.freshTurn`, unused store methods
   `editCharacter`/`studyItem`), unused `*_SCHEMA` constants, plus about 65 exports used only inside
   their own file (drop the `export`). About 1–1.5k lines.
4. **One sealed commit for a use (`commitUse`), so the new UI needs no TurnEconomyProvider.** The
   provider still holds about 1.5k lines of non-UI logic: commit, cast, payment, reaction, riders,
   Cunning Strike, readied spell, and the turn-start reconcile. Each commit chains up to 12
   hand-written restore closures. Target: `commitUse(action, option, targets)` and
   `commitReaction(...)` in the core, each returning one whole-state undo sealed around the
   character and the turn's own fields. About −800 lines. Characterization tests first, as for End
   Turn (#428).
5. **Edits bypass the log, and an edit drops a pending Concentration save (bug).** `setCharacter`
   is both the loader and the edit path (65 calls, no undo). On any edit it clears
   `combatPendingConcentrationSaves` and `combatLegacyActiveEffects` (`characterStore.ts:1241–1243`),
   so an XP edit loses a pending save. Fix the clear (test first), then make `setCharacter`
   load-only and route edits through one `editCharacter` (whole-state undo).
   _Status (2026-11-02):_ the bug is fixed and pinned (#473: an edit keeps the pending save and
   the standing effects), and `editCharacter` exists. The 48 `setCharacter` edit calls live in
   today's sheet tabs, which the new UI replaces: they are not moved. New code edits through
   `editCharacter`.
6. **Six undo styles, nine write paths.**
   - Undo: the stack, returned closures, `dispatch` snapshots, whole-state seals, world-journal
     reverses, and fences.
   - Writes: `dispatch`, `setCharacter`, `updateSession`, direct `set()` in about 20 store methods,
     world commits, `applyMechanicsPlan`, log lines, and raw `setState`.
   - Target: two styles, one `dispatch(event)` per act or one sealed whole-state edit, both on the
     one undo stack.
   - Move the remaining direct writes into events: inspiration, Hit Dice, potion, initiative
     top-ups, the five item operations, hidden state, the zero-HP interrupt, Arcane Recovery.
   - Merge the duplicated Concentration-save queue (`:1478` and `:2541`).
   - About −400 lines.
7. **Weapon attack math lives in four places.** These are `inventory-view.ts:405–520` and
   `smart-tracker.ts` `resolveWeaponActions`, `resolveManifestedWeaponAttacks` and
   `resolvePactWeaponAttacks`. Replace them with one `weaponAttackProfile(doc, ref, ctx)` that all
   four read, plus a parity test (inventory to-hit and damage equal the action row for every dev
   scenario). About −500 lines.
   _Status (2026-11-02):_ the parity test is in (`weapon-attack-parity.test.ts`: 48 weapons over
   every dev scenario, all agreeing today); the one-profile refactor follows on it.
8. **Numbers computed twice, once as a value and once as a breakdown, with guards checking they
   agree.** Spell, feature and maneuver DCs, proficiency, walking speed, max HP, tracker formulas,
   initiative. Keep the breakdown and make each total `breakdownTotal(parts)`; "8 + PB + mod" is then
   written once. About −500 lines; the existing agreement guards prove the cut.
9. **Pure campaign logic sits in an old UI folder.** `encounter.ts`, `encounter-view`,
   `encounter-world-command`, `combat-chronicle`, `chronicle-*`, `party-*` and `member-*`
   (about 4.5k lines) are domain logic in `src/features/campaigns`. `campaign-io.ts` (2.5k) mixes
   Firestore with domain math. Move the logic to `src/domains/campaign/` and keep `campaign-io` for
   I/O only. This is a move with no stored-data risk; add a lint rule so the domain imports no
   `features/*`.
10. **Codecs: one guard kit, one policy per record, no silent rewrites.** `isRecord` is redefined
    about 12 times, and `isPlainJson`/`jsonEquals` twice. `effectOps` (an append-only ledger) and
    `extraTurns` are cleaned on read and then written back whole by the DM's writer, so the ledger
    is rewritten unseen. Fix: one small guard kit, and for each record either fail closed or stay
    tolerant without writing back. About −150 lines, plus round-trip tests on stored fixtures.

## Next, after the top ten

**Scheduled right after item 4 (Coordinator, 2026-11-02): the members' campaign write rule is at
the rules' expression budget.** One `allow update` evaluates every member move in a chain, and
the 8-revoke effect-op batch already spends nearly the whole per-request budget: one extra
check on that path made a passing test fail (found in #505, which moved the kept fight to its own
document to avoid it). The next small feature will hit the same wall. Fix: split the path, so
no rule sits near the limit. Each member move gets its own small `allow update` alternative,
gated first by which top-level keys it touches. Or move bulk validation into the data's shape:
for example, effect operations as one document each, as the session log's per-item documents.
Same emulator coverage, plus a budget test that runs each move at its largest legal size.
Ships with the deploy (rules).

11. **Split `smart-tracker.ts` (9.7k lines, 139 functions)** into `trackers/`, `weapon-attacks/`,
    `actions/`, `lifecycle/` and `turn-economy/`, behind a re-export barrel. This is a move only.
12. **Shared helpers** replace the scattered copies: `dice-expr` (parse, mean, max: four copies
    today), `pickByLevel` (five hand-written loops), `wornArmor` (five scans), `isCopyAtHand`
    (`resolve-grant-sources.ts:173` checks `equipped` itself).
13. **The playbook view must not parse English text.** `playbook-view.ts` reads a spell's range with
    a "feet" regex over the English summary (mine, from #434); it should read a structured `rangeFt`.
    The playbook's average damage is computed twice (the builder and the view).
14. **Views doing rules work.** The aura radius and dice in `tracker-view.ts:640–700`, weapon math in
    `inventory-view.ts`, the spell modifier in `companion-row-view.ts`, and speed and defence rules in
    `sheet-view.ts:695–810` (move them to a locale-free module). The old-UI-only views
    (`combat-log-view`, `companion-row-view`, `creation-view`, `cunning-strike-view`, …) go with the
    old UI.
15. **The `memberEffects` drain has no production writer** ("New actions never append here",
    `campaign-io.ts:1039`). Delete the drain (about 200 lines) once a read-only query confirms that
    no campaign holds a non-empty `encounter.memberEffects`. Keep the type and the codec key.
16. **Mechanics world vs the legacy session.** In production the world only mirrors the legacy
    session, which wins (`rebasedOnStoredVitals`). Three steps, each needing snapshots of stored
    `session.world` / `encounter.world` and the owner's yes before anything stored changes:
    - (a) conditions book their occurrence directly, without the program engine;
    - (b) shrink the engine to its live capabilities (about 8–10k lines);
    - (c) decide the one source of truth (the world as the record, or frozen read-only parsing).
      Readers of stored worlds always stay.
17. **Facts held twice in a fight.** Monster HP and conditions live in `combatants[]` and in
    `world`. Chronicle beats live in `encounter.events` and in the session log. Pick one owner for
    each and project the other at read time. Medium to high risk; this comes after 16.

## Kept on purpose

- Reader-first seams waiting for a screen: mounts, summons, Magic Jar, provisions, environment,
  swarms, `takeRider`, `castPreview`/`castPlan`, `playbookView`, `resourcesView`, `sheetNumbers`.
- The writers the release draft holds, and every stored-data reader and legacy tolerance:
  `sharedNotes` fallback, old `combat/state` shapes, `stateToSession`, character-codec id remaps.

## Open PRs in this lane

- **Close as superseded by the new UI, branches kept:** the restyle PRs #351, #352, #355, #357,
  #358, #359 and #362.
- **Salvage the pure rules into the core first, then close:**
  - #354: `purchase.ts`, buying with change and selling at half price; `armor-donning.ts`, don and
    doff times. The armour times in `armor.ts` belong to the rules session.
  - #369: jumps, compared with what #447 already ships; Squeezing; the potion one-taps.
  - #178: `session-log/mine.ts`, the session lines about one character.
