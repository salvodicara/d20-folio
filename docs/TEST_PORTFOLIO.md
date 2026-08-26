# Test Portfolio

This ledger owns the current risk-based test portfolio baseline and later
replacement/deletion evidence. It implements the execution direction in the
[Automation-first Wayfinder](superpowers/plans/2026-08-25-automation-first-wayfinder.md)
and the [Tactical Codex UI/UX Wayfinder](superpowers/plans/2026-08-25-tactical-codex-ui-ux-wayfinder.md);
those documents remain the owners of their respective designs.

Both Wayfinders are pinned in the sibling documentation stream at `7590b18` and
must land before these repository-relative links resolve on `main`; they are not
copied into this commit.

Counts and timings here are observable health indicators, not quotas, deletion
targets, or completion gates. A test may be merged or deleted only when its
risk signal remains protected and its row has the applicable D1-D7 evidence.

## Baseline inventory

The reset audit recorded 619 public unit files / 168,204 LOC; 178 private-pack
unit files / 49,189 LOC; one 98-LOC source guard; two Rules files / 3,239 LOC;
seven Functions files / 1,533 LOC; and 62 E2E specs / 10,191 LOC: 232,454 test
LOC total, including its one 98-LOC guard. The composed Vitest baseline was 797 files / 19,024 tests. The
Playwright baseline was 2,331 registrations, including about 930 env-gated
capture/pixel registrations and 1,124 ambient registrations across four
overlapping surface sweeps.

Task T7A freezes that exact legacy surface baseline on
`250e5d555f82c9727fc0043347b99e7a9558a987`: 100 stable ids in original order
over 42 routes, with the default Playwright inventory still at 2,331
registrations in 62 files. The canonical, Playwright-free census/index now owns
route and state data; `surface-manifest.ts` is a compatibility re-export and
`surfaces.ts` retains the legacy runtime behavior. The separate ten-route list
in `_identity-shots.spec.ts` remains untouched and classified for T8B
consolidation. `CAND-surface-sweeps` stays `blocked-on-wayfinder`: T7A adds the
census contract only, with no grader, deletion, or D1-D7 evidence.

The dedicated T8A visual runtime preserves that legacy behavior by deriving the
sheet mode from each runtime surface and opening every curated variant and B01
motion frame in its own browser context while retaining the fixture's configured
base URL. Every named capture has a 60-second deadline whose diagnostic carries
its locale, theme, viewport, and optional motion frame. Its focused lifecycle proof traverses
`roster-empty` → `home` → `character-spell-add`, so both page-state reuse and an
edit surface seeded as Play fail before screenshots can be accepted. Census
counts, `PAIRWISE`, default discovery, and the 2,331-registration baseline are
unchanged.

On exact base `1ccb8af74b69e8af2f2b8568480ab1e3048c1eac`, the read-only
recalculation is 619 public unit files / 168,225 LOC; 178 private-pack unit
files / 49,189 LOC; two Rules files / 3,239 LOC; seven Functions files /
1,533 LOC; and 62 E2E specs / 10,191 LOC. The six mandated commands produce a
232,377-LOC subtotal across their five measured groups and exclude the colocated
`src/components/shared/folio-card-migration.guard.test.ts` guard (98 LOC).
All tracked test source is therefore 232,475 LOC. Playwright lists 2,331
registrations. Future deltas compare to these exact-base measurements.

The composed `pnpm test` baseline observed 19,022 of 19,024 passing under
portfolio load, with two five-second timeouts; each passed three isolated
executions. This is a reliability signal, not a semantic failure. Do not add a
retry or timeout to mask it.

### Read-only inventory commands

```bash
find tests/unit -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l
find -L content-pack/tests/unit -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l
find tests/e2e -type f -name '*.spec.ts' | wc -l
find tests functions/src -type f \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.spec.ts' \) -print0 | xargs -0 wc -l | tail -n 1
find -L content-pack/tests/unit -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) -print0 | xargs -0 wc -l | tail -n 1
pnpm exec playwright test --list | tail -n 1
wc -l src/components/shared/folio-card-migration.guard.test.ts
```

## Durable proof registry

