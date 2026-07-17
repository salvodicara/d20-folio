# d20 Folio — AI Agent Briefing

> Single source of truth for agents working on this project. Kept **lean** — deep detail lives in
> the linked docs.

## What it is

A free, bilingual (EN + IT) PWA for **D&D 2024** players to create, manage, and play characters
digitally — backed by Firebase, offline-first. It replaces the old single-file HTML app
(`dnd-sheets`, read-only reference at `/Users/salvatoredicara/Workspace/dnd-sheets/`). Core value:
a complete pre-loaded 2024 SRD database, cloud sync, and party/campaign features (Party · Chronicle ·
Treasury · SharedNotes · Sessions · DM Tools · encounter/initiative tracking — built and live). The
deterministic rules engine is the product's intelligence — there is no AI/LLM assistant surface.

**Current state:** live at **v0.19.0** (deployed 2026-07-11; 6 real users). The 100%-automation
push, the encounter/combat single-source re-architecture, the campaign-hub redesign, admin
god-mode, the initiative single-source re-architecture, the sheet's management-chrome system (the
Binder's Fob / Signet), and the combat-CTA/reversal grammar are shipped and deployed; the
mechanical-automation long-tail (seams S1–S11) is now effectively CLOSED. The forward frontier is
(1) the 2024 core-rules SYSTEM-audit fix waves (RA-01…RA-35 — `docs/AUTOMATION_BACKLOG.md`), (2) a
tracking-doc reconciliation audit (the rule-16 on-ramp), (3) the design-heavy new-primitive tier
(the marked-target model flagship, et al.), and (4) parked backups/observability/legal (the light
theme is at FULL parity: the depth-parity
rebuild shipped 2026-07-09, the owner-ratified "Daylight Sibling Plates" art direction shipped
2026-07-10, and the owner-ratified "Ember Penumbra" lit-magic grammar shipped 2026-07-11 — per-theme
scene art, the P8 panel material wired, the custom-art veil, the glow-below gilt grammar, no open
light-theme work). Roadmap + open decisions: `PROGRESS.md`; the open
frontier map: `docs/AUTOMATION_BACKLOG.md`.

## Canonical doc index

**These are the ONLY source-of-truth docs.** Keep each one **EXACT, COMPLETE, and CURRENT.** If
reality and a doc disagree, the doc is the bug. Every change updates the relevant doc in the same
commit. Broken cross-references are a bug. Do not add new top-level docs casually — fold detail into
the canonical set.

