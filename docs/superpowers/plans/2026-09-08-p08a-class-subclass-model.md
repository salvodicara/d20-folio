# P08a Class and Subclass Model Implementation Plan

> Execute with Superpowers executing-plans, TDD and independent reviews. Only independent work
> may be delegated; every writer owns disjoint files in its own isolated worktree.

**Goal:** Typed class/subclass definitions with shared conformance, lossless codec and real versions.
**Architecture:** One shared authoring/closure model and existing P04/P03 persistence.
**Tech Stack:** TypeScript, Vitest, React19, Firebase SDK/demo emulators, Playwright, pnpm11.2.2.
**Spec:** ../specs/2026-09-08-p08a-class-subclass-model-design.md

## Global constraints

All spec mandates apply, including approved Astra0.9.3+r2, BG3 transferable behavior under D&D2024,
new-application/no-legacy-bridge, custom same-engine automation/editable-combat future runtime exits,
clarity/familiar controls, delegated reviewed-green V2 integration and complete recursive successor.
Only P08a. BaseFamily four; AuthoringFamily eleven. Closure32/depth8; JSON depth20/200000UTF16;
aggregate180000UTF8/4096nodes; operation600000UTF8. Pinned Node24.16.0/pnpm11.2.2/Temurin25.
All files/cache/evidence under Workspace/Codex; private pack read-only. No production/main/deploy.

## Task 1 — Model and conformance (Astra/model lane)

Files: create src/lib/homebrew/classes.ts, tests/unit/homebrew-classes.test.ts;
modify model.ts, advanced.ts, origins.ts, conformance.ts and docs/homebrew-classes.md.
Interfaces: initializeDefinition(class|subclass), conformDefinition, shared includeOriginDependency;
new typed ClassData/SubclassData and decodeClassDefinition, pinned pair validation.

- [x] Write failing tests with initializeDefinition('class'), named valid progression1/3/5 and a
      subclass pinned via includeOriginDependency; expect conformDefinition to equal[].
- [x] Run pinned pnpm test --run tests/unit/homebrew-classes.test.ts; retain expected missing-family failure.
- [x] Implement spec fields and typed discriminants, reuse declarations and closure validation.
- [x] Add/run malformed progression, wrong parent/version, choices/references/cycles, resources,
      spellcasting, unknown/future, max closure/levels/bytes and nine-family roundtrip regression cases.
- [x] Reconcile owning representation doc and changeset; hooked Conventional Commit, owner sole author.

## Task 2 — Version boundary and real persistence (Astra)

Files: src/lib/library/repository.ts only if required to enforce class publication conformance;
tests/unit/homebrew-class-library.test.ts and external runtime-sdk runner.
Interfaces: existing read/saveIntent/publishIntent/commit/readVersion/reconcile and portable codec.

- [x] Write failing repository case: invalid class remains draft but publishIntent rejects; an altered
      operation cannot bypass commit validation. Unsupported remains exact recoverable content.
- [x] Apply minimal class/subclass validation at both boundaries, preserve nine-family behavior.
- [x] Use real authenticated SDKs to create/publish/read both families, v2 update with v1 pinned,
      received version closure independent of source revocation, conflict/unknown receipt/recovery.
- [x] Audit server definitions/versions/receipts and six fixture exact recovery, retain actual exits.

## Task 3 — Minimal consultation and optimized UI (Astra)

Files: HomebrewReader.tsx, new ClassReader.tsx if needed, HomebrewFields.tsx to keep model-only families
out of unfinished generic editing, EN/IT homebrew labels; focused reader test.

- [x] Test actual reader names/level rows/parent version, shared choices and unknown recovery first.
- [x] Implement readable consultation from the typed model, no class/subclass editor or growth flow.
- [x] Build optimized demo configuration; use actual Google app/provider login, inspect existing
      Library/version/import/recovery flows for both families and verify server results.
- [x] Capture dark EN/IT1440×900/1280×800/390×844 relevant consultation; inspect all generated print pages.

## Task 4 — Review and integration

- [x] Independent spec/correctness and visual review; reproduce and fix findings with targeted regressions.
- [x] Run fresh composed just ci; SRD-only when seam changes; full rules if changed; six fixture recovery.
- [x] Hash source/runtime/images and keep failed attempts separate. Update external HANDOFF/REPLAY/manifest.
- [x] Fresh fetch/rebase origin/v2, required final gate, hooked explicit HEAD:v2; verify remote SHA.
- [x] Update PROGRAM_STATUS closure, retain evidence and send actual images; stop only owned services.
      Remove clean worker worktrees after remote proof and prepare the complete P08b successor.
      Final parent/control removal and successor delivery are the external post-push tail recorded in
      integration-preflight/RECEIPT.md; do not execute P08b.
