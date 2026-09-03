# Test Portfolio

This ledger owns the current risk-based test portfolio baseline and later
replacement/deletion evidence. It implements the execution direction in the
[Automation-first Wayfinder](superpowers/plans/2026-08-25-automation-first-wayfinder.md)
and the [Tactical Codex UI/UX Wayfinder](superpowers/plans/2026-08-25-tactical-codex-ui-ux-wayfinder.md);
those documents remain the owners of their respective designs.

Both Wayfinders are integrated and resolve from current `main`; this portfolio links their design
authority rather than copying it.

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

### Rules suite (P1, 2026-09-03)

`tests/rules/` is four files — `firestore-rules.test.ts` (101 cases),
`storage-rules.test.ts` (12), `migrate-character-parents.emulator.test.ts` (1) and
`migration-kit.emulator.test.ts` (4): **118 cases**, inside the ≤ 120 budget the combat P1
data-safety plan sets. The firestore file was cut from 176 by the P1 legacy cutover: the
`playStateVersion` marker cases, the unmarked-legacy escape hatch, `peerLegacyCoreCreate`
and every duplicate access-matrix row died with the representations they pinned, and each
surviving predicate keeps one accept and one deny. Count them with
`grep -c "^\s*it(" tests/rules/*.test.ts`.

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
| C3    | unassigned (next: T3)        | 1ccb8af74b69e8af2f2b8568480ab1e3048c1eac | `.github/workflows/**`; `justfile` is outside the narrow activation diff but may be reassigned only after the final F0 authority handoff.         | —           | Established at the approved handoff; assign `justfile` only after the activation handoff is remotely proven.    |
| C4    | T8A (this commit)            | 6efda521d6a0c3ecdd481628656fbb4c4a7792bb | Record the visual-lane foundation over T7A's census; `CAND-surface-sweeps` remains blocked pending T7B/T8B; next owner is T10/T14.                | this commit | `pnpm visual:review -- --grep detector`; `pnpm visual:motion -- --grep detector`                                |

### F0 — Program Supervisor Foundation shared-path lease

- **Repository lease F0 (Task 0):** holder `program-supervisor-foundation` in
  `/Users/salvatoredicara/Workspace/Codex/d20-folio-program-supervisor-foundation`, branch
  `feat/program-supervisor-foundation`; acquired `2026-08-26T01:38:26Z`, expires
  `2026-08-27T01:38:26Z`, and rechecked valid at `2026-08-26T18:30:26.000Z`. Its exact
  repository-exclusive paths remain `justfile`, `package.json`, `CLAUDE.md`, `PROGRESS.md`,
  `docs/WORKTREES.md`, `docs/PROGRAM_STATUS.md`, `docs/TEST_PORTFOLIO.md`, and
  `scripts/program-supervisor/**` until the terminal handoff rule below is satisfied.
- **Activation runtime lease:** `runtime-foundation-f0-activation-status`, holder
  `program-supervisor-foundation-activation-status`, was acquired
  `2026-08-26T15:50:42.912Z` and expires `2026-08-27T15:40:00.000Z`. Its mutation scope is the
  strict subset `docs/PROGRAM_STATUS.md`, `docs/TEST_PORTFOLIO.md`, and
  `.changeset/program-supervisor-activation.md`. It does not narrow or release the versioned
  repository lease; the remaining F0 paths are dependency-frozen by that lease, not implicitly
  owned by the activation runtime task. Its acquisition-time repository pointer remains
  `F0`, `docs/TEST_PORTFOLIO.md@7cb89ed4b26021aa46a7d4cdc8ef7888df692d52`, reconciled through
  `fd5d84cec2e5da2986bda412e277d7cc68c77735`; that is the preserved pre-authority-reconciliation
  lease receipt, not the current public or runtime main authority.
- **Current base and activation candidate:** fetched public `origin/main`, remote main, clean
  detached program-control HEAD, and runtime main authority are
  `1a549625175af1802cc521f6c4bcba03ebe0f8b9`. The clean rebased activation worktree is two commits
  ahead at pre-refresh HEAD `f9f29e95bda67ff8757396adda6abc258175d526` (tree
  `95d5d2fdb959d5b019fff3428953b0fc55f774b4`), with first activation commit
  `07e694a9e2493f2c44408abd3db94634dc93c076`. Runtime has not yet reconciled that rebase: its last
  activation `task-reconciled` identity remains base
  `b9cdabde76aae63c9418b0ae3cb2b5a7d10ac3fa` and head
  `512e0ffca44db0945393fb7013c190c88a4c3060` until this refreshed candidate is committed and the
  next typed reconciliation event is appended.
