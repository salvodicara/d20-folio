# d20 Folio — agent briefing

The short, cross-harness router. `AGENTS.md` is a symlink to this file, so every instruction here
must work in Claude Code and Codex. Read only the documents the task needs.

## Restart handoff — 2026-09-12

On `claude/d20-folio-redesign-planning-3weqk7`, the restart now continues in
[the new public d20-studio repository](https://github.com/salvodicara/d20-studio).
Read its AGENTS and docs/NEXT for new work. The owner requires a project that can run with GPT
alone, with autonomous research and naming/branding after design clarity. This scoped handoff
supersedes the old PD opening task and vendor allocation for the restart. The sections below
remain historical context on this planning branch; existing production is not migrated or deployed.

## Direction

d20 Folio v2 is a new application, rebuilt from zero on the long-lived branch `v2`. Astra's approved
mock `d20-folio-html-0.9.3-2026-09-06` plus the shell corrections of 7 September 2026 are the
experience reference, and the owner's 9 September engagement feedback is part of it, open as block
**PD**. The delivery plan is [`docs/program/`](docs/program/) — P01–P30 plus PD, one program, no
second roadmap.

`main` is the production app the group still plays on: production fixes only, never merged with
`v2`, retired only after a complete V2, a verified player-data migration and an owner switch.

Two parities are owed at once: everything **Baldur's Gate 3** does at the table (hotbar, automatic
resolution, initiative, reactions, dice, map) and everything **D&D Beyond** does around the
character (a readable, printable sheet, loot moving between characters, a party inventory, the DM's
tools). First milestone: one whole session of the group without Owlbear, D&D Beyond or a calculator.

Product intent is owned by [`PRODUCT.md`](PRODUCT.md) §Steering; start every session from
[`docs/program/NEXT.md`](docs/program/NEXT.md).

## Who decides what

Astra (Codex/GPT) owns every visual and taste decision — screens, layout, palette, typography,
raster art, screenshot matrices. Claude owns everything else — architecture and archify diagrams,
the graphify graph, document/code cleanup, BG3/D&D Beyond research, engine/data/rules, gates. Split
by decision type, not by file (owner, 2026-09-09).

## Authority and document roles

No source is infallible because it is called canonical: a fact has one document owner, while code,
configuration, tests, git and deployed behaviour are evidence about reality.

| Role         | Owns                                                                                                                    | Use                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Constitution | `PRODUCT.md` §Steering · `docs/PRODUCT_CONSTITUTION.md` · `docs/GOLDEN_RULES.md`                                        | Durable product, safety and repo invariants   |
| Program      | `docs/program/{PROGRAM,CHECKLIST,DECISIONS,NEXT}.md` · `docs/PROGRAM_STATUS.md`                                         | The plan, its decisions, handoff and frontier |
| Map          | `docs/{ARCHITECTURE,MECHANICS,CHARACTER_SCHEMA,IT_NAME_REGISTRY}.md` · `DESIGN.md` · `graphify-out/` · `docs/diagrams/` | How the system is intended to work            |
| History      | `CHANGELOG.md` · `docs/archive/v1/` · changesets · git                                                                  | What changed and why; not instructions        |
| Operations   | `docs/CONTRIBUTING.md` · `docs/WORKTREES.md` · `docs/RELEASE.md`                                                        | Task runbooks                                 |

When sources disagree: the owner's latest dated informed decision wins; identify the owner of the
fact; inspect current code, configuration, runtime and tests; use history to recover intent; then
reconcile the owning document in the same change. Tests and memory are evidence, not authority. A
branch is a proposal until it is integrated.

## Product and safety invariants

- **Every roll is logged.** Dice roll in-app by default or are entered from physical dice, per
  person; the DM may roll hidden. Every roll carries formula, result, roller and provenance into the
  encounter log, and every consequence applies automatically with undo. The only roller is the dice
  seam `src/lib/dice.ts` (ADR-0010), pinned by `tests/unit/dice-randomness.guard.test.ts`.
