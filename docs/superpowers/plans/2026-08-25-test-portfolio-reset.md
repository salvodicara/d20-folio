# Test Portfolio Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the accumulated test suite with the smallest risk-based portfolio that proves deterministic rules, live-user data safety, authoritative Firebase boundaries, critical play journeys, and the rendered Tactical Codex experience without preserving obsolete implementation details.

**Architecture:** Tests are owned by durable product invariants, not by files or historical regressions. Cheap pure proofs run on every PR; real Auth/Firestore/Functions and browser journeys run against the exact integration SHA; visual and motion evidence is curated for human approval. A legacy, duplicate, or source-regex test is deleted only in the same slice that proves its replacement catches the relevant mutation.

**Tech Stack:** React 19, strict TypeScript, Vitest 4 projects, Playwright 1.60, axe-core, Firebase Auth/Firestore/Storage/Functions emulators, GitHub Actions, pnpm, npm for `functions/`, Changesets.

**Specs:**

- [Automation-first Wayfinder](./2026-08-25-automation-first-wayfinder.md)
- [Tactical Codex UI/UX Wayfinder](./2026-08-25-tactical-codex-ui-ux-wayfinder.md)
- [Automation-first product reset](../../plans/2026-08-24-automation-first-product-reset.md)

The frozen causal-protocol branch is salvage evidence only. Its journal, proof, lease, and storage shapes are not authority for new tests.

## Global Constraints

- Preserve no-RNG, EN+IT, SRD/content-pack separation, offline-first solo play, six live fixtures, migration idempotence, and owner-only deploy/visual approval gates.
- Do not delete a test until all deletion gates D1-D7 below pass in the same slice; test count alone is never evidence.
- Do not add a second command, persistence, surface, or capture model. Consume the interfaces owned by the two Wayfinders.
- Playwright retries are `0`; release-critical journeys must pass three consecutive executions (`pass^3 = 100%`). A quarantined or skipped test supplies no release coverage.
- Each public-repo commit is small, Conventional, owner-authored, and includes the named patch Changeset. Private content-pack commits remain separate and are verified through the composed public checkout.
- Each work package runs in a fresh, short-lived worktree from the latest owning `main`; parallel packages own disjoint files and integrate one at a time after rebase.
- Never deploy while executing this plan. Visual changes integrate only after approved rendered images and motion frames.

Every named public Changeset has this exact shape, using the task-specific sentence given at commit time:

```markdown
---
"d20-folio": patch
---
```

The body is the exact Changeset sentence printed in that task's final checkbox.

## Portfolio Authority and Risk Inventory

| Risk    | Durable invariant                                                                          | Fact owner                                               | Minimum proof and lane                                                            | Keep                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| R0      | Pure deterministic rule outcomes; formulas only, never rolled results                      | Automation Wayfinder, `docs/MECHANICS.md`                | table/mutation tests around `resolveCommand`; L1                                  | legality, costs, scaling, external-input requests, patch/events/undo/idempotency                           |
| R0      | Stored characters remain readable and migrations never lose data                           | `docs/CHARACTER_SCHEMA.md`, six team fixtures            | codec round-trip plus snapshot → dry-run → idempotent apply → verify; L1/L2       | schema versions, fixture parity, `Timestamp` boundaries, migration replay                                  |
| R0      | Authenticated edits persist once and survive reload/offline/rebase                         | Automation Wayfinder P1 persistence seam                 | real Auth + Firestore emulator browser journeys; L2/L3                            | CRE-006 snapshot, one create/advance patch, server echo without a second write, pending write/rebase/error |
| R0      | Shared commands are authorized, atomic, revision-fenced, and idempotent                    | `executeSharedCommand`, Firestore Rules                  | Functions emulator plus thin owner/member/DM/admin/outsider/blocked matrix; L2/L3 | callable results, direct-write denial, receipt replay, atomic convergence                                  |
| R1      | ActionFlow completes the real high-frequency jobs                                          | both Wayfinders                                          | 10-12 semantic browser journeys; L3                                               | cast, attack/save observation, resource use, rest, undo, creation/advancement/import                       |
| R1      | Every designed state is coherent, bilingual, accessible, responsive, and honest about sync | Tactical Codex Wayfinder, `DESIGN.md`, atlas A00-A16/B01 | one pairwise surface traversal plus curated screenshot/motion evidence; L4/L5     | axe, i18n, overflow, focus, touch, save/offline/error, motion/reduced-motion                               |
| R2      | Static repository policy cannot regress                                                    | constitution/map owners                                  | lint or focused source guard; L0                                                  | licensing partition, i18n key parity, import direction, route coverage, no RNG                             |
| Retired | Journal/proof/lease/mirror/CSS implementation shape                                        | none after cutover                                       | replacement evidence only                                                         | no preservation test; remove with the retired producer/consumer                                            |

## Audited Baseline and Outcomes

Baseline at the reset audit: 619 public unit files/168,204 LOC; 178 pack unit files/49,189 LOC; 1 source guard/98 LOC; 2 Rules files/3,239 LOC; 7 Functions files/1,533 LOC; 62 E2E specs/10,191 LOC. Total test code is 232,454 LOC. The composed Vitest gate reported 797 files/19,024 tests. Playwright listed 2,331 registrations, about 930 of them env-gated capture/pixel entries; four overlapping surface sweeps accounted for 1,124 ambient registrations.

Operational outcomes, measured again on the final exact SHA:

- PR jobs: p95 wall time at or below 5 minutes over the latest 10 green runs.
- Full exact-SHA verdict across CI + Verify: p95 at or below 12 minutes, with Functions in CI and Rules, critical emulator journeys, and surface audit parallelized in Verify.
- Default Playwright inventory is materially smaller and visual/capture tools do not appear in it.
- Immediate cleanup removes or merges only rows that satisfy D1-D7; LOC and registration reductions are reported as outcomes, never used as deletion quotas.
- The two 12,783-LOC pack aggregate files become smaller semantic tables when the table form preserves equal or stronger signal; no target size overrides D1-D7.
- After the automation cutover, net test code and wall time are lower than the audited baseline after counting all replacement tests. If either grows, the final review must name the new durable risk that justifies the increase.
- Every R0 journey passes three consecutive runs with zero retry, skip, conditional pass, or flaky classification.

