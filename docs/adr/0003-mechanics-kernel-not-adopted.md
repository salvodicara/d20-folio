# ADR-0003: The `mechanics-*` kernel is salvaged, not adopted

**Date**: 2026-09-02
**Status**: accepted (owner steering, 2026-09-03)
**Deciders**: owner (D3 free review), architecture round

## Context

`src/lib/mechanics-*.ts` (28,086 lines, merged 2026-08-20 as one squash) is documented as the canonical runtime. The
audit measured it: live in solo play through six entry points, off in encounters, gated by ~14 exclusion predicates,
mirrored onto legacy fields by a rollout bridge with "session wins on drift"; a hand-authored Hunter's Mark is ~150
lines and 13 concepts; there is no standing fact for a damage rider or advantage; every trigger role is anchored to
self; conformance failure is a bare `null`; the design defends against a hostile in-process caller (possession
proofs, private fibers, authenticated projections) — a threat model the owner has ruled out.

## Decision

Do not adopt it as the runtime. Salvage: the zero-dependency `exact-schema` layer, the monotonic-ordinal identity
law, the journal-with-exact-undo idea, the boundary state machine concepts (turn, rest, day phase), the clause census
in `mechanics-transcription.guard.test.ts`, and its tests as specifications. Delete the rest in Phase 5.

## Alternatives Considered

### Alternative 1: Adopt and strip the authentication layers, open the role model

- **Pros**: keeps 560 tests running.
- **Cons**: a 28k-line refactor of code only its author understands; the single-character assumption is in the
  world model (party lease, self-anchored roles), not in a removable layer.
- **Why not**: cost and risk exceed a guided rewrite against a 256-item rules surface.

### Alternative 2: Adopt as-is and finish the cutover

- **Why not**: F14 in the audit; the authoring cost alone violates "total automation is the natural consequence of
  adding data".

## Consequences

### Positive

- A kernel one owner and agents can hold in their heads; authoring ≤ 40 lines per mechanic.

### Negative

- The 2026-08-20 investment is mostly written off; `session.world` needs a migration to the new personal aggregate.

### Risks

- Losing hard-won edge cases → every kernel test is triaged into a golden replay or deleted with a reason.

## Amendment (2026-09-03, `v2` architecture reset)

On `v2` the kernel is read only by the old play surfaces (`PlayTab`, the engine spell flows,
`characterStore`, the rest boundary) through seven entry modules; it dies at stage 6 together with
those surfaces (`docs/superpowers/plans/2026-09-03-new-app-stage-1.md`, "Module fates"). Until
then it is frozen: `tests/unit/mechanics-kernel-freeze.guard.test.ts` pins its importer set so no
new reader appears; `mechanics-trigger.ts`, which nothing read, was deleted on 2026-09-03. The
salvage list stands. Status accepted.
