# Restart proposal v2 — d20 Studio (2026-09-12)

Owner request of 12 September 2026: stop before the next mock pass, return to product design,
interrogate every feature, screen, button and interaction from zero, in a new repository whose
process is designed for Codex (GPT-6 Astra, "Astra") and Claude (Fable 5.1) working together, run
only through prompts by the owner. Copy proven methods and products; invent almost nothing. No time
limit: the group keeps playing on production `main` meanwhile. The product name is provisional
(working name **d20 Studio**) and may change once the direction is clear.

This is v2 of the proposal, rebuilt on five research reports written today and kept beside it in
[`restart-research/`](restart-research/): methods, landscape, skills, frameworks, benchmarks, plus
two domain reports written on the owner's request of the same day: a D&D primer (the game from its
origins to the 2024 rules) and a market and behaviour study (what DMs and players do, customise,
use and want, and which features are dead ends). It is
a proposal until Codex has reviewed it (step −1 below) and the owner has decided.

## 0. Diagnosis of the current repository

- Governance weighs more than the product: the steering, design, golden-rule, constitution and
  program documents total ~2,000 lines; 136 documents under `docs/`; three overlapping
  methodologies (Superpowers lifecycle, 36 golden rules, P01–P30 program).
- No surface was ever specified element by element: mock 0.9.3 is the reference, but no document
  lists every screen with its objects, states, calls-to-action and consequences.
- Worth keeping as **evidence** (never as authority): `PRODUCT.md` §Steering, the jobs research
  (`docs/superpowers/research/2026-09-03-self-contained-jobs.md`), `docs/program/DECISIONS.md`,
  the ADRs, the BG3/D&D Beyond research, mock 0.9.3, the engine knowledge in `src/lib` and the
  typed-mechanics (Grant) design, which D&D Beyond's own 2026 "rules as data" rebuild validates.

## 1. What the research says (one line each; details in the reports)