These measurements are health indicators, not completion gates. Correctness, fidelity, sensitivity,
and the D1-D7 evidence decide whether a test may be removed; missing a numerical improvement triggers
review, never arbitrary deletion.

## Mandatory Delete and Merge Gates

A deletion row in `docs/TEST_PORTFOLIO.md` may change from `candidate` to `deleted` only when:

1. **D1 — Owner:** the durable invariant and its fact owner are named.
2. **D2 — Replacement:** an existing or new test observes the product outcome at the cheapest faithful boundary.
3. **D3 — Sensitivity:** the replacement was seen failing before the fix or against one deliberate mutation of the owned seam.
4. **D4 — Fidelity:** Firebase/auth/offline claims use emulators, and visual/motion claims use rendered output; mocks or source text do not substitute.
5. **D5 — Unique signal:** every assertion in the candidate is mapped to the replacement or explicitly rejected as retired behavior.
6. **D6 — Cutover:** `rg` finds no reachable producer, consumer, import, field, selector, or feature flag for the retired representation.
7. **D7 — Green evidence:** focused tests, the applicable composed/SRD/Rules gate, and three critical runs are green; the inventory and owner document are updated in the same commit.

Merge tests when setup, authority boundary, and failure mode are identical and only fixture/theme/locale/example changes. Keep separate tests when they fail for different causes or require different recovery. Capture scripts, artifact generators, performance probes, and intentionally broken modes move outside release test discovery.

## Target Lanes and Gates

| Lane                | Contents                                                                         | Execution                                                          |
| ------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| L0 static           | type, lint, licensing, i18n, import direction, route coverage, no RNG            | pre-commit and PR                                                  |
| L1 pure             | engine invariants, formulas, codecs, migrations, store reducers                  | fast/slow Vitest jobs on PR; composed twin on main                 |
| L2 live boundary    | Functions, six fixtures, Auth/Firestore/Rules/command emulator                   | Functions in CI; remaining boundaries in main Verify, same SHA     |
| L3 critical browser | 10-12 authenticated save/play/shared journeys                                    | main Verify, `--repeat-each=3`, no retry                           |
| L4 surface audit    | one navigation per pairwise specimen with i18n + axe + layout/ink graders        | main Verify, sharded                                               |
| L5 visual/motion    | curated screenshots and entry/mid/settled/interrupted/exit/reduced-motion frames | change-scoped human approval, outside default Playwright discovery |
| L6 release          | green CI + Verify exact SHA, health/read-only smoke                              | owner-triggered deploy only                                        |

## Dependency DAG, Waves, and Serial Chokepoints

```text
Wave 0  T1 ledger + T2 fast meta ─► T3 Functions/no-retry
                                      │
                                      ▼
                                  T7A census contract ─► T8A visual-lane foundation

Wave 1  P1 + existing SaveStatus ──► T4 save/offline ─┐
        S1 ready ─────────► T6 shared boundary ────┤
        pack baseline ────► T11 primitives ────────┼─ independent private worktrees
                         └► T12 grants ────────────┘
Wave 2  UI Tasks 1–14 + T8A ─► T7B census consolidation ─► T8B curated consolidation
Wave 3  UI Task 15 cutover ───► T9 vacuous/layout + T10 UI-regex retirement
        Automation X1 cutover ► T13 causal + T14 material retirement/close
```

- Wave labels are scheduling groups for currently eligible nodes, not dependency barriers. A node waits only for its stated dependency or DAG arrow, an exclusive C0–C4 lease, or an explicit owner gate; sharing a later wave never creates an unstated edge.
- Wave 0 starts T1/T2 immediately in disjoint worktrees. T3 takes the shared-config lease next; T7A freezes the census contract after Tasks 1–3; T8A starts only after both T3's C0/C2 handoff and T7A's schema/index handoff.
- T4 waits for P1's canonical document plus the existing locale-free `SaveStatus` seam; T6 waits for S1's callable/App Check seam. Neither invents an interim boundary or waits for a future Tactical Codex component.
- T7B/T8B wait for the candidate UI census and rendered states. T7A/T8A land the frozen census and `visual:review`/`visual:motion` lane before any UI slice invokes it.
- A read-only pack baseline freezes titles/outcomes; T11 and T12 then branch independently from the same verified private `origin/main`, own disjoint harnesses/tables, and use separate public verifier worktrees.
- T9/T10/T13/T14 are cutover cleanup, never speculative early deletion. Every deletion still passes D1-D7.

The immediate C0 handoff is `T3 → T8A → Tactical Codex UI Task 1`. T4 takes the next available C0/C2 window only after P1 is integrated; it does not hold the visual-foundation path open while waiting for P1. UI Task 15 is the final C0 owner.

The portfolio ledger contains a serial lease registry for these shared chokepoints:

| Lease | Exclusive paths                                                                                           |
| ----- | --------------------------------------------------------------------------------------------------------- |
| C0    | `package.json`, `pnpm-lock.yaml`, root script/command manifests                                           |
| C1    | `src/app/router.tsx`, specimen/production i18n loaders and catalogue registration                         |
| C2    | `playwright*.config.ts`, shared Playwright fixtures/reporters                                             |
| C3    | `.github/workflows/**`, `Justfile`                                                                        |
| C4    | `docs/TEST_PORTFOLIO.md`, `PROGRESS.md`, automation/UI status documents and final owner-map documentation |

Only the named lease holder edits a chokepoint. A parallel worker records the requested change in its own task evidence and waits for an explicit ledger handoff; it never touches the path opportunistically. Handoff records prior holder, next holder, exact SHA, pending change, and focused command.

