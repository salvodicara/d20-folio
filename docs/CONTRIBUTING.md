# Contributing

> Day-to-day workflow for humans and AI agents. The pre-commit + pre-push hooks enforce
> almost everything below — they're not friction, they're the contract.

---

## First-time setup

```bash
git clone git@github.com:salvodicara/d20-folio.git
cd d20-folio
asdf install                          # Node 24 + Temurin 25 JDK, pinned in .tool-versions
pnpm install                          # root app deps
git config core.hooksPath .githooks   # or `just setup`
```

The toolchain is pinned via **asdf** (`.tool-versions`): **Node 24.16.0** (matches the Cloud
Functions runtime) and **Temurin 25** (the JDK the Firestore emulator needs — no Homebrew JDK
required). Install asdf + its `nodejs`/`java` plugins first if you don't have them. The root app
uses **pnpm**; the standalone `functions/` package uses **npm** (`npm --prefix functions ci`),
deployed via `firebase deploy --only functions`.

That `git config` line installs the project's strict pre-commit + pre-push hooks. **Never bypass
them with `--no-verify`** — if they fail, the issue gets fixed in the same commit, not
deferred.

---

## The gate split (SAFE but never running forever)

Owner mandate (2026-06-12 — golden rule 14, docs/GOLDEN_RULES.md): **keep the gate SAFE, but never
let checks slow development or deployment**. The repo is public, so GitHub Actions minutes are
free — the heavy lanes run REMOTELY on every merge, off the local critical path. Every check still
runs MANDATORILY before code reaches a USER, each in exactly ONE lane, never twice on one path.

| Lane                          | What it runs                                                                                                                           | Cost                           | Where                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------ |
| **pre-commit**                | doc-guard + `lint-staged` + fast unit lane                                                                                             | ~5 s                           | `.githooks/pre-commit`                     |
| **pre-push → topic branch**   | no gate — topic branches are recoverable remote checkpoints                                                                            | instant                        | `.githooks/pre-push`                       |
| **pre-push → `main`**         | typecheck ∥ lint (`--cache`) ∥ unit + coverage **concurrently**, then `vite build` · budget · rules (change-scoped) — **NO e2e**       | ~3 min (max of three, not sum) | `.githooks/pre-push`                       |
| **per merge — CI** (`ci.yml`) | the SRD-only gate: typecheck + lint ∥ unit ∥ build + budget as **parallel jobs**, every push to `main` + every PR                      | ~4 min wall, free              | `.github/workflows/ci.yml`                 |
| **per merge — Verify**        | the COMPOSED verdict: pack unit suite + the **full Playwright e2e matrix sharded 8×** across parallel runners, every push to `main`    | ~10 min wall, free             | `.github/workflows/verify.yml`             |
| **deploy** (owner-fired)      | **PROMOTES a verified SHA** in Actions: green CI + Verify → build/budget → Firestore export → Functions → Hosting/rules → health gates | ~10–15 min                     | `deploy.yml` (`just deploy` dispatches it) |

> **Why `workers: 1` in CI, not 2.** A 2nd Playwright worker was measured and REJECTED: on the
> 2-vCPU `ubuntu-latest` runner one worker already saturates the cores (a full-page Chromium render
> plus the vite DEV server transforming modules on demand), so a second added ~zero throughput
> (2.75 s/test at workers=2 vs 2.16 s/test at workers=1) and starved slow renders — `.wiz-orbs`
> `toBeVisible` timed out and flaked the gate red. Parallelism scales through SHARDS
> (`--shard` on isolated runners — exactly what `verify.yml` does, 8 ways), never a shared-runner
> worker (`playwright.config.ts`).

**E2E lane shape (cost-trimmed 2026-06-13, ZERO coverage loss).** The Playwright matrix that
`verify.yml` runs is the same `playwright.config.ts`,
trimmed of provable waste:

- **The native-mobile project runs only the specs that NEED the touch profile.** The project is
  allow-listed with `testMatch` to the two width-dependent surface sweeps (`a11y.spec.ts`,
  `i18n-sweep.spec.ts`), the Signet suite (the mobile management chrome), the ⌘K-chip test in
  `mobile-layout.spec.ts`, and the three touch-gate specs whose coarse-pointer halves only execute
  under Pixel-7 emulation. Every other behavioural journey runs in chromium with pinned viewports,
  so desktop-only mouse/keyboard journeys are never replayed under touch. **A spec that self-gates
  on `project.name === "mobile"` MUST be in that `testMatch` list** — otherwise it silently never
  runs anywhere while reporting green (the Signet suite shipped exactly this way for three weeks;
  caught by the 2026-08-05 test audit).
- **`visual-full.spec.ts` runs ONLY in the pixel lane (`VISUAL=1` / `--update-snapshots`).** Its
  no-flag navigate-only pass was retired (2026-08-05): the a11y + i18n sweeps drive the same
  `SURFACES` manifest (with `prepare`) across both themes, locales, and viewports, so the ambient
  gate lost ~344 duplicate navigations and zero unique signal.
- **The service-worker dev server (`:5175`) boots ONLY for the SW projects.** `playwright.config.ts`
  reads the `--project` flags: the SW `webServer` is started only when `portrait-sw` /
  `portrait-sw-mobile` are in the run (or no `--project` filter = the full matrix). The
  `--project=chromium` / `--project=mobile` CI legs and `pnpm test:e2e` skip that second `vite` boot.
  It fails toward booting (anything not provably SW-free still gets the server), so the SW journey is
  never starved of its origin.

