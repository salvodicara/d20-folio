# New-UI build plan (2026-10-26)

How the new screens get built once each is approved. Planning only: no UI code before a screen's
board is approved (direction row 2) and its prototype video is accepted (row 20). Sources: the
direction rows 1–22 (`docs/strategy/2026-10-23-direction.md`), the approved design decisions below,
the engine seams in `docs/design/new-ui-wiring.md`, the target layout in
`docs/strategy/2026-10-16-target-architecture.md`.

**Approved so far (2026-10-25):** one panel family (one box and header type, a colour bar, no icons
in titles); the character header with gold corners only (no frieze); the five premium rules (no box
in a box, two button types, colour only with a meaning, text at least 12 px, an 8 px grid); the phone
copies D&D Beyond's phone exactly; game-icons.net icons where an icon carries a meaning; the Diario is
one page per session (q38).

## How the new UI ships beside the old

The new screens live in `src/ui/` (design system) and `src/domains/<area>/ui/` (screens), behind
one flag (`VITE_NEW_UI`, plus a per-user preview switch). Today's UI stays live and untouched until
the switch. Each screen reads the core only: view models and store actions, never the old
components. A route moves to the new screen when that screen passes its acceptance video.

## 1. Design-system slice first (M)

`src/ui/`: tokens (colour per meaning, the 8 px grid, the type scale from 12 px), panel and its
header, the two button types with hover glow, press sink and focus ring (row 21), tabs, the game-icons
set (one sprite, named by meaning), chips, the HP ring (row 7). One story route (`/ui`, dev and
preview only) shows every piece in light and dark, EN and IT, desktop and phone, and Playwright
screenshots pin it. Everything after this slice uses only these pieces; no screen restyles a
primitive.

## 2. Screen order and dependencies

| #   | Screen                                                         | Needs                                 | Size |
| --- | -------------------------------------------------------------- | ------------------------------------- | ---- |
| 1   | Character header + Play, desktop (three columns, row 22)       | design system                         | L    |
| 2   | Play, phone (D&D Beyond phone model)                           | 1 (same view models, own layout)      | M    |
| 3   | Combat: turn strip, initiative over the log, damage tray, cast | 1                                     | L    |
| 4   | Spells (prepared side panel, cast dialog, board 22)            | 1, cast dialog from 3                 | M    |
| 5   | Items + treasury (one owner per coin and item, row 15)         | 1                                     | M    |
| 6   | Campaign (Gruppo · Scontro · Diario · Tesoro · Note) + Diario  | 3 (Scontro), 5 (Tesoro)               | L    |
| 7   | Compendium (filters · list · detail)                           | design system                         | M    |
| 8   | Lists (roster, campaigns)                                      | design system                         | S    |
| 9   | Creation (DDB 2024 order) + Level-up ("step 1 of 3")           | 7 (pickers reuse the compendium list) | L    |
| 10  | Settings, account                                              | design system                         | S    |

## 3. What each screen wires (from `new-ui-wiring.md`)

- **Play (1–2):** `playbookView`, `resourcesView`, `restPreview`, `actionFilterCounts`, the
  resource log lines (`sheetEventLogEvents`), `sheetNumbers` incl. `otherSpeeds` for the speed tip,
  `runEndTurn` for End Turn.
- **Combat (3):** the damage tray with row `outcome` (revive and threshold; revive's "On whom?" and
  Power Word Stun's tray still need the owner's gate), `takeRider` and `effectRiders`,
  `burningTurnStart` as a turn-start prompt, `castPlan` + `castPreview` for the cast dialog.
- **Spells (4):** `castPreview` (spent levels greyed), `castPlan`, the weapon picker for Magic
  Weapon and Shillelagh (`eligibleBindingWeapons` → `activateActionState(…, { weapon })`).
- **Items (5):** the attunement guard (`attuneItem` / `unattuneItem`, `canAttune`, `force` after a
  confirm), the item-resource controller (`createItemResourceCommands`).
- **Campaign (6):** Sanctuary on an ally (`effectIdsEndingOnAct` → revoke with undo), swarm heal
  and temp HP through `swarmHealing` / `swarmTempHp` on rule-driven heals, add a summon →
  `linkSummon` (writer held), `multiattackPlan`, `monsterMovementFeet`, monster uses and recharge.

## 4. Parallel lanes

Three sessions can build at once after the design-system slice, each in its own folders:

- **Lane A, sheet and play:** `src/domains/play/ui/`, `src/domains/character/ui/` (screens 1–5).
- **Lane B, campaign and journal:** `src/domains/campaign/ui/`, `src/domains/chronicle/ui/`
  (screen 6, then the Diario).
- **Lane C, catalogue and onboarding:** `src/domains/compendium/ui/`,
  `src/domains/character/ui/creation/`, lists, settings (screens 7–10).

Shared files have one owner each, to avoid clashes: `src/ui/` belongs to the design-system session
(a lane asks for a new primitive, it doesn't add one); `src/app/router.tsx` gets one small PR per
route switch; each screen has its own i18n shard (`src/i18n/{en,it}/ui/<screen>.json`), EN and IT
in the same PR; a store change goes through the engine session.

## 5. Release checklist (the new UI's first deploy)

1. **Item-resource migration:** `scripts/migrate-item-resources.ts` through the
   `live-data-migration` skill (snapshot → `--check` → owner's yes → `--apply --backup` →
   `--check` green). `deploy.yml` refuses to promote while anything is pending.
2. **Chronicle kept verbatim:** every stored session log and combat chronicle entry reads and
   shows as before in the new Diario; nothing is rewritten. A test renders real exported logs.
3. **Held writers:** the readers ship now; each writer turns on in a later release, once v0.25.0
   clients are gone (list in `docs/release/v0.26.0-draft.md`: `homebrewId`, `magicJar`,
   `provisions`, `burning`, multi-language homebrew text, encounter `summons`).
4. **Preview channel:** a Firebase Hosting preview channel tested with copies of real characters.
   Copying real data is a live-data step, so it needs the owner's yes and stays in the private
   project.
5. **Videos:** an acceptance video per screen (row 20), in Italian, before the switch.
6. **Owner's yes** for the deploy, then the `deploy` skill.

## 6. Rough sizes

S: up to a day of one session. M: two to four days. L: a week. Totals: the design system M,
screens 2 S + 4 M + 4 L (L: screens 1, 3, 6 and 9). With three lanes that is about three to four weeks
after the design-system slice, video gates included.