The initial L3 inventory contains these twelve jobs: authenticated create/import/save, edit/save/echo/reload, Firestore SDK pending write/reconnect/rebase, cast/undo, attack-or-save external observation, rest/resource recovery, DM shared command, member shared command/idempotent replay, public/read-only authority, campaign attach/join, PWA offline boot, and recoverable permission/write failure. Combine them when one journey proves two jobs without obscuring the failure cause. Add another only for a distinct R0/R1 risk that cannot be proved faithfully by an existing journey, and record that rationale in the portfolio ledger; no numerical cap may force a risk to lose coverage.

### Wayfinder slice proof registry

| Slice           | Retained proof files                                                                                                             | Focused command                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| K1              | `resolve-command.contract.test.ts`, `resolve-command.golden.test.ts`                                                             | `pnpm exec vitest run --project fast tests/unit/resolve-command.{contract,golden}.test.ts`                                      |
| P1              | `material-state-codec.test.ts`, `material-state-migration.test.ts`, authenticated save spec                                      | `pnpm exec vitest run --project fast tests/unit/material-state-{codec,migration}.test.ts`                                       |
| C1              | `resolve-command-casting.test.ts`                                                                                                | `pnpm exec vitest run --project fast tests/unit/resolve-command-casting.test.ts`                                                |
| U1              | `action-flow-state.test.ts`, `action-flow-view.test.ts`, headless fixtures                                                       | `pnpm exec vitest run --project fast tests/unit/action-flow-{state,view}.test.ts`                                               |
| O1              | `target-new-file:tests/unit/creation-domain.test.ts`, `target-new-file:tests/unit/advancement-domain.test.ts`, headless fixtures | `pnpm exec vitest run --project fast tests/unit/creation-domain.test.ts tests/unit/advancement-domain.test.ts`                  |
| S1              | `functions/src/gameplay/execute-shared-command.test.ts`, shared critical spec                                                    | `npm --prefix functions test -- src/gameplay/execute-shared-command.test.ts && pnpm test:rules`                                 |
| A1              | `campaign-migration.test.ts`, Rules access matrix                                                                                | `pnpm exec vitest run --project fast tests/unit/campaign-migration.test.ts && pnpm test:rules`                                  |
| A2              | `session-record-contract.test.ts`, `session-record-migration.test.ts`                                                            | `pnpm exec vitest run --project fast tests/unit/session-record-{contract,migration}.test.ts`                                    |
| H1              | `homebrew-rule-definition.test.ts`, `homebrew-rule-migration.test.ts`                                                            | `pnpm exec vitest run --project fast tests/unit/homebrew-rule-{definition,migration}.test.ts && pnpm test:rules`                |
| F1-F6           | `resolve-command-{vitals,resources,effects,economy,inventory,discovery}.test.ts`                                                 | `pnpm exec vitest run --project fast tests/unit/resolve-command-{vitals,resources,effects,economy,inventory,discovery}.test.ts` |
| T7A             | `surface-census.test.ts`, canonical schema/index, unchanged legacy adapters                                                      | `pnpm exec vitest run --project fast tests/unit/surface-census.test.ts tests/unit/route-coverage.guard.test.ts`                 |
| T8A             | isolated visual config, curated/motion detector specimen, public command listing                                                 | `pnpm visual:review -- --list && pnpm visual:motion -- --list`                                                                  |
| UI Task 4       | UI-owned component behavior, `surface-census/action-flow.ts`, A08 rendered frames                                                | `pnpm visual:review -- --grep A08 && pnpm visual:motion -- --grep A08`                                                          |
| UI Task 8       | UI-owned component behavior, `surface-census/character.ts`, A05-A07 rendered frames                                              | `pnpm visual:review -- --grep 'A0[5-7]' && pnpm visual:motion -- --grep 'A0[5-7]'`                                              |
| Tactical slices | slice-owned `tests/e2e/surface-census/*.ts`, rendered behavior and curated frames                                                | `pnpm exec playwright test surface-audit && pnpm visual:review && pnpm visual:motion`                                           |
| T7B/T8B         | consolidated surface graders plus curated/motion corpus                                                                          | `pnpm exec playwright test surface-audit && pnpm visual:review && pnpm visual:motion`                                           |
| X1 / UI cutover | all retained lanes                                                                                                               | Task 14 authoritative command set; no deleted representation suite is reintroduced                                              |

A2 is mandatory when canonical sessions/records remain in the Task 15 release scope; H1 is mandatory when typed/versioned Homebrew remains. Their contract, codec/migration, provenance/pinning, hostile-input, and authorization proofs land with their Automation owner before UI Tasks 10/13 render them. O1 creation/advancement and U1 remain DOM-free and locale-free; UI Tasks 7 and 4/8 respectively own rendered behavior, screenshots, and motion.

### Task 1: Establish the Living Portfolio Ledger

**Files:** Create `docs/TEST_PORTFOLIO.md`; modify `AGENTS.md`; create `.changeset/test-portfolio-baseline.md`.

**Interfaces:** Produces the proof row `ID | risk | invariant | owner | current proof | replacement proof | state | measured cost` and lease row `lease | holder | base SHA | pending change | handoff SHA | focused command`. Proof states are exactly `keep`, `merge-candidate`, `delete-candidate`, `blocked-on-wayfinder`, and `deleted(D1-D7 evidence)`.

- [ ] Record the audited baseline above, every R0/R1 invariant, the candidate clusters, exact inventory commands, and C0-C4 leases. Do not copy historical implementation narrative into the ledger.
- [ ] Add `docs/TEST_PORTFOLIO.md` to AGENTS' Status owners and link both Wayfinders from its first section.
- [ ] Verify inventory totals without running suites:

