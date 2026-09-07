# P04 Library and Versions Implementation Plan

> Use superpowers:executing-plans with TDD and independent actual-candidate reviews.

Goal: a real eleven-family library with immutable versions, honest autosave and recipient-owned grants.
Architecture: one library authority; P03 envelopes/controller/receipts; Firestore CAS and rules.
Tech stack: Node24.16.0/pnpm11.2.2, React/TypeScript/Firebase, Vitest and Playwright.
Spec: ../specs/2026-09-07-p04-library-versions-design.md.
Execution receipts and completion status belong only to PROGRAM_STATUS; this is the implementation checklist.

## Global constraints

New V2, Astra technical ownership, mock Astra0.9.3 +7 September delta, transferable BG3
behavior under D&D2024, no legacy bridge. Only P04; editors P05–08 and quantities P24 stay
assigned. EN/IT dark1440×900/1280×800/390×844. No deploy, real data changes, cost or main push.
Explicit per-change integration and actual runtime screenshot gate. Production remains separate.

## 1. Model and real IO

Astra owns src/lib/library, shared operation extensions, firestore.rules/storage.rules and
library unit/rules tests. LibraryDefinition/LibraryEntry/LibraryVersion/LibraryInstance and
LibraryOffer/GrantReceipt carry common schema and exact provenance. createLibraryRepository
provides load/list/readVersion/saveIntent/publishIntent/offerIntent/acceptIntent/revokeIntent/commit/reconcile.

- Write behavioral tests: each family roundtrips, unknown schema retains raw, instance
  quantity survives explicit definition replacement, incompatible state is rejected.
- Run pinned focused tests; record expected red before model/codec implementation.
- Implement strict common codec, autosaved draft distinct from explicit stable publication, and immutable version/copy/instance seams; rerun green.
- Write real demo rules cases for save CAS, addressed accept, deterministic copy, revoke
  and receipt forgery. Run red, implement transactional repository and matching rules, green.
- Include denied peer/admin acceptance, get/list/wildcards/assets, racing accept/revoke,
  lost response and duplicate materialization. Keep receipts tied to exact transitions.
- Reconcile Architecture/Character schema and commit coherent changes with changeset.

## 2. Runtime library

Astra owns src/features/library, identity shell integration and EN/IT common locales, relevant
unit tests and external browser evidence. Consumes the repository above and P03 controller.

- Test that delayed load makes zero writes, dirty loaded metadata autosaves, unknown keeps
  original envelope, conflict preserves draft, and scope invalidation suppresses late ack.
- Implement family navigation/search/details, common metadata edits, immutable version
  history/comparison and explicit update, addressed offer/accept/revoke on real services.
- Retain account-separated draft/base/envelope; no implicit replay on reconnection.
- Run green focused tests and actual two-browser journeys using synthetic demo fixtures.
- Compare to mock; capture EN/IT desktop and phone states; reconcile Design and changeset.

## 3. Acceptance and closure

- Independent specification/correctness/privacy and actual visual review; resolve findings.
- Fresh just ci and full demo rules, six fixture-copy recovery, relevant i18n/format checks.
  Run ci-srd-only when the licensing composition seam changes.
- External HANDOFF records commands/outcomes/failures/skips, source/image hashes, service
  ownership, reviews and permissions; PROGRAM_STATUS holds execution facts only.
- Deliver actual runtime images and obtain only indispensable owner screenshot/integration
  verdict after autonomous work. Stay on P04 while any exit is missing.
- Authorized integration only: fresh fetch/rebase origin/v2, pertinent gates, hooked explicit
  HEAD:v2, remote SHA verification, remove only owned clean worktree/control and stop services.
- Deliver one complete recursive successor prompt only at actual closure; never execute P05.
