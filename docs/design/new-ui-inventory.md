# New UI vs the classic sheet: verified inventory (2026-11-23)

What each classic capability has in the new UI (`VITE_NEW_UI`, `src/domains/**`) on `main` at
2323e5abe. "Present" means a control that the screen the router uses under the flag actually
mounts. A model with no mounted control counts as missing. This replaces the 2026-11-09 code
inventory in `docs/release/v0.26.0-draft.md` («Parità della nuova interfaccia»). Play prompts are
pinned by `tests/unit/play-parity.guard.test.ts`, which now fails when a «pending» row's model is
already used on screen, or when a «covered» module is not mounted.

Plan for 12-05 (coordinator, 2026-11-23): player path only; the DM stays on the classic sheet;
players opt in one by one with the per-user toggle (#1233).

## Character sheet (Play screen)

| Capability                                                    | New UI                                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Every classic Play prompt (turn, fight, 0 HP)                 | Present, except the partial rows below (parity guard)                                         |
| Heroic Inspiration, Bardic die                                | Present: `PlayInspiration`                                                                    |
| Rest re-pick of grant bundles                                 | Present: `PlayRestSummary`                                                                    |
| Re-pick maneuvers/metamagic/invocations                       | Missing (classic `ChoiceRePicker`)                                                            |
| Wish follow-up                                                | Partial: the note only (`PlaySoloTurn`), no duplicate or Wish Stress buttons                  |
| Rage upkeep, Stand up, extra turn, Time Stop                  | Present: `PlaySoloTurn`, solo and campaign; extra turn and Time Stop solo-only, as on classic |
| Defenses                                                      | Partial: show, temporary add/remove, re-pick (`PlayDefenses`); no permanent edits             |
| Undo                                                          | Partial: «Annulla» on each action's toast; no redo, no ⌘Z                                     |
| Edit mode (scores, AC/HP max/init overrides)                  | Missing                                                                                       |
| Features & Traits tab                                         | Missing                                                                                       |
| Bio (portrait edit, story, alignment, languages)              | Missing (portrait shown read-only)                                                            |
| XP                                                            | Missing (read only for the "level up ready" note)                                             |
| Resource notes and conversions                                | Missing (one slot→tracker refill exists)                                                      |
| Proficiencies (armor, weapons, tools, languages), skill edits | Missing (skill proficiency dot only)                                                          |
| Senses and other speeds                                       | Partial: walking speed only                                                                   |
| Items: quantity, equip, remove                                | Present: the item pane (`PlayItemPane`), opened from the item's name                          |
| Items: add from the catalogue                                 | Present: «Aggiungi un oggetto» (`PlayAddItem`), the Compendium's own list                     |
| Items: custom (homebrew) item, sell                           | Missing                                                                                       |
| Coins: add, take                                              | Present: the coin pane (`PlayCoinPane`), opened from the coin row                             |
| Add spells, custom spells, wizard spellbook copy              | Missing (prepare and cantrip swap exist)                                                      |
| Share, PDF, snapshots history                                 | Partial: JSON export from the roster only                                                     |
| Playbook editing, situational rules reference                 | Missing (playbook is read-only)                                                               |

## Characters, creation, level-up

| Capability                                                       | New UI                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Roster: open, clone, JSON export, delete, import                 | Present (import reuses the classic host)                                    |
| Roster: search, multi-select, retire/restore, PDF, free-plan cap | Missing                                                                     |
| Creation: Expertise                                              | Present (Equipment step)                                                    |
| Creation: start above level 1, subclass, rolled HP, alignment    | Missing                                                                     |
| Creation: hand-pick languages, skills, class spells              | Missing (filled by the ready-made template)                                 |
| Creation and level-up: exit confirmation                         | Missing                                                                     |
| Level-up: list search                                            | Present when a list has more than 12 options                                |
| Level-up: phone layout                                           | Present (one column at ≤760 px, sticky summary bar); not yet e2e on a phone |
| Level-up: multiclass into a new class, Wizard 18/20              | Hands off to the classic wizard (`/level-up/classic`)                       |
| Level-up: subclass-spell preview                                 | Missing                                                                     |

## Campaign (the DM stays on classic for 12-05)

Player side, present: roll in with your own initiative (from the sheet or the Fight tab), the turn
order, pass a turn, the session report and its text. Linking a character to a campaign is missing:
a character linked before (classic) stays linked and plays normally (`FightTab` reads the stored
`memberDetails`); a new link needs the classic sheet, which the per-user toggle (#1233) allows.

DM side, of the 20 classic capabilities checked:

- Present (1): share the invite link.
- Partial (5): campaign image and next session (read-only), session text editing (no chronicle
  versions or .md download), pick saved homebrew monsters (no create or delete), join a fight
  (no skip).
- Missing (14): rename, admin on every campaign, «L'ultima volta», lock joins, pass the DM role,
  remove a member, delete the campaign, party summary, create or delete a session, NPCs and
  ally/foe, hide monsters or their HP, reorder the turns, the monster sheet, the end-of-fight
  write-up (past fights are listed).

The campaign list and the DM's member sheet are new screens too.

## Other screens

New: Settings (language, account, sign out, admin link; no data export/import/delete account),
Join, Shared view, Legal, 404. Classic: Login, Admin.