| Finding                                                                                                                                                                  | Report     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Structure before screens: Object-Oriented UX (ORCA) inventories every object, relationship, call-to-action and attribute before any wireframe; Event Storming adds behaviour over time | methods    |
| Questions must pass the Mom Test: ask about the last session that happened, never "would you like X"                                                                     | methods    |
| Amazon PR/FAQ and Shape Up breadboards are the proven ways to frame a product and to describe screens without layout                                                    | methods    |
| Acceptance criteria in EARS ("WHEN …, THE SYSTEM SHALL …") are readable by the owner and testable by the agents                                                          | methods    |
| Full per-feature document hierarchies (Spec Kit, BMAD wholesale) drift and cost tokens; borrow their best parts (clarify taxonomy, dated answer ledger, checklists)       | frameworks |
| Superpowers is the most adopted lifecycle, official on both harnesses, and already the owner's default: keep it as the backbone                                          | frameworks |
| Two agents on one repo work when ownership is by path and enforced by hooks, the reviewer is read-only, and the verdict is a file gated by CI                              | frameworks |
| Separating the agent that does the work from the agent that judges it is Anthropic's own strongest lever for long-running work                                            | frameworks |
| Every tool the owner likes (superpowers, impeccable, ponytail, graphify, archify, Pocock's grilling) is alive, MIT/Apache, and runs in Codex too                          | skills     |
| One skills home: `.agents/skills/` read by Codex, `.claude/skills` a committed symlink to it                                                                              | skills     |
| Twelve products and games to tear down first, BG3 and Solasta at the top; Sigil is dead, D&D Beyond is rebuilding, "sheet + map + dice on one screen" is the shared demand | landscape  |
| GPT-6 Astra and Fable 5.1 are close on agentic coding; each leads on different benchmarks, so routing is per task and re-evaluated at every model release                   | benchmarks |

## 2. The proposal in one paragraph

A new public repository, **d20 Studio**, born as a specification workshop and growing into the
application. Superpowers as the lifecycle backbone. A long discovery phase copied from product
design's best methods, run as an interview in which Claude asks the owner one question at a time
with a recommended answer taken from a reference dossier. Every screen described as objects,
calls-to-action, states and EARS criteria before Codex draws it. Two agents with ownership by path,
alternating writer and reviewer, the reviewer always read-only, the verdict a file that CI gates.
The owner answers questions, judges images, reads a fixed report and takes dated decisions. The old
repository becomes read-only evidence.

## 3. Roles and routing

| Who              | Owns                                                                                                                                                                             | Never                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Owner            | Answers interviews, judges visuals from images, takes dated decisions at the decision boundary, authorises deploy/cost/migration                                                  | Reads diffs, edits files, resolves technical conflicts  |
| Claude (Fable)   | Interviews and specs, domain model, architecture, engine/rules/data, tests, gates, document hygiene, code graph and diagrams; reviews Codex's design and UI work                | Visual taste decisions                                  |
| Codex (Astra)    | Reference dossiers, wireframes, mocks, raster art, design system, UI implementation from an approved spec; reviews Claude's specs, plans, architecture and engine code           | Changes a spec without an owner decision                |
| Subagents        | Bounded research, read-only adversarial review, screenshot sweeps                                                                                                                | Integrate anything                                      |

Routing by task type is evidence-based and dated (benchmarks report §4, 13 rows with sources and
confidence). Summary as of 2026-09-12, GPT-6 Astra versus Claude Fable 5.1:

| Task type                                   | Route                                                             | Confidence |
| ------------------------------------------- | ----------------------------------------------------------------- | ---------- |
| Interviewing, requirements, specs           | Claude (respects stated intent; strongest long-document synthesis) | medium     |
| Architecture, ADRs, diagrams                | Claude; Astra as second opinion on hard designs                   | medium-high |
| UI/UX design and mocks                      | Codex Astra (WebDev Arena lead, practitioner taste)               | medium     |
| Raster art, icons, image-based mocks        | Codex (gpt-image-2; Claude has no image model)                    | high       |
| CSS pixel pass vs tokenised system code     | Astra for the pixel pass; Claude for the token system             | medium-low |
| Engine, rules, data logic, tests            | Claude (LiveCodeBench #1, SWE-bench Pro 81.2, instruction fidelity) | high     |
| Debugging                                   | Logic and state bugs → Claude; terminal, build, CI, infra → Astra  | medium     |
| Code review of the other's work             | Astra primary (finds more cross-file bugs); Claude tie-breaker on intent | high  |
| Documentation and cleanup                   | Claude                                                            | medium     |
| Research and teardowns                      | Live web and app exploration → Astra; synthesis into docs → Claude | medium    |
| Screenshot verification                     | Whoever did not implement; the visual verdict stays with Codex    | low-medium |

Two facts behind the table: the two flagships are tied on the independent composite indices, and
each leads on different rows, so the split is by task, not by prestige. Roles **alternate** on
purpose: whoever wrote never reviews. The table is re-run at every model release (§10).

## 4. Discovery — the interview, copied from product design (Phase 1)

Metaphor the owner chose: an architect interviewing a client about the house of their dreams. The
architect does not ask "do you want a kitchen"; they ask what happened the last time you cooked for
eight people, show you three kitchens that solved it, and recommend one.

**Interview mechanics** (Pocock's `grilling` + Anthropic's interview loop + Spec Kit's `clarify`):

- One question at a time (the owner's preference; a supported switch of `grilling`), always with a
  recommended answer drawn from the reference dossier ("BG3 does X, D&D Beyond does Y, I recommend
  X because…"), multiple choice where possible.
- Frontier only: a question is asked when everything it depends on is settled; nothing obvious,
  nothing already answered in `evidence/` or in an earlier session.
- Mom Test filter on every question: about the owner's real sessions and the table's life.
- Every answer is written the same session as a dated line under `## Clarifications / ### Session
  YYYY-MM-DD` of the owning document; every deviation from earlier evidence is a decision in
  `decisions/`. Ungrillable questions ("how should the hotbar feel?") are parked for a Codex sketch.
- Spec Kit's nine ambiguity categories are the completeness checklist of every area: functional
  scope, domain and data, interaction and UX flow, quality attributes, integrations, edge cases and
  failure handling, constraints and trade-offs, terminology, completion signals.

**The owner has played little D&D.** This changes the interview in three ways, all copied from
how architects work with first-time clients:

- The interviewer teaches before asking: every question opens with one paragraph that explains the
  concept in plain words with a table example ("a reaction is a move you make on someone else's
  turn, like an attack of opportunity when an enemy walks away"), then asks.
- The recommended answer comes from evidence, not from the owner's memory: the market report says
  what most tables do and how often, the primer says what the rules require, the dossier says how
  the best products handle it. The owner decides between named options; he never has to invent.
- "Maximum freedom" is a stated principle, so every object and rule gets two explicit questions:
  "can the DM change this at the table?" and "can a group replace this with homebrew?" — with the
  market evidence on how often people actually do, so freedom is designed where it is used and
  dead-end features are skipped with a reason on record.

**The eleven steps, each its own session series, in this order** (the rationale is in the methods
report §11: objects before events before features before screens before criteria):

| #  | Step                     | Question answered                                                          | Artifact                                                                                          | Copied from                                    |
| -- | ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 0  | Frame                    | Why, for whom, what changes in a year, how it could fail                   | `spec/PRFAQ.md` (press release + FAQ), long-term goal, sprint questions                            | Amazon Working Backwards; GV Sprint Monday     |
| 1  | Stories from the table   | What happened last session; when the calculator or Owlbear was picked up   | Interview snapshots, experience map, job stories                                                  | Torres; Mom Test; job stories                  |
| 2  | Reference dossier        | What BG3, Solasta, D&D Beyond and the others do, screen by screen          | Per-title evaluation, feature matrix, per-screen interaction inventory, task step counts           | Games competitor evaluation; Nielsen; HTA      |
| 3  | Objects                  | What the things are, how they relate, what each role can do to them        | Noun list, Nested-Object Matrix, CTA Matrix, Object Map, Object Guide (= glossary), attributes     | OOUX / ORCA rounds 1–2                         |
| 4  | Events and rules         | What happens, in what order, triggered by what, deciding what              | Event timeline of a session and a round; every rule as trigger → command → event                  | Event Storming (process level)                 |
| 5  | Opportunities → features | Which needs, which candidate solutions, which we pick and why              | Opportunity Solution Tree; one pitch per block (problem, appetite, solution, rabbit holes, no-gos) | Torres; Shape Up pitch                         |
| 6  | Journey and slices       | In what order the features are used; the smallest whole session           | Story map: activities → steps → stories; walking skeleton = first milestone                       | Patton User Story Mapping                      |
| 7  | Screens                  | Which places exist, what you can do on each, where each takes you          | Breadboards (places / affordances / connections); Nav Flow; card/detail/list/landing per object   | Shape Up breadboarding; ORCA round 3           |
| 8  | Interactions and states  | Every state and transition of every screen and component                   | Wireflows; per-component state inventory; storyboard of the walking-skeleton session              | NN/g wireflows; state notation; Sprint         |
| 9  | Acceptance criteria      | How we will know each behaviour works                                      | `requirements.md` per feature: job story + numbered EARS criteria + Gherkin flows + usability pillars | Kiro; EARS; Gherkin; Hodent                  |
| 10 | Synthesis and gate       | Is anything still silently assumed                                         | Spec per block; pre-mortem and red-team pass; ADRs for hard-to-reverse trade-offs                 | Pocock to-spec; BMAD elicitation; MADR         |

Output layout: `spec/PRFAQ.md`, `spec/jobs.md`, `spec/objects/` (guide, matrices), `spec/events/`,
`spec/features/<id>/requirements.md`, `spec/screens/<id>.md`, `spec/flows/<id>.md`, `spec/glossary.md`,
`spec/open-questions.md`; each with its dated `## Clarifications`. Step 2 can run in parallel with
steps 0–1 (Codex owns the dossiers, Claude the interviews).

## 5. Teardown targets (Phase 1, step 2)

Study in this order, each with a written evaluation template before playing, recordings, and a
per-screen interaction and state inventory (landscape report for the reasons and URLs):

1. Baldur's Gate 3 — hotbar, reaction prompts, initiative strip, dice screen, party inventory, level-up, journal.
2. Solasta: Crown of the Magister and Solasta II — the most rules-faithful 5e engine; the only 2024-rules implementation.
3. Foundry VTT dnd5e system (Activities, Active Effects V2) + Midi-QOL presets — mechanics as data; three automation levels.
4. D&D Beyond — character-side parity target; its 2026 roadmap and its list of pains to avoid.
5. Shard Tabletop — the consolidated action block; closest sheet-plus-automation hybrid.
6. Owlbear Rodeo 2 — onboarding in thirty seconds; touch canvas; the floor for the physical table.
7. Roll20 Jumpgate — performance budget, undo/redo, page folders, secret DM pins.
8. Pathbuilder 2e — plan the whole progression, one-tap level-up.
9. Pathfinder: Wrath of the Righteous / Rogue Trader — roll breakdown with provenance in the log.
10. Fire Emblem forecast + Into the Breach telegraphing + Tactical Breach Wizards undo — preview before commit, undo after.
11. Avrae + Improved Initiative — minimal, correct combat-state models without a map.
12. LegendKeeper + Kanka + Neverwinter Nights DM client — campaign wiki, chronicle, secrets, handouts.

Cross-cutting demands the market keeps repeating: sheet, map and dice on one screen; reliable 2024
automation; true offline and in-person mode; party inventory and loot transfer; printable sheets.

## 6. Phases after discovery

- **Phase 2 — Spec cross-review (Codex, read-only).** Findings as blocking / major / minor with file
  and line; Claude resolves; product questions go to the owner as multiple choice with a
  recommendation. Exit: zero blocking findings and zero `NEEDS CLARIFICATION` markers.
- **Phase 3 — Design (Codex, one screen or flow per session).** Dossier entry → wireframe → mock,
  dark theme, EN and IT, three viewports, every state from the state inventory. Claude reviews each
  mock against its screen document with a checklist. The owner judges images only. Exit: every
  must-have screen approved.
- **Phase 4 — Architecture (Claude, Codex review).** Engine, data model, persistence, offline, auth,
  licensing partition, test portfolio, budgets. Old engine seams are salvaged only when a spec asks.
- **Phase 5 — Build (both, vertical slices, worktrees).** A slice is a job end to end. Per slice:
  brainstorm gate → plan (2–5 minute tasks with tests) → TDD → runtime verification with screenshots
  → cross-review → fix → integrate. Ownership by path decides who writes; the other reviews.
- **Phase 6 — Migration and release (owner-gated).** Six fixtures; snapshot → dry-run → idempotent
  apply → verify; staging first; the owner's switch.

## 7. The two-agent operating model

- **Ownership by path**, declared in `OWNERSHIP.md` and enforced by a `PreToolUse` hook in each
  harness: Codex owns `docs/design/**`, `src/styles/**`, UI components once specified; Claude owns
  `src/lib/**`, `tests/**`, `decisions/**`; shared files are edited only through a named task.
- **One worktree per task per agent.** Claude Code blocks edits outside its worktree; Codex desktop
  creates worktrees too.
- **Reviewer read-only by construction.** Codex reviews through `.codex/agents/reviewer.toml` with
  `sandbox_mode = "read-only"` or `codex review --base`; Claude reviews through `/code-review` in a
  fresh subagent; the Codex plugin for Claude Code adds `/codex:adversarial-review` for risky diffs.
- **Verdict as a file.** `changes/<slug>/review.json` records reviewer, model, effort, commit SHA,
  verdict (`approve` | `needs-attention`), findings and resolutions. A required CI check
  `review-gate` fails unless the verdict is approve, the SHA matches HEAD and the reviewer differs
  from the author. No vendor review is an approval by itself.
- **Reviewer brief.** "Report only gaps that affect correctness or the stated requirements; treat
  the rest as optional" (Anthropic's caveat: a reviewer asked for gaps always finds some).
- **Owner report.** Every change ends with `changes/<slug>/REPORT.md`, pasted in chat: what changed
  in plain language; what you can now do; evidence (checks, screenshots EN/IT phone/desktop, the
  other agent's verdict); decisions taken on your behalf with D-numbers; decisions that need you as
  multiple choice; next and blocked.

## 8. Decision memory

- `decisions/DECISIONS.md`: append-only ledger, one line per decision
  (`D-0042 | 2026-09-12 | owner (chat) | "Rolls are always logged" | supersedes D-0017 | ADR-0010`);
  a pre-commit check rejects edits to existing lines.
- `decisions/ADR-NNNN-<slug>.md` in MADR-minimal form with `decision-makers`, `date`, `status` and a
  `confirmation` (the check that proves the decision is honoured).
- Precedence in `AGENTS.md`: the owner's latest dated decision wins over any document, plan, test or
  memory; conflicting decisions open a question in `program/QUESTIONS.md`, never a guess.
- `program/NEXT.md` is the only handoff, rewritten every session, with a five-line opening prompt.

## 9. Skills (the curated set)

Single home `.agents/skills/`; `.claude/skills` is a committed relative symlink to it. Every entry
below is verified alive, MIT or Apache, and installable in Codex (skills report, task 1).

| Job                                | Pick                                                                     | Overlap pruned                                                |
| ---------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Lifecycle                          | obra/superpowers (brainstorm gate, plans, TDD, debugging, review ceremony, worktrees) | Pocock tdd, diagnosing-bugs, implement, code-review |
| Interview + glossary/ADR hygiene   | mattpocock `grill-with-docs` (= `grilling` + `domain-modeling`), run inside brainstorming | `grill-me` (same primitive), to-spec, to-tickets, triage |
| Agent-readable docs and research   | mattpocock `writing-for-agents`, `research`                              | —                                                             |
| UI/UX craft                        | pbakaus/impeccable (24 commands; reads PRODUCT.md and DESIGN.md)         | anthropics frontend-design, vercel web-design-guidelines      |
| Design-system file format          | google-labs-code/design.md format + linter for `DESIGN.md`               | no new design skill                                           |
| Simplicity                         | ponytail + ponytail-review (deletion-only review)                        | Claude `/simplify` for reviews                                |
| Correctness review, cross-harness  | Claude `/code-review` + `codex review --base` + codex-plugin-cc adversarial review | community bridges, the stop-time review-gate hook   |
| Code graph                         | graphify (committed graph, `graphify query`, hook refresh)              | —                                                             |
| Diagrams                           | archify (typed JSON IR, `--quality showcase` validation)                 | —                                                             |
| Browser verification               | microsoft/playwright-cli skill                                           | vercel agent-browser                                          |
| Firebase                           | firebase/agent-skills (official on both)                                 | —                                                             |
| Skill discovery and quality        | vercel `find-skills` + Anthropic skill-creator, `claude plugin eval`, `/skill-doctor`; Codex `$skill-creator` | superpowers writing-skills, Pocock write-a-skill |

House skills, written with skill-creator and evaluated before commit: `interviewing` (the mechanics
of §4 and the eleven steps), `reference-dossier` (the teardown template of §5), `cross-review` (how
to request, record and gate a review), `owner-report` (the template of §7), `session-handoff`.

## 10. Effort and the model routing protocol

- Effort (both models expose low / medium / high / xhigh / max). Claude: `high` by default,
  `xhigh` for interviews, synthesis, architecture and reviews; `max` avoided because Fable 5.1
  over-edits at the top level. Codex Astra: `low` or `medium` for routine reviews and lookups (its
  ChatGPT Pro allowance is a five-hour and a seven-day window), `high` for design, `xhigh` or `max`
  only for audits and hard debugging. Hold the level for a whole session; vary across sessions.
- Two corrections on the same point: stop, clear, re-prompt with what was learned.
- **Routing re-evaluation** at every frontier release (Anthropic or OpenAI): check the same five
  leaderboards, run the same three bake-off tasks in two worktrees with the same prompt, compare the
  diffs with the other agent as judge, and append the result as a dated decision. The five
  leaderboards, the three tasks and the recording format are in the benchmarks report.

## 11. Prompt templates (owner → agent)

Every prompt carries Goal, Context, Constraints, Done-when. The owner writes in Italian; the
repository is English.

**Open any session**
```
Leggi AGENTS.md e program/NEXT.md. Obiettivo: <one line>. Contesto: <files or spec ids>.
Vincoli: rispetta CONSTITUTION.md; una sola attività; nessuna decisione di prodotto senza chiedermi.
Fatto quando: <artifact> esiste, la revisione incrociata è stata richiesta, program/NEXT.md è riscritto.
```

**Interview session (Phase 1, any step)**
```
Usa la skill interviewing, passo <0..10>, area <...>. Prima leggi evidence/ e spec/; non chiedermi
nulla che sia già scritto lì. Una domanda alla volta, sempre con la tua risposta consigliata presa
dal dossier. Chiedimi cosa è successo davvero al tavolo, non cosa mi piacerebbe. Massimo 20 domande.
Alla fine scrivi gli artefatti del passo con le Clarifications datate, le decisioni, e program/NEXT.md.
```

**Teardown session (Phase 1 step 2, Codex)**
```
Usa reference-dossier su <product>, schermate <...>. Scrivi il template di valutazione prima di
giocare; registra; produci inventario interazioni e stati per schermata, conteggio passi per i
compiti chiave, matrice funzionalità. Solo evidenza, nessuna proposta.
```

**Cross-review session (any phase)**
```
Usa la skill cross-review, in sola lettura, su <spec | mocks | changes/<slug>>. Criteri:
completezza rispetto a spec/<id>, criteri verificabili, contraddizioni, casi limite, accessibilità,
offline, i18n. Solo blocking/major/minor con file e riga; scrivi review.json; nessuna correzione.
```

**Design session (Phase 3, Codex)**
```
Usa reference-dossier poi impeccable su spec/screens/<id>. Wireframe, poi mock dark EN+IT su tre
viewport, uno per ogni stato dell'inventario. Consegna le immagini in chat e chiedi la cross-review
a Claude prima di chiedermi il verdetto.
```

**Build session (Phase 5)**
```
Slice <id> nel worktree task/<slug>: brainstorming gate, writing-plans, TDD, verifica nel runtime
con screenshot, poi cross-review. Integra solo a review.json approvato. Fatto quando: gate verde,
REPORT.md scritto e incollato in chat, program/NEXT.md riscritto.
```

## 12. Steps before Phase 0

- **Step −1 — Codex reviews this proposal.** Read-only on the sources, against the seven reports,
  with the cross-review criteria; findings as blocking / major / minor; Claude resolves;
  disagreements go to the owner as multiple choice with both recommendations. Nothing starts before
  this. The exact prompt for Codex (repository `salvodicara/d20-folio`, branch
  `claude/d20-folio-redesign-planning-3weqk7`):

  ```
  Repository: github.com/salvodicara/d20-folio. Fai checkout del branch
  claude/d20-folio-redesign-planning-3weqk7 (esiste già sul remoto; non crearne altri).
  Leggi, in quest'ordine: docs/program/RESTART_PROPOSAL.md, poi tutti i report in
  docs/program/restart-research/ (methods, landscape, skills, frameworks, benchmarks, dnd-primer,
  dnd-market). Per contesto puoi leggere CLAUDE.md, PRODUCT.md e docs/program/DECISIONS.md del
  repo attuale, che la proposta vuole sostituire.

  Ruolo: revisore avversario, in sola lettura sui file esistenti. Assumi che il piano possa
  fallire in modi costosi finché le prove non dicono il contrario. Cerca: lacune, contraddizioni
  fra sezioni, passi non verificabili, metodi o prodotti mancanti, scelte che i report non
  sostengono, rischi per un proprietario che gestisce solo prompt, punti in cui il tuo giudizio
  di design e di gusto differisce. Sfida in particolare: l'ordine delle undici tappe, la divisione
  dei compiti fra Claude e te, il modello di revisione incrociata, le dieci golden rules, la lista
  delle skill, e la lista dei dodici prodotti da sezionare.

  Output: un solo file nuovo, docs/program/restart-research/2026-09-13-codex-review.md, con:
  (1) verdetto complessivo (approve / needs-attention); (2) trovate numerate, ognuna con severità
  blocking / major / minor, sezione e riga della proposta, prova citata dai report o dal web, e la
  tua alternativa raccomandata; (3) le domande che solo il proprietario può decidere, come scelta
  multipla con la tua raccomandazione; (4) cosa manca del tutto. Nessun altro file modificato.
  Commit "docs(program): codex review of the restart proposal", push sullo stesso branch.
  Scrivi il file in inglese; rispondimi in chat in italiano con un riassunto di dieci righe.
  ```

- **Step 0 — Foundations (Claude, one session).** Skeleton only: `AGENTS.md` (≤ 150 lines) with
  `CLAUDE.md` symlinked, `CONSTITUTION.md` (ten rules, one page), `OWNERSHIP.md`, `decisions/` with
  D-0001 (this operating model), `program/NEXT.md` and `QUESTIONS.md`, `spec/` templates, `evidence/`
  imported with dates and sources, `.agents/skills/` with the curated set installed in both
  harnesses, `.codex/agents/reviewer.toml`, hooks, CI with `review-gate`, `docs-gate`,
  `ownership-gate`. Codex reviews the skeleton before the first interview.

## 13. The ten golden rules (draft, to be grilled)

1. The spec is the source of intent; code and tests are the source of truth about behaviour. A
   disagreement is a bug in one of the two and is fixed in the same change.
2. Nothing is built without a spec, nothing is designed without a dossier, nothing ships without a
   verifiable check the agent ran and showed.
3. One question at a time, one task per session, one artifact per session, one worktree per task.
4. Every session ends by rewriting `program/NEXT.md`; the repository is the only memory.
5. Every owner decision is a dated line in the ledger; the newest dated decision wins.
6. Cross-review is mandatory and alternates: whoever wrote does not review, the reviewer is
   read-only, and nothing integrates until `review.json` says approve on the current commit.
7. Copy the dominant proven pattern with evidence before inventing; reuse before adding.
8. Every roll is logged with its provenance; the DM keeps the last word through undo.
9. Bilingual EN/IT by construction; SRD-only in public, non-SRD in the private pack.
10. Deploy, release, real-data migration and any new cost need an explicit per-change owner
    permission; secrets never enter the repository or an agent's memory.

## 14. Open questions for the owner

1. Repository name d20 Studio as the provisional name, product name decided by the PR/FAQ step?
2. Old repository frozen as read-only evidence, production fixes only on `main`?
3. Interview cadence: sessions of about twenty questions, as many per day as you like, no deadline?
4. Teardowns in parallel with the first interviews (Codex on dossiers while Claude interviews)?
5. Superpowers as the backbone with the borrowings above, rather than Spec Kit wholesale?
