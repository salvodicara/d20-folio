# Contributing

How work is gated, committed and reviewed in this repository. The lifecycle itself is Superpowers'
(`CLAUDE.md` → Delivery workflow); the worktree procedure is [Worktrees](WORKTREES.md); the durable
constraints are [Golden Rules](GOLDEN_RULES.md).

## Setup and the two build modes

```bash
asdf install                                            # Node 24.16.0 + Temurin 25 (.tool-versions)
pnpm install                                            # root app dependencies
npm --prefix functions ci --prefer-offline --no-audit   # standalone Functions dependencies
git config core.hooksPath .githooks                     # or `just setup`
```

`scripts/worktree/bootstrap-worktree.sh` does all four, idempotently and under the pinned toolchain;
use it in every new worktree.

The `@pack` alias composes the maintainer's private `content-pack/` into the app whenever that
directory exists and `VITE_CONTENT_PACK` ≠ `0`. Two modes follow:

- **SRD-only** — what the public tree is. With no `content-pack/`, the plain commands build the
  complete SRD 5.2.1 app with zero configuration; this is an external contributor's only mode. A
  tree that has the pack forces this lane with `just ci-srd-only`.
- **Composed** — the maintainer's default wherever `content-pack/` exists: the full catalogue, and
  the pack's own suites join the same vitest lanes. `just ci` runs here.

Every suite in `tests/unit` must pass in both modes. Tests that read `content-pack/fixtures/` or
assert private catalogue facts live under `content-pack/tests/`, never under the public tree.

## Gates

Every check runs mandatorily before code reaches a user, each in exactly one lane, never twice on
one path (golden rule 14). The v2 gate is fast by mandate — the target is under fifteen minutes.

| Lane                   | What it runs                                                                                                                                                                                                                                                    | Where                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **pre-commit**         | staged-changeset guard · graphify refresh when staged code changed · `lint-staged`                                                                                                                                                                              | `.githooks/pre-commit`         |
| **pre-push → topic**   | nothing — a topic branch is a recoverable remote checkpoint                                                                                                                                                                                                     | `.githooks/pre-push`           |
| **pre-push → `main`**  | typecheck ∥ lint ∥ unit + coverage concurrently, then `vite build` · budget · rules (scoped)                                                                                                                                                                    | `.githooks/pre-push`           |
| **`just ci`**          | typecheck · lint · app tests · Functions tests · build, composed                                                                                                                                                                                                | local, before integration      |
| **`just ci-srd-only`** | `typecheck:srd-only` · `test:srd-only` · `build:srd-only`                                                                                                                                                                                                       | local, licensing seam          |
| **`pnpm test:rules`**  | the Firestore rules suite on the emulator (needs the JDK; `demo-` project, no cost)                                                                                                                                                                             | local, rules changes           |
| **budget**             | `pnpm build && pnpm test:budget` — bundle and precache ceilings                                                                                                                                                                                                 | inside pre-push and CI         |
| **per merge — CI**     | the SRD-only gate as parallel jobs                                                                                                                                                                                                                              | `.github/workflows/ci.yml`     |
| **per merge — Verify** | the composed verdict (pack checked out, composed unit suite); triggers only on a push to `main`, never on `v2`, and still carries the 8-shard Playwright e2e matrix `v2` no longer has — reconciling the workflow with the rebuilt portfolio is a separate task | `.github/workflows/verify.yml` |
| **deploy**             | promotes a verified SHA; owner-fired only                                                                                                                                                                                                                       | `.github/workflows/deploy.yml` |

**The pre-push hook special-cases `main` only.** A push to `v2` runs no hook gate, so run `just ci`
(plus `just ci-srd-only` and `pnpm test:rules` when their surfaces moved) locally on the rebased tree
before `git push origin HEAD:v2`. The local gate list must always be a superset of the hook's: read
`.githooks/pre-push` before your first integration and run anything it adds — the bundle budget in
particular — beforehand, with its measured baseline recorded.

**Browser lane on `v2`.** The old end-to-end matrix is not carried over (owner, 2026-09-03: almost
an hour per run is unacceptable). `playwright.config.ts` keeps two projects, `chromium` and
`mobile`, running the accessibility sweep only; the owner's screenshot lane has its own config
(`playwright.visual.config.ts`). Measured durations and the shape of the rebuilt portfolio are owned
by [Test portfolio](TEST_PORTFOLIO.md), not by this page.

