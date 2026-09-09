# Program Status

This file owns the execution frontier of the `v2` program: the current block, what has closed and
where, and the open owner gates. It does not own decisions
([`docs/program/DECISIONS.md`](program/DECISIONS.md)), the program itself
([`docs/program/PROGRAM.md`](program/PROGRAM.md)), the session handoff
([`docs/program/NEXT.md`](program/NEXT.md)), or history
([`docs/archive/v1/PROGRAM_STATUS-2026-09-09.md`](archive/v1/PROGRAM_STATUS-2026-09-09.md)).

## Frontier

**PD — Engagement and progressive-disclosure design** is open, inserted between P10 and P11a by
the owner's 2026-09-09 feedback. Its exit acceptance
([`PROGRAM.md`](program/PROGRAM.md#pd--engagement-and-progressive-disclosure)):

- BG3 and D&D Beyond studied for real, evidence recorded, never a decorative citation.
- The character-creation journey redesigned as the representative path.
- A raster art direction for spells and combat content, with concrete examples and
  coherence/legibility criteria — not generic icons and not ad-hoc SVG pictograms.
- Both sides of progressive disclosure proven: expert speed with no mandatory explanation, and
  beginner discovery that teaches while playing.

The owner's verdict closes PD. **P11a does not start before that verdict.** PD has not started;
P11a is next, not started.

**P10 — Creation and onboarding** delivered, `59b20e75`, verified on `v2`:

- Guided six-step creation over typed catalogue and custom sources, with shared acquisition
  composition and retained drafts.
- Atomic five-document creation with exact receipt recovery.
- Import comparison keeps the 2014 → 2024 edition distinct from file format; original, custom,
  override and private data are preserved.
- Shares P09 navigation and P03 session/recovery authority; no bridge to a legacy runtime.

`main` remains `9b06b75`.

## Closed blocks

| Block                                                                                                      | Closed on  | Integration SHA     | Evidence                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ---------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Stages 0–6 (engine base: dice seam, positions/areas, reducer, shared encounter, minimum map, play surface) | 2026-09-05 | `24d9fbf6`          | [archived ledger](archive/v1/PROGRAM_STATUS-2026-09-09.md)                                                                        |
| P01 Reconciliation and baseline                                                                            | 2026-09-06 | `908dfbd1`          | `~/Workspace/Codex/archive-2026-09-09/d20-folio-p01-evidence` (documentary candidate, no separate receipt in the archived ledger) |
| P02 Identity and privacy                                                                                   | 2026-09-07 | `b5edf2a7`          | `~/Workspace/Codex/archive-2026-09-09/d20-folio-p02-new-evidence` (older candidate: `d20-folio-p02-evidence`)                     |
| P03 Shared state and offline                                                                               | 2026-09-07 | `abc58d48`          | `~/Workspace/Codex/archive-2026-09-09/d20-folio-p03-evidence`                                                                     |
| P04 Library and versions                                                                                   | 2026-09-07 | `078ad638`          | `~/Workspace/Codex/archive-2026-09-09/d20-folio-p04-evidence`                                                                     |
| P05 Base homebrew editors                                                                                  | 2026-09-07 | `175203d9`          | `~/Workspace/Codex/archive-2026-09-09/d20-folio-p05-evidence`                                                                     |
| P06 Monster and rule editors                                                                               | 2026-09-08 | `999b3fad`          | `~/Workspace/Codex/archive-2026-09-09/d20-folio-p06-evidence`                                                                     |
| P07 Origin and feat editors                                                                                | 2026-09-08 | `3ba6061c`          | `~/Workspace/Codex/archive-2026-09-09/d20-folio-p07-evidence`                                                                     |
| P08a Class model                                                                                           | 2026-09-08 | `ca8a61bf`          | `~/Workspace/Codex/archive-2026-09-09/d20-folio-p08a-evidence`                                                                    |
| P08b Class editor                                                                                          | 2026-09-08 | `f1c08cd7` (source) | `~/Workspace/Codex/archive-2026-09-09/d20-folio-p08b-evidence`                                                                    |
| P08c Subclass editor                                                                                       | 2026-09-08 | `7e7701b3` (source) | `~/Workspace/Codex/archive-2026-09-09/d20-folio-p08c-evidence`                                                                    |
| P09 Shell and orientation                                                                                  | 2026-09-08 | `c0213b67` (source) | `~/Workspace/Codex/archive-2026-09-09/d20-folio-p09-evidence`                                                                     |
| P10 Creation and onboarding                                                                                | 2026-09-09 | `59b20e75`          | `~/Workspace/Codex/archive-2026-09-09/d20-folio-p10-evidence`                                                                     |

P08b, P08c and P09 SHAs are the verified integrated source, not a separate final remote receipt;
their remote closure lives in the evidence folders above and in the archived ledger.

## Open gates

- Staging Google sign-in provider: owner console action, pending since 2026-09-03.
- PD owner verdict: closes PD and authorizes P11a to start.
- Production deploy, data migration and cutover (P29/P30): owner-gated, not authorized here.

## Delete zone

`v2` owns two worktrees: this one and the pack twin `d20-folio-content-v2`; neither is a deletion
candidate. Other worktrees under `Workspace/Codex` and `main`'s own copy of this ledger belong to
`main`-era programs; `v2` neither uses nor removes them. The stage-6 task worktrees and the other
`main`-era candidates named in the archived ledger have already been removed; nothing is queued
for deletion here.
