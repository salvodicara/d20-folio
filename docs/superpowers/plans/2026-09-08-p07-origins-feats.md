# P07 Origins and Feats Implementation Plan

> **For agentic workers:** use Superpowers subagent-driven-development with disjoint isolated
> worktrees; Astra owns composition and independent final review. Execute only P07.

**Goal:** Three complete typed origin editors with guided cascades and actual persistent build use.
**Architecture:** P04 library and P03 operations remain shared. A single character origin-build
aggregate owns selected immutable snapshots/choices/exceptions; pure composition derives facts.
**Tech Stack:** React19, TypeScript, Firebase demo, Vitest/Playwright, Node24.16.0/pnpm11.2.2.
**Spec:** ../specs/2026-09-08-p07-origins-feats-design.md

## Global constraints

All spec requirements apply to every task, especially new application/Astra0.9.3+r2/BG3/D&D2024,
future same-engine custom automation and editable combat/causalundo, understandable familiar
controls and preservation of depth. No P08/P10/P11/P14 execution, legacy bridge, production,
cost, deploy, PR/main or implicit V2 integration. English repo; bilingual EN/IT dark product.
Only PROGRAM_STATUS owns execution status. TMPDIR/cache/artifacts physically Workspace/Codex.
Pinned bootstrap --run for commands/hooks. Every commit owner-only with changeset and owner doc.

## Task 1 — Origin authoring and pure choice composition

Owner: isolated authoring worker. Files src/lib/homebrew/origins.ts, origin-build.ts,
model.ts, advanced.ts, conformance.ts; tests/unit/homebrew-origins.test.ts;
docs/homebrew-origins.md and changeset. Keep BaseFamily restricted to four.
Interfaces: originFields/collections feed existing authoring controls/readers;
OriginBuild/OriginSelection model described in spec; parseOriginBuild, composeOriginBuild,
validateOriginSelection expose safe shape, attributable facts and path/code diagnostics.
Exact exported contract is documented before parallel persistence/UI implementation starts.

- [ ] Write red behavioral tests: three named initialized families conform; named background
      ability distribution +2 strength/+1 wisdom derives exactly those increases; replacing
      parent choice retains answers but excludes inactive child contributions.
- [ ] Run focused test through bootstrap --run and retain expected failure in evidence.
- [ ] Implement shared nine-family dispatcher, typed prerequisite/benefit/choice declarations,
      finite source/version dependencies, ordinary/constrained cascade composition and diagnostics.
- [ ] Test duplicate/cyclic references, unknown predicate/option/kind/version, invalid counts,
      distinct background abilities, max20 normal path, repeatability and explicit exceptions.
- [ ] Test portable unknown roundtrip and immutable snapshots using actual codec, no RNG/engine.
- [ ] Run focused P05/P06/P07 regressions/typecheck; reconcile owner doc; hooked commit.

## Task 2 — Atomic persistent origin build

Owner: isolated persistence worker after model contract. Files origin-build-repository.ts,
firestore.rules; tests/unit/homebrew-origin-build.test.ts and
tests/rules/folio-origins.rules.test.ts; docs/homebrew-origin-build.md and changeset.
Consumes OriginBuild/OriginSelection; produces createOriginBuildRepository(db,session), read/watch/
watchIssues, saveIntent(character,base,selections), commit/reconcile. Envelope kind origin-build;
exact character ref/base/selections and original character authority, revision+1 and lastOperation.

- [ ] Red parser/intent tests and real demo ACL/CAS tests, existing P03 controller retained.
- [ ] Read exact receipt first; compare character and full aggregate; verify new immutable owned
      versions; atomically write only origins/build and matching receipt, one SDK attempt.
- [ ] Prove detached receipt/sibling/source spoof/admin-consent rejected, authorized reader needs
      no library access, blocked/revoked/archived scope fails appropriately, duplicate apply once.
- [ ] Prove stale concurrent saves retain base, lost response exact reconciliation, reload no
      replay, A→B→A invalidation; unknown originals exposed and archived before replacement.
