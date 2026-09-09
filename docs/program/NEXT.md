# Next session

The only handoff. Rewrite this file at the end of every session; never copy contracts into a prompt.

## Current block

**PD — Engagement and progressive-disclosure design**, inserted between P10 and P11a by the owner's
feedback of 9 September 2026. Its entry conditions and exit are in
[`PROGRAM.md`](PROGRAM.md#pd--engagement-and-progressive-disclosure): study BG3 and D&D Beyond for
real and record the evidence, redesign the character-creation journey as the representative path,
produce a raster art direction for spells and combat actions with concrete examples and
coherence/legibility criteria, and prove both speed for the expert and discovery for the beginner.
The owner's verdict closes PD. **P11a does not start before that verdict.**

Split (owner, 2026-09-09 afternoon): Astra owns the visual/taste half, Claude owns the rest.
Claude's first deliverable is the research document
`docs/superpowers/research/2026-09-09-pd-bg3-dndbeyond-research.md` — in progress.

## Closed (SHA)

<!-- source: docs/PROGRAM_STATUS.md -->

| Work                                             | SHA        |
| ------------------------------------------------ | ---------- |
| Stages 0–6 — the v2 engine base, closed history  | `24d9fbf6` |
| P01 Reconciliation and baseline (documents only) | `908dfbd1` |
| P02 Identity and privacy                         | `b5edf2a7` |
| P03 Shared state and offline                     | `abc58d48` |
| P04 Library and versions                         | `078ad638` |
| P05 Base homebrew editors                        | `175203d9` |
| P06 Monster and rule editors                     | `999b3fad` |
| P07 Origin and feat editors                      | `3ba6061c` |
| P08a Class model                                 | `ca8a61bf` |
| P08b Class editor (verified source)              | `f1c08cd7` |
| P08c Subclass editor (verified source)           | `7e7701b3` |
| P09 Shell and orientation (verified source)      | `c0213b67` |
| P10 Creation and onboarding                      | `59b20e75` |

P01 is a documentary candidate with no separate integration receipt. For P08b, P08c and P09 the SHA
above is the verified integrated source; their final remote receipts were kept in external evidence
folders — see `docs/archive/v1/PROGRAM_STATUS-2026-09-09.md` for the full historical record.

Knowledge-base reset (2026-09-09): one program in `docs/program/`, one-page ledger, v1 docs
archived, map documents rewritten with archify diagrams, graph committed and hook-refreshed,
skills unified — integrated on `v2` through `1cc5d32e` (the commit after it is this record).

## Open

- **PD** — the current block, not started.
- **P11a → P30** — not started; the order and dependencies are in [`PROGRAM.md`](PROGRAM.md).
- The per-family definitions E01–E22 and the nine player-freedom scenarios still live only in the
  lab (`~/Workspace/Codex/d20-design-dialogue/full-lab/docs/RULES-EXCEPTION-CATALOG.md`,
  `PLAYER-FREEDOM-CONTRACT.md`); rule 36 requires them in the repository before P14a starts — that
  import is a P14a entry condition.
- **Out-of-combat mechanical freedom** (owner, 2026-09-03) still needs its own design pass: players
  resolve spells and other mechanics outside a formal encounter, and whether the personal
  `Encounter` aggregate is usable independently of a campaign lease is unverified.
- No deployment, production write, real-data migration, release or new cost is authorised.

## Recent owner decisions (dates)

Full text in [`DECISIONS.md`](DECISIONS.md); the newest dated statement always wins.

- **2026-09-09 (afternoon)** — Astra owns visual/taste decisions; Claude owns architecture, graph,
  research, cleanup, engine.
- **2026-09-09** — knowledge-base reset: one program in the repository, v1 documents archived, the
  repository is the only memory, the graph committed and hook-refreshed, one short handoff.
- **2026-09-09** — the nine reset decisions (`DECISIONS.md`).
- **2026-09-09** — the experience is too cold and administrative; progressive disclosure for expert
  and beginner; raster art for spells and combat actions; BG3 and D&D Beyond studied for real.
- **2026-09-08** — standing delivery delegation: reviewed, gate-green work integrates into `v2`
  without a per-block visual verdict; screenshots stay mandatory. Clarity and familiar patterns.
- **2026-09-07** — custom content drives the same engine and combat stays editable on authoritative
  facts; shell and Account r2 corrections; the successor handoff only when the work is truly done.
- **2026-09-06** — V2 is a completely new application; the approved mock 0.9.3 is the binding
  reference; depth is delegated to the implementation blocks; agents may push on `v2`.
- **2026-09-05** — immersive-v2 is the accepted visual base; d20 Folio and the D20 mark confirmed;
  dark theme only, IT and EN.
- **2026-09-03** — giants' shoulders; the app rolls dice; CI under 15 minutes; no dead weight.

## Opening prompt

1. Read `CLAUDE.md`.
2. Read `docs/program/NEXT.md`.
3. Start the block named under "Current block".
4. Follow `docs/program/PROGRAM.md` for the next selection.
5. End the session by rewriting `docs/program/NEXT.md`.