| Doc                            | What                                                                                                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                    | Project front door — what it is, how to run it, links into the doc set.                                                                                                                                                                                                      |
| `CLAUDE.md`                    | This agent briefing (the lean index — you are reading it).                                                                                                                                                                                                                   |
| `LICENSE`                      | MIT.                                                                                                                                                                                                                                                                         |
| `PROGRESS.md`                  | **Living roadmap + phase status.** Keep it current as you ship.                                                                                                                                                                                                              |
| `CHANGELOG.md`                 | Shipped releases (minted by `@changesets/cli`; see `docs/RELEASE.md`).                                                                                                                                                                                                       |
| `DESIGN.md`                    | **The design system** — defers to `src/index.css` + `src/styles/folio.css` (canonical tokens).                                                                                                                                                                               |
| `PRODUCT.md`                   | The `impeccable` skill's project-context file (register/users/purpose/anti-references) — a distillation `docs/PRODUCT_CONSTITUTION.md` stays the source of truth for; not a second constitution.                                                                             |
| `docs/PRODUCT_CONSTITUTION.md` | **THE PRODUCT CONSTITUTION — supreme product/UX/design rules.** Read before any redesign/feature work; validate ALL work against it; an owner request that conflicts is complied with but surfaced (informed override).                                                      |
| `docs/GOLDEN_RULES.md`         | **The non-negotiable golden rules — cross-cutting engineering/process disciplines + owner philosophy. Read every session.**                                                                                                                                                  |
| `docs/ARCHITECTURE.md`         | **How the system works** — the layered model (data→engine→views→UI), i18n-completeness locks, multiclass model. Start here if new to the code.                                                                                                                               |
| `docs/CHARACTER_SCHEMA.md`     | The v3 portable character codec — the ONLY supported import/export format (`{ schema: 3, build, state, meta? }`).                                                                                                                                                            |
| `docs/MECHANICS.md`            | The declarative-grant taxonomy (every mechanic the engine models).                                                                                                                                                                                                           |
| `docs/AUTOMATION_BACKLOG.md`   | The open automation frontier — the minimum-interaction doctrine, defect-class taxonomy (A–E), the ranked 2024 core-rules SYSTEM-audit ledger (RA-01…RA-35), and the closing seams S1–S10 (companion to the coverage matrix; pack-entity items live in `content-pack/docs/`). |
| `docs/AUTOMATION_COVERAGE.md`  | The per-entity coverage **matrix** (automated/partial/narrative/override) — companion to the backlog; what's auto-computed vs the gap frontier (pack-entity rows live in `content-pack/docs/`).                                                                              |
| `docs/CONTRIBUTING.md`         | Local dev + contribution flow.                                                                                                                                                                                                                                               |
| `docs/RELEASE.md`              | The changeset → release flow.                                                                                                                                                                                                                                                |
| `docs/WORKTREES.md`            | **The work standard** — one worktree + branch-off-`main` per task; NO PRs — agents converge, then merge to `main` (`just wt-new/wt-rm/wt-list`).                                                                                                                             |
| `docs/BUG_REPORTING.md`        | Cloud-Functions runbook — bug-report → GitHub-issue, new-user email, and the SAFE-01 billing kill-switch (setup · IAM · restore path).                                                                                                                                       |

**The contract:**

- **Every change updates the relevant canonical doc in the same commit.** Engine/data change →
  `docs/ARCHITECTURE.md` + `docs/MECHANICS.md`. UI/tokens → `DESIGN.md`. Workflow/tooling →
  `docs/CONTRIBUTING.md`. Status/roadmap → `PROGRESS.md`. Releases → `CHANGELOG.md` via a changeset.
- **Broken cross-references are a bug** — a doc that links a moved/deleted path must be fixed, not left
  dangling.
- Do not add new top-level docs casually — fold detail into the canonical set; this index stays lean.
  Anything that can grow INDEFINITELY becomes its own SINGLE-concern referenced doc (golden rule 16),
  but the number of docs stays minimal — one concern per doc, never proliferate.

## The architecture in one breath

A character's effective stats are **not** computed from prose. Every mechanic-bearing fact is a
typed `Grant` on the SRD data (race trait / feat / class feature / subclass / magic item). At
render time `evaluateGrants(sources)` (`src/lib/grants.ts`) aggregates every grant the character
receives, and the sheet reads the aggregated view. Trackers/actions/riders resolve through
`src/lib/smart-tracker.ts`; derived stats (AC, PB, spell DC, attack, passives) through
`src/lib/compute.ts`; level-up recompute through `src/lib/level-up.ts`. **Adding a mechanic =
adding a `Grant` kind + an evaluator branch + a consumer — never a regex over English.** This is
the single seam between data and UI; keep it that way. Full detail: `docs/ARCHITECTURE.md`,
`docs/MECHANICS.md`.

## Tech stack

React 19 + TypeScript (strict) + Vite 8 (Rolldown bundler) · Tailwind v4 · a **custom in-house UI
layer** (`src/components/ui/*` — hand-written folio components on Radix primitives: dialog, popover,
tooltip, checkbox, radio-group, switch, slot). NOT shadcn/ui — no `shadcn` package is installed.
Zustand state · React Router v7 · Firebase (Auth Google-only, Firestore, Storage, Hosting) ·
Vite PWA (Workbox) · react-i18next (EN + IT) · Vitest (unit) + Playwright (E2E) · ESLint + Prettier ·
`@changesets/cli` · GitHub Actions (two lean workflows: `ci.yml` — push/PR gate, self-skipping
while the repo is private; `deploy.yml` — the dispatch-only remote twin of `just deploy`. The
local hook gate is authoritative; deploys are LOCAL-primary, `docs/RELEASE.md`). No server/SSR —
client-side SPA.

