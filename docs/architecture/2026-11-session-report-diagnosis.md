# The automatic session report: diagnosis (2026-11-12)

The owner writes his recaps from the session report: players tap their buttons and spend
their resources, and the app works out whether a fight is on and writes who did what. This
maps how the report is made today, what it misses, ranked by how much each miss hurts a
recap, and the spec proposed from the reference tools. Code references are to `main` at
`ee2e42a25` (verified by reading the code; counts in production come from
`scripts/survey-session-reports.ts`, run by the coordinator).

## How it works today

- **Lines.** Each gesture is one `PlayEvent` appended to the session
  (`src/lib/session-log/types.ts`). The player's device writes its sheet's events through
  `useSessionLogPlayerRecorder` (`combatEventToPlayEvent`, `character-events.ts`): actions
  and casts, damage taken, heals, temporary HP, conditions, concentration, death saves,
  rests, time passing. The DM's device mirrors the fight's chronicle (`encounter-mirror.ts`):
  damage it booked, heals, downs, conditions, grants, stat changes.
- **Fights.** A campaign fight starts at the first initiative roll
  (`encounter-lifecycle.ts`) and ends only when someone presses End (`endCombatNow`).
  `encounterEndReason` knows "all enemies down" and "idle for 60 minutes", but only to
  suggest the button (`fight-controls.ts:55`). The fight's `encounter-start`,
  `round-start` and `encounter-end` lines are written only by the DM's device while the
  campaign page is open (`useSessionLogMirror`, mounted in the campaign hub and the new
  campaign screen).
- **The report.** `foldSession` applies corrections, then `buildReport` splits the
  session into "outside a fight" and one section per fight, by round
  (`report.ts`); `renderSessionReport` writes the text. The live fight feed folds a
  player's declared hit into the nameless damage it caused (auto-attribution,
  `encounter-feed.ts`); the written report does not.

## What it misses, ranked by harm to a recap

1. **Fights that are never closed.** Nothing ends a fight but the End button. A fight the
   DM forgets runs on in the report until the next start or the end of the session, so
   exploration and the next scene land inside "Fight N". Survey: `fightsNeverClosed`.
2. **Fights the report cannot see.** The fight and round markers come only from the
   DM's open campaign page. With the page closed, or the DM on the sheet, the players'
   lines carry their own round stamp only while the sheet knew the fight, and otherwise
   fall in "outside a fight". Survey: `sessionsWithoutMarkers`, `eventsOutsideFight`.
3. **"Who struck?" left open in the written report.** The DM's damage lines without an
   attacker stay nameless in the report even when a player declared the hit. The live
   feed already resolves them; the report never applies the same rule. Survey:
   `damageWithoutAttacker`.
4. **Resources spent by hand leave no line.** Spell-slot pips, class resources (Rage,
   Bardic Inspiration, Ki, Channel Divinity), Exhaustion and Heroic Inspiration change the
   sheet without a line: `useSpellSlot`, `useTracker` and `setExhaustion` only
   `dispatch`, and the line builder for them (`src/lib/play/resource-log.ts`) is
   used by its test alone. A player who taps a pip instead of the action button leaves
   nothing to recap.
5. **Detail lost on casts and attacks.** The cast's slot level and the attack's result
   reach the log only when the damage tray sets them (`character-events.ts:23-31`), so
   "Lara cast Healing Word" never says at which level, and a miss with no damage leaves
   no result. Survey: `actionsWithoutOutcome`.
6. **The DM's monsters do not act.** A monster's attack is recorded as the damage it dealt
   (or a condition), never as an action, so "the Goblin's Scimitar missed Lyra" is
   absent.
7. **Rolls outside an action.** A player's own initiative roll, saving throws, ability
   checks and a successful Concentration save write nothing (only death saves and the
   initiative the DM rolls for missing players do).
8. **Money and loot.** Buying, selling, picking up coins and items write no line.
9. **Solo fights.** A player's solo fight writes no markers, so its lines sit outside any
   fight.

No noise problem was found: markers are not shown, corrections apply silently, a second
device's duplicate line is dropped by its id.

## How the reference tools do it (the model to copy)

- **BG3 combat log**: one line per action, actor → target, with the result and the
  numbers ("Shadowheart: Guiding Bolt → Goblin: hit, 14"); combat starts with hostility
  and ends by itself when no hostile is left standing.
- **Foundry VTT chat log + combat tracker**: every roll and item use is a chat card
  (attacks, damage, saves, checks, initiative, spells with their slot); the GM ends the
  combat, the tracker announces rounds and turns.
- **Roll20 chat + turn tracker**: every roll in chat with its roller; the tracker holds
  the order, rounds are the GM's.
- **D&D Beyond game log**: every roll a character sheet makes (attack, damage, save,
  check, initiative) posted with the character's name; no fight grouping.

Common model: every roll and every spend a sheet makes is a line with its actor; an
attack is one line with its result; a fight is bounded by initiative and by the GM's end
or the last enemy down.

## Proposed spec (tickets, in order)

Pure logic, no new visible surface (the report text gains lines in its existing style),
merge on green:

1. **The report closes a forgotten fight.** At read time a fight's section ends at the
   first of: its `encounter-end`, the moment all enemies were down, 60 minutes without
   activity (`encounterEndReason`), the next fight's start. Nothing is written; the live
   fight is untouched.
2. **The report applies auto-attribution.** `buildReport` runs the live feed's rule, so a
   declared hit names the attacker on the damage it caused and the two lines become one.
3. **Spends by hand are lines.** Wire `resource-log.ts` into the store after the sheet
   event (spell-slot pips, Exhaustion, Heroic Inspiration), retracted on undo, as its own
   doc describes.
4. **Initiative rolls are lines.** The player's own roll writes the existing
   `initiative` line, as the DM's roll already does.

Through the coordinator and the direction lane (new line kinds or new wording the player
sees):

5. **Class-resource spends** ("Lara used Bardic Inspiration"), a `resource-spend` line.
6. **Fight markers without the DM's page**: the encounter's start, rounds and end derived
   from the stored encounter, so every device's lines land in their fight.
7. **The cast's slot level and the attack's result** on the action line.
8. **Monster actions** as action lines from the DM's monster tray.
9. **Saves and checks** rolled on the sheet; **money and loot** lines.
