# ADR-0002: The append-only action log is the only persisted mutation

**Date**: 2026-09-02
**Status**: accepted (owner steering, 2026-09-03)
**Deciders**: owner (offline-first, minimum cost), architecture round

## Context

Today the encounter is an embedded map written whole with a 2 s debounced last-write-wins; peers write into other
users' `combat/state`; the character parent is replaced wholesale on every sibling snapshot; undo is forbidden under
campaigns because a snapshot replay would clobber peers. Firestore transactions do not work offline.

## Decision

Clients never write state. They append `Action`s (intent + answers, override, declare, resolve, undo, table) to the
encounter document's `log` with `arrayUnion`, stamped with a hybrid logical clock. Every client folds the same log
with the same reducer to the same state; a stale action is re-validated where it lands and rejected identically
everywhere. Undo is an action. Checkpoints compact the log.

## Alternatives Considered

### Alternative 1: Server-authoritative shared commands (Wayfinder S1)

- **Pros**: one trusted executor; clients cannot forge state.
- **Cons**: Cloud Functions per action (cost, cold start, latency); no offline shared commit.
- **Why not**: owner ruling 2026-09-02 (minimum cost, trust at the table).

### Alternative 2: Transactions with a revision field on a materialized state document

- **Pros**: familiar CAS.
- **Cons**: transactions fail offline; conflicts surface as retries; undo still needs a log.
- **Why not**: breaks offline shared play and keeps two representations (state + history).

### Alternative 3: Actions as a subcollection (one doc per action)

- **Pros**: no document-size ceiling; per-action rules.
- **Cons**: N reads on join; more listeners/docs; rules per doc.
- **Why not (for now)**: the single document with compaction is simpler and within budget; the subcollection is the
  measured fallback if fights exceed the document budget.

## Consequences

### Positive

- Offline appends compose; cross-device undo is free; the log is the forensic record of play; one listener per fight.

### Negative

- Fold cost grows with the log → checkpoints; `arrayUnion` array order must never be relied on (`seq` orders).

### Risks

- Two concurrent checkpoints → precondition on the previous checkpoint seq; DM-only by rule.

## Amendment (2026-09-03, `v2` architecture reset)

A `roll` is an action of the same log (ADR-0010): appended before the intent that consumes it,
verified by every client in the fold, undone like any action. Hidden rolls live in the same
document; their faces are concealed by presenters, not by rules (ADR-0005's trust model). Status
accepted with the steering.