**Why e2e is the per-merge REMOTE lane, not the pre-push gate.** The full matrix is ~1,450 tests —
48 min unsharded on a CI runner (measured 2026-08-03), far beyond any local critical path. A push
lands on `origin`, which is **not user-facing** — nothing deploys off a push (deploys are ALWAYS
explicitly owner-triggered, golden rule 22). So the matrix runs remotely on EVERY merge to `main`
(`verify.yml`, sharded 8× → ~10 min wall clock, free on the public runners), and a deploy requires
that green verdict on the exact SHA. The behavioural suite still runs mandatorily before a user
sees the code — exactly once, ambiently, and every merged SHA carries a full verdict instead of
e2e rot accumulating silently between deploys.

**How to deploy (owner-fired, always — a deploy PROMOTES a verified SHA).** The sole production
path is `gh workflow run deploy.yml --ref main`: it WAITS for green CI + Verify on the target SHA
(up to 40 min if they're still in flight), composes the private pack, builds once, checks bundle
budget + open Blaze billing, exports Firestore, deploys and health-checks all Node 24 Functions,
then deploys Hosting/rules and requires SAFE-01 armed. `just deploy` is only a clean-`origin/main`
dispatcher for that workflow — there is no local Firebase mutation path to drift. ONE flow, no
double-running (golden rule 14). It refuses to promote a composition Verify never saw: a
**pack-only merge** changes what deploys without moving the public SHA, so after one, re-verify —
`gh workflow run verify.yml --ref main` (also the fix when a run was superseded/cancelled by a
newer merge).

**The two remote workflows are the two compositions.** `ci.yml` verifies what the public tree IS
(SRD-only — no secrets, no pack; parallel jobs so the wall clock is the slowest lane) on every
push to `main` and every PR. `verify.yml` verifies what actually DEPLOYS (the composed build: it
checks out the private pack via `CONTENT_PACK_TOKEN`, runs the composed unit suite and the full
sharded e2e matrix) on every push to `main`. Both green = both build modes green, remotely, per
merge (golden rule 28). The local pre-push hook remains the last line of defence BEFORE a merge
lands; the remote lanes are the standing verdict every SHA carries after.

Tests that read `content-pack/fixtures/` or assert private catalogue facts live under
`content-pack/tests/`, never under the public `tests/` tree. This keeps a fresh public checkout
genuinely self-contained: CI must not rely on a developer's optional sibling-pack symlink, while
Verify still runs those live-user conformance contracts in the composed build.

> **Never add a slow check to a hook "to be safe."** If a check is slow, it belongs in the
> per-merge remote lane (`ci.yml` / `verify.yml`), not on every push. Keep `--cache` everywhere it
> helps (eslint `.eslintcache`, tsc incremental) so a no-op re-run is seconds.

### The review step (before every merge — golden rule 12)

Superpowers owns the generic review lifecycle: request a correctness/requirements review, process
the findings with technical rigor, and re-run verification on the final diff. Add
`ponytail-review` when the change carries meaningful abstraction or dependency risk; that pass asks
only what can be deleted, reused, or replaced with a simpler native seam. Review findings are
evidence, not commands: apply each actionable finding or record the concrete reason it does not fit.

After review, run the relevant gate on the final tree, rebase onto current `origin/main`, and
integrate from the worktree with `git push origin HEAD:main`. The exact repository adapter remains
in `docs/WORKTREES.md`; review replaces PR review, never tests or owner visual approval.

### The i18n build-time leak-lock (lock 6)

`pnpm build` cannot ship an untranslated string. A Vite `buildStart` plugin
(`vite.config.ts → i18nLeakLock`, build-only — it never touches `pnpm dev`/HMR) runs the i18n leak
detectors over EN + IT and every `srd/` catalogue and **fails the build (non-zero exit) on ANY leak**:

- an **en↔it key-set mismatch** (a key in one locale missing from the other),
- an **empty / whitespace-only** value,
- an **English-in-IT leak** — an IT value byte-identical to its EN counterpart that still reads as
  English (the `STRONG_EN` heuristic; loanwords / proper nouns / abbreviations never trip it),
- a **static `t("…")` literal** in `src/` whose key is absent from the catalogue.

It's free on `pnpm build` (so it runs in pre-push, the deploy workflow, and CI automatically), and you can
run it standalone with **`pnpm i18n:check`** (prints each problem + a non-zero exit). When it fails,
**fix the leak** — translate via the IT SRD 5.2.1 cascade (never leave IT == EN-English), or add the
missing key to BOTH `src/i18n/{en,it}/ui/<group>.json` shards. Do NOT weaken the detector to make it
pass.

**One detector, no drift (DRY — golden rule 6).** The leak logic lives ONCE in
`scripts/i18n/leak-detectors.ts` (pure: data in → violations out, fs-free; the catalogues are read by
`scripts/i18n/catalogue-io.ts` and the pure flattener/types live in `scripts/i18n/flat.ts`). The
build gate (`scripts/i18n/check-i18n.ts`, called by the Vite plugin + the `i18n:check` CLI) AND the
unit guards (`tests/unit/i18n-parity.test.ts`, `i18n-dedup.guard.test.ts`) all import that ONE
module — so the parity / empty / English-in-IT rules can never differ between "fails the build" and
"fails CI". To extend the lock to a 3rd language, add `src/i18n/<lng>/…` and the locale to `LOCALES`
in `scripts/i18n/flat.ts`. (`scripts/**` is the node tsconfig project, kept in strict lockstep with
the app project so the shared detectors typecheck identically in both.)

### The test policy (write the CHEAPEST test that pins the fact — and only that)

The gate stays fast only if the tests are written at the right altitude. A standing policy (golden
rule 13, `docs/GOLDEN_RULES.md`) — apply it to every new and touched test:

- **Every test pins a FACT someone could plausibly break — name the regression or don't write
  it.** A test earns its place by failing when a specific, plausible future change breaks a
  specific behaviour. If you cannot state that regression in one sentence, the test is ballast:
  it costs every push forever and catches nothing. Never test the framework (React renders
  children, Zustand stores update, i18next interpolates), never re-assert a static datum a
  compile-time type already guarantees, never duplicate an assertion another lane already makes —
  "every check runs once" (golden rule 14) applies to individual assertions too.
- **Pick the LOWEST lane that can observe the fact.** The ladder: pure function (fast lane,
  milliseconds) → store/hook → thin render (`.test.tsx`, jsdom — pays for the DOM + the SRD
  eager-load) → Playwright e2e (a real browser). E2E is ONLY for what jsdom cannot see — real
  layout/motion/scroll, focus traversal, the service worker, a full user journey across surfaces,
  axe sweeps. An engine fact asserted through an e2e journey is the most expensive possible way to
  pin it and duplicates the unit lane; move it down.
- **A bug fix ships THE regression test** — one test that fails before the fix and passes after,
  written at the seam the root cause lives in (rule 2), not at the symptom's surface. A guard
  counts. One is enough: five tests re-proving one fix from five angles are four tests of ballast.
- **Superseded tests are DELETED with the code they pinned** (golden rule 10). When a component,
  format, or mechanic is removed or re-architected, its tests move or die in the same commit —
  never kept green as fossils asserting a world that no longer exists.
- **A GUARD DERIVES ITS INPUTS, AND SAYS WHAT IT CANNOT SEE** (golden rule 13). A guard whose
  subjects come from a list maintained beside it is a guard that agrees with itself: derive them
  from the stylesheet, the DOM, the manifest or the data, assert the derived set is non-empty, keep
  any unavoidable exemption list short and reasoned — and write the blind spot into the guard,
  because an unstated one is read as coverage. Prove it by mutation before you commit it.

- **Prefer a pure-function unit test over a full-tree render mount for an ENGINE fact.** A sort order,
  a predicate, a cap, a FIFO rule, a computed value — assert it against the function that PRODUCES it
  (`sortActions`, `togglePick`, `eligibleNewClasses`, …), not by mounting a page and reading the DOM.
  A pure `.test.ts` runs in the jsdom-free fast lane in milliseconds; a `.test.tsx` mount pays for
  jsdom + the whole SRD eager-load. **Keep ≥1 thin render test per surface for the WIRING** — that the
  surface calls the engine and reflects its result (an aria-label, a row renders, a click reaches the
  store, the `data-picked` ceremony moves). Move the engine fact down; leave the wiring witness up.
  If a "pure fact" is only observable through the render (a stateful reveal, a pipeline+grouping
  result), LEAVE it in the render test.
- **Memoize shared expensive setup.** A fixture parse, a source-tree crawl, a resolved import tree —
  read/compute it ONCE per worker and cache it, never per test or per guard. The source-tree guards
  share `tests/unit/__helpers__/src-files.ts` (one memoized `src/**` crawl: a path→content map +
  `srcFiles({ under, exts })` + `readSrc()`); each guard keeps its OWN predicate over that shared
  input. **Never re-read the whole tree per guard.** The import-tree guards (`pure-modules-guard`,
  `architecture-direction.guard`) cache their per-file reads + transitive trees module-side.
- **Avoid super-long single test files and resource locks.** Integrate a new assertion into the
  existing unit's test; create a new file only for a genuinely new unit (golden rule 13). Table-drive
  per-entity families. A guard test counts as the regression for a guard-shaped fix.

---

## The two build modes (content pack vs SRD-only)

The `@pack` alias (docs/ARCHITECTURE.md → "The content-pack seam") composes the
maintainer's private `content-pack/` into the app whenever that directory exists
and `VITE_CONTENT_PACK` ≠ `0`. Two lanes exist:

- **SRD-only mode** — what the public tree IS: with no `content-pack/` present,
  the plain commands (`pnpm dev` / `pnpm test` / `pnpm build`) build the
  complete SRD 5.2.1 app with zero configuration. If you're an external
  contributor, this is your (only) mode — nothing to opt into. A tree that
  CONTAINS the pack can force this lane with `just ci-srd-only`
  (= `pnpm typecheck:srd-only` + `pnpm test:srd-only` + `pnpm build:srd-only`,
  which pin `VITE_CONTENT_PACK=0`). No pack suites, no coverage floors.
- **Pack mode** — the maintainer's composition (the default wherever
  `content-pack/` exists): the full catalogue; the authoritative gate
  (`just ci`: typecheck ∥ lint ∥ `test:coverage` with the coverage floors ∥
  build) runs in this mode, and the pack's own suites
  (`content-pack/tests/unit/**`) join the same fast/slow vitest lanes.

