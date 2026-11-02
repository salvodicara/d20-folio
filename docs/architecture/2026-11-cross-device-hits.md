# A hit from another device (2026-11-02)

**Problem.** When the DM (or an ally) damages a PC, their device writes the PC's combat roots in
one transaction, through the PC's own damage rule (`peerDamageState`, #535). Some rules also
spend something on the PC's sheet: an Arcane Ward absorbs and fills, a claimed Uncanny Dodge or
Death Ward is used up. Those live in `playState`, which the rules protect from peers byte for
byte. Today such a hit leaves them out (`fromPeer`, #555), so the ward and the dodge do nothing
against the DM. This is the shared root of the M1, M4 and M7 limits
([edge cases](2026-11-edge-cases.md)).

## Options

| Option                                       | Works offline target                      | Rules                                                      | Cost                                                                            |
| -------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A Function resolves every hit                | yes                                       | none                                                       | the whole rules engine and the private pack on the server; a cold start in play |
| The target's own client resolves queued hits | **no**: a sleeping phone stalls the table | an inbox                                                   | small                                                                           |
| Peers may write the counters in `playState`  | yes                                       | can't be validated: rules can't read which map key changed | small, unsafe                                                                   |
| **A spends ledger the owner folds** (chosen) | yes                                       | one append-only root                                       | small                                                                           |

## Chosen: the spends ledger

- **Its own document**, `users/{uid}/characters/{charId}/combat/spends` (`{ entries }`). The
  owner's client overwrites `combat/state` whole, so a ledger there could be wiped by an
  ordinary save; this document it never overwrites.
- **The hit's writer** still resolves the hit through the target's own rules, in its
  transaction, now with every stage on (`peerHit`). It writes the combat roots as before and
  **appends** what the hit spent: `{ id, kind: "tracker", trackerId, amount }` (a ward filled) or
  `{ id, kind: "state-end", key }` (a dodge, a Death Ward used up).
- **Nothing is used twice.** The writer folds the pending entries into the target's sheet before
  it resolves the hit (`foldPeerSpends`), so a second hit sees the ward already full.
- **The owner folds once, by id.** The owner's client folds the entries into its sheet, records
  their ids in `session.foldedPeerSpends` (persisted with the play state, pruned to the ids still
  in the ledger), then removes them with `arrayRemove`, which keeps any entry appended meanwhile.
  A repeat snapshot or a crash between the two steps applies nothing twice. A read-only viewer
  never folds. The ledger belongs to the character, so a fight ending changes nothing.
- **Undo appends, never deletes.** Undoing the hit restores the roots and appends the inverse
  (`amount: -n`, `kind: "state-restore"`), right whether or not the owner folded first.
- **Cap.** 128 entries. A hit that would overflow still lands (HP, conditions, the save) without
  the spending stages, and logs an error report (`combat.peer-spends-full`).
- **Offline.** A hit is a transaction, so it needs the hitter online, as today; a failure shows
  the existing "not sent" toast. The target can be offline.
- **Rules.** The owner (or an admin) has full control. A current attached peer may only append:
  the new list starts with the old one, at most 128 entries, no other keys. Emulator tests in
  `tests/rules/firestore-rules.test.ts`.

## Compatibility and rollout

- A new document and an optional session field; no migration. A v0.25.0 client never reads or
  writes the ledger: its owner never folds, but every new writer folds the pending entries, so
  nothing is spent twice.
- The reader, the fold and the rules ship first. The writer switches on with the build setting
  `VITE_PEER_SPENDS_LEDGER=true` once the rules are deployed (before that every append, and the
  hit with it, would be refused). Both steps are in the v0.26.0 draft.