- **Bilingual by construction.** Every user-visible string ships in EN and IT through i18n; never
  branch on display text, never persist a translated label.
- **Licensing partition.** Public `src/data` and `src/i18n/*/srd` carry only SRD 5.2.1 content;
  non-SRD content lives in the private `content-pack/`. Design against the full product and keep
  `just ci` and `just ci-srd-only` green when the pack seam is touched.
- **Offline-first and zero-cost.** No redundant listeners or polling; PWA behaviour preserved;
  Firebase safeguards and bundle budgets respected.
- **Live-user safety.** Schema, derived-value and stored-string changes validate against the six
  team fixtures; migrations follow snapshot → dry-run → idempotent apply → verify.
- **Owner gates.** Deployment, release, real-data migration and any new cost each need explicit
  per-change permission; integration into `v2` authorises none of them.
- **Secrets.** Never printed, committed or stored in agent memory: `.env.local`, CI secrets and
  Secret Manager only.

## Architecture in one breath

One entity-generic reducer over an append-only Encounter log (ADR-0001, ADR-0002) in
`src/lib/combat`: every fact enters as an action, every projection is replayed from the log. Rolls
are log actions carrying their provenance (ADR-0010). The three campaign automation levels — full
auto, propose-and-confirm, log only — are application policy (ADR-0011), and the DM keeps the last
word through correction and undo. Firestore rules enforce access, never gameplay (ADR-0005).
Mechanics are typed data, never prose parsing: a mechanic-bearing source declares a `Grant`,
`evaluateGrants` aggregates it, pure engine and presenter seams expose it, UI consumes the result.
Dependencies point data/types/stores/lib → views → features/UI, never backwards; a shared fact has
one model home and is edited from every surface through that seam.

Read [Architecture](docs/ARCHITECTURE.md) before changing boundaries, persistence or Firebase,
[Mechanics](docs/MECHANICS.md) before changing rules automation, and
[Character schema](docs/CHARACTER_SCHEMA.md) before changing stored or imported data; the accepted
decisions live in [`docs/adr/`](docs/adr/).

## Stack and repository boundaries

React 19, strict TypeScript, Vite 8, Tailwind v4, Zustand, React Router v7, Firebase, Vite PWA,
react-i18next, Vitest, Playwright, ESLint, Prettier and Changesets. The UI layer is custom
`src/components/ui/*` on Radix primitives; it is not shadcn/ui.

- UI: `src/features`, `src/app`, `src/components`, `src/hooks`
- Engine/data: `src/lib`, `src/stores`, `src/data`, `src/types`; localized presenters only in
  `src/lib/views`
- Locales: `src/i18n/{en,it}`; tests: `tests/{unit,e2e}`
- Private composition: the gitignored `content-pack/` symlink to the v2 pack twin
- Root package manager: pnpm. `functions/` is standalone npm. The toolchain is pinned in
  `.tool-versions` (Node 24.16.0, Temurin 25).

## Delivery workflow

Superpowers is the default lifecycle: brainstorming → written plan → isolated worktree → TDD →
systematic debugging → review → verification. The adapters below override command examples, never
the lifecycle.

- **Worktree.** Every change gets its own. A v2 task branches from fresh `origin/v2` onto a
  harness-neutral `task/<slug>` branch under `~/Workspace/Codex`, never in another task's checkout;
  an authorized production fix uses `just wt-new` from fresh `origin/main`
  ([Worktrees](docs/WORKTREES.md)).
- **Commits.** Small Conventional Commits; the owner is the sole author, with no
  co-author/footer/trailer. Every commit stages one `.changeset/*.md` and reconciles the document
  owning the changed fact.
- **Gates.** Never `--no-verify`. The authoritative local gate is `just ci`; add `just ci-srd-only`
  when the licensing seam is touched and `pnpm test:rules` for rules changes; the split is in
  [Contributing](docs/CONTRIBUTING.md).
