# ADR-0001: One entity-generic combat reducer over an Encounter aggregate

**Date**: 2026-09-02
**Status**: proposed
**Deciders**: owner (rulings 2026-09-02), architecture round

## Context

Combat runs on three executors (`TurnEconomyProvider`/`CombatResolver`, the `mechanics-*` kernel, the dead K1) over a
single-character state model: monsters are prose, other creatures do not exist, six facts have two writers, and the
kernel is switched off inside campaign encounters (`PlayTab.tsx:470`). The owner requires total automation for every
combatant with overrides everywhere, and one machinery for solo and shared play.

## Decision

One pure, total reducer `resolve(state, action, catalogue)` over an `Encounter` aggregate in which every creature
(PC, monster, NPC, summon, companion, object, abstract table creature) is an `Entity` with a controller, relations are
declared data, and effects carry sources and lifetimes. Solo and shared play use the same aggregate; only the host
document differs.

## Alternatives Considered

### Alternative 1: Complete the `mechanics-*` cutover as designed

- **Pros**: exists, 560 tests, deterministic, exact undo, hostile-input hardened.
- **Cons**: trigger roles anchored to self in every live install; PCs absent from the shared world; no standing fact
  for riders/advantage; 150-line programs; 28k lines defending against a hostile in-process caller.
- **Why not**: the single-character assumption lives in its core (see ADR-0003).

### Alternative 2: Keep the legacy provider and add monsters to it

- **Pros**: smallest first step.
- **Cons**: three hand-written copies of payment; outcome-independent commits; no event model; the provider is UI code.
- **Why not**: every root cause in the audit is representable there by construction.

## Consequences

### Positive

- One executor; a new mechanic is data; monsters, summons and PCs are the same case.
- The DM with ten monsters and a player with one PC are one code path.

### Negative

- A rewrite of the combat core (estimated 6–8k lines) and a five-phase migration.

### Risks

- Vocabulary too small for some SRD clause → loud `unsupported` in the coverage artefact, never a content branch.