```bash
find tests/unit -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l
find -L content-pack/tests/unit -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l
find tests/e2e -type f -name '*.spec.ts' | wc -l
find tests functions/src -type f \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.spec.ts' \) -print0 | xargs -0 wc -l | tail -n 1
find -L content-pack/tests/unit -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) -print0 | xargs -0 wc -l | tail -n 1
pnpm exec playwright test --list | tail -n 1
```

- [ ] Commit with Changeset text `Document the risk-owned test portfolio baseline.`

```bash
git add AGENTS.md docs/TEST_PORTFOLIO.md .changeset/test-portfolio-baseline.md
git commit -m "docs: establish test portfolio authority"
```

### Task 2: Collapse the Fast-Lane Meta Ledger

**Files:** Modify `tests/unit/fast-lane.meta.test.ts`; create `.changeset/test-lane-meta.md`.

**Interfaces:** Preserve `JSDOM_TS_TESTS` as the lane owner. Replace one Vitest case per scanned file with one diagnostic assertion returning `Array<{file:string; imports:string[]}>`; remove all hard-coded pack family row counts.

- [ ] Add a direct scanner assertion proving `import React from "react"` and `import "jsdom"` are reported, then aggregate every real offender into one failure message.
- [ ] Run the focused test; expected result is one file and three tests: scanner sensitivity, repository scan, manifest paths.

```bash
pnpm exec vitest run --project fast tests/unit/fast-lane.meta.test.ts
```

- [ ] Delete `TABLE_FAMILIES`, `countRows`, and the `83`-row historical assertion only after each pack table's own unique-ID assertion remains green.
- [ ] Commit with Changeset text `Reduce duplicate test-lane meta cases without weakening lane detection.`

```bash
git add tests/unit/fast-lane.meta.test.ts .changeset/test-lane-meta.md
git commit -m "test: collapse fast lane meta checks"
```

### Task 3: Make Functions and Flakes First-Class Gates

**Files:** Modify `package.json`, `Justfile`, `playwright.config.ts`, `.github/workflows/ci.yml`, `docs/CONTRIBUTING.md`; create `.changeset/functions-test-gate.md`.

**Interfaces:** Add `pnpm test:functions` = `npm --prefix functions test`; add `just test-functions`; `just ci` consumes it. Playwright exports `retries: 0` and `trace: "retain-on-failure"`.

- [ ] Run `npm --prefix functions test` before the config edit and record the current seven-file verdict in the ledger.
- [ ] Add an independent `functions` PR job using Node from `.tool-versions`, npm cache keyed by `functions/package-lock.json`, `npm ci`, `npm run lint`, `npm test`, and `npm run build`. Do not duplicate it in Verify.
- [ ] Set Playwright retries to zero; retain traces on the first failure rather than turning a later pass green.
- [ ] Verify the local and workflow commands:

```bash
pnpm test:functions
just --dry-run ci
pnpm exec playwright test --list | tail -n 1
pnpm exec prettier --check package.json playwright.config.ts .github/workflows/ci.yml docs/CONTRIBUTING.md
```

- [ ] Commit with Changeset text `Gate Cloud Functions and stop retry-hidden browser flakes.`

```bash
git add package.json Justfile playwright.config.ts .github/workflows/ci.yml docs/CONTRIBUTING.md .changeset/functions-test-gate.md
git commit -m "test: gate functions and browser flakes"
```

### Task 4: Add the Authenticated Save/Reload/Server-Echo Lane

**Dependency:** Automation P1's canonical character document and the already-available non-UI `SaveStatus` contract from `src/stores/saveStore.ts`, produced by `src/lib/firestore.ts#saveStatusCallbacks`. It does not depend on Tactical Codex UI Task 3 or a future `DocumentSyncStatus` component.

**Files:** Create `playwright.critical.config.ts`, `tests/critical/emulator-fixture.ts`, `tests/critical/authenticated-save-reload.spec.ts`; modify `scripts/dev-seed-sandbox.ts`, `package.json`; create `.changeset/authenticated-save-journey.md`.

**Interfaces:** Product code owns the locale-free `SaveStatus = "saved" | "pending" | "saving" | "error" | "offline"` vocabulary and Firestore callback transitions. The current `SaveIndicator` and the future Tactical `DocumentSyncStatus` are visual consumers that expose the same state as `role="status"` plus semantic `data-state`; tests never produce, mock, or redefine it. `readEmulatorDocument(path): Promise<{fields:unknown; updateTime:string}>`; `emulatorTest` exposes authenticated `page` with no `VITE_DEV_BYPASS_AUTH`. Config reads `D20_CRITICAL_GREP` into `grep` and `D20_REPEAT_EACH` into `repeatEach`; add `pnpm test:e2e:critical`.

- [ ] Write a failing journey: edit one ability through its accessible tile, observe `saving` then `saved`, read the emulator document, wait for the server snapshot, assert `updateTime` did not change again, reload, and assert the edited value.
- [ ] Configure port 5184, one Chromium worker, zero retry, demo Firebase variables, `VITE_USE_EMULATORS=true`, and no auth bypass. Seed a deterministic owner character from a real team fixture; `D20_REQUIRE_TEAM_FIXTURES=1` must fail rather than skip when composition is absent.
- [ ] Run once, then three consecutive times:

```bash
D20_CRITICAL_GREP="save reload server echo" pnpm test:e2e:critical
D20_CRITICAL_GREP="save reload server echo" D20_REPEAT_EACH=3 pnpm test:e2e:critical
```

- [ ] Commit `test: add authenticated save journey` with Changeset text `Prove authenticated character saves survive server echo and reload.`

### Task 5: Prove Firestore SDK Pending Writes, Reconnect, Rebase, and Failure

**Files:** Create `tests/critical/offline-rebase.spec.ts`; modify `tests/critical/emulator-fixture.ts`; create `.changeset/offline-rebase-journey.md`.

**Interfaces:** Add `patchEmulatorDocument(path, fields, updateMask): Promise<string>` returning the new emulator `updateTime`.