- **Integration.** Reviewed, gate-green v2 work integrates under the owner's standing delegation of
  8 September 2026: verify against the real runtime, deliver curated runtime screenshots as actual
  chat images across the affected theme/locale/viewport matrix, then integrate — no per-block visual
  verdict is awaited. Push explicit `HEAD:v2`, confirm the remote SHA, remove the task worktree. No
  PR flow; integration is never a deploy.

## Knowledge base and memory

The repository is the only memory. Everything an agent must obey lives here, in English.

- **Graph first.** Before answering any question about the code, run `graphify query "<question>"`.
  The graph is committed (`graphify-out/graph.json` + `GRAPH_REPORT.md`) and refreshed by the
  pre-commit hook when staged code changes; it is an index — then read the files it names.
- **Diagrams.** Every diagram in a map document is an archify source: its JSON and SVG live under
  `docs/diagrams/` and validate at showcase quality. No hand-drawn or pasted diagrams.
- **Handoff.** [`docs/program/NEXT.md`](docs/program/NEXT.md) is the only handoff, rewritten at the
  end of every session; its opening prompt is five lines and never copies contracts.
- **Harness memory.** Claude auto-memory and claude-mem hold harness hazards and pointers only —
  never rules, decisions, state or secrets. Process observations go to the task-observer log at
  `~/.agents/state/d20-folio/skill-observations/log.md`, never inside a worktree.

## Tool routing

- **superpowers** — the delivery lifecycle: plans, TDD, debugging, review, verification.
- **impeccable** — all UI/UX design, critique, accessibility, responsive behaviour and motion,
  reading `PRODUCT.md`, `docs/PRODUCT_CONSTITUTION.md` and `DESIGN.md`.
- **ponytail / ponytail-review** — ponytail applies to every code change once the design is settled;
  ponytail-review checks risky diffs for avoidable complexity. Neither lowers the target.
- **grill-me** — genuinely ambiguous owner intent, never technical choices evidence can resolve.
- **graphify** — the committed code graph; query it before reading files.
- **archify** — every diagram in the map documents.
- **task-observer** — process observations, logged outside the repo.
- **find-skills** — discover candidates and verify adoption, reputation, currency, security and
  overlap before installing; nothing else is installed without that evidence.
- **playwright-cli** — a real browser for runtime verification and screenshots.
- **claude-mem** — searchable prior context and leads only; verify it, never authority.
- **frontend-design** — visual direction inside impeccable's work, never in place of it.
- **`.agents/skills/firebase-*`** — the project-local official Firebase skills.

**Giants' shoulders (golden rule 30):** research the state of the art and copy the dominant, proven
pattern with real evidence before designing or building anything; the dossier method — the real
reference beside our rendition, then the rules — is the standard for every surface — enforced: every
spec carries a `## Reference dossier` (see rule 30).

**Language:** the repository is English — code, comments, documents, commits, changesets, issues;
the conversation with the owner is Italian.

**Firebase and cloud access:** the owner does not operate consoles. Use the Firebase CLI and
`gcloud` for projects, Firestore, rules, indexes, hosting and functions, the Firebase MCP server in
`.mcp.json` for console-like queries, and `gh` for GitHub. Production `d20-folio`, staging
`d20-folio-staging` (alias `staging`, gitignored `.env.staging.local`); deploys stay owner-gated.

Choose the smallest set of non-overlapping tools; resolve technical conflicts from evidence and ask
the owner only at the decision boundary in [Golden Rules](docs/GOLDEN_RULES.md).

## Common commands

- Setup: `scripts/worktree/bootstrap-worktree.sh` — the pinned idempotent bootstrap verifies Node
  24.16.0 and pnpm 11.2.2, installs root and `functions/` deps, sets `core.hooksPath=.githooks`.
- Development: `pnpm dev` · focused: `pnpm test --run <path-or-pattern>`
- Gates: `just ci` · `just ci-srd-only` · `pnpm test:rules`
- Graph query: `graphify query "<question>"`
- Diagram validation:
  `node ~/.agents/skills/archify/bin/archify.mjs validate <type> <json> --quality showcase --json`
- Release and deploy: [Release](docs/RELEASE.md), [Contributing](docs/CONTRIBUTING.md)
