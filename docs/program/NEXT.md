# Next session

The only handoff. Rewrite this file at the end of every session; never copy contracts into a prompt.

## Current block

**PD — Engagement and progressive-disclosure design**, inserted between P10 and P11a by the owner's
feedback of 9 September 2026. Entry conditions and exit are in
[`PROGRAM.md`](PROGRAM.md#pd--engagement-and-progressive-disclosure). The owner's verdict closes
PD. **P11a does not start before that verdict.**

Split (owner, 2026-09-09 afternoon): Astra owns the visual/taste half, Claude owns the rest.
Claude's half is delivered in two passes:

- Research (2026-09-09 afternoon):
  `docs/superpowers/research/2026-09-09-pd-bg3-dndbeyond-research.md` + `2026-09-09-pd/`.
- Rule 30 audit and game feel (2026-09-09 evening): the audit table
  `docs/superpowers/research/2026-09-09-rule-30-audit.md`, the game-feel rules and copy set
  `docs/superpowers/research/2026-09-09-game-feel.md`, the reference evidence
  `docs/superpowers/research/2026-09-09-rule-30/`, and the dossier drafts Astra's specs carry
  verbatim `docs/superpowers/specs/2026-09-09-pd-reference-dossiers.md`. Seams delivered with
  tests: SRD class and species descriptions (EN/IT), ten creation glossary terms, `applyRecommendedBuild` (`src/lib/character-creation/recommended.ts`),
  `forecastCreation`/`speculate` (`src/lib/views/creation-forecast.ts`), and
  `creationIssueMessage` with `creationV2.fix.*` (`src/lib/views/creation-issues.ts`), and
  the rubric → glossary seam (`src/lib/views/creation-glossary.ts`).

**Astra takes over from here:** open the audit §1 and §2.3–§2.4 rows marked `M`, then the dossiers
D1–D9 (creation), then D10–D12 (landing, hub, roster). Every redesigned surface's spec starts with
its dossier entry (rule 30 gate). Screens wire the three seams above; no new pattern is invented
where the dossier names one.

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

P01 has no separate integration receipt; P08b, P08c and P09 SHAs are the verified integrated
source (remote receipts in the archived ledger `docs/archive/v1/PROGRAM_STATUS-2026-09-09.md`).

Knowledge-base reset (2026-09-09): integrated on `v2` through `1cc5d32e`.

## Open

- **PD** — Claude's research and audit halves are delivered; Astra's visual half is open (creation
  screens + raster art direction); owner verdict closes PD.
- Owner questions from the audit that only the owner answers: a ≤ 3-input quick path at the door
  (research §9.1); a remembered "help text" preference versus the 2026-09-07 no-switch decision
  (§9.5); art in creation and a portrait step (§9.3).
- Screen-owned follow-ups the audit lists for the blocks (audit §5): draft storage
  `sessionStorage` → `localStorage`, locale-aware distance units, invite token replacing the raw
  campaign id, default route to the last campaign hub, the copy rewrite of the four creation and
  library shards against the game-feel rules.
- Preset drift the engine tests pin (pack-side, `content-pack/data/quickbuild.ts`): the artificer
  preset names a tool the class already grants; a human's size falls to the first pool option unless
  the preset carries a `lineage` value.
- **P11a → P30** — not started; order and dependencies in [`PROGRAM.md`](PROGRAM.md).
- E01–E22 and the nine player-freedom scenarios still live only in the lab; rule 36 requires them in
  the repository before P14a starts.
- **Out-of-combat mechanical freedom** (owner, 2026-09-03) still needs its own design pass.
- No deployment, production write, real-data migration, release or new cost is authorised.

## Recent owner decisions (dates)

Full text in [`DECISIONS.md`](DECISIONS.md); the newest dated statement always wins.

- **2026-09-09 (evening)** — raster art generated with GPT, BG3-inspired, never identical; rule 30
  is a gate: every spec carries a reference dossier.
- **2026-09-09 (afternoon)** — Astra owns visual/taste decisions; Claude owns architecture, graph,
  research, cleanup, engine.
- **2026-09-09** — knowledge-base reset; the nine reset decisions; the experience is too cold and
  administrative; progressive disclosure for expert and beginner; BG3 and D&D Beyond studied for real.
- **2026-09-08** — standing delivery delegation; clarity and familiar patterns.
- **2026-09-07** — custom content drives the same engine; shell and Account r2 corrections.
- **2026-09-06** — V2 is a completely new application; mock 0.9.3 is the binding reference.
- **2026-09-05** — immersive-v2 accepted; d20 Folio and the D20 mark; dark theme only, IT and EN.
- **2026-09-03** — giants' shoulders; the app rolls dice; CI under 15 minutes; no dead weight.

## Opening prompt

1. Read `CLAUDE.md`.
2. Read `docs/program/NEXT.md`.
3. Start the block named under "Current block".
4. Follow `docs/program/PROGRAM.md` for the next selection.
5. End the session by rewriting `docs/program/NEXT.md`.