Every suite in `tests/unit` must pass in BOTH modes.

**The maintainer's local composition** is a gitignored symlink into a sibling
checkout of the private pack repo (`salvodicara/d20-folio-content`):

```sh
ln -s ../d20-folio-content/content-pack content-pack
```

**Task worktrees are composed automatically.** `just wt-new` replicates that
same relative symlink into each new worktree whenever the pack sibling exists,
so the pack-mode gate runs composed there **by default** — closing the gap where
a pack-absent worktree would silently gate SRD-only and let a public API change
break the pack undetected. When no pack sibling exists (external contributors),
`wt-new` skips the link and the worktree gates SRD-only, unchanged (that is the
correct, complete build for a public tree). As a backstop, `.githooks/pre-push`
prints a loud WARNING if a worktree gates SRD-only while the pack actually
exists on disk. Because the pack's files
REALLY live outside the repo root, pack tests import public-root helpers only
through the root-anchored `@tests/*` / `@scripts/*` aliases (never physical
`../../../` escapes), the vitest lanes resolve with `preserveSymlinks`, and the
dev server allows the pack's real directory (`fsAllowRoots()`,
`scripts/content-pack-mode.ts`).

## Reading order (especially for AI agents)

1. **`CLAUDE.md` / `AGENTS.md`** — the short shared router, authority model, invariants, and tool
   routing.
