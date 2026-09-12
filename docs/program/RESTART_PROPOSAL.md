# Restart proposal — d20 Studio (2026-09-12)

Owner request of 12 September 2026: stop before the next mock pass, go back to product design,
interrogate every feature, screen, button and interaction from zero, in a new repository whose
process is designed for Codex and Claude working together, run only through prompts by the owner.
This document is the proposal; the owner's answers turn it into the constitution of the new repo.

## Diagnosis of the current repository

- Governance weighs more than the product: `PRODUCT.md`, `DESIGN.md`, the golden rules, the
  constitution and the program total ~2,000 lines, 136 documents under `docs/`, three overlapping
  methodologies (Superpowers lifecycle, 36 golden rules, P01–P30 program) and a router that tells
  every session to read all of them.
- The product was never specified surface by surface: mock 0.9.3 is the reference, but no document
  lists every screen with its elements, states and interactions, so every block re-discovers intent.
- What is worth keeping is evidence, not authority: `PRODUCT.md` §Steering, the jobs research
  (`docs/superpowers/research/2026-09-03-self-contained-jobs.md`), `docs/program/DECISIONS.md`,
  the ADRs, the BG3/D&D Beyond research, mock 0.9.3, and the engine knowledge in `src/lib`.

## Evidence (state of the art, September 2026)