- **Integrated core receipt:** exact remote SHA
  `fd5d84cec2e5da2986bda412e277d7cc68c77735` received independent PASS review. `just ci` passed
  801/801 Vitest files and 18,613/18,613 tests, 7/7 Functions files and 129/129 Functions tests,
  typecheck, lint, and both builds. `just ci-srd-only` passed 623/623 files and 13,037/13,037
  tests, typecheck, and build. The separate final pre-push gate passed typecheck, lint, 801/801
  Vitest files and 18,613/18,613 tests, coverage, build, and 6/6 bundle-budget tests. The pinned
  toolchain/typecheck authority correction remains evidenced by
  `be84367069e47ce029eadf1c11fbdf9aac90df2d`. No deployment occurred.
- **Subsequent test-harness repair receipts:** current main advanced from historical core F0 through
  independently reviewed runtime-residue repair
  `b9cdabde76aae63c9418b0ae3cb2b5a7d10ac3fa` and worktree-race repair
  `1a549625175af1802cc521f6c4bcba03ebe0f8b9`, not through another core integration. Each separate
  repair passed `just ci`, `just ci-srd-only`, and the actual pre-push coverage/build/budget lane
  before remote integration, authority reconciliation, and runtime-lease release. Neither changed
  production or private content, and neither deployed. Their clean worktrees and branches remain
  retained only for supervisor cleanup after handoff.
- **Runtime and adapter receipt:** private bootstrap fingerprint
  `840c0ce7c9514608040389ae234b0cd526b4754ab2799c738310db653b34984e`; event sequence `49`;
  fixed-ref tip `25c24b798c10f9c72d64e85f510b30cc77415c51`; main authority
  `1a549625175af1802cc521f6c4bcba03ebe0f8b9`. The projection contains six tasks, exactly one active
  writer lease for activation, and current writer `program-supervisor-bootstrap-controller`. The
  activation task remains `executing` with its sequence-39 failed-gate reconciliation pending:
  `just ci` passed typecheck and lint, then completed 800/801 test files and 18,612/18,613 tests
  because the single-fetch worktree test exceeded 5 seconds. The separately chartered
  `foundation-worktree-race-test` removed only its irrelevant harness setup, received independent
  PASS review, passed both full gates plus the actual pre-push coverage/build/budget lane, integrated
  at current main, reconciled authority, and released its lease at sequence 49. Provisioning records
  task `d20 Folio Program Supervisor`,
  saved project `1ffe790a-2e8c-41fd-b048-932ad89d0d4e`, thread
  `01a03eba-ac75-7fb0-80b0-88356b3aba67`, host `local`, marker
  `d20-folio-program-supervisor:v1:05405bae8b24f3ec1f120985f66bf755c1011b19`, automation ID
  `d20-folio-program-supervisor-heartbeat`, automation name
  `d20 Folio Program Supervisor Heartbeat`, cadence 30 minutes, the same target thread,
  destination `thread`, notifications `failed_runs_only`, and status `PAUSED`. A disposable probe
  proved `just wt-new`, pinned Node `v24.16.0`, pnpm `11.2.2`, root and Functions installs, hooks,
  idempotent bootstrap, and the exact read-only content-pack link, then was cleanly removed with its
  branch.
- **Current conflict receipt (observed `2026-08-26T18:30:26.000Z`):** K1 is clean and queued at
  `7ae43494be58f92651b02a32de821c0d3f59fb98`; B00 is clean and frozen at
  `7b66c828b1f181c22e5921abf678c436825bc089`; neither has an active writer or rebase. The private
  content repository is clean with HEAD, fetched `origin/main`, and remote main all equal to
  `1d5226f564d2c790f5409c294afe9d9ba6cc2ab7`; retained product links resolve to its
  `content-pack/` and are read-only.
- **Terminal handoff rule:** F0 is released only after this refreshed rebased activation-status
  candidate is remotely proven, its current base/head is reconciled into runtime, and its authority
  event is appended. Then and only then may the activation task become `integrated`, its runtime
  lease be released, the exact heartbeat change from `PAUSED` to `ACTIVE`, and
  `heartbeat-activated` irreversibly transfer the sole runtime writer role to thread
  `01a03eba-ac75-7fb0-80b0-88356b3aba67`.
- **Verification contract:** the exact candidate requires independent read-only review,
  documentation guards, `just ci`, `just ci-srd-only`, clean private/link proof, fresh-base
  verification immediately before candidate evidence, explicit `HEAD:main` remote proof, and
  atomic reconciliation of the new `docs/PROGRAM_STATUS.md` and `docs/TEST_PORTFOLIO.md` blobs.
- **Cleanup:** after the typed writer handoff, only the provisioned supervisor may prove the
  bootstrap controller detached and each tree clean, remotely integrated, and unowned; remove the
  Foundation, runtime-residue-repair, and worktree-race-repair worktrees and branches from
  program-control; and append `cleanup-recorded`. Program-control, the active runtime, immutable
  bootstrap evidence, shared checkout, K1, and B00 are not cleanup candidates.
