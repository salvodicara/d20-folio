# P08c Subclass Editor Implementation Plan

Execute inline with Superpowers TDD and independent source/spec/UI/paper review.
Goal: guided subclass authoring with exact pinned parent, common progression and explicit multiclass.
Architecture: existing SubclassData/ClassData, root closure, Library controller/repository and reader.
Spec: ../specs/2026-09-08-p08c-subclass-editor-design.md. All global and future contracts apply.

- [ ] Task1: tests/unit/homebrew-subclass-editor.test.tsx exercises HomebrewFields subclass setup,
      a named loaded LibraryVersion parent, includeOriginDependency/conformClassPair, preserving future
      metadata and stable level IDs. Assert no hit die/starting saves appear. Run focused test red.
      Implement SubclassFields.tsx and share ClassFields progression/casting without copying its model;
      enable HomebrewFields, preserve family-specific help/diagnostics. Add EN/IT labels. Run green.
- [ ] Task2: static parent/subclass and multiclass presentation through shared reader. Test inherit,
      augment and replace once; exact parent version/wrong owner/changed copy; scheduled first and
      casting-only intermediate rows. Preserve unsupported originals rather than computing them.
      Reuse recorded subclass through LibraryEditor.onDuplicate, test stable versus current draft.
- [ ] Task3: current optimized explicit demo UI plus real Google login, independent accounts;
      subclass ordinary/edge/composition, immutable versions, publish/reuse/duplicate/import/export,
      autosave/reload and actual persisted receipt audit. Run portable and failure/recovery paths.
      Retain failed/green attempts and source/build hashes. Complete individual eleven-family matrix.
- [ ] Task4: actual EN/IT1440/1280/390 form/detail images, real relevant PDFs and all pages inspected.
      Independent source/spec/UI/paper review; fix reproduced findings with tests and recheck affected
      runtime. Reconcile docs/homebrew-classes.md, class-versions and DESIGN for extended seams.
- [ ] Task5: fresh origin/v2 fetch/rebase, fresh just ci, applicable SRD/rules/six fixture recovery.
      Conventional sole-owner hooked commits with changesets, explicit HEAD:v2, verified remote SHA;
      PROGRAM_STATUS closure, external HANDOFF/REPLAY/manifest and owned clean cleanup. Actual images
      and one complete successor after closure only, no next-block execution or deployment.

Concrete editor assertion:

```ts
expect(conformClassPair(actual(), parentVersion)).toEqual([]);
expect(actual().payload.data.progression).toEqual(previousProgression);
expect(actual().payload.data.parentClass).toMatchObject({ mechanicId: parentMechanicId });
```
