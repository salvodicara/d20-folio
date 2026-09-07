# P03 shared operations implementation plan

> Execute inline using superpowers:executing-plans and TDD; independent reviewers read actual candidate and evidence.

Goal: stable intent, CAS, atomic receipts and honest offline recovery on the new V2.
Spec: ../specs/2026-09-07-p03-shared-offline-design.md.
Stack: pinned Node24.16.0/pnpm11.2.2, React/TypeScript/Firebase, Vitest/Playwright.

## Global constraints

Entirely new V2; Astra technical responsibility, approved mock 0.9.3+r2 binding, all transferable BG3 behavior and useful Beyond/Roll20 capabilities under D&D2024; no legacy bridge. Preserve separate production and recoverable migration. Dark EN/IT desktop1440x900/1280x800 and phone390x844 where pertinent. No deploy/cost/real migration/main push/P04. P09/P14/P15/P27 depth remains with those blocks. Owner visual and P03 integration gates are separate.

## 1. Operation boundary

Astra owns src/lib/shared/{model,controller,repository}.ts, identity repository integration, firestore.rules and tests/unit/shared-operations.test.ts + tests/rules/shared-operations.test.ts.

- [ ] Write red cases for same intent and competing original base using actual emulator clients; unit controller test advances timeout then resolves original promise, verifying unknown→ack without duplicate send.
- [ ] Implement immutable OperationEnvelope, OperationReceipt, prepare/commit/reconcile and OperationController. CAS compares original envelope with freshly read authority; transaction writes receipt and target together.
- [ ] Route note and assignment writes through the same contract. Verify direct forged receipts, stale revision, authority change and assignment ABA denied. Preserve owner release recovery and six-copy import.
- [ ] Run focused green tests and commit with changeset and owning architecture/schema facts.

## 2. Actual runtime state and recovery

Astra owns src/features/identity integration, note editor, EN/IT identity locales, scoped styles, tests/unit and browser tooling in external evidence.

- [ ] Write red behavior for double save, preserved draft on remote edit/conflict, unknown receipt, scoped reload recovery and late callback invalidation.
- [ ] Connect editor to OperationController; retain immutable draft/base per intent and per-account session storage. Present pending/unknown/ack/conflict/rejected/invalidated with one relevant recovery command.
- [ ] Integrate assignment intent capture before its confirmation; keep inspected/active/actor distinct. Test two clients and offline→online against real IO.
- [ ] Run focused green tests, capture mock/runtime states and commit coherent UI changes with changeset and Design facts.

## 3. Acceptance

- [ ] Independent final spec/correctness/security review of actual diff; resolve findings and scoped retest.
- [ ] Full just ci, rules on owned explicit demo cluster, six copies, formatting/i18n; pack seam unchanged means no redundant SRD gate.
- [ ] Real browser concurrency/fault/offline journeys and EN/IT viewport screenshots; independent visual review against approved mock.
- [ ] Update PROGRAM_STATUS and external HANDOFF with exact commands, failures/skips, source/image hashes, SHA, service ownership and gates.
- [ ] Show actual images and request only indispensable owner verdict after autonomous work; no successor prompt until P03 truly closed.
- [ ] Only after explicit integration authorization: fresh origin/v2 rebase, relevant revalidation, hooked HEAD:v2, verify SHA, remove only clean owned topic, deliver one complete recursive next prompt. Never start next block.