- [ ] Green focused unit/full demo rules including six copies/recovery; doc and hooked commit.

## Task 3 — Guided editors, picker and build reader

Owner: Astra. Files src/features/library/OriginFields.tsx, OriginBuild.tsx, OriginReuse.tsx,
HomebrewFields.tsx, HomebrewReader.tsx, LibraryEditor.tsx, homebrew-labels.ts, library.css,
src/features/identity/IdentityApp.tsx/IdentitySheet.tsx; src/i18n/{en,it}/ui/homebrewV2.json;
focused tests/unit/homebrew-origin-ui.test.tsx; DESIGN/Architecture/schema owner references.

- [ ] Red actual component tests for named option controls, parent-child preservation, unmet
      requirement explanation/exception and explicit build confirmation; keep actual hook/controller.
- [ ] Guide species/feat/background fields with selects, counts, named library/prior-choice
      references; advanced identity metadata in disclosure. Reuse common programs/resources/effects.
- [ ] Picker loads owned stable versions, displays detail, retains draft/filter/cause context,
      reveals child choices, previews attributable consequences and records explicit exceptions.
- [ ] Build reader consumes persisted aggregate, compares chosen versions and reconciles obsolete
      answers without ghost contributions; remove/replace preserves unaffected selections.
- [ ] Local drafts keep original base; envelope save/readback before send; conflict review and
      exact unknown reconciliation; prevent stale callback clearing newer drafts/pending state.
- [ ] Shared portable/print reader includes all typed declarations and unknown originals.
- [ ] Focused green with EN/IT, offline, lifecycle/storage failures; doc/changeset/hooked commit.

## Task 4 — Current optimized runtime and paper

Owner Astra; independent read-only reviewers inspect actual source and artifacts.
External /Users/salvatoredicara/Workspace/Codex/d20-folio-p07-evidence owns scripts/logs/manifests.

- [ ] Configure explicit synthetic demo Auth19099/Firestore18080/Storage19199, preview5180;
      verify ownership first and preserve preexisting Firestore8080.
- [ ] Run just ci optimized build. Actual Google-emulator UI login in independent clients;
      three-family create/edit/version/offer/accept/revoke/reuse and backend receipt audits.
- [ ] Run ordinary/boundary/composition including background→feat→choice, exceptions and actual
      build persistence; concurrent/lost response/unknown reload/offline/ABA/version updates.
- [ ] Export/import each family typed/unknown/future/incompatible content, recover exact original.
      Save long and normal PDFs and inspect every page; retain failures and affected reruns.
- [ ] Capture EN/IT1440/1280/390 current runtime against family mocks; curate actual chat images.
- [ ] Independent spec/code/ACL/UI/paper review; resolve actual findings and rerun affected paths.
- [ ] Final just ci/full demo rules/ci-srd-only when seam affected; manifest precise candidate.
- [ ] Present only indispensable P07 owner visual/integration verdict after autonomous work.
- [ ] With explicit verdict, fresh fetch/rebase/gates/hooked HEAD:v2, remote proof, owned cleanup,
      full handoff and single complete recursive next prompt. Never execute next block.

## Mandatory preflight refinements

Tasks 1–3 consume the spec's final review-resolution section. Dependencies are frozen inside the
root LibraryVersion; P04 grant carries the entire bundle without new child grants or foreign reads.
OriginBuild.selections is a max32 map; every intent changes exactly one root and verifies one root
source. Task2 exposes saveIntent(character,base,targetId,selectionOrNull), with parseOriginBuild,
OriginSelection from task1. Task1 owns projectOriginCharacter and ordered candidate-excluded
eligibility, returning explicit unknown context rather than guessed class/legacy mechanics.
Task3 must route all current identity/origin facts through that projection and show superseded
imported baseline only as such. The final spec names field-level precedence/removal behavior.
The nine review regressions in the spec are required behavioral tests and Task4 runtime scenarios.