2. Read the **one document that owns the task's fact**: Architecture/Mechanics/Schema for engine or
   data, Product Constitution/Design for UI, or the relevant operations runbook.
3. **`PROGRESS.md`** only when roadmap or current status matters; verify claims against code,
   config, git, and runtime evidence before acting.
4. **`docs/AUTOMATION_COVERAGE.md`** for per-entity automation coverage.
   `docs/AUTOMATION_BACKLOG.md` is the closed audit record, not a default reading assignment.

### Claude Code and Codex parity

The two agent harnesses intentionally read the same project contract and the same Impeccable skill.
`AGENTS.md` is a tracked symlink to `CLAUDE.md`; `.agents/skills/impeccable` is a tracked symlink to
the canonical `.claude/skills/impeccable` directory. Update only the canonical targets. This keeps
instructions and UI craft behavior identical without vendoring a second skill copy that can drift.

### AI agent tool stack and conflict policy

One tool owns each layer; overlap is resolved by evidence and the weaker workflow is removed rather
than stacked:

| Layer                 | Canonical tool           | Repository use                                                                                                                                                                                                                                   |
| --------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Development lifecycle | **Superpowers**          | Brainstorm/spec → plan → worktree → TDD → systematic debugging → review → verification. `just wt-new`, the no-PR integration flow, changesets, and owner gates are repository adapters.                                                          |
| Specialist operations | **Selective ECC skills** | Living-doc governance, workspace/context audits, product/competition analysis, automation audits, browser QA, security reviews, and eval harnesses. The monolithic plugin stays disabled because its always-on context cost is disproportionate. |
| Capability discovery  | **Find Skills**          | Search the public ecosystem, then verify installs/adoption, publisher reputation, freshness, security, and overlap before recommending or installing.                                                                                            |
| Session recall        | **claude-mem**           | Retrieve context and possible prior decisions, then verify them against the current request and operational evidence. Memory never overrides the fact owner; cloud sync is opt-in and secrets are forbidden.                                     |
| Process improvement   | **Task Observer**        | Log skill/process observations outside worktrees at `~/.agents/state/d20-folio/skill-observations/log.md`; review them in batches so delivery is not interrupted.                                                                                |

Project specialists remain on demand: `impeccable` for UI/UX, `graphify` for structural navigation,
`ponytail`/`ponytail-review` for simplicity, and `grill-me` for genuinely ambiguous product intent.
No tool wins because of branding or popularity alone; documented behavior, behavioral evaluations,
security, maintenance, context cost, and fit to this repository decide. Technical conflicts are agent
work. Escalate only the decision boundary in `docs/GOLDEN_RULES.md`.

---

## Common recipes

### I want to add a new spell

```text
1. Open src/data/spells/level<N>.ts  (where N is the spell level; 0 for cantrips).
2. Add an entry following the SrdSpellData shape.
3. Bilingual EN + IT (golden rule 9 — Italian never empty; AI-translate with comment if no
   authoritative source).
4. If the spell is on a class list, add the class id to the spell's `classes` field (resolved by
   `getSpellsByClass` in `src/data/spells.ts`).
5. Write a unit test if anything non-trivial about its data (concentration flag,
   ritual tag, scaling, …).
6. `pnpm changeset` → describe the addition.
7. Commit; at the task's finish line, converge + merge (`docs/WORKTREES.md`).
```

### I want to add a new feat

```text
1. Open src/data/feats.ts.
2. Add the entry with EN + IT fields.
3. If it has a mechanical effect, declare it via the Grant union (see
   docs/MECHANICS.md). Examples:
     - +1 ASI → `{ type: "ability-score", ability: "X", amount: 1, cap: 20 }`
     - Choose one of two abilities → `{ type: "choice-ability-score", abilities:
       ["X","Y"], amount: 1, cap: 20 }`
     - Skill proficiency → `{ type: "skill-proficiency", skill: "Athletics" }`
     - Free-cast spell → `{ type: "free-cast-spell", spellId, chargesPerRest, rest }`
4. Add a unit test in tests/unit/feat-asi.test.ts (or a relevant file) if the feat
   carries a Grant.
5. `pnpm changeset` → "Add Feat X".
6. Commit; at the task's finish line, converge + merge (`docs/WORKTREES.md`).
```

### I want to add a new mechanic (new Grant kind)

```text
1. Open src/lib/grants.ts. Add a new variant to the `Grant` discriminated union with
   `// Phase X` marker. Document its evaluator merge rule in the type comment.
2. Add the evaluator branch (one case in the switch in `evaluateGrants`).
3. Add a field to `AggregatedGrants` (or extend an existing one).
4. Update `emptyAggregate()` with the new field's identity value.
5. Add the consumer (sheet header chip / abilities-page row / combat-panel button /
   levellup picker / …).
6. Add a unit test in tests/unit/grants-phase-c.test.ts pinning the new branch.
7. Document the new kind in docs/MECHANICS.md.
8. `pnpm changeset` (minor — schema add).
9. Commit; at the task's finish line, converge + merge (`docs/WORKTREES.md`).
```

### I want to add a new SRD class subclass

```text
1. Open src/data/classes/<class>.ts.
2. Add an entry to the `SUBCLASSES` array with EN + IT name + description + level entries.
3. If subclass-granted spells, populate the `expandedSpells` map per level.
   These auto-flow into `injectExpandedSpells` (Cleric Domain / Paladin Oath / Sorcerer
   Origin / Warlock Patron / Druid Circle) and become `alwaysPrepared: true` for prepared
   casters — they don't count against the preparedMax.
