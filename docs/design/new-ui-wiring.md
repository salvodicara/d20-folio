# New-UI wiring list (2026-10-25)

Pure-core seams that are on `main`, tested, and wait for an approved screen. They are not
wired into today's UI (owner 2026-10-24: today's UI is to be thrown away). When a screen is
approved, wire its rows from here and strike them. Anything a player or the DM sees goes to the
coordinator before merge. Rules-by-rules status lives in `docs/RULES_COVERAGE.md` ("UI
pending"); this is the engine side's to-do for the screens.

## Play (board 01) and the cast dialog (board 22)

- `playbookView(doc, locale, context?)`: the "Cosa ti conviene fare" block (`plan` 2–4 lines,
  `steps` all). Copy approved by Direction (#434).
- `castPreview(doc, spellId)`: levels with what is left (spent levels greyed), scaled dice,
  darts, targets, healing, economy, Concentration ending (#415).
- `castPlan(doc, action, execution)`: what a spell tap leads to (#416).
- `activateActionState(action, level, { weapon, damageType })`: the weapon the cast names
  (Magic Weapon, Shillelagh); the picker comes from `eligibleBindingWeapons` (#426).
- `resourcesView`, `restPreview`, `actionFilterCounts` (#411–#413).

## Damage tray and turn

- Tray row `outcome` (`revive` / `threshold`, #419). Still owner-gated: revive spells don't
  open "On whom?" (`shouldResolveCombatAction` lacks `revives`); Power Word Stun has no tray.
- `takeRider(effect, facts, source)` and `summary.effectRiders` (#446).
- `burningTurnStart(doc)`: a turn-start prompt (1d4 Fire), EN + IT copy to design.
- `runEndTurn(ports)` for any End Turn button (#428).
- Rules session (#453): the store logs `sheetEventLogEvents(...)` after a sheet event
  (Exhaustion, slots spent or regained, Heroic Inspiration; new `set-inspiration` event),
  removing those lines before its undo. Visible in the combat log.

## Sheet

- Inventory attunement → `attuneItem` / `unattuneItem` (`canAttune` blocks a 4th or a duplicate;
  `force` after a confirm) (#454).
- Speed tip → `sheetNumbers().otherSpeeds` (burrow, fly, swim, climb; explained and pinnable)
  (#454).

## Encounter (DM)

- Sanctuary on an ally: `effectIdsEndingOnAct` → revoke the effect with its undo (#418).
- Swarms: a rule-driven monster heal (`regenerationTurnStart`, a tray heal on a monster) goes
  through `swarmHealing` / `swarmTempHp`; the DM's manual HP editor stays free (#451).
- Add a summon → `linkSummon` (the `summons` writer is held); Begin Turns already orders by
  `summonedTurnOrder` and `mountedTurnOrder`.
- `multiattackPlan`, `monsterMovementFeet`, monster uses / recharge (Rules session).

## Campaign Diario (owner 2026-10-26, board q38)

- One page per session, as in World Anvil / Kanka / Foundry journals: the pasted AI chronicle
  on top ("Cronaca della sessione", editable), the automatic session report with the
  hand-written notes woven in below, one "Copia" (report + notes). The list on the left has
  the sessions and "Tutta la cronaca". No separate Cronaca tab, chapter UI or recap view.
- Data safety: today's campaign Chronicle (one shared Markdown document, `Chronicle.tsx`)
  stays intact and readable under "Tutta la cronaca" from day one, kept verbatim as an
  imported "Cronaca precedente" entry. Splitting it into per-session pages is a live-data
  migration: snapshot → dry-run → owner yes → idempotent apply → verify (`live-data-migration`).
