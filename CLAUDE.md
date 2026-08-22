# d20 Folio — agent briefing

This file is the short, cross-harness router. `AGENTS.md` is a symlink to it, so every instruction
here must work in both Claude Code and Codex. Read only the documents relevant to the task; do not
load the whole documentation set by default.

## Product

d20 Folio is a free, bilingual EN+IT, offline-first PWA for D&D 2024 players. It combines a
deterministic rules engine, character management, and live party/campaign play. It complements the
physical table and external dice; it is not a VTT and has no AI/LLM product surface.

The app has live users. Preserve stored characters and the deployed experience. `main` is the
integration line, not proof of what is deployed; deployment is always owner-triggered.

For the current roadmap and release state, inspect [PROGRESS.md](PROGRESS.md), git, and the relevant
runtime/configuration rather than copying dated status into this briefing.

## Authority and document roles

No source is infallible merely because it is called canonical. A fact has one document owner, while
code, configuration, tests, git, and deployed behavior provide evidence about reality.

| Role         | Owners                                                                                                                                                                           | Use                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Constitution | [Product Constitution](docs/PRODUCT_CONSTITUTION.md), [Golden Rules](docs/GOLDEN_RULES.md)                                                                                       | Durable product, safety, and repository invariants       |
| Map          | [Architecture](docs/ARCHITECTURE.md), [Mechanics](docs/MECHANICS.md), [Character schema](docs/CHARACTER_SCHEMA.md), [Design](DESIGN.md), [IT registry](docs/IT_NAME_REGISTRY.md) | How the current system is intended to work               |
| Status       | [Progress](PROGRESS.md), [Automation coverage](docs/AUTOMATION_COVERAGE.md), [Automation audit record](docs/AUTOMATION_BACKLOG.md)                                               | Current and remaining work; verify claims before acting  |
| History      | [Changelog](CHANGELOG.md), changesets, git history                                                                                                                               | What changed and why; not current operating instructions |
| Operations   | [Contributing](docs/CONTRIBUTING.md), [Worktrees](docs/WORKTREES.md), [Release](docs/RELEASE.md), [Bug reporting](docs/BUG_REPORTING.md)                                         | Task-specific procedures and runbooks                    |

When sources disagree: respect the user's latest informed decision; identify the owner of the fact;
inspect current code/config/runtime and relevant tests; use history to recover intent; then reconcile
the owner document in the same change. Tests and memory are evidence, not authority. A branch is a
proposal until integrated.

## Product and safety invariants

- **No dice rolling:** never generate dice results or use RNG for dice. Show formulas; deterministic
  effects may apply with undo, while rolled effects require user input.
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

- Every repo change uses `just wt-new <slug> [kind]` from the shared checkout; never edit, commit,
  or switch branches in that checkout. Full flow: [Worktrees](docs/WORKTREES.md).
- Small Conventional Commits; the owner is the sole commit author, with no co-author/footer/trailer.
  Every commit includes a `.changeset/*.md` and reconciles the document that owns the changed fact.
- Never use `--no-verify`. The authoritative local gate for integration is `just ci`; use
  `just ci-srd-only` when the licensing seam is affected. Rules changes also run `pnpm test:rules`.
- Non-visual work may integrate after review and green gates. Visual work waits for approved,
  curated before/after screenshots across the affected theme/locale/viewport matrix.
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
- **ponytail / ponytail-review:** implementation simplicity and over-engineering review after the
  product design is settled; they do not lower the target or replace correctness review.
- **grill-me:** product-direction interviews and genuinely ambiguous owner intent, not technical
  choices that evidence can resolve.

Choose the smallest set of non-overlapping tools for the task. Resolve technical conflicts from
documentation and evidence; ask the owner only about genuine product/taste, cost/privacy,
irreversible external actions, or unresolved authority decisions.

## Common commands

- Setup: `asdf install && pnpm install && git config core.hooksPath .githooks`
- Development: `pnpm dev`
- Focused tests: `pnpm test --run <path-or-pattern>`
- Full composed gate: `just ci`
- SRD-only gate: `just ci-srd-only`
- Firebase rules: `pnpm test:rules`
- Release and deploy procedures: [Release](docs/RELEASE.md) and
  [Contributing](docs/CONTRIBUTING.md)