- [ ] Write failing journeys for: offline local edit → `offline`/pending-write state from Firestore metadata → reconnect → `saved` → reload; and offline edit plus a newer server revision → explicit conflict/rebase state without silent overwrite. Do not add a product-level command queue.
- [ ] Add one denied-write case that preserves entered input, exposes `error`, and succeeds after retry when authority is restored. Never assert translated display text; use roles, labels, and semantic state.
- [ ] Prove the lane has no conditional pass:

```bash
rg -n 'isVisible\(.*catch|\.catch\(\(\) => false\)|test\.skip' tests/critical
D20_CRITICAL_GREP="offline|rebase|denied" D20_REPEAT_EACH=3 pnpm test:e2e:critical
```

- [ ] Commit `test: cover offline save recovery` with Changeset text `Prove offline persistence, rebase, and recoverable save failure.`

### Task 6: Add the Shared-Command and Thin Access Matrix

**Dependency:** Automation Wayfinder's `executeSharedCommand`, versioned material states, receipts, and direct shared-write denial.

**Files:** Create `tests/critical/shared-command.spec.ts`; modify `tests/rules/firestore-rules.test.ts`, `.github/workflows/verify.yml`, `docs/CONTRIBUTING.md`; create `.changeset/shared-command-gate.md`.

**Interfaces:** The browser invokes the real callable with Auth; emulator assertions cover required/malformed App Check, owner/member/DM/admin/outsider/blocked, revision mismatch, repeated `commandId`, atomic changed documents, and one receipt.

- [ ] Require S1's owned `functions/src/gameplay/execute-shared-command.test.ts` lane before narrowing Rules. Add a browser black-box journey that fails against observe-only or direct-write behavior, then passes through the real callable.
- [ ] Prove offline shared work remains preview-only in memory: commit is disabled, reconnect reloads canonical revisions, and ActionFlow re-previews rather than persisting a command document.
- [ ] Reduce Rules to access/schema facts: permitted reads, denied direct shared-runtime writes, immutable roles/ownership, and public projection boundaries. Remove arithmetic and fan-out choreography only after D1-D7.
- [ ] Add parallel `rules` and `critical` Verify jobs. Rules uses `actions/setup-java@cf277c60eb25467037889841efdb72551f06f6c3` with Temurin 25 and `firebase-tools@15.28.1`; critical runs the composed pack and `D20_REPEAT_EACH=3 pnpm test:e2e:critical`.
- [ ] Verify locally:

```bash
pnpm test:rules
D20_CRITICAL_GREP="shared command" D20_REPEAT_EACH=3 pnpm test:e2e:critical
pnpm exec prettier --check .github/workflows/verify.yml docs/CONTRIBUTING.md
```

- [ ] Commit `test: gate shared command authority` with Changeset text `Gate authoritative shared commands and thin Firebase access rules.`

### Task 7A: Bootstrap and Freeze the Surface Census Before Candidate UI

**Dependency:** Test Tasks 1–3 are integrated. Run before Task 8A and before Tactical Codex UI Task 1, in a fresh short-lived worktree after the C4 handoff.

**Files:** Create `tests/e2e/surface-census/schema.ts`, `tests/e2e/surface-census/index.ts`, `tests/unit/surface-census.test.ts`; modify `tests/e2e/surface-manifest.ts`, `tests/e2e/surfaces.ts`, `docs/TEST_PORTFOLIO.md`; create `.changeset/surface-census-bootstrap.md`.

**Interfaces:** `surface-census/index.ts` becomes the only state/route owner and derives the legacy-compatible manifest while migration is in flight. Its pure-data schema names stable id, board, route, state, locale/theme/viewport applicability, authority, call site, curated-review flag, and optional motion frames without importing Playwright. Use exactly this frozen pairwise set per ordinary surface:

```ts
const PAIRWISE = [
  { locale: "it", theme: "dark", device: "desktop" },
  { locale: "en", theme: "light", device: "desktop" },
  { locale: "it", theme: "light", device: "mobile" },
  { locale: "en", theme: "dark", device: "mobile" },
] as const;
```

- [ ] Start with a failing pure contract test that rejects duplicate ids, missing routes/authority/call sites, unknown boards, empty variant applicability, and invalid B01 frame names.
- [ ] Move or adapt the current legacy manifest declarations behind the new index without deleting or weakening any current traversal. T7A registers no future UI fragment and owns no grader.
- [ ] Export the stable schema/index consumed by T8A and all slice-owned `surface-census/<family>.ts` fragments; prove neither `surface-manifest.ts` nor `surfaces.ts` can become a second route/state owner.
- [ ] Verify the pure contract, existing route guard, and unchanged default Playwright inventory:

```bash
pnpm exec vitest run --project fast tests/unit/surface-census.test.ts tests/unit/route-coverage.guard.test.ts
pnpm exec playwright test --list | tail -n 1
```

- [ ] Commit `test: freeze surface census contract` with Changeset text `Freeze one surface census contract before Tactical Codex visual work.`

### Task 7B: Merge Repeated Surface Traversals After Candidate UI

**Dependency:** Tactical Codex Tasks 1–14 have registered their slice-owned `tests/e2e/surface-census/<family>.ts` fragments; Tasks 7A and 8A are integrated. Run in a fresh short-lived worktree after a C2/C4 handoff.

**Files:** Create `tests/e2e/surface-graders.ts`, `tests/e2e/surface-audit.spec.ts`; modify `tests/e2e/surface-census/index.ts`, `tests/e2e/surface-manifest.ts`, `tests/e2e/surfaces.ts`, `tests/e2e/mobile-layout.spec.ts`, `docs/TEST_PORTFOLIO.md`; delete `tests/e2e/a11y.spec.ts`, `tests/e2e/i18n-sweep.spec.ts`, `tests/e2e/on-art-ink.spec.ts` after parity; create `.changeset/surface-audit.md`.