**Toolchain pinned via asdf** (`.tool-versions`): **Node 24.16.0** + **Temurin 25** (the JDK the
Firestore emulator needs) — run `asdf install` after cloning. The root app uses **pnpm**; the
standalone `functions/` package uses **npm** (see Firebase essentials).

## Project layout (high level)

The tree is **feature-centric** — `src/features/` is the primary home of UI; `src/components/` holds
only shared chrome.

```
src/
  features/                          PRIMARY UI HOME, one dir per surface — account, campaigns,
                                     character (CharacterCockpit), compendium, creation (CreationWizard),
                                     leveling, report, roster, wizard
  app/                               AppShell.tsx · router.tsx · routes/ (login, not-found) · shell/ · _data/
  components/{ui,sheet,shared}              custom UI primitives (ui/) + shared sheet chrome + modals
  hooks/                             cross-feature React hooks (useCharacterSubscription, useLocale, …)
  data/                              the SRD database (static TS) — classes/, spells/, feats,
                                     races, backgrounds, equipment, magic-items, conditions, types
  lib/                               engine: grants, smart-tracker, level-up, compute, cast-options,
                                     cost-engine + condition-effects (combat model),
                                     the *-pick / feat-*-choices choice resolvers, character-io,
                                     firebase/firestore/storage, sanitize-character, utils
  lib/views/                         the PRESENTER seam (R2): pure (engine output+locale)→view-model;
                                     the ONLY engine-side layer that localizes — sheet-view,
                                     combat-action-view, toast-intent (engine-core is i18n-free)
  stores/                            Zustand: character/combat/save/ui/toast/auth/confirm
  types/                             CharacterDoc, SessionState, campaign types
  i18n/{en,it}/{ui,srd}/*.json        chrome split into per-group `ui/*.json` shards (merged into ONE
                                     runtime `common` ns) + id-keyed `srd/*.json` content catalogues
                                     (SRD 5.2.1 ONLY — the pack adds its own); async lazy-per-locale
                                     bootstrap (index.ts) — only the active locale loads at startup;
                                     EN srd always loads (engine FACTS)
  index.css · styles/folio.css       the CANONICAL design tokens + folio styles
tests/{unit,e2e}                     Vitest + Playwright (suites here pass in BOTH build modes)
content-pack/                        the PRIVATE content pack (docs/ARCHITECTURE.md → content-pack seam):
                                     all non-SRD data + i18n + the composed-build overlay + pack dev
                                     scenarios + pack-only test suites + the 6 live-user conformance
                                     fixtures (content-pack/fixtures/team/*.json); composed
                                     via the `@pack` alias when present (VITE_CONTENT_PACK≠0), else the
                                     app builds SRD-only
.githooks/{pre-commit,pre-push}      strict local CI gate
```

Character & session shapes live in `src/types/character.ts`; SRD types in `src/data/types.ts` —
read those rather than duplicating them here.

## Constraints

- **Zero budget.** Firebase Blaze, stays in free tier; budget alert at £1.
- **Licensing partition.** `src/data` + `src/i18n/*/srd` carry ONLY SRD 5.2.1 (CC-BY-4.0) content,
  every entry `source: "SRD"` (guard-enforced); ALL other content lives in the private
  `content-pack/`, composed in via the `@pack` alias (docs/ARCHITECTURE.md → "The content-pack
  seam"). Both build modes stay green: `just ci` (pack) and `just ci-srd-only` (the public
  snapshot's composition).
- **Source of truth = `http://dnd2024.wikidot.com/`** — the standard public 2024-rules reference
  5e tools verify against. Model the **facts** (which spells a subclass grants and at what level,
  numeric values, level tables) as declarative data; don't paste long verbatim prose — write
  concise functional descriptions. The sourcing workflow detail lives in
  `content-pack/docs/SOURCING.md`. (IT translations still follow the i18n cascade below.)
