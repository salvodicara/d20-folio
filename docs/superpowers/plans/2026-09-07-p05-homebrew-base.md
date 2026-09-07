# P05 Base Homebrew Implementation Plan

> **For agentic workers:** use Superpowers executing-plans for this bounded block; isolated
> workers with disjoint ownership may implement independent tasks. No next-block execution.

**Goal:** Four typed real editors with P04 lifecycle, persistent sheet copies and portable output.
**Architecture:** Pure homebrew vocabulary/conformance extends P04 payload. Existing P03 CAS
and operation controller coordinate character-owned instances, never a second runtime/queue.
**Tech Stack:** React19, strict TypeScript, Firebase demo SDK/rules, Vitest, Playwright, pnpm11.2.2.
**Spec:** ../specs/2026-09-07-p05-homebrew-base-design.md

## Global constraints

New V2 application, Astra approved mock0.9.3+r2, full transferable BG3 depth, D&D2024.
No legacy bridge, engine, P06/P07/P08/P10/P11/P24 expansion, production/deploy/cost.
Node24.16.0 through bootstrap --run; artifacts under Workspace/Codex. Pack read-only.
Owner alone authors commits, each with changeset and fact-owner reconciliation; hooks required.
No P04 approval reused for P05. All UI EN/IT, dark three-size image matrix.

## Task 1 — Typed authoring and conformance

Files: src/lib/homebrew/model.ts, conformance.ts, portable.ts; tests/unit/homebrew-authoring.test.ts.
Interfaces: BaseFamily, field specifications, initializeDefinition(family),
conformDefinition(definition) -> diagnostics; decode/encode portable document with exact original.

- [x] Write failing ordinary/boundary/composition cases per four families and unknown roundtrip.
- [x] Run bootstrap --run pnpm test --run tests/unit/homebrew-authoring.test.ts; retain red log.
- [x] Implement discriminated family types and finite effect primitives, strict dependency checks.
- [x] Verify no description parsing, no instance state in templates, source/version retention.
- [x] Green focused tests; reconcile MECHANICS and CHARACTER_SCHEMA, changeset, commit.

## Task 2 — Character instance persistence

Files: src/lib/homebrew/instances.ts, instance-repository.ts; firestore.rules;
tests/unit/homebrew-instances.test.ts; tests/rules/folio-homebrew.rules.test.ts.
Interfaces: HomebrewInstance with version snapshot and separate state; InstanceOperation extends
Envelope; createInstanceRepository(db,session) exposes list/watch, intent, commit, reconcile.

- [x] Failing tests: add immutable version, update retains state, stale character/instance denied.
- [x] Rules tests: owner only mutations, DM/member current shared read, revoke/blocked/admin denies,
      forged source/snapshot/receipt and piggyback denied; same opId delivers one mutation.
- [x] Implement atomic CAS/receipt, read recovery, scope ticket invalidation and exact version lookup.
- [x] Run focused unit/rules on owned demo cluster, preserve failures, green, document and commit.

## Task 3 — Family editors, readable preview and portable UI

Files: src/features/library/LibraryEditor.tsx, LibraryWorkspace.tsx, LibraryComparison.tsx;
new HomebrewFields/Reader/Portable components; library.css; common EN/IT; focused UI tests.

- [x] Add failing tests for four family fields and saving actual typed edits through draft controller.
- [x] Implement family fields matching specific mock images; meaningful inline dependencies.
- [x] Add import preview/confirmation, exact-original recovery and same-store draft initialization.
- [x] Add source/version-aware export and paper rendering using shared reader; localized comparison.
- [x] Test actual save/reload, unknown preservation, no premature publish and conflict draft retention.
- [x] Reconcile DESIGN, focused green, changeset and commit.

## Task 4 — Reuse in real sheet

Files: src/features/identity/IdentityApp.tsx, IdentityWorkspace.tsx, new HomebrewSheet/Reuse UI.

- [x] Add failing tests proving selected stable version materializes, selection alone does not write.
- [x] Wire owner character selection, version compare and explicit commit through OperationController.
- [x] Render persisted authorized instances in sheet; instance state edits and explicit update preserve state.
- [x] Test two PCs, DM read-only, scope A→B→A, unknown receipt recovery, offline no replay.
- [x] Green tests, schema/architecture documentation, changeset and commit.

## Task 5 — Actual optimized runtime acceptance

External: d20-folio-p05-evidence/{HANDOFF.md,REPLAY.md,FIDELITY.md, scripts, logs, images, manifests}.

- [x] Build current candidate with explicit demo config; independent fresh browser profiles use real login.
- [x] Per family UI create/edit/reload/publish/reuse/update/import/export/print; audit all typed fields.
- [x] Per family sender offer, recipient accept and revoke pre/post; inspect exact grants/opreceipts.
- [x] Exercise concurrent edits, retry/duplicate, dropped real ack, offline/reconnect and invalidation.
- [x] Reproduce failures, add regression, fix, rebuild and rerun affected scenarios; retain failures.
- [x] Inspect printed output and real EN/IT1440/1280/390 editor/reuse/recovery images against mock.
- [x] Independent code and visual review; correct findings, run just ci/full rules/six fixtures;
      ci-srd-only if seam touched. Record exact commands/counts/skips/hash and fidelity gaps.
- [x] Deliver curated actual images for owner verdict only after autonomous work complete.
- [x] Upon explicit integration approval fetch/rebase/gate/push HEAD:v2, verify SHA and safe cleanup.
- [x] Close P05 only with all exits; then deliver one complete recursive successor prompt; do not start it.

## Verification receipt

Implementation and independent code/visual review are complete through runtime 5e60ac40.
Full composed `just ci` exited 0: 871 app files / 19,326 tests; seven Functions files /
129 tests; typecheck, lint, optimized build and PWA. Full demo rules exited 0: nine files /
219 tests, no skips, including all six private fixture copies and exact-original recovery.
The public/private seam is unchanged; `ci-srd-only` was not rerun.

Evidence lives externally in `/Users/salvatoredicara/Workspace/Codex/d20-folio-p05-evidence`:
HANDOFF.md, REPLAY.md, FIDELITY.md, final-source-review.md, final-print-review.md, gate logs,
actual browser scripts, backend audits, source/image/build manifests and preserved failed outputs.
The final print review closed the last-page artwork defect. Final bounded optimized runtime
retested negative versatile validation, valid draft restoration and bilingual exact-file recovery.
Frontier, active services and remaining owner/integration gates belong only to PROGRAM_STATUS.

The final remote and owned-worktree removal receipts are external in integration-preflight/RECEIPT.md;
completion requires their verified outcome, not this checkbox alone.
