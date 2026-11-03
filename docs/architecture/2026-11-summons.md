# Summons with a lifecycle (2026-11-03)

Edge-case family M6 ([edge cases](2026-11-edge-cases.md)). The rules session owns the catalogue
(`CompanionStatBlock.lifecycle`, scalars, actions as Activities). This lane owns the instances: which
summons are on the field, and when they end.

## Today

A companion's presence is inferred, never recorded:

- A class feature's companion (Steel Defender) always shows.
- A Concentration spell's creature shows while the caster concentrates on it.
- Any other spell's creature (Find Steed) shows whenever the spell is prepared, even if it was never
  cast and even at 0 HP.

So Find Steed never vanishes at 0 HP, and a Beast Master's beast never dies. Its catalogue end-rules
(`lifecycle.endsOn`) have no reader.

## The model

A new optional session key, `summons`, keyed by the spell or feature that made the summon:
`{ [sourceId]: { castLevel?, fallen? } }`.

- **What the key holds.** Presence and the cast level for a non-Concentration spell's summon, and
  `fallen` for a companion that died and can come back (`0-hp:dies`).
- **What stays where it is.** HP, the chosen variant and the count stay in `companionHp`,
  `companionVariant` and `companionCount`. A v0.25 client keeps reading and writing them, so both
  clients share every number. A v0.25 client keeps `summons` verbatim as an unknown key and ignores it.

Presence (`summonPresent`), by the catalogue's `lifecycle.endsOn`:

- `concentration`: on the field while the caster concentrates on the source (unchanged).
- Any other spell: on the field when `summons[source]` exists and hasn't fallen. A session with no
  `summons` key at all (every document written before this change) keeps today's rule: present
  whenever prepared. No stored steed disappears on update.
- A class feature: on the field unless fallen.

Ending (the play functions, so every path ends it):

- `0-hp:vanish`: at 0 HP the summon and its HP entry go. Find Steed; Find Familiar's own record.
- `0-hp:dies`: at 0 HP it is `fallen`. The card stays, with its revive.
- `long-rest`: a Long Rest ends it.
- `owner-death`: the caster's death ends it.

Casting a non-Concentration summon records it at full HP with its cast level (`summon-companion`).

## Order

1. Instances: the key and its codec, presence, cast, and the ends above. Find Steed and Find Familiar
   flip in the conformance suite.
2. Revive (the catalogue's `revive`), `timer` and `damaged` ends, and Antimagic suppression.
3. Companion actions as Activities, once the rules session lands `CatalogueActivity`, plus the
   `speed-zero` and conditional-condition effects.

## Compatibility

`summons` is a new optional session key: no migration. A v0.25 client keeps it verbatim and ignores
it, so on that client a fallen companion or a vanished steed still shows. The numbers stay shared.
