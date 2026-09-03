# d20 Folio — agent briefing

This file is the short, cross-harness router. `AGENTS.md` is a symlink to it, so every instruction
here must work in both Claude Code and Codex. Read only the documents relevant to the task; do not
load the whole documentation set by default.

## Product

**Steering (owner, 2026-09-03; full text in [PRODUCT.md](PRODUCT.md) §Steering, which outranks
every other document):** d20 Folio is a digital table where the app does the math and the rules
the way Baldur's Gate 3's engine does, the people do the story, and the DM can change anything.
Free, bilingual EN+IT, offline-first PWA for D&D 2024, for remote groups and the physical table;
built for the owner's group first, public later. It is not a 3D game, not an AI narrator, not a
chat. It is self-contained: notes, recap, chronicle, calendar, NPCs, loot, handouts and homebrew
live in the app, never in another tool. Default automation is BG3's; the DM always has the last
word. First milestone: one whole session of the group without opening Owlbear, D&D Beyond or a
calculator.

The app has live users and production keeps working as it is: `main` receives production fixes
only, the new app grows in a separate long-lived branch and worktree with a mandatory staging
environment, and is released only when the milestone is reached. Preserve stored characters and
the deployed experience; deployment is always owner-triggered. Approved cuts for the new branch
and the keep/rebuild inventory are recorded in the steering.

For the current roadmap and release state, inspect [PROGRESS.md](PROGRESS.md), git, and the relevant
runtime/configuration rather than copying dated status into this briefing.

## Authority and document roles

No source is infallible merely because it is called canonical. A fact has one document owner, while
code, configuration, tests, git, and deployed behavior provide evidence about reality.

| Role         | Owners                                                                                                                                                                           | Use                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Constitution | [Product Constitution](docs/PRODUCT_CONSTITUTION.md), [Golden Rules](docs/GOLDEN_RULES.md)                                                                                       | Durable product, safety, and repository invariants       |
| Map          | [Architecture](docs/ARCHITECTURE.md), [Mechanics](docs/MECHANICS.md), [Character schema](docs/CHARACTER_SCHEMA.md), [Design](DESIGN.md), [IT registry](docs/IT_NAME_REGISTRY.md) | How the current system is intended to work               |
| Status       | [Program status](docs/PROGRAM_STATUS.md)                                                                                                                                         | active agent-program execution control                   |
| Status       | [Progress](PROGRESS.md), [Test portfolio](docs/TEST_PORTFOLIO.md), [Automation coverage](docs/AUTOMATION_COVERAGE.md), [Automation audit record](docs/AUTOMATION_BACKLOG.md)     | Current and remaining work; verify claims before acting  |
| History      | [Changelog](CHANGELOG.md), changesets, git history                                                                                                                               | What changed and why; not current operating instructions |
| Operations   | [Contributing](docs/CONTRIBUTING.md), [Worktrees](docs/WORKTREES.md), [Release](docs/RELEASE.md), [Bug reporting](docs/BUG_REPORTING.md)                                         | Task runbooks                                            |

Agents update `docs/PROGRAM_STATUS.md` whenever a frontier, lease, blocker, owner gate, or
integration SHA changes. Do not duplicate those execution facts in product/release status.

When sources disagree: respect the user's latest informed decision; identify the owner of the fact;
inspect current code/config/runtime and relevant tests; use history to recover intent; then reconcile
the owner document in the same change. Tests and memory are evidence, not authority. A branch is a
proposal until integrated.

## Product and safety invariants

- **Every roll is logged:** dice roll in-app by default or are entered from physical dice; every
  roll records formula, result, roller and source in the encounter log, and every consequence
  applies automatically with undo. Shipped code still enforces the older "no dice" rule until the
  play screen lands; do not add RNG outside the dice seam.
- **Bilingual by construction:** every user-visible string ships in EN and IT through i18n; never
  branch on display text or persist translated labels.
- **Licensing partition:** public `src/data` and `src/i18n/*/srd` contain only SRD 5.2.1 content.
  Non-SRD content lives in the private `content-pack/`. Design against the full product and keep
  `just ci` plus `just ci-srd-only` green when the pack seam is touched.
- **Offline-first and zero-cost posture:** avoid redundant listeners/polling, preserve PWA behavior,
  and stay within Firebase safeguards and bundle budgets.
- **Live-user safety:** schema, derived-value, and stored-string changes validate against the six
  team fixtures. Migrations use the snapshot → dry-run → idempotent apply → verify protocol.
- **Owner gates:** never deploy or publish externally without explicit per-change permission. Any
  visual change requires the repository's screenshot approval gate before integration.
- **Secrets:** never print, commit, or store them in agent memory. Use `.env.local`, CI secrets, and
  Secret Manager.

## Architecture in one breath

> **Direction (2026-09-02):** the combat runtime is being re-architected. The target — one
> entity-generic reducer over an append-only Encounter log, one mechanics authoring format, rules as
> access policy — is owned by
> [`docs/superpowers/specs/2026-09-02-total-combat-automation-design.md`](docs/superpowers/specs/2026-09-02-total-combat-automation-design.md)
> and its [migration program](docs/superpowers/plans/2026-09-02-total-combat-automation-migration.md).
> The paragraph below describes the code as it is today; `src/lib/combat` is the P2 prototype.

Mechanics are typed data, never prose parsing: a mechanic-bearing source declares a `Grant`;
`evaluateGrants` aggregates it; pure engine/presenter seams expose it; UI consumes the result.
Dependencies point data/types/stores/lib → views → features/UI, never backwards. A shared fact has
one model home and may be edited from several surfaces through that seam.