4. Add features in the relevant features array, gated by `subclass` + `level`.
5. If a feature has a tracker, declare `mechanics.tracker`.
6. If a feature has a rider, declare `mechanics.rider`.
7. Add tests.
8. `pnpm changeset`. Commit; converge + merge at the finish line.
```

> **Automation-coverage guard.** `tests/unit/automation-coverage.guard.test.ts` fails if a class
> feature has NO `grants`/`mechanics` and isn't a system-handled marker or a listed deliberate
> residual. So a NEW feature must be **automated** (grant/mechanic), match the system pattern, or be
> consciously added to `DELIBERATE_RESIDUALS` **with a reason** — coverage can only go up. This is the
> objective "everything automatable is automated" check; ~71% of features are automated today and the
> rest are accounted for.

### I'm fixing a bug

```text
1. Reproduce the bug locally (or via unit test). If it's UI, manual repro first.
2. Add a failing test (or extend an existing test).
3. Fix the code so the test passes.
4. Run the full suite locally: `pnpm test`.
5. `pnpm changeset` (patch — bug fix).
6. Commit; at the task's finish line, converge + merge (`docs/WORKTREES.md`).
```

### Build & data-file conventions

- **The React Compiler is intentionally NOT enabled.** It was trialled (Jun 2026) and measured to add
  **+46 KB gzip to the cockpit chunk (69→116 KB) and ~14 KB to the entrypoint, and made the build 11×
  slower** — for marginal benefit on an already well-optimized app, and it did NOT fix the one visible
  re-render symptom (an option-picker flicker, which is a CSS repaint). Net regression to load time, so
  it was reverted. Hand-optimize instead: keep Zustand selectors granular, avoid unstable prop/element
  identities passed to heavy children, and reach for `useMemo`/`useCallback` only where a profile shows
  it matters. (The `eslint react-hooks` recommended rules still lint the Rules of React.)
- **Keep each source file under ~500 KB.** Babel's code generator deoptimises (and prints a Note) above
  that, and the compiler/lint Babel pass touches every file. The SRD magic-item roster outgrew it, so it
  lives split under `src/data/magic-items/` (`part-N.ts` chunks + an `index.ts` barrel that re-assembles
  `SRD_MAGIC_ITEMS` and keeps the public API). When a generated data file approaches the limit, split it
  the same way — never let a single module balloon past it.

### I'm working on UI/UX

The active design system is **"Illuminated Folio, Evolved"** (identity FROZEN), documented in full
in `DESIGN.md` (the single design + UX system of record) + the canonical tokens (`src/index.css`

- `src/styles/folio.css`). The redesign journey and its past attempts live in git history.
  The earlier
  atomic-design / numbered-HTML-previews / `ui-restyle`-branch cadence is superseded.

```text
1. Read docs/PRODUCT_CONSTITUTION.md (supreme UX law) + DESIGN.md (the design system of record).
2. Build from the DESIGN.md system + its shared primitives ONLY; never re-invent a surface.
3. Reuse the shared design-system primitives so a fix propagates (one component per job; a
   bespoke restyle of an existing job is a defect).
4. Every commit ships its own `.changeset/*.md`; the converged branch passes the full `main`
   pre-push CI (incl. the axe a11y surface gate, light + dark).
```

### I'm adding a new page / form / wizard step / modal (visual surface coverage)

> **The rule:** a new user-facing surface → add its screenshot surface. Coverage is
> self-enforcing — a guard test fails CI if you don't.

```text
1. Add a route to src/app/router.tsx as usual.
2. Add a { slug, route } entry to tests/e2e/surface-manifest.ts (the SINGLE source
   of truth for "every surface the visual suite covers"). One entry per distinct
   captured state — a page, an edit variant, a wizard step, a modal/popover/drawer,
   or a scenario state (e.g. an HP band).
3. Add the matching runtime def in tests/e2e/surfaces.ts: { edit, ready, prepare?,
   variants? }. `ready` is a locator that proves the surface painted; `prepare`
   opens the overlay / drives the state; `variants` restricts the locale×theme×
   viewport matrix for overlays whose trigger only exists at some breakpoints
   (omit it for full pages — they run the whole cross). Drive wizard states by
   semantic accessible labels/state signals, never by a positional step index:
   conditional steps can otherwise make a correctly named capture show the wrong page.
4. That's it — both visual suites pick it up automatically:
     • visual-full.spec.ts drives it (navigate-only by default; a pixel
       baseline per surface × {dark,light}×{desktop,mobile}×{en,it} under
       VISUAL=1 — see below).
     • _polish-shots.spec.ts captures it for the human-review polish loop.
