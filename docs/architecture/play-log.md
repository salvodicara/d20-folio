# The play log as the record (re-foundation phase 3a)

Today a character's play state is mutated in place (`characterStore`, about 80 actions) and the
session log only narrates it. Phase 3a turns that around for one character first: the log is
the record, and the play state is a fold of it. The plan and target live in
`docs/strategy/2026-10-16-*`; this note is the engine's design for the first steps.

## Model

- **Checkpoint.** A full `CharacterDoc` the fold starts from (today: the stored character).
- **Entries.** An ordered list. Each has an `id` (unique, stable across devices), a `seq`
  (the order), an `actor` (who wrote it) and one of:
  - a **`SheetEvent`** (`src/lib/play/sheet-events.ts`): the existing pure transitions, 36 kinds;
  - **`undo { target }`** and **`redo { target }`**: take an earlier entry out, or put it back;
  - **`correct { target, event }`**: replace an earlier entry's event (the DM fixing a number).
- **Fold.** First the effective events: walk the entries in `seq` order, apply the meta events
  (an undo removes its target, a redo restores it, a correction swaps its event), and drop
  any meta event whose target is unknown. Then replay the effective events in order from the
  checkpoint with `applySheetEvent`. An event that changes nothing (`null`) is skipped.

The fold is pure and deterministic: the same checkpoint and entries give the same character on
every device. Undo is an event, so it survives a reload and reaches every device. That is the
reload-proof undo the owner asked for on 2026-10-16.

## Replay versus "set" events

Undoing an early entry replays the later ones. A relative event (`spend-slot`, `add-condition`)
composes correctly. An absolute one (`set-hp current: 14`) does not, because it pins the value it
was given. So the hot paths move to intention events as they are wired: `take-damage { amount }`,
`heal { amount }` and `gain-temp-hp`. The absolute kinds stay for corrections and manual edits.

## Language-neutral entries

Entries store ids and params, never translated text: a source is a `LocText` of kind `srd`,
`ui` or `custom` (what a player typed), localized at render. `{ lit: { en, it } }` is not
written by new entries. The `lit` text already stored (turn-economy actions in `combat/state`,
Chronicle entries, e.g. monster action names) converts to ids in the same owner-gated migration
as step 5 (snapshot → dry-run → idempotent apply → verify), not in a separate one; readers keep
accepting it until then.

## Relation to the session log

The session log (`src/lib/session-log/`) is the table's narrative for the report. It stays. A
character's entries are the source its lines are derived from, so the two records stop
disagreeing.

## Steps (each shippable, nothing visible until the last)

1. **Types and fold.** `src/lib/play/play-log.ts`: the entry union, `effectiveEvents` and
   `foldPlayLog`, with tests. No wiring.
2. **Shadow mode.** The store appends an entry next to every write it already does. A dev-only
   check asserts `foldPlayLog(checkpoint, entries)` equals the live session. Parity first.
   Done: `src/lib/play/play-log-shadow.ts`, wired into `characterStore.dispatch` in dev only.
   A write outside `dispatch` starts a new checkpoint; a snapshot undo of an older event (it
   also drops the later ones) warns as a mismatch, which is what step 4 fixes.
3. **Intention events** for damage, healing and temporary HP, so undo replays correctly.
   Done: `take-damage`, `heal` and `gain-temp-hp` in `sheet-events.ts`. The store's heal and
   temp HP dispatch them; its damage records its hit in the shadow (the command undo stays).
   Parity ignores the session log's narrative lines, which the store writes next to them.
4. **Undo through the log.** The undo stack becomes `undo`/`redo` entries. Done for
   `dispatch` in development: its undo appends an `undo` entry and the sheet becomes the fold,
   but only when the log reproduces the live sheet (the shadow's parity); otherwise it restores
   today's snapshot. The difference shows on an older action's undo: only that event goes,
   later ones stay. Production keeps the snapshot until the owner turns it on. Undo survives a
   reload only once the entries are stored (step 5).
5. **Storage.** One Firestore document per entry, plus a periodic checkpoint for fast load.
   It needs a migration, so snapshot → dry-run → apply, with the owner's yes.