| ID             | risk | invariant                                                                                                                                                           | owner                                                    | current proof                                    | replacement proof                                                                                                                                                                                   | state | measured cost                                                                 |
| -------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| R0-rules       | R0   | Pure rule outcomes are deterministic formulas; they never roll dice.                                                                                                | Automation Wayfinder; `docs/MECHANICS.md`                | Existing rule/unit coverage and no-RNG guard.    | Table and mutation proofs around `resolveCommand` in L1.                                                                                                                                            | keep  | Baseline not yet apportioned; 232,377 LOC is an indicator.                    |
| R0-character   | R0   | Stored characters remain readable; migrations preserve data and six-fixture parity.                                                                                 | `docs/CHARACTER_SCHEMA.md`; six team fixtures            | Existing codec, migration, and fixture coverage. | Codec round-trip plus snapshot → dry-run → idempotent apply → verify in L1/L2.                                                                                                                      | keep  | Baseline not yet apportioned; 232,377 LOC is an indicator.                    |
| R0-persistence | R0   | Authenticated edits save once and survive server echo, reload, offline work, and rebase.                                                                            | Automation Wayfinder persistence seam                    | Existing persistence representations.            | Real Auth + Firestore-emulator browser journeys in L2/L3.                                                                                                                                           | keep  | Baseline not yet apportioned; 2,331 registrations is an indicator.            |
| R0-shared      | R0   | Shared commands retain real Auth and App Check, Firestore Rules/direct-write denial, role matrix, callable atomicity, revision fence, and idempotent receipt proof. | `executeSharedCommand`; Firestore Rules                  | Existing Functions and Rules coverage.           | Emulator proof of real Auth/App Check, Rules/direct-write denial, owner/member/DM/admin/outsider/blocked role matrix, callable atomicity, revision fencing, and idempotent receipt replay in L2/L3. | keep  | 2 Rules files / 3,239 LOC; 7 Functions files / 1,533 LOC.                     |
| R1-action-flow | R1   | ActionFlow completes high-frequency play jobs.                                                                                                                      | Both Wayfinders                                          | Existing browser journeys.                       | Semantic L3 journeys for cast, attack/save observation, resources/rest, undo, onboarding/import, and remaining distinct high-frequency jobs.                                                        | keep  | 62 E2E specs / 10,191 LOC; count is an indicator.                             |
| R1-rendered    | R1   | Designed states are bilingual, accessible, responsive, and honest about sync.                                                                                       | Tactical Codex Wayfinder; `DESIGN.md`; atlas A00–A16/B01 | Existing surface, visual, and motion coverage.   | Pairwise rendered L4/L5 evidence for EN+IT, a11y, responsive layout, offline/pending/reconnect/error states, and visual/motion including reduced motion.                                            | keep  | 1,124 overlapping-sweep registrations; not a reduction target.                |
| R2-policy      | R2   | Static policy cannot regress: licensing partition, i18n key parity, import direction, route coverage, and no RNG.                                                   | Constitution/map owners                                  | Existing lint and focused source guards.         | Retain focused L0 guards.                                                                                                                                                                           | keep  | One colocated guard / 98 LOC plus in-suite policy guards not yet apportioned. |

## Candidate proof registry

Every candidate remains classification-only in this baseline. No row is
deleted; the durable rows above remain `keep` while candidate work is proved at
its own scope.