**Interfaces:** Keep T7A's schema/index as the only state/route owner, register the completed feature fragments, and derive the legacy-compatible manifest while migration is in flight. One navigation runs composable `gradeI18n`, `gradeA11y`, `gradeLayout`, and `gradeInk` over T7A's frozen pairwise set; T7B does not redefine that set.

- [ ] Add detector-sensitivity cases using `page.setContent`: raw i18n key, serious axe violation, horizontal overflow, and unreadable light-theme on-art ink must each fail its grader.
- [ ] Run old and new graders over representative A00, A04, A08, A11, and A16 states; compare every old failure class before deleting loops. Retain unique mobile interaction tests outside the manifest loop.
- [ ] Verify list size and focused behavior:

```bash
pnpm exec playwright test surface-audit --grep "login|character|campaign"
pnpm exec playwright test --list | tail -n 1
```

- [ ] Commit `test: merge surface audit traversals` with Changeset text `Merge duplicate accessibility, locale, layout, and ink traversals.`

### Task 8A: Establish the Curated Visual and Motion Lane

**Dependency:** Task 3 has handed off C0/C2 and Task 7A has handed off the frozen census schema/index. This foundation integrates before any Tactical Codex slice uses a visual command.

**Files:** Create `playwright.visual.config.ts`, `tests/visual/census.ts`, `tests/visual/curated.spec.ts`, `tests/visual/motion.spec.ts`, `scripts/qa/perf-probe.ts`; modify `package.json`, `.gitignore`, and `docs/TEST_PORTFOLIO.md`; create `.changeset/visual-review-lane.md`.

**Interfaces:** Both runners consume the Tactical Codex `surface-census/index.ts`; they do not create a second review manifest. `tests/visual/census.ts` deterministically aggregates named `SURFACE_CENSUS_FRAGMENT` exports with identity de-duplication and reruns `assertSurfaceCensus`. Each census entry names board, route, state, locale/theme/viewport applicability, authority, call site, curated-review flag, and optional motion frames. Motion captures `entry`, `mid`, `settled`, `interrupted`, `exit`, and `reduced`; browser emulation remains `prefers-reduced-motion: reduce`. Artifacts go to `artifacts/visual-review/`, never default test discovery.

- [ ] Add `pnpm visual:review`, `pnpm visual:motion`, and explicit `pnpm qa:perf`; none appears in default Playwright discovery. Commands use zero retry and fail if a registered state cannot be reached. Do not delete any former harness yet.
- [ ] Seed one detector-sensitivity specimen for curated and six-frame/reduced-motion capture, then verify the public commands:

```bash
pnpm exec playwright test --list | tail -n 1
pnpm visual:review -- --list
pnpm visual:motion -- --list
```

- [ ] Commit `test: separate visual review tooling` with Changeset text `Move curated screenshots and motion evidence into a dedicated review lane.`

### Task 8B: Consolidate Curated Evidence After Candidate UI

**Dependency:** Tactical Codex Tasks 1–14, Task 7B, and the A00–A16/B01 census are complete. Run in a separate worktree after C2/C4 handoff.

**Files:** Modify `tests/visual/{curated,motion}.spec.ts`; remove `tests/e2e/visual-full.spec.ts` and `_*-shots`/`_perf-probe` specs only after parity; update `docs/TEST_PORTFOLIO.md`; create `.changeset/visual-review-consolidation.md`.

- [ ] Prove A00 save states, A08 ActionFlow, and every slice-owned curated state through the single census; compare every old capture class before removal and apply D1-D7.
- [ ] Run `pnpm visual:review` and `pnpm visual:motion` across the approved matrix; default discovery must still exclude both lanes.
- [ ] Commit `test: consolidate visual evidence` with Changeset text `Consolidate curated UI and motion evidence after candidate parity.`

### Task 9: Remove Vacuous Journeys and Merge Layout-Symptom Specs

**Dependency:** The relevant Tactical Codex production routes have atomically cut over; candidate/specimen tests remain with their owning slice until then.

**Files:** Modify the conditional cohort found by the command below, anchored by `tests/e2e/{character-creation,spells,features,rest,equipment}.spec.ts`; create `tests/e2e/layout-stability.spec.ts`; merge the `*jump*`, `*reflow*`, `*bounce*`, and `*flicker*` cohort; create `.changeset/semantic-e2e-journeys.md`.

**Interfaces:** A supported journey must first assert its required CTA exists, perform it, and assert a semantic postcondition. Composition-specific absence uses declaration-time `test.skip(condition, reason)` only; it never branches inside the test body.

- [ ] Replace `isVisible().catch(() => false)` branches with required locators and outcomes. Delete a shallow test when its only assertion is already supplied by an R0/R1 journey.
- [ ] Merge scroll/focus stability into table rows keyed by action and expected anchor; remove the intentionally broken raw flicker mode. Keep distinct tests only where recovery differs.
- [ ] Verify source and behavior:

```bash
rg -n 'isVisible\(.*catch|\.catch\(\(\) => false\)' tests/e2e
pnpm exec playwright test character-creation spells features rest equipment layout-stability
```

- [ ] Report the 11-file/1,385-LOC cohort against the six-file/885-LOC health indicator; D1-D7 and distinct failure causes, not the count, decide the result. Commit `test: replace vacuous browser checks` with Changeset text `Replace conditional browser checks with semantic journeys.`

### Task 10: Retire UI Source-Regex Guards After Rendered Replacement

**Dependency:** Tactical Codex Task 15 atomic cutover, its reviewed deletion ledgers, approved screenshots, and Task 7B/8B graders.

**Files:** Delete only eligible UI implementation guards under `tests/unit/*guard.test.ts`; update `docs/TEST_PORTFOLIO.md`; create `.changeset/retire-ui-source-guards.md`.

**Interfaces:** Candidate families are `canonical-*`, `wizard-css`, `topbar-brand-never-hidden`, `touch-target-inset`, and obsolete Illuminated-Folio typography/ornament/on-art selectors. Durable licensing, i18n, architecture, route, schema, bundle, and no-RNG guards remain.

