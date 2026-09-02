# ADR-0004: K1 and the Wayfinder S1 are retired; the A1 topology direction is kept

**Date**: 2026-09-02
**Status**: proposed
**Deciders**: owner ("no ratified destination", cost ruling), architecture round

## Context

`src/lib/command` (K1, 1,456 lines) has zero production importers and one rule kind; it is bundled into `functions/`
where nothing calls it. The Codex Wayfinder (2026-08-25) plans K1 → C1 → S1 (server-authoritative shared commands) →
A1 (campaign topology simplification) → X1 (delete `session.world`). It contradicts `docs/ARCHITECTURE.md`.

## Decision

Delete K1 (browser and functions bundle) in Phase 2. Retire S1 (owner ruling: no gameplay Cloud Functions). Keep the
A1 direction — membership as data, no PC facts in encounters, rules as access policy — folded into ADR-0002/0005 and
the migration plan. Mark the Wayfinder superseded by the target architecture; retire its program charters in
`docs/PROGRAM_STATUS.md`.

## Alternatives Considered

### Alternative 1: Grow K1 into the reducer

- **Pros**: strict codec and typed rejections already exist.
- **Cons**: no vocabulary (~10 kinds to invent for one spell); a fourth kernel lineage.
- **Why not**: the reducer starts from the rules surface, not from a resource-spend stub; typed rejections are reused
  as a pattern, not as code.

## Consequences

### Positive

- One destination document; Functions carry no gameplay code.

### Negative

- The Wayfinder's slice bureaucracy is abandoned; its G0 ledgers stay as history.
