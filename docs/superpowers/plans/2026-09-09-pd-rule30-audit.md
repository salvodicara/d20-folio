# PD rule 30 audit and game feel — plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or
> superpowers:executing-plans to run this plan task by task. Steps use checkbox syntax.

**Goal:** deliver the evidence-based audit that lets Astra render screens without deciding
patterns — a rule 30 audit table over mock 0.9.3 and P02–P10, a game-feel evidence base, one
reference dossier draft per surface, and the engine/data/i18n consequences in Claude's lane.

**Architecture:** research streams run in parallel against primary sources and the real
artefacts (lab, runtime, code); the evidence is written into four repository documents; pure
data and presenter gaps are closed with TDD in `src/data`, `src/i18n`, `src/lib`, never in a
screen. No visual verdict anywhere (owner, 2026-09-09).

**Tech stack:** Markdown documents under `docs/superpowers/`; Vitest for every code change;
Playwright/browser for the lab and runtime walks; `just ci` before each push `HEAD:v2`.

**Spec:** the owner's task brief of 2026-09-09 evening (chat), `docs/program/PROGRAM.md` §PD,
`docs/GOLDEN_RULES.md` rule 30 with its Enforcement paragraph, `docs/superpowers/specs/README.md`.

## Global constraints

- Rule 30 binds every proposal: name the product that already does it and the evidence.
- No visual or taste decision: colour, layout, typography, icon style, art style are "reserved to
  Astra", with the constraint the evidence imposes.
- Evidence hygiene: URL or `file:line` per fact; unverified claims marked; no licensed assets; any
  line carrying a URL slug with a lowercase product token also writes "Baldur's Gate 3"
  (`tests/unit/content-pack-partition.guard.test.ts`).
- Repository language English; owner conversation Italian.
- Small Conventional Commits, owner sole author, one `.changeset/*.md` per commit, never
  `--no-verify`, `just ci` green before every push `HEAD:v2`; never touch `main`; no deploy.
- Ordering key: the four acceptance stories of `PRODUCT.md` §Steering; a surface serving none is
  flagged superfluous (rule 31).

## Evidence folder (outside the repository)

`~/Workspace/Codex/d20-folio-pd-rule30-audit-evidence/` — raw notes per stream, lab and runtime
captures, agent reports. Only the four documents below enter the repository.

## Streams (parallel)

| Stream | Input                                                                  | Output (evidence folder)         |
| ------ | ---------------------------------------------------------------------- | -------------------------------- |
| R1     | Campaign home, session/recap, calendar, notes/lore, handouts           | `ref-campaign.md`                |
| R2     | Sheet reading, spells, inventory, party loot, level-up                 | `ref-character.md`               |
| R3     | Compendium lookup, homebrew authoring (11 families), sharing           | `ref-library.md`                 |
| R4     | DM prep, encounter/initiative, map/fog/tokens, dice                    | `ref-table.md`                   |
| R5     | Game feel: framing, identity moments, previews, tone, feedback, sound  | `ref-game-feel.md`               |
| P1     | The 12 earlier research files                                          | `prior-research-index.md`        |
| M1     | Lab 0.9.3 walk (Campagna, Personaggio, Biblioteca, Al tavolo, Account) | `mock-walk.md`                   |
| A1     | Runtime walk of P02–P10 against emulators, fixture data                | `runtime-walk.md` (Claude's own) |
| C1     | Code and i18n inventory: files, routes, worst administrative strings   | `code-inventory.md`              |

## Tasks

### Task 1: Evidence streams

- [ ] Dispatch R1–R5, P1, M1, C1 as parallel agents with the brief in §Streams; each report cites
      URL or `file:line`, marks unverified claims, lists capture URLs for Astra.
- [ ] Run A1 in the browser against `pnpm dev:emulators` with the seeded fixtures; record per
      surface: route, first screen, primary action, copy register, empty state, feedback.
- [ ] Spot-check three agent claims per stream against the source before use.

### Task 2: `docs/superpowers/research/2026-09-09-rule-30-audit.md`

- [ ] Surface-by-surface table: surface · mock location · app location · proven pattern + source ·
      verdict (follows / partially / reinvents) · change (behaviour, flow, order, copy, disclosure)
      · priority (blocks the milestone / hurts daily play / polish) · acceptance story served.
- [ ] Superfluous list (rule 31) and a per-story ordering summary.
- [ ] Prettier-format, then run the docs-budget test and the content-pack partition guard
      (both under `tests/unit/`) before committing.
- [ ] Commit `docs(research): rule 30 audit of mock 0.9.3 and P02–P10` with a changeset.

### Task 3: `docs/superpowers/research/2026-09-09-game-feel.md`

- [ ] Evidence base by mechanism (framing, identity-first, live previews, tone with EN/IT
      before/after from `src/i18n`, feedback and rewards, sound/motion budgets, expert bypass),
      each a testable rule with sources; do-not-copy list from documented failures.
- [ ] Commit `docs(research): game-feel evidence base` with a changeset.

### Task 4: `docs/superpowers/specs/2026-09-09-pd-reference-dossiers.md`

- [ ] One `## Reference dossier` draft per surface Astra redesigns (creation first), six lines each
      in the README format: Surface · Product · Evidence · Copied · Adapted · Why.
- [ ] `pnpm test --run tests/unit/docs-budget.test.ts` (the dossier gate).
- [ ] Commit `docs(specs): PD reference dossier drafts` with a changeset.

### Task 5: Engine/data/i18n consequences (Claude's lane, TDD)

Prioritised list lives in the audit document §Consequences. Implemented here when pure data or
presenter work and not reserved by `DECISIONS.md`:

- [ ] 5a Class and species descriptions in `src/i18n/{en,it}/srd/{classes,races}.json`, guarded by
      a test that no creation source resolves an empty description.
- [ ] 5b A preset replay through the P10 seam (`selectCreationSource`, `answerCreationChoice`) in
      `src/lib/character-creation/`, pinned by a test that every preset yields a valid preview.
- [ ] 5c A pure consequence-diff presenter in `src/lib/views/` ("what changes if I choose X"),
      tested on Fighter and Wizard.
- [ ] 5d A creation diagnostic catalogue naming the field and the fix, EN and IT, replacing the
      `homebrewV2.diagnostics` fallback for every `OriginDiagnostic` code the flow emits, with a
      coverage test.
- [ ] 5e Glossary terms the creation labels need (`src/i18n/{en,it}/ui/glossary.json`), with a
      coverage test.
- [ ] One commit per item, each with its changeset; `just ci` before push.

### Task 6: Handoff

- [ ] Rewrite `docs/program/NEXT.md` (five headings verbatim) and keep
      `docs/PROGRAM_STATUS.md` on one page.
- [ ] `just ci`; push `HEAD:v2`; confirm the remote SHA; five-line Italian summary to the owner.
