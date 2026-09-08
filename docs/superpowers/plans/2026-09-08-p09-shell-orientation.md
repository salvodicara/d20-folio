# P09 Shell and Orientation Implementation Plan

> **For agentic workers:** Use Superpowers execution, TDD and independent review. Root owns the
> coupled navigation integration; independent reviewers own only external review evidence.

**Goal:** Deliver the approved four-domain shell with truthful discovery and scoped browser returns.
**Architecture:** One typed native-history navigation seam above current V2 identity/library consumers;
SessionController and P03 controllers retain their authority. No dormant legacy router integration.
**Tech Stack:** React19, TypeScript, native History/URLSearchParams, Radix, Lucide, Vitest, Firebase demo.
**Spec:** ../specs/2026-09-08-p09-shell-orientation-design.md

## Global constraints

Node24.16.0/pnpm11.2.2 via scripts/worktree/bootstrap-worktree.sh --run; Temurin25.
Approved Astra0.9.3 + r2; dark EN/IT1440x900,1280x800,390x844. Owner standing delegation permits
verified integration v2, never production/deploy/real-data/cost. Sole author Salvatore Di Cara,
changeset each commit, hooks never bypassed. P09 only. Full custom automation/editable causal
combat and clarity obligations from spec remain in every review/handoff; authoring is not play.

## Task 1 — Navigation contract and browser state

Files: identity/navigation.ts, identity/IdentityNavigation.tsx; tests/unit/identity-navigation.test.ts.
Interface: typed destination codec, native history navigation/back and scoped transient frames;
React context consumed by IdentityApp/Workspace/LibraryWorkspace. No domain data in history.

- [x] Write codec/history tests: legacy hash, allowlisted fields, malformed URL, no private query;
      direct detail parent fallback; navigate/back/forward retains valid frame and scope change clears it.
      Example assertion: `expect(parseRoute('#characters?filter=independent').page).toBe('characters')`.
- [x] Run pinned focused test, retain expected red result before implementation.
- [x] Implement codec with URLSearchParams and allowlists; one provider owns subscriptions to
      popstate/hashchange, saves outgoing scroll/focus and restores only same account/lifetime frames.
- [x] Run focused tests and existing identity workspace baseline; reconcile owning architecture docs.
- [x] Commit coherent navigation seam with changeset and owner authorship after verification.

## Task 2 — Shell, Account and context consumers

Files: IdentityApp.tsx, IdentityWorkspace.tsx, IdentityAccount.tsx, identity.css,
EN/IT identity locale JSON; tests/unit/identity-workspace.test.tsx and identity-app.test.tsx.

- [x] Add red tests for deep-link inspection without active selection, route-return filters,
      grouped search/current/unavailable/empty state, typed/dialog guards and unknown-route recovery.
- [x] Replace duplicated page/hash handling with navigation seam; resolve campaign/inspection
      through existing authorized repositories, preserve valid drafts and invalidate old callbacks.
- [x] Drive four icon+label primaries, grouped function search and go-to shortcuts from one registry.
      Keep r2 Account/sidebar/select and direct locale/dice existing repository behavior.
- [x] Run focused tests, typecheck and strict lint. Verify scope switches including A→B→A.

## Task 3 — Library and picker provenance

Files: LibraryWorkspace.tsx and only required navigation caller seams; library-workspace tests.

- [x] Add red tests: family/tab URL reload, query/selection restored on return, current class/subclass
      draft preserved through parent picker and shell navigation, scope invalidates stale selection.
- [x] Remove separate folio-library-view navigation store; route/frames own browsing state.
      Preserve LibraryDraftController and P03 envelope/base/unknown semantics unmodified unless a
      failing real boundary requires a focused root-cause repair with regression.
- [x] Verify real caller parent loader and reuse destinations, with no active actor switch.
- [x] Run focused composed tests and review diff for duplicated state or avoidable abstractions.

## Task 4 — Real optimized verification and closure

External owner: Workspace/Codex/d20-folio-p09-evidence. Repository owner: PROGRAM_STATUS only for status.

- [x] Independent spec/code review; resolve each material finding with red/green evidence.
- [x] Fresh optimized demo build; real app Google/provider sign-in for independent users; execute
      ordinary/boundary/composition routes from spec, with actual document/receipt audit.
- [x] Fault/recovery runs cover changed draft routes, offline/CAS/unknown/storage/auth/revocation;
      retain failed attempts and exact source applicability for unchanged prior proof.
- [x] Capture and actually review all changed dark EN/IT surfaces at three required sizes;
      send curated real images. Paper only if changed, all actual pages inspected.
- [x] Fresh just ci; conditional SRD/rules/six-fixture gates from spec. Preserve exact logs/hashes.
- [x] Reconcile spec/plan/design/architecture and PROGRAM_STATUS; final independent review.
      Final integration uses fresh fetch/rebase, hooked explicit HEAD:v2, remote SHA verification and
      owned services/clean-worktree cleanup. PROGRAM_STATUS and the external integration receipt own
      that execution record; release the complete successor only after the receipt confirms cleanup.