| ID                        | risk | invariant                                                                                          | owner                                            | current proof                                                   | replacement proof                                                                     | state                | measured cost                                                    |
| ------------------------- | ---- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------- |
| CAND-fast-meta            | R2   | Fast-lane meta checks retain distinct static policy signal.                                        | Test portfolio owner                             | Duplicate fast-lane meta tests.                                 | Merge only identical setup, authority boundary, and failure mode after D1-D7 mapping. | merge-candidate      | 1 file / 143 LOC.                                                |
| CAND-functions-zero-retry | R0   | Functions and critical browser proofs remain zero-retry and faithful.                              | Automation Wayfinder                             | Current Functions/critical coverage has a zero-retry gap.       | Emulator boundary proof with retries 0 and critical `pass^3` evidence.                | blocked-on-wayfinder | Not yet separately measured; coverage gap, not a numeric target. |
| CAND-auth-persistence     | R0   | Authenticated persistence is proved through real boundary journeys.                                | Automation Wayfinder persistence seam            | No faithful real Auth critical journeys.                        | Auth + Firestore-emulator save/echo/reload/offline/rebase journeys.                   | blocked-on-wayfinder | 0 faithful journeys.                                             |
| CAND-surface-sweeps       | R1   | Each designed state has one faithful pairwise rendered traversal.                                  | Tactical Codex Wayfinder                         | Four overlapping a11y/i18n/layout/ink sweeps.                   | One composable pairwise surface audit after Wayfinder census handoff.                 | blocked-on-wayfinder | 4 files / 987 LOC; 1,124 registrations.                          |
| CAND-capture-visual       | R1   | Curated capture, performance, visual, and motion evidence stays outside default release discovery. | Tactical Codex Wayfinder                         | Capture/performance/visual harness cohort in default discovery. | Dedicated curated visual/motion and explicit performance lanes.                       | blocked-on-wayfinder | 5 files / 661 LOC; about 930 env-gated registrations.            |
| CAND-conditional-layout   | R1   | Browser journeys fail semantically rather than conditionally or on layout symptoms alone.          | Tactical Codex Wayfinder                         | Conditional/vacuous E2E and layout-symptom cohort.              | Semantic journeys and merged layout-stability proofs with D1-D7 evidence.             | delete-candidate     | 11 files / 1,385 LOC indicator.                                  |
| CAND-ui-regex-guards      | R1   | Rendered UI evidence replaces implementation-shape checks only where it catches the same failure.  | Tactical Codex Wayfinder                         | Eligible UI source-regex guards.                                | Component, surface grader, screenshot, or motion mutation proof.                      | delete-candidate     | 13 files / 1,246 LOC.                                            |
| CAND-pack-aggregates      | R0   | Private-pack primitive/grant outcomes retain equal or stronger semantic signal.                    | Private content-pack test owners                 | Aggregate tables.                                               | Focused semantic tables with unique rows and evaluator mutations.                     | merge-candidate      | 2 files / 12,783 LOC.                                            |
| CAND-causal-protocol      | R0   | Semantic command outcomes replace retired causal-protocol representation assertions.               | Automation Wayfinder                             | Named causal-protocol representations.                          | Golden/contract command proofs plus D1-D7 cutover evidence.                           | delete-candidate     | 6 files / 4,923 LOC.                                             |
| CAND-legacy-material      | R0   | Canonical material/persistence codec and migration preserve live-user compatibility.               | `docs/CHARACTER_SCHEMA.md`; Automation Wayfinder | Legacy material/persistence representations.                    | Canonical codec/migration and boundary journey proof plus D1-D7 cutover evidence.     | delete-candidate     | 2 files / 1,255 LOC.                                             |

### D1-D7 deletion evidence

`deleted(D1-D7 evidence)` is permitted only when the row records all of the
following in the same slice and commit:

1. **D1 — Owner:** Name the durable invariant and its fact owner.
2. **D2 — Replacement:** Prove the outcome at the cheapest faithful boundary.
3. **D3 — Sensitivity:** Show the replacement failing before the fix or against a deliberate owned-seam mutation.
4. **D4 — Fidelity:** Firebase/Auth/offline assertions use emulators; visual/motion assertions use rendered output. Mocks or source text are not substitutes.
5. **D5 — Unique signal:** Map every candidate assertion to its replacement or explicitly retire the behavior.
6. **D6 — Cutover:** `rg` finds no reachable producer, consumer, import, field, selector, or feature flag for a retired representation.
7. **D7 — Green evidence:** Run focused tests and the applicable composed/SRD/Rules gate; every critical journey supplying coverage has Playwright retries set to 0 and passes three consecutive executions (`pass^3 = 100%`) with no skip, quarantine, conditional pass, or flaky classification; update this inventory and the owner document in the same commit.

Merge only when setup, authority boundary, and failure mode are identical and
the variation is fixture, theme, locale, or example. Keep tests separate when
they have different failure causes or recovery. Proof state is exactly one of
`keep`, `merge-candidate`, `delete-candidate`, `blocked-on-wayfinder`, or
`deleted(D1-D7 evidence)`.

## Shared-path lease registry

Only the named holder edits a leased chokepoint. Other workers record their
requested change in task evidence and wait for an explicit handoff. An
unperformed handoff has no fabricated SHA.

