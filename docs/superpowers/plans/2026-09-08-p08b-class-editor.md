# P08b Class Editor Implementation Plan

Execute inline with Superpowers TDD and independent reviews. Spec:
../specs/2026-09-08-p08b-class-editor-design.md. All global constraints and future contracts apply.

1. Shared composers: add an optional scoped acquisition to OriginFields, reading dependencies from
   the real root; default root behavior unchanged. AdvancedFields class mode generates identities,
   hides technical identity fields in disclosure and resolves resource/program references by name.
   Tests first exercise scoped mutation preserving root/siblings/unknown, named cascades and refs.
2. Class editor: create ClassFields.tsx with the progression authoring adapter; HomebrewFields enables class only.
   Pure progression edits preserve IDs/unknown and sort only on explicit request; add uses unique ID.
   Guided1/3/5, identity/acquisition/casting, programs/resources, conformance and preservation tests
   precede implementation. Use existing reader/autosave/repository, no new state store or engine.
3. Runtime: build explicit demo configuration, real Google provider login in independent contexts;
   author class1/3/5 with conditional choices, resources/programs/pinned dependency. Verify autosave,
   reload, immutable versions, duplicate/import/export/reuse and server receipts. Reproduce relevant
   conflict/unknown/storage/identity recovery; retain failures and rerun affected flows after fixes.
4. Visual: actual EN/IT dark1440/1280/390 form/detail captures; independent inspection against mock
   plus r2, fix defects, preserve source/dist hashes. Existing print remains common reader; if altered,
   inspect all actual pages. Reconcile docs/homebrew-classes.md and DESIGN for owned new behavior.
5. Delivery: independent correctness/spec review; focused regressions, fresh just ci and SRD-only;
   six fixture recovery and rules as applicable. Hooked sole-owner Conventional Commits each with
   changeset. Fresh origin/v2 fetch/rebase, explicit HEAD:v2 and remote proof. PROGRAM_STATUS closure,
   retained HANDOFF/REPLAY/hash manifest, actual screenshots, owned cleanup, complete successor only.

Example acceptance code (real production APIs):

```ts
const initial = initializeDefinition("class");
// Through HomebrewFields, add rows3 and5, edit row3 to4 then explicitly reorder.
// Assert output progression IDs and nested choice IDs unchanged, unknown keys byte-equivalent.
expect(conformDefinition(authored)).toEqual([]);
expect(decodePortable(encodePortable(authored)).original).toBe(encodePortable(authored));
```

Checklist: [x] shared composers [x] editor/adapter [x] optimized runtime [x] visual review
[x] source review [x] gates. Integration and cleanup are the external delivery tail recorded in
Workspace/Codex/d20-folio-p08b-evidence/integration-receipt.json before releasing the complete
successor. No P08c execution. PROGRAM_STATUS owns the frontier and current gate facts.