- [ ] For each candidate, fill D1-D7 with the component test, surface grader, screenshot specimen, or motion frame that catches the real failure. If no replacement catches it, keep the guard until one does.
- [ ] Temporarily mutate one shared token/component state per replacement cohort and observe the rendered/component test fail; restore it before deletion.
- [ ] Verify no guard still treats old CSS/class vocabulary as product authority:

```bash
rg -n 'readFileSync|className|folio|Cinzel|ornament|rounded-' tests/unit/*guard.test.ts
pnpm test
pnpm exec playwright test surface-audit
```

- [ ] Commit `test: retire UI source-shape guards` with Changeset text `Retire UI source-shape regressions after rendered coverage.`

### Task 11: Normalize the Pack Primitive Table

**Repository:** Private worktree `/Users/salvatoredicara/Workspace/d20-folio-content-test-primitives`; public verifier `/Users/salvatoredicara/Workspace/d20-folio-pack-primitives-verify`. It may run in parallel with Task 12.

**Files:** Create `content-pack/tests/unit/_harness/primitive-cases.ts` and focused primitive tables; delete `aggregated-primitives.table.test.ts` only after parity.

**Interfaces:** Use `SemanticCase<I,O> = { id:string; input:I; evaluate:(input:I)=>O; expected:O }`; the harness rejects duplicate IDs and runs one assertion per semantic row. Group modifiers, choices/actions, and state/resource primitives; do not preserve nested `describe` prose or closure-scoped duplicate setup.

- [ ] Capture current test titles and coverage, convert one semantic group at a time, and run old plus new files together until every assertion is mapped.
- [ ] Mutation-check one evaluator field per group, then remove the old rows and aggregate file.
- [ ] Create and validate both isolated worktrees before editing; never reuse the shared content checkout or its relative path:

```bash
D20_PACK_PRIMITIVES_WT=/Users/salvatoredicara/Workspace/d20-folio-content-test-primitives
D20_PACK_PRIMITIVES_APP_WT=/Users/salvatoredicara/Workspace/d20-folio-pack-primitives-verify
test ! -e "$D20_PACK_PRIMITIVES_WT" && test ! -e "$D20_PACK_PRIMITIVES_APP_WT"
git -C /Users/salvatoredicara/Workspace/d20-folio-content fetch origin main
git -C /Users/salvatoredicara/Workspace/d20-folio-content worktree add -b test/portfolio-primitives "$D20_PACK_PRIMITIVES_WT" origin/main
(cd /Users/salvatoredicara/Workspace/d20-folio && just wt-new pack-primitives-verify chore)
test "$(git -C "$D20_PACK_PRIMITIVES_WT" rev-parse --show-toplevel)" = "$D20_PACK_PRIMITIVES_WT"
test "$(git -C "$D20_PACK_PRIMITIVES_WT" rev-parse --git-dir)" != "$(git -C "$D20_PACK_PRIMITIVES_WT" rev-parse --git-common-dir)"
test "$(git -C "$D20_PACK_PRIMITIVES_APP_WT" rev-parse --show-toplevel)" = "$D20_PACK_PRIMITIVES_APP_WT"
ln -sfn "$D20_PACK_PRIMITIVES_WT/content-pack" "$D20_PACK_PRIMITIVES_APP_WT/content-pack"
test "$(cd "$D20_PACK_PRIMITIVES_APP_WT/content-pack" && pwd -P)" = "$D20_PACK_PRIMITIVES_WT/content-pack"
```

- [ ] Verify from the dedicated public verifier, then stage only private test files:

```bash
(cd "$D20_PACK_PRIMITIVES_APP_WT" && pnpm exec vitest run --project fast content-pack/tests/unit && just ci-srd-only)
git -C "$D20_PACK_PRIMITIVES_WT" add content-pack/tests/unit
git -C "$D20_PACK_PRIMITIVES_WT" commit -m "test: normalize primitive rule cases"
```

### Task 12: Normalize the Pack Grant Table

**Repository:** Independent private worktree `/Users/salvatoredicara/Workspace/d20-folio-content-test-grants`; public verifier `/Users/salvatoredicara/Workspace/d20-folio-pack-grants-verify`.

**Files:** Create `_harness/grant-cases.ts` plus focused class/feat, item, and conditional grant tables; delete `aggregated-grants.table.test.ts` after parity. Do not edit Task 11's primitive harness or tables.

**Interfaces:** Each row selects one observable aggregate/resolver result. Catalogue registration, bilingual data integrity, and engine behavior are separate assertions rather than repeated per-row scaffolding.

- [ ] Convert and mutation-check the class/feat, magic-item, and conditional/while-active groups independently; preserve all RAW semantic outcomes.
- [ ] Report the combined tables against the 9,000-LOC health indicator; require unique IDs without a cross-family row-count meta-test, and never delete signal to hit the indicator.
- [ ] Create and validate both isolated worktrees, then point only its public verifier at this pack:

