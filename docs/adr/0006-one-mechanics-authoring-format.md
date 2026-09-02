# ADR-0006: One versioned mechanics authoring format for SRD, pack and homebrew

**Date**: 2026-09-02
**Status**: proposed
**Deciders**: owner (licensing partition is legal, not scope), architecture round

## Context

Active mechanics are authored today in several dialects (`Grant`, `SrdActionDef`, spell fields, item charge fields,
hand-written `mechanicsProgram`s of 63–549 lines), and the engine leaks content knowledge (`"marked"|"cursed"|"vowed"`
in nine files; the pack's Vow of Enmity works only because `"vowed"` is pre-seeded publicly).

## Decision

`Mechanic = { schema, id, source, passive: Grant[], active: Program[] }` — passive facts keep the proven 127-kind
`Grant` union; active mechanics are `Program`s (trigger, typed costs, targets, inputs, `when`-gated steps, effects
with lifetimes). Closed unions, `assertNever` handlers, a diagnostic conformer with path and rule id. Monster stat
blocks compile to the same shape by a pure adapter. Marks, auras and riders reference `self`/`target` bindings, never
content ids.

## Alternatives Considered

### Alternative 1: Keep `MechanicsProgram` (mechanics-\*) as the format

- **Why not**: ~150 lines per mechanic, 24 step kinds tuned to the kernel's internals, no rider/advantage fact,
  bare-`null` conformance.

### Alternative 2: Free-form scripting (a DSL or JS)

- **Why not**: no closed world, no coverage derivation, no safe homebrew.

## Consequences

### Positive

- Hunter's Mark ≤ 25 lines; the pack twin is data only; coverage is derivable from the data.

### Negative

- Every existing dialect must be migrated (Phase 3), including the 21 hand-written programs.
