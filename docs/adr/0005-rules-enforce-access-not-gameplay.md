# ADR-0005: Firestore rules enforce identity, membership, ownership and shape; trust at the table

**Date**: 2026-09-02
**Status**: accepted (owner steering, 2026-09-03)
**Deciders**: owner (rulings 4, 9, 10 of 2026-09-02), architecture round

## Context

`firestore.rules` has 55 predicates, 31 of which validate game semantics duplicated from `src/lib` (conditions
byte-for-byte, effect ops, peer patches); an unrolled batch validator exists to stay under the 1000-expression
ceiling; rules lagging the client by one field denied every write twice (2026-08-31 hotfix during play). Peers write
into other users' subtrees.

## Decision

Rules enforce who may read/write which document and that documents have the declared shape and size. The reducer
enforces game legality. Nobody writes into another user's subtree; the encounter document is the only shared
writable surface (members append; DM/admin checkpoint). Actors: owner, member, DM (`dmUid`), admin, anonymous reader.
`memberDetails[uid].role` is deleted. Threat model: a malicious member can append well-formed actions; the fold
attributes them, anyone can undo them, the DM removes the member. This is accepted.

## Alternatives Considered

### Alternative 1: Keep semantic validation in rules

- **Why not**: two engines in two languages diverge by construction; the outage class recurs.

### Alternative 2: Trusted writer (Cloud Functions)

- **Why not**: cost, latency, offline; owner ruling.

### Alternative 3: Server-side protection of PCs from co-members

- **Why not**: requires a trusted writer; the owner prefers log + undo.

## Consequences

### Positive

- ≈150-line rules; the rules test suite shrinks to access matrices; no field allowlists to lag.

### Negative

- Manners, not mechanisms, protect a table from a prankster.

## Amendment (2026-09-03, `v2` architecture reset)

The threat model explicitly includes hidden rolls: a hidden roll's faces are in the shared
encounter document, readable by any member through the raw API; the app conceals them by
presenter (ADR-0010). A DM-private document was rejected because every client must fold the
same log to the same state and there is no server to filter it. Trust at the table covers it, as
it covers forged actions. Status accepted.

## Amendment (2026-09-04, stage 4)

The decision is now built. `firestore.rules` is 548 lines (984 before) and contains no predicate
that reads a game field: `coreConditions`, `validPeerEffectState`, `validMember*`,
`validCombatEffectOpsChange`, `turnFieldsOnlyChanged`, `combatEffectFieldsOnlyChanged`,
`encounterInit*`, `isAttachedPeer`, `peer*`, `playStateVersion*` and `isCampaignDmDetach` are
gone, and the campaign model's fields are enumerated so the retired ones are un-writable without
a migration. Four points the implementation settled:

- **Admin-supreme.** `users/{uid}.role == "admin"` carries DM-level rights on every encounter
  document — create, append, checkpoint, settings, delete — whether or not the admin is a member
  of that campaign, and owner-level rights on every user path. The single exclusion is
  `characters/{id}/public/sheet`: the anonymous projection's exactness is atomic with the owner's
  parent write, so a published character's build change and its deletion still require the owner.
  Membership stays explicit: the owner's account is added as a member of his group's campaign
  rather than being an implicit member of every campaign.
- **Append-only by prefix, not by length.** A member's encounter `update` requires the stored log
  to be a byte-identical prefix of the written one, so existing entries are frozen and only the
  tail may grow. "The log grew" alone would have allowed a member to rewrite history as long as
  the list got longer, which the decision's `arrayUnion`-only wording never intended.
- **The empty-log guard.** A Firestore rules slice `log[0:0]` errors instead of yielding an empty
  list, so the prefix comparison is guarded by `resource.data.log.size() == 0`. That is the state
  of a freshly created encounter and of a compacted one whose tail is empty. An empty stored log
  is trivially a prefix of anything, so the fence loses nothing — and, stated plainly for the
  threat model, an empty stored log has nothing to protect.
- **Nobody writes another user's documents, membership paths included.** `removeMember` and
  `deleteCampaign` no longer detach the leaving member's character: they write the roster alone,
  and the owner's own client clears its claim. `attachMemberCharacter` treats a claim as stale
  only on a `permission-denied` read of the campaign — never on any error — so an offline client
  cannot talk itself into discarding a live claim.

Status accepted.
