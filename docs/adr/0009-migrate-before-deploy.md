# ADR-0009: Every persisted-shape change migrates live data before the deploy that needs it

**Date**: 2026-09-02
**Status**: accepted (owner steering, 2026-09-03)
**Deciders**: owner ("never again a live hotfix during play"), architecture round

## Context

On 2026-08-31 the owner hotfixed production during a session because deployed rules and legacy documents disagreed
with the client. Unmarked legacy parents, `session.world`, item-id trackers and `ref.charges` coexist in production.

## Decision

A deploy that reads a new persisted shape is preceded, in the same release, by a migration run under the snapshot →
dry-run → idempotent apply → verify protocol against a production export, with rollback = restore. Compatibility
readers are allowed only between the migration and the deploy of the same release, then deleted. The release
checklist (`docs/RELEASE.md`) gains this gate.

## Alternatives Considered

### Alternative 1: Read-time lazy migration with compatibility readers

- **Why not**: permanent compatibility layers are what the owner wants gone (golden rule 10); they are where the
  2026-08-31 class lives.

## Consequences

### Positive

- No window where a live document is unreadable or unwritable by its owner.

### Negative

- Each shape change costs a script and an owner-gated run; the plan names them.

## Amendment (2026-09-03, `v2` architecture reset)

Unchanged; status accepted. On `v2` the P1 migration scripts and their legacy readers were
deleted on 2026-09-03 because `v2` never runs them: the migrations run from `main` before `main`'s
deploy, and `main` deletes its own copies afterwards (golden rule 10).
