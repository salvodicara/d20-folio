# Wayfinder Orchestration Reconciliation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` only when implementing the corrected DAG. This node changes documentation only and requires an independent cross-plan review before integration.

**Goal:** Reconcile the committed `7590b18` automation, Tactical Codex, and test-portfolio package so its census, sync-evidence, cutover, and scheduling dependencies are acyclic and explicit.

**Architecture:** Test T7 becomes T7A, which freezes the single census contract before T8A, and T7B, which consolidates UI Tasks 1–14 afterward. Test T4 consumes the existing locale-free `SaveStatus` product seam produced by Firestore callbacks, never a future Tactical component. Automation X1 becomes an explicit UI Task 15 dependency. Wave labels group eligible work but create no dependency edge.

**Tech Stack:** Markdown plans, Changesets, Git object/blob verification, Prettier, repository link and DAG audits.

---

## Constraints

- Base every edited owner document on commit `7590b186f0878ea95c70bf58a5d246efd44366e4`.
- Do not modify `src/**`, runtime tests, configuration, or any atlas PNG byte.
- Preserve Task 4 as a spell-only DEV/TEST specimen and Task 15 as the only public atomic cutover.
- Do not create a mock sync producer, enable `VITE_DEV_BYPASS_AUTH`, or assign product-state ownership to tests.
- Do not create a PR or deploy. Integrate only after a fresh-main rebase and green repository gates.

## Task 1: Reconcile the three owner plans

**Files:** Modify `docs/superpowers/plans/2026-08-25-test-portfolio-reset.md`, `docs/superpowers/plans/2026-08-25-tactical-codex-ui-ux-wayfinder.md`, `docs/superpowers/plans/2026-08-25-automation-first-wayfinder.md`, and the necessary sync cross-reference in `docs/plans/2026-08-24-automation-first-product-reset.md`.

- Split T7 ownership and dependencies into pre-UI T7A and post-UI T7B; make T8A depend on T3 plus T7A, and T8B on T7B plus UI Tasks 1–14.
- Freeze `SaveStatus` from `src/stores/saveStore.ts`, produced through `src/lib/firestore.ts#saveStatusCallbacks`, as T4's current non-UI semantic dependency; make future `DocumentSyncStatus` only a visual consumer.
- Add Automation X1 to UI Task 15's explicit dependency, producer matrix, and cutover gates.
- State in each Wayfinder that only explicit dependencies, DAG arrows, owner gates, and serial leases block a node; wave membership alone does not.

## Task 2: Record and independently review the correction

**Files:** Create `.changeset/wayfinder-orchestration-reconciliation.md`.

- Run Prettier over every changed text file.
- Verify every relative Markdown link resolves and every required DAG edge appears while the superseded T7/T4/X1 wording does not.
- Compare every atlas PNG blob with `7590b18` and prove no `src/**` or runtime-test path changed.
- Ask a fresh reviewer to audit all three plans as one graph; resolve every High/Medium finding.

## Task 3: Verify and integrate

- Run focused format/link/DAG/blob checks, Changeset status, and `just ci`.
- Fetch fresh `origin/main`, rebase the reviewed documentation package, rerun the gates, push explicit `HEAD:main`, and confirm the integrated SHA only if the worktree runbook and filesystem permissions permit it.
- Do not deploy. Hand off the acyclic order: Test T2/T3, then T7A/T8A, then Tactical Codex UI Task 1.