```

Page and inline-state captures are full-document. Overlay surfaces are deliberately
viewport captures: the viewport is the modal/menu/popover's composition frame, while a
full-page shot would mostly record obscured content beneath it. `overlay: false` keeps a
variant-limited inline state (such as an unfolded wizard step) on the full-page path.

> **The final gate (design / i18n / surface work):** the pre-push hook does not run e2e — the
> full matrix runs remotely on the merge (`verify.yml`, see "The gate split"). So before you
> MERGE design / i18n / surface work, run the affected e2e specs locally (`pnpm test:e2e` for
> the chromium leg, `pnpm test:e2e:all` for chromium **and** the Pixel-7 mobile project) and
> the visual lane `pnpm test:e2e:all:visual` (the full `{dark,light}×{desktop,mobile}×{en,it}`
> pixel matrix) when pixels moved. A CSS / i18n / layout change can pass desktop yet break at
> 390px or in the other locale; `verify.yml` runs the full matrix on the merge and a deploy
> requires that verdict green — so a regression the chromium-only run misses still can't reach
> users, but catching it BEFORE the merge keeps `main` green for every parallel agent.

**Why a guard:** `tests/unit/route-coverage.guard.test.ts` (a pure unit test) enumerates
the routes in `src/app/router.tsx` and fails if any navigable route has NO surface in the
manifest — so a new page can't ship with zero visual coverage. If a route is genuinely
not capturable, add it to that test's
`EXEMPT_ROUTES` **with a reason** — the test also asserts every exemption is justified.

> **Dev fixture loader.** In the `DEV_BYPASS_AUTH` preview, `/characters/mock-1` (any non-fixture
> id) renders the bundled MOCK; `/characters/team-<kebab>` renders one of the 6 real team sheets
> imported live — the `team-` route ids mirror the pack fixture file names
> (`src/lib/dev-fixtures.ts`, lazy-loaded from `content-pack/fixtures/team/`). The canonical MOCK stays the single mock; these are test fixtures surfaced
> for verification, never a second mock. Production never loads them (the only caller is the dead
> `DEV_BYPASS_AUTH` branch).

### I want to SELF-VALIDATE a mechanic on any class/subclass (screenshot proof)

> **The mock is a single Bard — that is never a reason to ask the owner to build a character.**
> If a mechanic needs a Life Cleric or a Great-Old-One Warlock to be seen, INJECT one and
> screenshot it yourself. A unit test that passes can still be invisible (or wrong) in the running
> app — e.g. a smart-tracker verdict gated behind a prose regex. **Verify by looking, every time.**

The **scenario injector** (`src/lib/dev-scenarios.ts`) builds ANY character from a concise spec —
`{ name, raceId, classId, subclassId, level, abilityScores, spells }` — with the full feature list
**inferred** via `buildGrantedFeatures` and spell slots read from the class table (declare the least,
infer the rest). It's the general counterpart of the frozen team fixtures: a `scn-<name>` id renders
the built character in the `DEV_BYPASS_AUTH` preview.

1. **Add a scenario:** append one entry to `DEV_SCENARIOS` in `dev-scenarios.ts` (set `exercises` to
   the mechanic you're proving). No other wiring — `/characters/scn-<name>` resolves it.
2. **Screenshot it:** the throwaway, env-gated harness `tests/e2e/_scenario-shots.spec.ts` drives the
   Play + Spells tabs in dark + light. Run the dev server, then the spec:

   ```bash
   # 1) dev server with auth bypass (Playwright reuses it on :5174)
   VITE_DEV_BYPASS_AUTH=true pnpm vite --port 5174 &
   # 2) capture full-page PNGs for every scenario × theme
   SCENARIO_SHOT_DIR=/tmp/folio-scn pnpm exec playwright test tests/e2e/_scenario-shots.spec.ts --project=chromium
   ```

   PNGs land in `$SCENARIO_SHOT_DIR`. Full-page shots downscale — crop the action panel at full
   resolution (e.g. `python3 -c "from PIL import Image; Image.open(p).crop((360,600,1160,1340)).save(q)"`)
   to read the verdict chips. The harness is `test.skip`-gated on `SCENARIO_SHOT_DIR`, so it never runs
   in CI.

3. **Pin it with a test:** assert the mechanic surfaces through the live consumer (`resolveActions`),
   not just the pure helper — see `tests/unit/dev-scenarios.test.ts`. That integration assertion is
   what catches "passes in isolation, dead in the app".

One-mock compliant: scenarios are dev/test fixtures derived from the single `MOCK_CHARACTER`, never a
parallel production mock; production never loads them.

> **The `_*` capture-harness convention (env-gated, never a CI gate).** A leading-underscore spec in
> `tests/e2e/` (`_*-shots.spec.ts`, `_*-probe.spec.ts`) is a **capture/measurement harness, not a
> test**: it is `test.skip`-gated on its own output-dir / mode env var (`SHOT_DIR`, `PERF=1`, …), so it
> is SKIPPED in every lane — it asserts nothing the gate reads and adds zero coverage. A harness built
> to preview ONE shipped mission (owner rule-25 shots for a specific fix — cropped to the changed
> region, before/after where a prior state exists, per golden rule 15) is a **worktree-local tool**:
> `git rm` it before merge, exactly like a spent one-off migration script (golden rule 10 — git history
> is the archive; a mission-specific capture must not accumulate on `main`). The repo keeps only the
> **standing, general, non-mission-bound** harnesses — today exactly four: `_polish-shots` (the
> manifest-driven full-surface polish sweep), `_identity-shots` (the identity/theme surface sweep),
> `_scenario-shots` (the mechanic-injection capture above), and `_perf-probe` (the runtime web-vitals
> probe). Add a new standing harness only when it is genuinely reusable and generic; never fork a
> per-mission copy of one that exists.

**Visual baselines are platform-specific** (macOS and Linux render fonts differently), and
**no baselines are committed** — the pixel lane is on-demand, never a gate. The
`toHaveScreenshot` assertions fire only under `--update-snapshots` or with `VISUAL=1`
(`tests/e2e/visual-gate.ts`); on a plain `pnpm test:e2e` the specs still navigate + assert
their ready anchors, so they're a real behavioural smoke — just no pixel diff. To pixel-diff
locally, generate a baseline set once (`pnpm exec playwright test visual --update-snapshots`),
make your change, then run the visual lane (`pnpm test:e2e:all:visual`) and review the diffs —
don't commit the generated `*.png`.

### I want to VERIFY a whole character end-to-end (engine + minimal round-trip)

The screenshot harness above proves ONE mechanic visually. To verify an ENTIRE sheet against the
2024 rules — every feature, spell, proficiency, resource, stat — use the **`dumpSheet` backbone**.

- **`tests/_harness/sheet-dump.ts → dumpSheet(doc)`** produces one structured snapshot of everything
  the engine derives (abilities/saves/skills/passives, AC/HP/init/speeds/senses, defenses,
  proficiencies, effective spells + DC/attack/slots, features, combat actions, trackers, and the
  minimal stored-key set). It calls the SAME engine seams the UI renders from, so **if a value in the
  dump is wrong, the UI shows the same wrong value** — it's a faithful mirror, not a re-implementation.
- **`tests/unit/team-fixtures-dump.test.ts`** emits a dump for each of the 6 real team characters to
  `content-pack/fixtures/team/__dumps__/<name>.dump.json` (gitignored, regenerated each run) and asserts the
  minimal round-trip renders an identical sheet.

To verify a real character: read its source JSON + its dump, hand-compute the expected sheet from the
rules (the class/species/feat/background pages on `dnd2024.wikidot.com` — retrieval workflow in
`content-pack/docs/SOURCING.md`), and diff. **Every divergence
is a root-cause engine gap** — fix it at the seam (Grant kind + evaluator + consumer + regression
test + a `docs/MECHANICS.md` row), never a patch. Then screenshot the fixed sheet via the live
fixture route `/characters/team-<name>` (`src/lib/dev-fixtures.ts`).

- **v3 round-trip (the "is the stored data minimal?" check):** `tests/unit/team-fixtures-new-export.test.ts`
  exports each fixture through the REAL user-facing path (`serializeCharacter`, the v3 portable format
  behind the roster-kebab "Export JSON") and asserts both `serialize(parse(file)) === file` (the
  on-disk fixtures are the canonical v3 form) and an identical `dumpSheet` on re-import. Run with
  `D20_EMIT_NEW=1` to also (re)write the v3 files to `~/Documents/d20-team/new/`. A field that survives
  minimization but is inferable is a shrink target — chase the export size down while the sheet stays fixed.

This is the JSON-grounded verification loop defined in `docs/AUTOMATION_BACKLOG.md → "⭑ CURRENT CAMPAIGN"`.
For breadth (all 6 at once, or the long tail), fan it out with a verification workflow: one agent per
character finds discrepancies, an adversarial pass confirms each is real, then fix serially.

### I'm adding a new realm, dataset, or global action — wire it into "Ask the Folio"

The ⌘K command palette (`src/app/shell/CommandPalette.tsx`) is the universal finder + launcher.
Whenever you ship a new top-level page, a new user-owned dataset, a new browsable SRD type, or a
new GLOBAL action, register it there so it stays reachable. The "EXTENDING THE PALETTE" block at
the top of that file is the checklist (new realm → `sections`; new dataset → a `…Hits` memo + a
`groups` entry, deep-linking to the entry's DETAIL; new SRD type → just add the spec to
`COMPENDIUM_SPECS`; new global action → an `actions` def with `run`/`to` + EN/IT search `terms` +
`palette.*` keys in BOTH `common.json`). Reuse the same lucide glyph the concept uses elsewhere,
and extend `tests/unit/command-palette.test.tsx`. (Character/campaign-SPECIFIC actions stay on
their own pages — the palette indexes the global surface only.)

---

## Firestore security rules

The `/campaigns` security rules (`firestore.rules`) are verified by an emulator-backed suite
— `tests/rules/firestore-rules.test.ts`, run via its own `vitest.rules.config.ts` and kept
OUT of the plain unit suite (which never boots an emulator).

**The gate is LOCAL-FIRST — independent of GitHub Actions minutes:**

- **`pnpm test:rules`** runs the full `/campaigns` matrix against the Firestore emulator on a
  `demo-` project (emulator-only — no real Firebase, no cost). Run it whenever you touch the
  rules.
- **The `main` pre-push hook is the real gate.** It runs `pnpm test:rules` automatically, but ONLY
  when the integration push changes the rules surface (`firestore.rules` or `tests/rules/**`);
  other `main` pushes skip it (no emulator boot → fast). Topic branches are checkpoints; a rules
  change cannot enter `main` unverified, with zero Actions minutes.
- **There is no remote rules job.** The `main` pre-push hook is the whole gate (it needs a JDK, which
  `asdf install` provides); `deploy.yml`'s e2e-gated deploy ships the rules files themselves.

**Requires a JDK** (the Firestore emulator is a JVM process) plus the Firebase CLI. The JDK is
auto-managed via **asdf** — `.tool-versions` at the repo root pins a Temurin LTS, so `asdf install`
puts `java` on your PATH:

```bash
asdf install                     # installs the Node + Java versions pinned in .tool-versions
npm install -g firebase-tools    # the emulator runner (already present if you deploy)
pnpm test:rules
```

The pre-push hook uses `java` from your PATH (asdf's Temurin) and, when the asdf shims aren't on
PATH (e.g. an IDE's git), resolves the JDK pinned in `.tool-versions` directly from
`~/.asdf/installs/java/`. If no JDK is found on a rules-changing push it fails with an `asdf install`
hint rather than letting an unverified rules change through — no Homebrew JDK required.

---

## Mandatory rules summary

- **TypeScript strict.** No `any`. No `!` (non-null assertion). No `eslint-disable`.
- **Zero lint warnings.** `pnpm lint --max-warnings 0` must pass.
- **Tests are mandatory for behavior.** Use Superpowers TDD and the cheapest lane that observes the
  fact. Delete obsolete or duplicate tests with the behavior they no longer protect; test count is
  not a quality metric.
- **Bilingual.** Every user-visible string is EN + IT. Italian never empty (golden rule 9).
- **No `--no-verify`.** Ever. If a hook fails, fix the issue in the same commit.
- **No dice rolling.** `Math.random()` is banned. Show formulas; the player rolls externally.
- **Override-first.** Every derived value can be manually overridden.
- **Small commits; sparse milestone pushes.** Each commit is one coherent step with its
  `.changeset/*.md`; a topic branch may reach `origin` at genuine recoverable milestones, while
  the converged `HEAD:main` integration remains the only push that runs the full local gate
  (`docs/WORKTREES.md` — no PRs, never a bare push).
- **Co-update docs.** A `.changeset/*.md` must be staged on every commit (the pre-commit hook
  enforces it; it feeds `CHANGELOG.md` at release time). Keep `PROGRESS.md` current as you ship.
- **New surface → new screenshot.** Adding a page / form / wizard step / modal means adding its
  visual surface (`tests/e2e/surface-manifest.ts` + `surfaces.ts`). The route-coverage guard
  fails CI otherwise. See "I'm adding a new page / form / wizard step / modal" above.
- **Rules change → emulator tests.** Touching `firestore.rules` / `tests/rules/**` runs
  `pnpm test:rules` at pre-push (needs a JDK; emulator-only `demo-` project, no cost). See
  "Firestore security rules".

---

## Release workflow

See `docs/RELEASE.md` for the full version-bump + tagging workflow. TL;DR:

```bash
pnpm changeset               # write a changeset describing the bump (patch/minor/major)
pnpm changeset:status        # see what's pending
pnpm changeset:version       # consume changesets + bump package.json + regenerate CHANGELOG.md
# Manually restore the [Unreleased] block + compare-links if changesets-cli stripped them
git add -A && git commit -m "chore(release): vX.Y.Z — …"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin main vX.Y.Z
```

Releases are owner-triggered and agent-executed with `just release` (the changelog entry is a
synthesized thematic section, never the raw changeset dump — golden rule 17; there is deliberately
no release workflow in CI) and deployed separately, only on explicit owner go, through
`gh workflow run deploy.yml --ref main` (`just deploy` dispatches that same workflow).

---

## Asking the owner questions

Resolve implementation details, tool conflicts, and discoverable facts autonomously. Ask only at the
decision boundary in `docs/GOLDEN_RULES.md`: genuine product/taste, cost/privacy, new external
authority, irreversible/destructive action, or a durable decision conflict that evidence cannot
resolve. Explain the recommendation in plain language and avoid technical questionnaires. When a
product interview is genuinely useful, use Superpowers brainstorming or `grill-me` and keep each
round focused.

---

## What this repo doesn't accept

- **Math.random() anywhere.** Use deterministic formulas.
- **Verbatim copying of non-SRD prose.** The public data layer (`src/data` +
  `src/i18n/*/srd`) carries ONLY SRD 5.2.1 content and every entry is tagged
  `source: "SRD"` (guard-enforced by `content-pack-partition.guard.test.ts`).
  Anything else — non-SRD imports carrying one of the non-`"SRD"` provenance
  tags (the `SrdSource` union, `src/data/types.ts`) — lives in the private
  `content-pack/` (docs/ARCHITECTURE.md → "The content-pack seam").
- **Mocks of SRD data that drift from the real data.** Only `MOCK_CHARACTER` exists; it
  references real SRD IDs.
- **Big refactors in one commit.** Break it into reviewable chunks.
- **Skipped tests** (`it.skip`, `describe.skip`) without a tracked deferral note.

---

## CI/CD pipeline (three workflows: verify ambiently, promote on demand)

**The model: every merge to `main` is fully verified remotely and ambiently (free on the public
runners); a deploy PROMOTES a verified SHA.** The local pre-push hook is the last line of defence
BEFORE a merge lands. Exactly three workflows live in `.github/workflows/`:

- **CI** (`ci.yml`) — the SRD-only gate on every push to `main` and every pull request, as three
  PARALLEL jobs (typecheck + lint ∥ unit ∥ build + budget) so the wall clock is the slowest lane.
  It needs no secrets and no mode flags: with no `content-pack/` in the tree the plain commands
  ARE the SRD-only composition (the presence-based `@pack` seam,
  `scripts/content-pack-mode.ts`).
- **Verify** (`verify.yml`) — the COMPOSED verdict on every push to `main` (+
  `workflow_dispatch` to re-verify a superseded SHA): it checks out the private content pack
  (`salvodicara/d20-folio-content` via the `CONTENT_PACK_TOKEN` secret), runs the composed unit
  suite (pack suites included) and the **full Playwright e2e matrix sharded 8×** across parallel
  runners (blob reports, merged into one HTML artifact when a shard fails). Together CI + Verify
  keep BOTH build modes green remotely, per merge (golden rule 28).
- **Deploy** (`deploy.yml`) — `workflow_dispatch` ONLY, owner-fired (golden rule 22; never on
  push). It WAITS for green CI + Verify on the target SHA, composes and builds the pack, checks
  bundle budget + open Blaze billing, creates a blocking Firestore export, deploys all Functions
  under the repo's Node 24 pin, requires all six `ACTIVE`, then deploys Hosting/Firestore/Storage
  rules and requires SAFE-01 armed. Authentication uses the existing
  `FIREBASE_SERVICE_ACCOUNT` through the pinned official Google auth action after the build, so
  credentials cannot enter `dist/`. `just deploy` only dispatches this workflow from clean
  `origin/main`; Cloud Functions never have a separate local production path.

There is deliberately **no release workflow** — releases are owner-triggered, agent-executed
(`just release`, synthesized changelog — golden rule 17). There is no remote pixel-diff or
baseline-regen workflow either: the visual lane is on-demand and local (`VISUAL=1`, no committed
baselines — see "Visual baselines" above), and the rules-emulator suite gates on the `main` pre-push.

Conventions every workflow keeps: `node-version-file: .tool-versions` (single-source Node version —
the asdf pin the app ships from), least-privilege `permissions` (`contents: read`, plus
`actions: read` only where a workflow reads run verdicts), a `concurrency` group,
`timeout-minutes`, and **every third-party action pinned to a full commit SHA**
(`owner/repo@<40-hex> # vTag` — supply-chain hardening; re-pin with
`gh api repos/<a>/commits/<tag> -q .sha` when bumping).