**Never use `--no-verify`, and never add a slow check to a hook "to be safe."** If a check is slow it
belongs in a remote per-merge lane. Keep `--cache` wherever it helps so a no-op re-run is seconds.

**Test altitude.** Governed by [Golden Rules](GOLDEN_RULES.md) rule 13 (TDD for behavior changes) —
the cheapest test that pins the fact, at the lowest lane that can observe it.

## Commits and changesets

- **One coherent step per commit**, as a Conventional Commit. The owner is the sole author: no
  co-author, footer or trailer lines.
- **Every commit stages exactly one `.changeset/*.md`** — the pre-commit hook enforces it, and the
  changesets feed `CHANGELOG.md` at release time. When amending, update and re-stage the existing
  changeset honestly; never add a second one to satisfy the hook.
- **Every commit reconciles the document that owns the changed fact** (golden rule 16). Execution
  state goes to `docs/PROGRAM_STATUS.md`, owner decisions to `docs/program/DECISIONS.md`, product
  intent to `PRODUCT.md`, durable rules here or in `docs/GOLDEN_RULES.md`.
- **TypeScript strict**: no `any`, no non-null `!`, no `eslint-disable`, zero lint warnings.
- **Bilingual**: every user-visible string ships EN + IT; Italian is never empty or byte-identical
  English. `pnpm i18n:check` runs the leak detectors standalone and inside `pnpm build`.
- **Milestone pushes** to a topic branch are fine and instant; the integration push is explicit
  (`HEAD:v2` or `HEAD:main`), never bare.
- **Releases** are owner-triggered and agent-executed with `just release`; deploys are a separate
  explicit gate (`just deploy` dispatches `deploy.yml`). See [Release](RELEASE.md).

## Review lifecycle

Review replaces PR review; it never replaces tests or screenshot evidence.

1. **Request** an independent correctness and requirement-coverage review through Superpowers'
   requesting-code-review workflow. Include the adversarial lenses the diff deserves: adjacent-class
   confusion in a security-sensitive classifier, owner-map parity for a derived category, "is there
   another stored copy of this fact that must stay equal?" for a migration, boundary proofs over the
   resolved import graph, typed receipts instead of collapsed identities.
2. **Add `ponytail-review`** when the diff carries meaningful abstraction or dependency risk. It asks
   only what can be deleted, reused or replaced by a simpler native seam, and never lowers the target
   or substitutes for the correctness review.
3. **Receive** the findings with technical rigor (Superpowers receiving-code-review): apply each
   actionable finding or record the concrete reason it does not fit. Findings are evidence, not
   commands. A broad gate that returned `NEEDS_CHANGES` closes only through a finding-by-finding fix
   report and a re-review of that same gate — an unrelated later fix or a rebase never closes it.
4. **Re-verify the final tree**, then rebase on the fresh destination and run the applicable gates
   again if the rebase changed anything.
5. **Integrate** per [Worktrees](WORKTREES.md). An independent reviewer reads the diff read-only and
   never writes into the task's worktree; one worktree has one writer.

## Lessons that became rules

Twenty-nine rules distilled from real sessions in this repository. They add to the golden rules,
never replace them; each names the situation first.

**Design and planning**

1. A "redesign the whole product" request: produce and ratify a one-page steering — purpose, for
   whom, what it is not, the automation line, the milestone, delivery posture, acceptance stories —
   before any approach or design, then run a keep/cut/rebuild inventory against it.
2. Asking the owner a design question: give a plain-language definition, two concrete examples from
   this product, the visible consequence of each option, and the recommendation first.
3. "Not premium" feedback is a craft verdict until a fair side-by-side that includes the current
   direction at equal fidelity is rejected; interview refinement axes before proposing any reset.
4. Bounded work that keeps redistributing around one constraint, or that starts crossing subsystem
   boundaries: stop coding, restate the end-to-end flow and invariants, compare two or three simpler
   architectures, get approval, and only then resume TDD.
5. In a category with a dominant product, copy its component grammar — shapes and positions — first,
   and spend identity only on palette, type, iconography and one signature material.