Read [Architecture](docs/ARCHITECTURE.md) before changing boundaries, persistence, or Firebase;
[Mechanics](docs/MECHANICS.md) before changing rules automation; and
[Character schema](docs/CHARACTER_SCHEMA.md) before changing stored/imported data.

## Stack and repository boundaries

React 19, strict TypeScript, Vite 8, Tailwind v4, Zustand, React Router v7, Firebase, Vite PWA,
react-i18next, Vitest, Playwright, ESLint, Prettier, and Changesets. The UI layer is custom
`src/components/ui/*` on Radix primitives; it is not shadcn/ui.

- UI: `src/features`, `src/app`, `src/components`, `src/hooks`
- Engine/data: `src/lib`, `src/stores`, `src/data`, `src/types`; localized presenters only in
  `src/lib/views`
- Locales: `src/i18n/{en,it}`; tests: `tests/{unit,e2e}`
- Private composition: gitignored `content-pack/` symlink
- Root package manager: pnpm. `functions/` is standalone npm. Toolchain is pinned in
  `.tool-versions` (Node 24.16.0, Temurin 25).

## Delivery workflow

Superpowers is the default lifecycle: discovery/brainstorming → written plan → isolated worktree →
TDD → systematic debugging as needed → review → verification before completion. Project-specific
adapters below override generic command examples, not the lifecycle:

- Every repo change uses an isolated worktree. `just wt-new` and `just wt-rm` run from a clean
  worktree whose HEAD has just been proven equal to fresh `origin/main` (the new app's work runs in
  the long-lived `v2` worktree); never run a stale worktree recipe from the shared checkout. The
  shared checkout stays untouched and is never recipe authority merely because it is on local
  `main`. Full flow: [Worktrees](docs/WORKTREES.md).
- Small Conventional Commits; the owner is the sole commit author, with no co-author/footer/trailer.
  Every commit includes a `.changeset/*.md` and reconciles the document that owns the changed fact.
- Never use `--no-verify`. The authoritative local gate for integration is `just ci`; use
  `just ci-srd-only` when the licensing seam is affected. Rules changes also run `pnpm test:rules`.
- Non-visual work may integrate after review and green gates. Visual work waits for approved,
  curated before/after screenshots across the affected theme/locale/viewport matrix, delivered as
  actual chat images viewable on the owner's phone rather than local file paths.
- Finish by rebasing on fresh `origin/main`, pushing explicit `HEAD:main`, confirming the SHA, and
  removing the worktree. No PR flow. Never deploy as part of integration.

## Tool routing

- **Superpowers:** canonical delivery lifecycle, TDD, debugging, review, and verification.
- **ECC selective skills:** specialist audits/governance/product/browser/security/eval work only;
  the monolithic ECC plugin stays disabled to protect context.
- **Find Skills:** discover candidates; verify adoption, reputation, currency, security, and overlap
  before installing. A better proven solution replaces the weaker incumbent.
- **claude-mem:** searchable context and leads only; verify before use. Cloud sync remains opt-in.
- **Task Observer:** log process observations externally at
  `~/.agents/state/d20-folio/skill-observations/log.md`, never inside a worktree.
- **impeccable:** all UI/UX design, critique, accessibility, responsive behavior, and motion; read
  [Product](PRODUCT.md), [Product Constitution](docs/PRODUCT_CONSTITUTION.md), and [Design](DESIGN.md).
- **graphify:** architecture/navigation queries when a graph exists; treat it as an index, not truth.
- **ponytail / ponytail-review:** Ponytail applies implicitly to every code change after the product
  design is settled; ponytail-review checks risky diffs for avoidable complexity. Neither lowers the
  target or replaces correctness review.
- **grill-me:** product-direction interviews and genuinely ambiguous owner intent, not technical
  choices that evidence can resolve.
- **Giants' shoulders (golden rule 30):** research the state of the art and copy the dominant,
  proven pattern with real evidence before designing or building anything; the dossier method
  (reference beside our rendition, then rules) is the standard for every surface.
- **Language:** the repository — code, comments, documents, commits, changesets, issues — is in
  English (open source, external collaborators); the conversation with the owner is in Italian.
- **Firebase and cloud access (agent-managed repo):** the owner does not operate consoles. Use the
  Firebase CLI (`firebase`, logged in as the owner) and `gcloud` for projects, Firestore, rules,
  indexes, hosting and functions; the project-scoped Firebase MCP server in `.mcp.json` for
  console-like queries; `gh` for GitHub. Production project `d20-folio`, staging `d20-folio-staging`
  (alias `staging`, config in the gitignored `.env.staging.local`). Deploys stay owner-gated.

Choose the smallest set of non-overlapping tools for the task. Resolve technical conflicts from
documentation and evidence; ask the owner only about genuine product/taste, cost/privacy,
irreversible external actions, or unresolved authority decisions.

## Common commands

- Setup: `scripts/worktree/bootstrap-worktree.sh`. This pinned idempotent bootstrap
  verifies Node 24.16.0 and pnpm 11.2.2, installs the root and standalone `functions/`
  dependencies, and configures `core.hooksPath=.githooks`.
- Development: `pnpm dev`
- Focused tests: `pnpm test --run <path-or-pattern>`
- Full composed gate: `just ci`
- SRD-only gate: `just ci-srd-only`
- Firebase rules: `pnpm test:rules`
- Release and deploy procedures: [Release](docs/RELEASE.md) and
  [Contributing](docs/CONTRIBUTING.md)
