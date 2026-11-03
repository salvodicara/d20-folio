# Trigger rules (2026-11-03)

Edge-case family M8 ([edge cases](2026-11-edge-cases.md)): one `on event → do, with limit`
grammar in place of a grant kind per trigger.

## The grant

`{ type: "trigger", on, do, limit? }`:

- `on`: the event. Today `initiative` (rolling Initiative) and `short-rest`.
- `do`: the action. Today `restore-tracker`: regain uses of `trackerId`, all of them (`full`) or
  `amount` (a tracker formula, read at the owning class's level).
- `limit`: `{ per: "long-rest" | "short-rest", max }`. Its counter is the session tracker keyed by
  the source id, or the feature's own tracker when it has one (Sorcerous Restoration). The rest that
  `per` names resets it, like any tracker.

A rule fires only when it would change something, so a full tracker spends no limit.
`firedTriggerRestores(doc, on)` is the one reader. Initiative feeds `getInitiativeTrackerTopUps`
and the store's top-up (which spends the counters). The Short Rest is `shortRestCharacter`.

`upkeep-waiver { activeKey }` is a maintained state that needs no End Turn upkeep (Persistent Rage).

## Using it

- Persistent Rage: on Initiative, regain every Rage use, once per Long Rest. Rage needs no upkeep.
- Sorcerous Restoration: on a Short Rest, regain up to half the Sorcerer level in Sorcery Points,
  once per Long Rest. It happens by itself; its own tracker shows it was used.

`initiative-tracker-topup` stays readable (stored homebrew may carry it) and keeps feeding the same
reader.

## The vocabulary (authored ahead, read as families land)

- `on`: initiative, short-rest, long-rest, turn-start, turn-end, reduced-to-zero, d20-test-failed,
  cast-spell, damage-dealt.
- `if`: school, slot (a slotted spell), target `marked` (the creature your effect marks), within
  (feet), by `any-creature`.
- `do`: `restore-tracker`, or `offer { actionId }` (Hunter's Mark moving).
- `limit.per`: long-rest, short-rest, turn, round.

The runtime reads only what this doc lists under "The grant". A rule using the rest of the
vocabulary is valid data and inert until its reader lands.

## Offers

`firedTriggerOffers(doc, on, facts)` returns the actions the `offer` rules on an event put in
front of the player: Hunter's Mark and Hex's "move-mark" when the creature that dropped is the
marked one (`facts.targetMarked`). Every field of a rule's `if` must match a fact the caller
gives (`targetMarked`, `school`, `slot`, `distanceFt`), and a spent limit offers nothing.

## Next

More events and actions as their cases come: a creature reduced to 0 (Hunter's Mark moving, kill
attribution), damage dealt (Guardian of Faith's 60-point budget), and a Long Rest losing the
created slots (Font of Magic).
