# ADR-0011: Three campaign automation levels, applied when an outcome is applied

**Date**: 2026-09-03
**Status**: accepted (owner steering, 2026-09-03)
**Deciders**: owner (steering: "the DM picks one of three campaign levels — full auto, propose-and-confirm, log only — and can change it mid-session"), architecture round

## Context

The default is Baldur's Gate 3: the app resolves everything and logs who did what. Some tables
want to confirm each consequence, some want the app to keep the book only. The DM must be able to
switch mid-session, and the roll and the verdict must not depend on the level (design rule 37:
the level only changes what happens after the verdict).

## Decision

- `automation: "full-auto" | "propose-and-confirm" | "log-only"` is a table setting of the
  encounter (`table:settings`), changed by the DM at any time; the personal aggregate uses
  `full-auto`.
- The reducer computes an action's receipt and transitions identically at every level. When it
  would apply them: `full-auto` applies; `log-only` records the receipt and applies nothing (the
  DM moves state through `override`); `propose-and-confirm` records the action as `proposed`
  with its transitions and applies them on a later `confirm` action (DM, or the actor when the
  campaign allows), or leaves the receipt on `reject`.
- Stage 3 builds `full-auto` and `log-only`; stage 6 builds `propose-and-confirm` with the surface
  that shows a proposal.
- Whatever the level, `override` and `undo` exist for every action: the DM's last word is the
  same mechanism everywhere.

## Alternatives Considered

### Alternative 1: A per-mechanic or per-player automation flag

- **Why not**: the owner's line is per campaign; per-mechanic flags multiply states and hide the
  log-only case in every program.

### Alternative 2: Levels as different reducers or code paths

- **Why not**: one reducer, one receipt; the level is a data property of outcome application.

## Consequences

### Positive

- One code path; switching level never changes a verdict already computed.

### Negative

- `propose-and-confirm` holds actions in a `proposed` state that later actions must respect
  (they fold against the unapplied state); stage 6 designs that with the surface.

### Risks

- A table at `log-only` forgetting to apply consequences → the receipt shows what would have
  changed and the DM drawer offers it as one tap (stage 6).
