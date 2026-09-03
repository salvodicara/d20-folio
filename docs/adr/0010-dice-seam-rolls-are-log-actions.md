# ADR-0010: Rolls are log actions with provenance; randomness for dice lives in one seam

**Date**: 2026-09-03
**Status**: accepted (owner steering, 2026-09-03)
**Deciders**: owner (steering: dice in-app by default, physical dice always allowed, hidden DM rolls; constitution §2.2; golden rule 32), architecture round

## Context

The v1.0 product never rolled: every die was a face entered by a person. The steering reverses
that: the app rolls by default with a shared animation, each person may enter real dice instead,
the DM may roll hidden, and every roll must be reviewable and correctable. The engine is a pure
reducer over an append-only log folded identically by every client (ADR-0001/0002), so the roll
has to be data the fold can trust without a server.

Evidence (giants' shoulders, golden rule 30): Foundry VTT's `Roll` keeps the formula, the parsed
terms, every die's result and the total, serializes with `toJSON`/`fromData`, and draws from a
seeded Mersenne Twister; its roll modes are Public, GM (roller and GMs see it), Blind (only GMs)
and Self. Roll20 has `/roll`, `/gmroll` (GM and roller see it) and `/sr` (GM only). D&D Beyond's
Game Log records who rolled, for what, the result with modifiers, and supports secret rolls.

## Decision

- A roll is a `roll` action in the encounter log:
  `{ formula, faces, total, seed, source: "app" | "manual", hidden, roller, purpose, label }`
  plus the envelope every action has (`id`, `seq`, `by`).
- The formula grammar is the Foundry/Roll20 subset the table needs: `NdS` with `S` in
  {2, 3, 4, 6, 8, 10, 12, 20, 100}, `khN`/`klN`, signed integers; at most 100 dice per roll.
- An `app` roll draws one 32-bit seed and derives its faces with a pure, pinned generator
  (mulberry32) inside the engine; every client re-derives the faces in the fold and rejects a
  roll whose faces or total do not match (`invalid-roll`). A `manual` roll carries the faces the
  person read off real dice and `seed: null`.
- Randomness for dice exists in exactly one module, `src/lib/dice.ts` (`roll(formula, { by,
roller, reason, hidden, mode, faces })`); a guard test pins every other call to a random
  source in `src/` as an id or a non-dice seed. `src/lib/combat` stays free of randomness.
- `hidden` follows the GM-roll pattern: the faces are visible to the DM and to the roller and
  concealed from everyone else by the presenter; a player's own roll is never hidden from them
  (constitution §2.2). There is no blind roll.
- Intents answer a `d20`/`dice` input with the roll's action id; the reducer reads the total
  from the folded `state.rolls`; undoing a roll makes the dependent intent re-validate as
  `missing-answer`. Golden replays feed recorded rolls (faces or seeds) through the same path.
- The shared 3D animation is a later stage; it renders the faces the log already holds.

## Alternatives Considered

### Alternative 1: Faces inside the intent's answers (no roll action)

- **Pros**: one action per attack; smaller log.
- **Cons**: no log line per roll, no hidden DM roll without a consequence, no propose-and-confirm
  between the roll and the verdict, no provenance on a physical die.
- **Why not**: the steering makes the roll itself the reviewable fact.

### Alternative 2: Hidden faces in a DM-private document

- **Pros**: players cannot read hidden faces through the raw API.
- **Cons**: player clients could not fold the consequences of a hidden roll; the fold would
  diverge or need a server to filter.
- **Why not**: one log, one fold, no gameplay server (ADR-0002/0005); trust at the table.

### Alternative 3: Server-side or third-party random source (a "verified roll" service)

- **Why not**: cost, latency, offline; a seed in the log gives the same reviewability for free.

## Consequences

### Positive

- Every roll is a line in the log with who, what, how and the numbers; a physical die and an
  app die are the same fact to the engine; replays are exact.

### Negative

- A hidden roll's faces are readable by a member who inspects the raw document (accepted, as
  forged actions are).

### Risks

- Changing the generator would invalidate stored seeds → the generator is pinned by a snapshot
  test and never changed; a new generator would be a new `source` value.
