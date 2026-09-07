# P06 Monsters and Rules Implementation Plan

> **For agentic workers:** use Superpowers executing-plans with isolated, disjoint workers;
> parent performs local integration and independent review. Complete P06 only, no successor work.

**Goal:** Real monster/rule editors with typed conformance, actual campaign reuse and portable output.
**Architecture:** Extend P04 authoring/version authority and P03 operations. Separate immutable
source from prepared creature/rule state in protected campaign subcollections. No engine/queue.
**Tech Stack:** React19, TypeScript strict, Firebase demo SDK/rules, Vitest/Playwright, pinned pnpm.
**Spec:** ../specs/2026-09-07-p06-monsters-rules-design.md

## Global constraints

New V2, Astra 0.9.3+r2, transferable BG3 depth, D&D2024. Preserve PRODUCT custom automation and
editable combat contract in full: future same-engine costs/effects/reactions, authoritative
in-use edits and causal undo; authoring/preview is not combat acceptance. No legacy bridge,
P07/P13/P14/P16 implementation, deploy/production/cost/main push. English repo, EN/IT product.
Node24.16.0/pnpm11.2.2 through bootstrap --run, TMPDIR/artifacts under Workspace/Codex.
Pack b6073dd0 read-only. All commits owner-only, Conventional, changeset and owner-doc update.
Owner runtime/screenshot plus explicit P06 V2 integration required after all autonomous work.

## Task 1 — Advanced vocabulary and behavioral conformance

Owner: isolated model worker. Files: src/lib/homebrew/{model,conformance,advanced}.ts;
tests/unit/homebrew-advanced.test.ts; docs/homebrew-authoring.md; one changeset.
Keep BASE_FAMILIES/BaseFamily and P05 instance restrictions. Add AUTHORING_FAMILIES/AuthoringFamily,
authoringFields(family), advancedCollections(family), initializeDefinition(AuthoringFamily).
advancedCollections returns descriptors for named resource/program/policy/dependency arrays;
blankAdvancedRow(kind) creates explicit defaults, never overwrites unknown originals.
Typed action programs share ordered TypedEffect and stable references; conformance validates
known structure and path-specific unsupported without executing it. Export field schemas for UI.

- [ ] Red tests for default named monster/rule, attack+multiattack/resource/recharge, typed rule.
      `expect(conformDefinition(monster)).toEqual([])`; change one referenced program ID and expect
      invalid diagnostic at the precise step, keeping original JSON unchanged.
- [ ] Run `bootstrap-worktree.sh --run pnpm test --run tests/unit/homebrew-advanced.test.ts` and
      retain actual expected failures externally.
- [ ] Implement six-family dispatcher, finite nested row descriptors/defaults and cross-field checks.
- [ ] Add boundary tests: zero/fractional CR, negative formula, duplicate IDs, absent resource,
      cost/capacity/recharge, unknown nested option/version, multiattack cycle, policy dependency.
- [ ] Portable roundtrip test: `decodePortable(encodePortable(definition))` retains nested unknown
      fields and original text; keep current codec API names verified from portable.ts.
- [ ] Green focused P05+P06, typecheck; reconcile authoring owner, changeset, hooked commit.

## Task 2 — Campaign persistence and adversarial authorization

Owner: isolated persistence worker. Files: src/lib/homebrew/preparation.ts,
preparation-repository.ts; firestore.rules; tests/unit/homebrew-preparation.test.ts;
tests/rules/folio-preparation.rules.test.ts; docs/homebrew-preparation.md; changeset.
Interfaces: PreparedCopy {schema:1,id,campaignId,preparationId:string|null,revision,snapshot,
state,lastOperation}; discriminated monster state versus rule enabled state.
createPreparationRepository(db,session) exposes list/watch/issues, addIntent(campaign,version,
preparationId,state,id?), updateIntent(campaign,base,version), stateIntent(campaign,base,state),
removeIntent(campaign,base), commit/reconcile. Export defaultPreparedState(version).
Intent extends Envelope with kind, target/base/snapshot/state/preparationId. Parent UI consumes
this contract; confirm exact types to parent before coding. P05 source validator stays restricted.

- [ ] Red codec tests for family/state separation, exact base/source, unknown recovery isolation.
- [ ] Red real demo rules tests owner DM/admin vs member/anonymous/blocked, archive/revoke,
      stale campaign/base, forged source, detached receipt, sibling piggyback, duplicate/retry.
- [ ] Implement atomic target+receipt; direct source actor ownership, current auth/scope/campaign
      CAS and getAfter checks, existing receipt returned exactly, no automatic retry/replay.
- [ ] Test version update preserves state over new capacity, two copies isolated, rule toggles,
      response recovery after later update, ABA, malformed records and original recovery.