6. Before the first mockup, pull a licensed icon set matching the domain, normalize it into one
   sprite and record attribution; hand-drawn SVG is only for brand marks.
7. A dense surface: compact the container — nested surfaces, duplicated labels, advanced settings
   behind disclosure — before shrinking any hit target below 44–48px, and add a geometry regression.
8. A global typography change passes only through a rendered reflow gate at the smallest supported
   viewport: truncation, overlap, wrapping, button-label fit, navigation density.
9. Framed raster art: decide the compositing contract early — what is baked into the image, and what
   stays theme- and state-aware chrome (frame, radius, rarity, focus, selection).
10. A task that rewrites a persisted shape carries a stored-copies table: every write site, every
    document family (parents, snapshots, indexes, denormalized projections), and the invariant that
    ties the copies together. The migration plans every family in one atomic batch.
11. Verification snippets in a plan are executed adversarially before approval — against the
    formatted target and against at least one minimal mutation per claimed invariant.

**Parallel work**

12. Read a set of parallel plans as one producer-consumer DAG before dispatching: an interface
    matrix, one named owner per new capability, disjoint file ownership, and one frozen base SHA in
    every brief. Independently sound plans have produced circular dependencies and missing owners.
13. A design or screen fan-out shares one written kit — tokens, helper library, sample data, screen
    sizes, output contract, icon policy, file naming, the exact files each agent may write — with
    disjoint write namespaces and an orchestrator-owned merge. Consistency is never delegated.
14. One worktree means one writer at a time. "The file sets are disjoint" is not isolation: hooks
    stash and restore the whole tree and gates share ports, `dist/` and caches. A second implementer
    gets a second worktree.
15. A task that changes a shared fixture or helper owns every failing consumer of it: classify each
    as production regression or stale assertion and fix the right boundary. A focused green never
    overrides a causally related full-suite red.

**Commits, gates and evidence**

16. Amending under the staged-changeset hook: validate the prospective amended tree or make an
    honest update to the existing changeset. Never create a second artifact to satisfy a hook.
17. Before an amend rewrites text a specification owns, re-read that specification: a hook adds a
    delivery condition, never authority over spec-owned literals.
18. Evidence extraction must be more inert than the command whose evidence it reads: single-quote
    patterns containing backticks, never name a zsh scratch variable `path`, and fix a failing probe
    before concluding anything about the product. Toolchain pinning counts only when the child
    process, not just the parent, is proved to resolve to the pinned executable.

**Tests**

19. "No test files found", a resolver error or the wrong runner project is a command defect, never
    RED. Prove the command enumerates the expected file count before trusting a failure.
20. A RED that dies at a strict fail-closed boundary may be exposing the bug: trace the value into
    that boundary before weakening the fixture, and keep the literal assertion for GREEN.
21. Destructive transitions need exact negatives — `toEqual({})`, `toHaveLength(0)`, explicit key
    absence. `toMatchObject({ nested: {} })` accepts a non-empty object.
22. A fixture standing in for a production boundary satisfies that boundary's complete contract:
    emit at least one fixture through the real producer and name the adversarial omissions.
23. Install fake timers before the timer under test is scheduled, and reset stateful mocks'
    implementations as well as their calls — a leaked `mockImplementationOnce` cascades.
24. Geometry oracles fail closed: require at least one selected element, assert width and height,
    measure the painted hit area, and give only CSS-pixel comparisons a named epsilon (≤ 0.01px)
    proved to still reject the real regression.
25. The expensive test layer is default-deny: a browser test needs a named cross-boundary risk and
    proof that cheaper layers cannot cover it.

**Debugging**

26. Reconcile concurrent private state by replaying the authoritative transition through its owning
    reducer onto local state — never by choosing or shallow-merging whole snapshots; a failed guard
    is an explicit conflict.
27. When independent reviews keep rediscovering the same invariant failure at later boundaries, the
    primitive is wrong: move to a transactional one (immutable value plus compare-and-swap,
    no-replace claims) instead of spending another round on local checks.
28. Strict-mode replays effects without recreating refs: reset liveness and generation refs in every
    effect setup, and keep the first successful acquisition's pre-mutation snapshot across the replay.
29. Migration atomicity covers every fact used to authorize a projection, not only the documents
    whose bytes change; and every parser reused by an audit, hash or backup carries a deep
    no-mutation contract.