- **Bilingual** EN + IT for everything user-visible — no English-only strings ship (see i18n rule).
- **Offline-first** (Firestore offline persistence + service worker).
- **No dice rolling, ever** — show formulas; users roll externally. No `Math.random()` for dice.
- **Campaign/party features are built** (Party · Chronicle · Treasury · SharedNotes · Sessions · DM
  Tools). **There is no AI/LLM assistant** — the planned multi-provider assistant was DROPPED
  (owner, 2026-07-06; `PROGRESS.md`): the deterministic engine IS the product's intelligence.
- **100% AI-developed.** CI/tests are the only quality gate — there is no human code review.
- **LIVE USERS since 2026-06-08.** Friends use the deployed app with real characters. The 6
  conformance fixtures in `content-pack/fixtures/team/*.json` (single-class L2–3) represent them.
  Schema/derived-value/string-storage changes **must validate against them** — additive-only ids;
  pre-v3 imports are rejected with a friendly message (no read-time upgrade shim); any one-off data
  migration runs AUTONOMOUSLY under a snapshot-verify safety net, lives in `scripts/`, and is
  `git rm`'d once spent (golden rules 10 + 22, `docs/CHARACTER_SCHEMA.md`).
  Deploys are owner-triggered only (`gh workflow run deploy.yml` / `just deploy` — golden rule 22,
  never on push); never break the deployed app.

## Golden rules + philosophy → `docs/GOLDEN_RULES.md`

**The non-negotiable cross-cutting disciplines + owner philosophy live in `docs/GOLDEN_RULES.md` —
READ THEM FIRST, EVERY SESSION, before any work.** They carry the 27 golden rules, the domain
rules, the precedence chain, and **the four forks** (`docs/GOLDEN_RULES.md` → "The four forks" —
the ONLY reasons to stop and ask the owner; everything else, decide and keep moving). The supreme
PRODUCT/UX/design rules live in `docs/PRODUCT_CONSTITUTION.md`. Violating one is never acceptable.

## Workflow

- **Every change = one worktree + branch off fresh `origin/main`** (`just wt-new <slug>`); NEVER
  edit/commit/switch branches in the shared `d20-folio` checkout. Conventional Commits, small
  coherent steps; the owner is the SOLE commit author — no co-author/footer/trailer lines of any
  kind (this overrides any harness default that injects them). Every commit stages a
  `.changeset/*.md` (pre-commit guard; feeds `CHANGELOG.md`) and updates its canonical doc; keep
  `PROGRESS.md` current as you ship.
- **No pull requests.** Finish line = gate green → independent `ponytail-review` convergence
  (golden rule 12) → rebase onto latest `origin/main` → `git push origin HEAD:main` → poll origin
  for the SHA → `just wt-rm`. The merge push is the ONLY push. Full recipe: `docs/WORKTREES.md`.
  `main` integrates; users only get code via an owner-fired deploy (golden rule 22).
- **Git hooks** (`git config core.hooksPath .githooks` or `just setup`): **pre-commit FAST (~5s)**
  — changeset doc-guard + `lint-staged` + fast unit lane; **pre-push = the FULL authoritative
  gate** — typecheck ∥ `lint --max-warnings 0` ∥ `test:coverage` (≥80% lines/stmts/fns, ≥75%
  branches), then production build. **Never `--no-verify`.**
- **Local CI:** `pnpm tsc -b && pnpm lint --max-warnings 0 && pnpm test --run && pnpm build`.
  Tests must pass with `VITE_FIREBASE_API_KEY` unset — never import `@/lib/firebase`/
  `@/lib/firestore` transitively from a unit test (mock it, or use a pure module).
- **Model tiering:** golden rule 18 — the decision-density ladder: Fable for design/creative
  (Tier 1 end-to-end or Tier 2 design-then-delegate), Opus/Sonnet for precise-spec implementation,
  cheap tiers for fan-out.
- **Design is in-repo:** `DESIGN.md` + the canonical tokens (`src/index.css` +
  `src/styles/folio.css`); validate all UI work against `docs/PRODUCT_CONSTITUTION.md`.