```bash
D20_PACK_GRANTS_WT=/Users/salvatoredicara/Workspace/d20-folio-content-test-grants
D20_PACK_GRANTS_APP_WT=/Users/salvatoredicara/Workspace/d20-folio-pack-grants-verify
test ! -e "$D20_PACK_GRANTS_WT" && test ! -e "$D20_PACK_GRANTS_APP_WT"
git -C /Users/salvatoredicara/Workspace/d20-folio-content fetch origin main
git -C /Users/salvatoredicara/Workspace/d20-folio-content worktree add -b test/portfolio-grants "$D20_PACK_GRANTS_WT" origin/main
(cd /Users/salvatoredicara/Workspace/d20-folio && just wt-new pack-grants-verify chore)
test "$(git -C "$D20_PACK_GRANTS_WT" rev-parse --show-toplevel)" = "$D20_PACK_GRANTS_WT"
test "$(git -C "$D20_PACK_GRANTS_WT" rev-parse --git-dir)" != "$(git -C "$D20_PACK_GRANTS_WT" rev-parse --git-common-dir)"
test "$(git -C "$D20_PACK_GRANTS_APP_WT" rev-parse --show-toplevel)" = "$D20_PACK_GRANTS_APP_WT"
ln -sfn "$D20_PACK_GRANTS_WT/content-pack" "$D20_PACK_GRANTS_APP_WT/content-pack"
test "$(cd "$D20_PACK_GRANTS_APP_WT/content-pack" && pwd -P)" = "$D20_PACK_GRANTS_WT/content-pack"
(cd "$D20_PACK_GRANTS_APP_WT" && pnpm test && just ci && just ci-srd-only)
git -C "$D20_PACK_GRANTS_WT" add content-pack/tests/unit
git -C "$D20_PACK_GRANTS_WT" commit -m "test: normalize grant rule cases"
```

### Task 13: Retire Causal-Protocol Representation Tests

**Dependency:** Automation X1 cutover proves the golden corpus and `resolveCommand` parity are green and every old producer/consumer is gone.

**Files:** Create or modify `tests/unit/resolve-command.golden.test.ts`; delete eligible `action-journal`, `mechanics-authority*`, `mechanics-command-boundary`, `mechanics-program-receipt`, and `party-world-lease` tests; update `docs/TEST_PORTFOLIO.md`; create `.changeset/retire-causal-tests.md`.

**Interfaces:** Replacement assertions cover semantic command → external input/rejection/preview/commit, attributed patch/events/undo receipt, revision fence, and idempotent replay. They never assert journal node order, proof carrier shape, or lease storage.

- [ ] Map every legacy assertion through D1-D7. Rewrite durable outcomes first; delete only representation assertions and unreachable fixtures.
- [ ] Prove the golden corpus catches deliberate mutations to cost, target legality, revision, receipt replay, and undo.
- [ ] Verify no retired type or flag remains:

```bash
rg -n 'ActionJournal|MechanicsAuthority|WorldLease|ProgramReceipt|legacy.*proof' src tests functions
pnpm exec vitest run --project fast tests/unit/resolve-command.golden.test.ts
D20_REPEAT_EACH=3 pnpm test:e2e:critical
```

- [ ] Commit `test: retire causal representation coverage` with Changeset text `Remove causal-protocol representation tests after semantic cutover.`

### Task 14: Retire Legacy Material/Persistence Tests and Close the Reset

**Dependency:** Automation X1 cutover plus versioned `CharacterMaterialState`, `SharedMaterialState`, migrations, live-fixture parity, offline/rebase journeys, and shared callable are green.

**Files:** Create or modify `tests/unit/material-state-codec.test.ts` and `tests/unit/material-state-migration.test.ts`; delete eligible `material-state` and `play-state-persistence-cutover` representation tests; update `docs/TEST_PORTFOLIO.md`, `docs/CONTRIBUTING.md`, `.github/workflows/verify.yml`; create `.changeset/complete-test-portfolio-reset.md`.

**Interfaces:** Keep six-fixture round-trip, migration dry-run/idempotence, pending offline write compatibility, and one canonical material-state codec. Delete nested `playState`/`session.world` shape assertions after `rg` proves the fields unreachable.

- [ ] Run D1-D7 per fact family, remove the legacy tests, and record final files/LOC/registrations plus the latest 10-run PR/Verify p95 in the ledger.
- [ ] Reduce Verify shards only if the measured p95 remains at most 12 minutes; never trade fewer runners for flaky timeouts.
- [ ] Calculate p95 wall time from the latest ten successful main runs:

```bash
gh run list --workflow ci.yml --branch main --status success --limit 10 --json startedAt,updatedAt | jq 'map((.updatedAt|fromdateiso8601)-(.startedAt|fromdateiso8601)) | sort | .[((length*0.95|ceil)-1)]'
gh run list --workflow verify.yml --branch main --status success --limit 10 --json startedAt,updatedAt | jq 'map((.updatedAt|fromdateiso8601)-(.startedAt|fromdateiso8601)) | sort | .[((length*0.95|ceil)-1)]'
```

- [ ] Run the authoritative local gates and request review; do not deploy:

```bash
just ci
just ci-srd-only
pnpm test:rules
D20_REPEAT_EACH=3 pnpm test:e2e:critical
pnpm exec playwright test surface-audit
pnpm visual:review
pnpm visual:motion
git diff --check
```

- [ ] Require zero R0 skips/retries/flakes and D1-D7 evidence for every ledger deletion row. Report final LOC, registrations, wall time, and signal coverage against the baseline without turning any raw count into a deletion quota.
- [ ] Commit with Changeset text `Complete the risk-based test portfolio reset.`

```bash
git add docs/TEST_PORTFOLIO.md docs/CONTRIBUTING.md .github/workflows/verify.yml .changeset/complete-test-portfolio-reset.md tests/unit/material-state-codec.test.ts tests/unit/material-state-migration.test.ts
git add -u tests/unit/material-state.test.ts tests/unit/play-state-persistence-cutover.test.ts
git commit -m "test: complete portfolio reset"
```

## Execution Handoff

Execute the explicit DAG with `superpowers:subagent-driven-development`, using waves only to batch nodes whose stated dependencies are already satisfied—not as barriers or as a serial 1–14 queue. Give every node its own short-lived worktree and disjoint ownership; enforce C0-C4 leases and explicit SHA handoffs. The first handoff is T2/T3 → T7A/T8A → Tactical Codex UI Task 1. Tasks 11/12 use their named independent private-pack and public-verifier worktrees. After each node, run its focused command, review D1-D7 where deletion occurs, rebase, integrate, and retire the worktree before releasing its lease. Final integration follows the repository worktree/rebase/push procedure and still requires explicit owner approval; this plan never authorizes deployment.
