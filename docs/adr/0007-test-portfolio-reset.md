# ADR-0007: Test portfolio — golden replays, properties, exhaustiveness, few rules and e2e tests

**Date**: 2026-09-02
**Status**: accepted (owner steering, 2026-09-03)
**Deciders**: owner ("far fewer tests, professional patterns; real regressions still slip"), architecture round

## Context

801 Vitest files / 18,613 tests at the last recorded gate; many pin representations (parity harnesses for duplicates
never adopted); real regressions reached production (2026-08-31).

## Decision

The regression spine is golden replays (a log folds to an expected state; one per hard case and per incident);
property tests for fold determinism under permutation and codec round-trip totality with hostile input; compile-time
exhaustiveness for every closed union; one payment guard, one coverage-drift guard; ~20 emulator rules cases; a
handful of e2e journeys. Representation tests are deleted with their representations, phase by phase.

## Alternatives Considered

### Alternative 1: Keep the suite and add tests for the new engine

- **Why not**: the owner's ruling; dead weight hides signal and slows the gate.

## Consequences

### Positive

- Hundreds of meaningful tests instead of eighteen thousand; failures point at a replay.

### Negative

- Deleting tests needs discipline: each deletion names the representation it dies with.

## Amendment (2026-09-03, `v2` architecture reset)

The `v2` gate (steering, 2026-09-03): unit and rules tests that guard live data, the golden
replays of the acceptance stories (`tests/unit/combat/replays`), one accessibility sweep and the
owner's screenshot lane; no end-to-end journeys on `v2` and none added; the gate stays under 15
minutes. The 60 old end-to-end specs were deleted on `v2` on 2026-09-03 (they ran only on
`main`'s `verify.yml`). Status accepted.
