# The session narrative (re-foundation phase 3)

Owner ask, 2026-10-16: the campaign log merges every member's actions into one session story,
"who did what, round by round", which the table can customise: edit, hide and reorder lines.
Phase 3 owns the record and this data shape; Phase 1 owns the UI.

## The record

One session log per campaign session (`src/lib/session-log`). Every member appends `LogItem`s.
Overrides are items too, appended like everything else, so history never changes and every device
folds the same story:

| Item                             | Effect on the narrative                          |
| -------------------------------- | ------------------------------------------------ |
| `event`                          | a line                                           |
| `correct { target, event }`      | edit: the line now says `event` (existing)       |
| `retract { target }`             | strike: the line is gone for good (existing)     |
| `hide { target }` / `show`       | take the line out of the story, or bring it back |
| `move { target, after \| null }` | place the line after another one (`null`: first) |

Who may: the line's author or the DM, as for corrections. The lines that give the story its shape
(encounter start, round start, encounter end) are never hidden or moved. A move whose anchor is
unknown, or is the line itself, changes nothing.

**Order is server arrival**, never device clocks: the array's order today, `serverAt` for the
one-document-per-item shape (`docs/architecture/session-log-per-event.md`). Moves apply in log
order on top of it, and a moved line's round follows its new place.

## The data shape (for the UI)

- `foldSession(items, { dmUid })` returns `SessionEntry[]`, the story as it reads, with hidden lines
  left out. Each entry has `id`, `by`, `at` (display only), `event`, `corrected`, `encounterId`,
  `round`, and `moved: true` when it was placed.
- `foldSession(items, { dmUid }, { includeHidden: true })` is the editor's view: hidden lines are
  kept and carry `hidden: true`.
- `buildReport(entries)` turns entries into `ReportSection[]`: the play outside fights, and each
  encounter round by round (`rounds: { round, entries }[]`), for the per-round report and the copy
  export.

A reader older than the overrides drops `hide`, `show` and `move` items, so it shows the story
unedited. The rules accept them in the session array (members append only their own). When the
per-item subcollection (#321) lands, its rule takes the same item types.

## Play outside a fight: scenes

Owner, 2026-10-16: exploration, rests, rituals and downtime are part of the story too. Lines
outside a fight are recorded like any other (the sheet records whether or not an encounter runs),
and the report groups them into numbered **scenes**, as a fight is grouped into rounds. A scene
starts at the session's first line, at a `scene-start { title? }` line (a structural line like a
round's start: never hidden or moved), after a rest and after a fight. Each scene carries the time
of its first line (`startedAt`, display only). The export heads it `## Scena 2: Il ponte · 21:40`.
Writing `scene-start` from the UI is Phase 1's (`recorder.record({ kind: "scene-start", title })`).

## Session notes in the same timeline

Owner workflow, 2026-10-16: during the game the DM writes free notes; afterwards the notes and
the action log go together into an AI that writes the journal, read aloud next session. So notes
are lines of the same log, not a separate document:

- A note is a `note` event (`{ kind: "note", text, actor? }`, existing), appended when written.
  It lands where the server receives it, between the actions of its round, and it can be corrected,
  hidden or moved like any line. `foldSession` and `buildReport` need nothing new.
- The copy is the one export: `renderSessionReport(sections, title, t, names, { notes })` writes
  the session page's free text first (the notes kept on `campaigns/{id}/sessions/{id}.notes`,
  which stay readable), then the round-by-round story, notes included (#332). Markdown, ready to
  paste; there is no AI in the app.
- For the UI (Phase 1): the note box writes `note` events through the recorder during play; the
  page's text field remains for notes written after the game.

## Not yet

- The writer: recorder helpers and the editor UI (Phase 1).
- A line's free text edit is a `correct` to a `note` event; the UI decides how to offer it.
