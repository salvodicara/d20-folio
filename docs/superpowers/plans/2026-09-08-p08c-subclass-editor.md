# P08c Subclass Editor Implementation Plan

Execute inline with Superpowers TDD and independent source/spec/UI/paper review.
Goal: guided subclass authoring with exact pinned parent, common progression and explicit multiclass.
Architecture: existing SubclassData/ClassData, root closure, Library controller/repository and reader.
Spec: ../specs/2026-09-08-p08c-subclass-editor-design.md. All global and future contracts apply.

- [x] Task1: tests/unit/homebrew-subclass-editor.test.tsx exercises HomebrewFields subclass setup,
      a named loaded LibraryVersion parent, includeOriginDependency/conformClassPair, preserving future
      metadata and stable level IDs. Assert no hit die/starting saves appear. Run focused test red.
      Implement SubclassFields.tsx and share ClassFields progression/casting without copying its model;
      enable HomebrewFields, preserve family-specific help/diagnostics. Add EN/IT labels. Run green.
- [x] Task2: static parent/subclass and multiclass presentation through shared reader. Test inherit,
      augment and replace once; exact parent version/wrong owner/changed copy; scheduled first and
      casting-only intermediate rows. Preserve unsupported originals rather than computing them.
      Reuse recorded subclass through LibraryEditor.onDuplicate, test stable versus current draft.
- [x] Task3: current optimized explicit demo UI plus real Google login, independent accounts;
      subclass ordinary/edge/composition, immutable versions, publish/reuse/duplicate/import/export,
      autosave/reload and actual persisted receipt audit. Run portable and failure/recovery paths.
      Retain failed/green attempts and source/build hashes. Complete individual eleven-family matrix.
- [x] Task4: actual EN/IT1440/1280/390 form/detail images, real relevant PDFs and all pages inspected.
      Independent source/spec/UI/paper review; fix reproduced findings with tests and recheck affected
      runtime. Reconcile docs/homebrew-classes.md, class-versions and DESIGN for extended seams.
- [x] Task5 verification: fresh origin/v2 fetch and source applicability, fresh just ci,
      SRD-only and applicable full rules/six fixture recovery. Independent source/UI/paper review
      and actual images completed. Conventional sole-owner hooked implementation commits include
      changesets; PROGRAM_STATUS and external evidence reconcile the results.

Delivery tail: after the documentation commit, fresh fetch/rebase and hooked explicit HEAD:v2,
verify the remote SHA and remove only owned clean worktrees/services. The external
integration-receipt.json records completion of these operations; this checklist does not assert
that a push or cleanup has occurred before that receipt exists. Release one complete successor
only afterward. No next-block execution or deployment.

Concrete editor assertion:

```ts
expect(conformClassPair(actual(), parentVersion)).toEqual([]);
expect(actual().payload.data.progression).toEqual(previousProgression);
expect(actual().payload.data.parentClass).toMatchObject({ mechanicId: parentMechanicId });
```

## Verified delivery record

Implementation and independent reviews are complete. The phone candidate identity finding was
reproduced with a failing equal-name regression and fixed before final screenshot/runtime gates.
PROGRAM_STATUS owns current frontier and gate facts. External P08c HANDOFF/REPLAY/FIDELITY and
source/build manifests retain precise applicability and failed attempts. The final integration SHA
and clean delivery tail are recorded in integration-receipt.json; no successor is released before
that receipt proves the push and cleanup. No next block or deployment is executed.