## Skill roster (golden rule 18 — one canonical skill per job)

| Skill                          | Job / trigger                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `impeccable`                   | ALL UI/UX design/audit/polish (golden rule 19). Official [pbakaus/impeccable](https://github.com/pbakaus/impeccable), committed at `.claude/skills/impeccable/` (present in every worktree); reads root `PRODUCT.md` + `DESIGN.md` — `DESIGN.md` §15 is the project checklist.                                                                                                                                                                                                                                                                             |
| `ponytail` + `ponytail-review` | ALL code changes, implicitly (golden rule 1) + the independent-review side of the convergence loop (golden rule 12).                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `graphify`                     | Code navigation / architecture queries ("what calls X", dependency maps, find ALL consumers before changing a seam) — `/graphify src`. On the symbol-level AST graph the STRUCTURAL views earn their keep: read the **God Nodes** for the hub / highest-risk modules, extract a **directory-scoped subgraph** for a seam's fan-in/out; the NL `graphify query` only literal-token-matches an AST graph, so prefer the structural queries. Locally installed (PyPI `graphifyy`), NOT a repo dep; `graphify-out/` is gitignored; an index, not ground truth. |
| `grill-me`                     | Owner forks + plan stress-tests (the four forks).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `claude-md-optimizer`          | Steering-doc bloat — progressive disclosure, tiering, zero information loss.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

A better skill for a job REPLACES the incumbent (golden rule 18).

## Firebase essentials

- Project: `d20-folio` · Hosting: `d20-folio.web.app` · Region: `europe-west1`.
- Auth: Google only; first sign-in creates `/users/{uid}` (`status: "active"`).
- **Admin is data-driven** (owner-ratified): a user is admin iff their `/users/{uid}` doc has
  `role: "admin"`. The SAME field is read by the client gate (`useIsAdmin` →
  `profile.role`) and `firestore.rules` (`isAdmin()` reads the doc), so they can't drift
  and nothing admin-related is in the client bundle. Granted out-of-band (Firestore
  console or an admin script); the client can never set it (users `update` is admin-only;
  `create` forbids self-assigning `role`). The current admin uid is not written down here — read
  it from the Firestore console (or `.env.local`).
- Security rules live in `firestore.rules` / `storage.rules` (owner-scoped reads/writes;
  blocked users denied; admin override). Env in `.env.local` (not committed); CI uses repo secrets.
- Data model: one Firestore doc per character (`/users/{uid}/characters/{charId}`) holding
  `character` (sheet) + `session` (play state); SRD content stored as **references** (`srdId`),
  resolved against the bundled SRD at render. Full shapes in `src/types/character.ts`.
- **Cloud Functions** (`functions/`, 2nd-gen, `europe-west1`, Node 24): two Firestore `onCreate`
  triggers — `onBugReportCreated` (in-app report → GitHub issue) and `onUserCreated` (new signup →
  owner email) — plus `deleteUser` (admin-only account nuke) and `onBudgetAlert` (SAFE-01 billing
  kill-switch: a Pub/Sub trigger on the `budget-kill` topic that detaches billing when the £1 budget
  is exceeded, hard-guaranteeing the zero-budget promise). This package uses **npm** (standalone —
  NOT the pnpm workspace; never run `pnpm` in `functions/`). Deploy with
  `firebase deploy --only functions` (its `firebase.json` predeploy runs `npm ci` + lint + build).
  Secrets live in **Secret Manager** (`defineSecret`), not `.env`. Full setup runbook:
  `docs/BUG_REPORTING.md`.

## Key design decisions (the durable ones)

SRD references (not copies) so SRD updates auto-propagate · auto-save debounced ~2s, last-write-wins ·
portraits in Storage (base64 only in JSON export) · level-up wizard is SRD-aware (auto-suggests
features/spells/ASI) · every derived value = auto-compute + override · combat algorithm kept (useful
for new players) · PDF export targets the official 2024 layout · responsive: cards on mobile, tables
on desktop · dark + light themes. The complete decision log is in git history / `CHANGELOG.md`.