- [ ] Remove only addressed copy with receipt; never source version/grant. Rules receipt reading
      rechecks current campaign privacy. Separate full preparation family validation from P05.
- [ ] Focused unit/rules green; record commands/red/green; document and hooked commit.

## Task 3 — Editors, reader and real reuse surfaces

Owner: Astra. Files: src/features/library/HomebrewFields.tsx, HomebrewReader.tsx,
LibraryEditor.tsx, homebrew-labels.ts, LibraryWorkspace.tsx, new AdvancedFields.tsx;
new CampaignHomebrew.tsx/PreparationReuse.tsx; IdentityApp/IdentityWorkspace wiring;
library.css; src/i18n/{en,it}/common.json; focused UI tests.

- [ ] Red component tests initialize two families, edit nested program/resource/policy, keep unknown
      selects/rows, validate program references before record and retain local draft through reload.
- [ ] Extend recognized authoring family without extending P05 character state. AdvancedFields
      uses shared descriptors with stable row identities, ordered action steps/effects and controls.
- [ ] Shared reader renders all typed collections in editor/offers/copies/print; raw preserved
      unknown data stays discoverable and print-visible. Existing portable exact recovery reused.
- [ ] Bestiary derives stable library versions. Reuse branches monster/rule to explicit campaign
      target/preparation, displays source/conformance and persists via useLibraryOperation.
- [ ] CampaignHomebrew reads real copies, member sees rule status, DM sees prepared creatures,
      state draft with original base, conflict review, exact unknown reconciliation, update compare
      preserving state, addressed remove. Reuse opens exact destination; no play execution.
- [ ] Dependencies/conflicting replacements visibly reported from enabled typed rule snapshots;
      no order-based override. Disable/enable with explicit operation; state is not template.
- [ ] Duplicate uses existing draft controller with a new destination; no source mutation. Library
      removal needs a narrowly scoped explicit tombstone operation if current store lacks it: retain
      versions/grants/recovery, use existing P03 receipt and test both families; never hard-delete copies.
- [ ] Test EN/IT, original-base retention, ABA, offline no replay, lost response/reload, storage failure.
- [ ] Reconcile DESIGN, Architecture/Mechanics/schema links; focused green, changeset, commit.

## Task 4 — Actual runtime verification loop

External d20-folio-p06-evidence owns scripts/fixtures/logs/manifests/PDF/screenshots and HANDOFF.

- [ ] Explicit demo optimized build, owned Auth19099/Firestore18080/Storage19199, loopback preview5180
      and mock5189; preserve Java86001/8080. Real Google UI sign-in through provider, independent users.
- [ ] For BOTH families: create/edit/autosave/reload, version1, share pre-revoke block and post-accept
      preserve, explicit recipient acceptance, exactly one grant/version/receipt, real own reuse.
- [ ] Ordinary/boundary/composition programs and rules, modify state, source stable2, compare/update
      owner copy preserving state, recipient remains stable1; audit backend final facts/receipts.
- [ ] Concurrent drafts/two clients, stale-base review, offline/reconnect, same intent duplicate,
      actual committed response withheld then unknown after reload and exact receipt; ABA/revocation.
- [ ] Both families import/export typed and unknown, exact incompatible original after reload;
      print ordinary/long EN/IT and inspect every PDF page. Store hashes and failed attempts.
- [ ] Actual EN/IT1440×900/1280×800/390×844 screenshots against specific mocks; inspect all relevant
      states and fix/rebuild/replay affected flow. Review references retain old shell as superseded r2.

## Task 5 — Review, gates and owner delivery

- [ ] Independent source/spec and actual image/paper reviews. Correct defects with regression tests,
      rerun affected acceptance; no reenlistment of historical reviewers. Ponytail for risky complexity.
- [ ] `bootstrap-worktree.sh --run just ci`; full demo rules including six private copy fixtures and
      exact recovery; `just ci-srd-only` because catalog/adapters touched. Preserve exit/count/skip logs.
- [ ] Hash final source/build/image evidence, review manifests; record concrete emulator fidelity gaps
      (indexes/limits/provider/AppCheck/IAM/HTTPS/devices/installed PWA) without fake production equivalence.
- [ ] Update only PROGRAM_STATUS for frontier/owner/gates/integration SHA. Deliver curated actual chat
      images visible on phone and ask only indispensable owner screenshot/P06 integration verdict.
- [ ] After authorization fresh fetch/rebase and applicable gates, hooked explicit HEAD:v2, verify
      remote SHA; stop owned services and remove only clean owned worktrees after equivalence proof.
- [ ] Only complete exits allow full recursive successor prompt, all inherited contracts/sources/gates;
      no interim next prompt and no execution P07. Incomplete test/review/gate continues same P06 outcome.
