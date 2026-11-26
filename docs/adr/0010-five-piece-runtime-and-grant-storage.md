# ADR-0010: Five-piece rules runtime, Grant as the one stored format, engine on the client

**Date**: 2026-11-25
**Status**: accepted
**Deciders**: owner (grilling, #1272), data-model research (#1267)

## Context

The stored character is sound: it holds inputs only (choices, overrides, spent counters), ids not text, a total
codec and the revision fence. The engine's in-memory rules model is not. Four rules layers are live at once (the
`Grant` union folded into one wide aggregate, `lib/rules` compiling only part of the passive kinds, the `mechanics-*`
kernel that ADR-0003 did not adopt, and Activities translated from catalogue fields). Play state has one field per
feature, overrides and build choices come in many shapes, and no stored document says which engine wrote it.
Homebrew features and items store their rules as `Grant[]` inside the character, so the authoring format cannot
change without a data migration.

## Decision

- **Runtime model.** The engine converges on five pieces that already exist in the code: **Rule** (a passive
  fact), **Activity** (anything usable), **Status** (something applied to a creature for a while), **Resource** (a
  counter that is spent and recovered) and **Choice/Progression** (what a level or a feature lets the player pick).
- **Grant is the single compiled storage format.** SRD, private pack and homebrew author mechanics as `Grant`, a
  versioned format with **one** compiler to the five pieces. Kinds are never removed or renamed without a data
  migration. Where ADR-0006 proposed a separate `Program` format for active mechanics, active mechanics run as
  Activities compiled from Grant and catalogue data instead; no second authoring dialect is built. The dead kernel
  code goes, as ADR-0003 decided.
- **Placement.** The engine stays on the client. `packages/folio-core` becomes a real package boundary (pure rules,
  no Firebase IO, no import of the app), so the same code can later run in a script, a Cloud Function or a public
  package. There is no rules server.
- **Migration, M0 to M5.**
  - M0–M2 change no stored data. M0: the before/after derived-sheet harness (`scripts/derived-digest.ts`) and the
    folio-core boundary. M1: every passive Grant kind compiles to a Rule. M2: Activities are the single runtime shape
    of everything usable.
  - M3–M5 change stored shapes: M3 statuses, M4 choices and overrides (schema 4), M5 the play-state `world`. Each is
    **one release** with a **forced reload** of every client, so an old tab cannot write the old shape; there is no
    multi-release coexistence window. A **write fence** refuses a write in the old shape (an offline queue included)
    and asks the player to reload; no write is accepted and lost. Each step needs the **owner's yes** and runs the
    live-data protocol of ADR-0009 (snapshot, dry-run, yes, idempotent apply, verify).
  - Every step proves with the harness that the derived sheets did not move, or moved only where a named change
    says so: on the public synthetic fixtures in CI, and on the live sheets as counts only, run by the Coordinator.

## Alternatives Considered

### Alternative 1: A rules server (the engine behind an API)

- **Pros**: one place computes every sheet; a public API comes for free.
- **Cons**: running cost and latency; no offline play at the table.
- **Why not**: two friendly groups, a zero-cost budget and no cheating threat; a real package gives the API later
  without a server now.

### Alternative 2: Replace Grant with a new runtime-shaped format

- **Pros**: the stored format would match the runtime one to one.
- **Cons**: every homebrew feature stored in a character would need a migration, and the pack would be rewritten.
- **Why not**: the runtime can change freely behind one compiler; the stored format does not have to.

### Alternative 3: Stored-shape changes over several releases with old and new shapes side by side

- **Pros**: no forced reload.
- **Cons**: old tabs and offline queues keep writing the old shape; compatibility readers stay for weeks.
- **Why not**: the owner chose one release per step, a forced reload and a write fence.

## Consequences

### Positive

- A new mechanic is data plus at most one compiler case, read in one place.
- Each migration step has a measured exit: the harness digest of every sheet.
- The engine can be published as a package without a server.

### Negative

- Three stored-shape steps, each with a release, a forced reload and an owner-gated live run.
- The compiler must cover every Grant kind before the old layers can be deleted.

### Risks

- An open tab or an offline queue writes the old shape during a step → the forced reload and the write fence.
- A rules change could slip into a migration step → the harness names the sheet and the section that moved.
