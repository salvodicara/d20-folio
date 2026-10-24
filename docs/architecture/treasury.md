# Treasury: one owner per coin

Owner direction 2026-10-23, row 15: every coin and item has exactly one owner, a
character or the party chest. Found loot goes to me, to the chest, or is split. Every
move is logged, and no total is ever overwritten by hand. The campaign is a view.

## Today

- The chest is `campaigns/{id}.treasury` (coins only) with `treasuryLog`. Its add and
  take are atomic deltas (`campaign-io.ts`), but a take can be typed by anyone and
  nothing ties it to a character.
- Each character's coins are `session.currency` and its items its equipment. The
  campaign does not see them.

## The model (`src/lib/treasury.ts`, pure)

- **Owner**: `{ kind: "character", characterId }` or `{ kind: "chest" }`.
- **Move**: `{ id, from, to, coins, by, at, note }`, where `from` is an owner or
  `found` (into the party) and `to` an owner or `spent` (out of it). A move never takes
  more than its owner holds, never moves a negative or empty amount, and never changes
  coins into other coins. There is no "set": a correction is a move back.
- **Loot**: `lootMoves` turns found coins into moves, all to one owner or split. A
  split divides each coin evenly and gives what doesn't divide to the chest.
- **View**: `campaignHoldings` is the chest, each member's purse, and their sum.
- **Items** (next step) follow the same move, carrying an item instance id instead of
  coins; the chest gets an item list next to its coins.

## Where the coins live (proposed, for the wiring step)

Each owner's balance stays where it is today, so solo characters keep working and the
stored data needs no rewrite: a character's purse in its own sheet, the chest in the
campaign. A move touches the two owners' documents:

- **Character ↔ chest**: the moving player writes both in one transaction (they may
  write their own sheet and, as a member, the chest delta). The move id is logged on
  both sides: the character's play log and the campaign's treasury log.
- **Character → character**: a player cannot write another's sheet. The coins leave
  the giver's sheet and the campaign carries the delivery; the receiver's own client
  applies it once by id (the same pattern as `EncounterState.memberEffects`).
- **Rules**: the chest may then only change by a logged move whose id is in the log
  (no free overwrite), enforced in `firestore.rules` with emulator tests.

## Migration

None for coins: today's chest balance is the chest's opening holding and
`treasuryLog` stays as its history. Any change to stored data (a new log shape, chest
items) goes through `live-data-migration` with the owner's yes.

## Open for the owner

- A split's leftover goes to the chest (proposed) or to whoever found it?
- Should a split break coins into change (1 gp → 10 sp) so it divides exactly, or keep
  each coin whole as proposed?