| Practice                                                                               | Source                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec-driven development: constitution → specify → clarify → plan → tasks → implement   | [GitHub Spec Kit](https://github.com/github/spec-kit) (works in Claude Code and Codex CLI); [SDD guide](https://dev.to/krlz/spec-driven-development-in-2026-what-it-is-the-tooling-and-how-teams-actually-use-it-2fk2)                              |
| Requirements written in EARS ("When …, the system shall …"), one criterion per test    | [EARS](https://en.wikipedia.org/wiki/Easy_Approach_to_Requirements_Syntax); [EARS for AI specs](https://www.braingrid.ai/blog/ears-notation)                                                                                                        |
| Let the agent interview the owner one question at a time, then write the spec          | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) ("Let Claude interview you"); [grill-me](https://ryanuo.cc/en/posts/grill-me-vs-superpowers); [Codex best practices](https://learn.chatgpt.com/guides/best-practices)  |
| One instruction file for both agents: `AGENTS.md`, `CLAUDE.md` = `@AGENTS.md`          | [AGENTS.md guide](https://www.morphllm.com/agents-md-guide); [Claude + Codex orchestration](https://nimbalyst.com/blog/orchestrating-claude-code-and-codex-together/)                                                                                |
| Cross-vendor review: one agent writes, the other reviews the diff read-only, roles swap | [Cross-vendor review](https://www.mindstudio.ai/blog/cross-vendor-ai-agent-review-claude-codex); Claude Code best practices §Writer/Reviewer                                                                                                        |
| Lean instruction file (≤ 200 lines), skills for on-demand knowledge, hooks for "always" | Claude Code best practices §CLAUDE.md; [skill-writing rules](https://github.com/obra/superpowers/blob/main/skills/writing-skills/anthropic-best-practices.md)                                                                                         |
| Prompt = Goal, Context, Constraints, Done-when; effort high by default, xhigh for design | Codex best practices; [Fable 5 effort guidance](https://claudefa.st/blog/guide/development/fable-5-best-practices)                                                                                                                                  |
| Fresh session per task; two corrections → clear and re-prompt; verify with evidence     | Claude Code best practices §Manage your session                                                                                                                                                                                                     |

## Proposal in one paragraph

A new public repository, working name **d20 Studio**, born as a specification workshop and growing
into the application. One backbone (Spec Kit's constitution → specify → clarify → plan → tasks →
implement), one instruction file (`AGENTS.md`), ten golden rules on one page, four house skills,
two agents with fixed roles and a mandatory cross-review, and an owner who only answers questions,
judges images and takes dated decisions. The old repository becomes read-only evidence.

## Roles

| Who                          | Owns                                                                                                                                                | Never                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Owner                        | Answers the interviews, judges visuals from images, takes dated decisions at the decision boundary, authorises deploy/cost/migration                 | Reads diffs, edits files, resolves technical conflicts    |
| Claude (Claude Code)         | Interviews, product and feature specs, architecture, engine, data, rules, tests, gates, document hygiene, review of Codex's work                    | Visual taste decisions                                    |
| Codex (Astra)                | Reference dossiers, wireframes, mocks, raster art, design system, screenshot matrices, UI implementation once a spec exists, review of Claude's work | Changes a spec without an owner decision                  |
| Subagents (both harnesses)   | Bounded research and read-only adversarial review                                                                                                   | Integrate anything                                        |

## Phases

### Phase 0 — Foundations (Claude, one session)

Creates the repository skeleton and nothing else: `AGENTS.md` (≤ 150 lines), `CLAUDE.md` with a
single `@AGENTS.md` import, `CONSTITUTION.md` (the ten rules), `.agents/skills/` (single home,
symlinked into `.claude/skills/`), `spec/` and `decisions/` folders with templates, `handoff/NEXT.md`,
Spec Kit installed and verified in both harnesses, CI that lints Markdown and validates the spec
templates. Evidence from the old repo is copied under `evidence/` with its date and source, never
into `spec/`.

### Phase 1 — Product interview (owner + Claude, several sessions, sequential)

The grilling protocol: one question at a time, a recommended answer with every question, the agent
reads the evidence before asking, nothing obvious is asked, every answer is written into the spec
at the end of the session, every deviation from earlier evidence is a dated decision. Layers, each
its own session series:

1. Product — purpose, users, non-goals, milestone, automation posture, platforms.
2. Jobs and journeys — each job the group does, before/during/after a session, who does it.
3. Domain — the nouns (campaign, character, encounter, item, roll, note…) and their relations.
4. Feature inventory — every feature named, grouped, ranked (must / should / later), with its job.
5. Per feature — EARS requirements, edge cases, permissions, offline, undo, logging, i18n.
6. Per screen — every region, element, control, state (empty, loading, error, offline), and every
   interaction with its consequence; navigation between screens.

Output: `spec/product.md`, `spec/jobs.md`, `spec/domain.md`, `spec/features/<id>.md`,
`spec/screens/<id>.md`, `spec/flows/<id>.md`, plus `decisions/<date>-<slug>.md`.

### Phase 2 — Spec cross-review (Codex, read-only)

Codex reviews the whole spec for gaps, contradictions, untestable criteria and missing screens,
producing a structured finding list (blocking / major / minor). Claude resolves; open product
questions go to the owner as a short list with a recommendation each. Exit: no blocking finding.

### Phase 3 — Design (Codex, one screen or flow per session)

For every screen in `spec/screens/`: reference dossier (the real BG3 / D&D Beyond / best-in-class
reference beside our rendition), wireframe, then high-fidelity mock, dark theme, EN and IT, three
viewports. Claude reviews each mock against its screen spec with a checklist (every element, state
and interaction present). The owner judges images only and answers "approved" or gives corrections.
Exit: every must-have screen approved at 100 %.

### Phase 4 — Architecture and plan (Claude, then Codex review)

`spec/architecture.md` and the ADRs: engine, data model, persistence, offline, auth, licensing
partition, test portfolio, budgets. Salvage from the old engine only what a spec asks for, one
seam at a time, with its tests. Codex reviews read-only. Exit: no blocking finding.

### Phase 5 — Build (both agents, vertical slices, parallel in worktrees)

Per slice: `specify` (already done) → `plan` → `tasks` → implement with TDD → verify in the real
runtime with screenshots → cross-review by the other agent → fix → integrate to `main` of the new
repo. A slice is a job end to end (for example "roll initiative and run one round"), never a layer.

### Phase 6 — Migration and release (owner-gated)

Six fixtures, snapshot → dry-run → idempotent apply → verify, staging first, then the owner's
switch. Unchanged from the current invariants.

## The ten golden rules (draft, to be grilled)

1. The spec is the source of intent; code and tests are the source of truth about behaviour.
   Disagreement is a bug in one of the two and is fixed in the same change.
2. Nothing is built without a spec, nothing is designed without a dossier, nothing ships without
   a verifiable check the agent ran and showed.
3. One question at a time, one task per session, one artifact per session, one worktree per task.
4. Every session ends by rewriting `handoff/NEXT.md`; the repository is the only memory.
5. Every owner decision is a dated file in `decisions/`; the newest dated decision wins.
6. Cross-review is mandatory: the agent that wrote does not integrate until the other agent
   reviewed read-only and every blocking finding is closed.
7. Copy the dominant proven pattern with evidence before inventing; reuse before adding.
8. Every roll is logged with its provenance; the DM keeps the last word through undo.
9. Bilingual EN/IT by construction; SRD-only in public, non-SRD in the private pack.
10. Deploy, release, real-data migration and any new cost need an explicit per-change owner
    permission; secrets never enter the repository or an agent's memory.

## Skills (house set, single home `.agents/skills/`)

| Skill              | Job                                                                                      | Invoked by                  |
| ------------------ | ---------------------------------------------------------------------------------------- | --------------------------- |
| `interviewing`     | The grilling protocol above; writes the spec files at the end of the session             | Owner, phase 1              |
| `reference-dossier`| Find the real reference, capture it, put it beside our rendition, extract the rules      | Codex, phase 3; Claude, 4   |
| `cross-review`     | Read-only structured review (blocking / major / minor) of a spec, mock, plan or diff      | Both, every phase           |
| `session-handoff`  | Rewrite `handoff/NEXT.md`, record decisions, list open questions with recommendations     | Both, every session end     |

External, adopted as-is after verification in phase 0: Spec Kit (backbone), the official Firebase
skills, playwright-cli. Superpowers, impeccable and ponytail are not carried over as frameworks;
their useful rules (TDD, systematic debugging, simplicity, accessibility) become lines of the
constitution and of the two review checklists.

## Sessions, agents, effort

- One session = one task = one artifact. Interviews are sequential (each answer changes the next
  question). Design and build parallelise by independent screen or slice, in separate worktrees.
- Claude for phases 0, 1, 4, engine slices, and review of design and UI code. Codex for phases 3,
  UI slices, raster art, and review of specs, architecture and engine code.
- Effort: `xhigh` for interviews, specs, architecture, reviews and design; `high` for
  implementation. Hold the level for the whole session. Both plans are Max: spend on thinking
  sessions, never on re-reading the repository (subagents do the reading).
- Two corrections on the same point: stop, clear, re-prompt with what was learned.

## Prompt templates (owner → agent)

Every prompt carries Goal, Context, Constraints, Done-when. The owner writes in Italian; the agent
writes the repository in English.

**Open any session**
```
Leggi AGENTS.md e handoff/NEXT.md. Obiettivo: <one line>. Contesto: <files or spec ids>.
Vincoli: rispetta CONSTITUTION.md; una sola attività; nessuna decisione di prodotto senza chiedermi.
Fatto quando: <artifact> esiste, la revisione incrociata è stata richiesta, handoff/NEXT.md è riscritto.
```

**Interview session (phase 1)**
```
Usa la skill interviewing sul livello <product | jobs | domain | features | screen <id>>.
Prima leggi evidence/ e spec/; non chiedermi nulla che sia già scritto lì.
Una domanda alla volta, sempre con la tua risposta consigliata. Massimo <N> domande.
Alla fine scrivi spec/<file>.md, le decisioni datate e riscrivi handoff/NEXT.md.
```

**Cross-review session (any phase)**
```
Usa la skill cross-review, in sola lettura, su <spec file | mock folder | branch>.
Criteri: completezza rispetto a spec/<id>, criteri verificabili, contraddizioni, casi limite,
accessibilità, offline, i18n. Riporta solo blocking/major/minor con file e riga; nessuna correzione.
```

**Design session (phase 3, Codex)**
```
Usa reference-dossier poi disegna spec/screens/<id>. Dossier, wireframe, mock dark EN+IT su tre
viewport. Ogni elemento, stato e interazione dello spec deve comparire. Consegna le immagini in chat
e chiedi la revisione incrociata a Claude prima di chiedermi il verdetto.
```

**Build session (phase 5)**
```
Slice <id>: /speckit.plan poi /speckit.tasks poi implementa in TDD nel worktree task/<slug>.
Verifica nel runtime reale con screenshot; poi richiedi la cross-review. Integra solo a revisione
chiusa. Fatto quando: gate verde, screenshot in chat, handoff/NEXT.md riscritto.
```

## Open questions for the owner

1. New repository name: d20 Studio, or another (the product stays d20 Folio)?
2. Old repository: frozen as read-only evidence, or kept alive for production fixes only?
3. Interview budget: sessions of about 20 questions each, several per day, for two to four weeks?
4. Phase 3 before or interleaved with phase 1 (design a screen as soon as its spec is approved)?
5. Spec Kit as the backbone (to be verified in phase 0), or a lighter hand-written pipeline?
