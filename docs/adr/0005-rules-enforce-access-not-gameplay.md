# ADR-0005: Firestore rules enforce identity, membership, ownership and shape; trust at the table

**Date**: 2026-09-02
**Status**: proposed
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