| lease | holder                       | base SHA                                 | pending change                                                                                                                                    | handoff SHA | focused command                                                                                                 |
| ----- | ---------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| C0    | T8A (this commit)            | 6efda521d6a0c3ecdd481628656fbb4c4a7792bb | Add isolated `visual:review`, `visual:motion`, and `qa:perf` commands without changing the lockfile; next owner is UI Task 1.                     | this commit | `pnpm visual:review -- --list`; `pnpm visual:motion -- --list`; `pnpm qa:perf -- --help`                        |
| C1    | unassigned (next: UI Task 2) | 1ccb8af74b69e8af2f2b8568480ab1e3048c1eac | `src/app/router.tsx`, specimen/production i18n loaders, catalogue registration; future order UI Task 2 → owning UI catalogue slices → UI Task 15. | —           | Established at the approved handoff.                                                                            |
| C2    | T8A (this commit)            | 6efda521d6a0c3ecdd481628656fbb4c4a7792bb | Add the isolated visual Playwright config and artifact/report root; ordinary `playwright.config.ts` stays untouched; next owner is T4.            | this commit | `pnpm exec playwright test --list` (2,331 / 62); `pnpm visual:review -- --list`; `pnpm visual:motion -- --list` |
| C3    | unassigned (next: T3)        | 1ccb8af74b69e8af2f2b8568480ab1e3048c1eac | `.github/workflows/**`; `Justfile` is exclusively leased by F0 until its recorded release.                                                        | —           | Established at the approved handoff; assign `Justfile` again only after the F0 handoff.                         |
| C4    | T8A (this commit)            | 6efda521d6a0c3ecdd481628656fbb4c4a7792bb | Record the visual-lane foundation over T7A's census; `CAND-surface-sweeps` remains blocked pending T7B/T8B; next owner is T10/T14.                | this commit | `pnpm visual:review -- --grep detector`; `pnpm visual:motion -- --grep detector`                                |

### F0 — Program Supervisor Foundation shared-path lease

- **Holder and location:** `program-supervisor-foundation` in
  `/Users/salvatoredicara/Workspace/Codex/d20-folio-program-supervisor-foundation`, branch
  `feat/program-supervisor-foundation`.
- **Fresh base and term:** fetched `origin/main`
  `c476f2b3bf2a1cf9d504d8b1281d6979463f2f97`; acquired
  `2026-08-26T01:38:26Z`, expires `2026-08-27T01:38:26Z`.
- **Exclusive paths:** `justfile`, `package.json`, `CLAUDE.md`, `PROGRESS.md`,
  `docs/WORKTREES.md`, `docs/PROGRAM_STATUS.md`, `docs/TEST_PORTFOLIO.md`, and
  `scripts/program-supervisor/**`. This is a repository-authority lease only; it
  does not claim a runtime lease before the runtime exists.
- **Current state and conflict receipt (Task 4 pre-authoring, observed
  `2026-08-26T05:18:32Z`):** F0 remains active; the Foundation worktree is clean at
  `4425731423bcd08b405046ff525b4aaffa58f235` on fresh `origin/main`
  `c476f2b3bf2a1cf9d504d8b1281d6979463f2f97`. K1 is clean at
  `7ae43494be58f92651b02a32de821c0d3f59fb98`; its fresh
  `origin/main...HEAD` path set is disjoint from every F0 path. B00 is clean and
  frozen at `7b66c828b1f181c22e5921abf678c436825bc089`; its committed candidate
  overlaps `package.json` and `PROGRESS.md` (and related `pnpm-lock.yaml`), so it
  is serialized behind F0. Neither retained product worktree has a rebase or active
  writer. The clean private `main` checkout is
  `1d5226f564d2c790f5409c294afe9d9ba6cc2ab7` and is read-only for this lease.
- **Handoff:** release F0 only after remote integration proof or an evidence-backed
  blocker/recovery disposition. Until then B00 receives no writer lease and may
  not edit, rebase, or integrate its frozen candidate. After F0 integrates, B00
  must freshly rebase onto the final F0 `origin/main`, explicitly reconcile
  `package.json`, `PROGRESS.md`, and `pnpm-lock.yaml`, receive new review and all
  visual gates, and never overwrite the integrated F0 authority.
- **Focused proof (acquisition `0690ee5a31477397c752cc3110effd30b49af1c0`):**
  `/Users/salvatoredicara/.asdf/installs/nodejs/24.16.0/bin/node /Users/salvatoredicara/.asdf/installs/nodejs/24.16.0/lib/node_modules/corepack/dist/corepack.js pnpm exec prettier --check docs/TEST_PORTFOLIO.md .changeset/program-supervisor-preflight.md`
  **PASS**; `git diff --check` **PASS**.
