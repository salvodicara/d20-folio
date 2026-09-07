# P02 new application implementation plan

> Use superpowers:subagent-driven-development for the independently testable data boundary,
> followed by the new runtime surfaces and actual final reviews.

Goal: implement P02 identity/privacy in the new application, following the approved Astra mock.
Spec: ../specs/2026-09-06-p02-new-application-design.md.
Architecture: one owner assignment authority, separate immutable inspection and private narrative,
Firebase transactions/ACL, session generation invalidation. No legacy runtime dependency.
Stack: pinned Node 24.16.0/pnpm 11.2.2, React/TypeScript/Firebase and current test tools.

## Global constraints

V2 is a completely new application. The approved Astra mock 0.9.3 is binding; prior code/tests/
screenshots are diagnostic only. BG3 transferable behavior and D&D 2024 remain mandatory.
No legacy combat bridge, production writes, real migrations, deployment or new costs.
Every repository edit is in an isolated codex/ worktree under Workspace/Codex. No main push.
Bilingual EN/IT, dark desktop 1440x900/1280x800, phone 390x844 where pertinent.
No peers write another owner's subtree. No fabricated reviews or approvals. P02 stays open.

## Current correction tasks — 7 September 2026

Historical checked tasks and gates below certify the previous commit only. The owner rejected
runtime chrome; do not carry their PASS to the current diff. Astra owns this resumed candidate.

- [x] Verify inherited dirty tree, fresh refs, source decisions and ownership without resetting it.
- [x] Reconcile this plan/spec with the authorized r2 direction before code edits.
- [x] Add behavioral red/green tests for persistent Account routing, search/help guards and dice preference.
- [x] Implement the one account preference/locale update seam, compatible with existing schema 1; rules checks.
- [x] Implement faithful r2 shell/Account, preserving real roster/invite/privacy behavior and explicit future boundaries.
- [x] Review the changed code and real runtime against the pertinent mock; resolve findings.
- [x] Run fresh just ci, rules, relevant fixture checks and browser EN/IT 1440/1280/390 journeys.
- [x] Commit with owner-only authorship/changeset, package fresh screenshots and full recursive handoff.
- [x] Obtain owner runtime visual verdict: approved 7 September for `c7eed6c4`. No integration, deploy or P03 is authorized here.

## Correction verification — 7 September 2026

Final `just ci` passes 858 app files/19,215 tests and 7 Functions files/129 tests, plus
check/lint/build/PWA. Unified demo-d20folio rules pass 168 tests in 6 files. Focused Account/
consumer/i18n checks 17 pass; migration 4 pass includes all six unchanged source copies.
No current skip. Pack/SRD seam unchanged: ci-srd-only not rerun, previous receipt historical.
Final browser shell 186 checks pass over EN/IT 1440/1280/390; real two-PC/revoke/offline flows pass.
Independent code review C1–C3 and subsequent scoped fixes are closed. Actual visual review
passes after nav geometry, phone avatar, focus wash and 44px target corrections. 84 runtime
and 18 mock PNGs plus manifests/review/handoff are in external r2 evidence. Owner screenshot
approval received 7 September for `c7eed6c4`; separate integration remains unauthorized. No deploy or P03. Historical task checks below apply
only to their original candidate; the current checklist above controls this correction.

## Task 1 — direction and boundary

- [x] Verify approved mock, freeze delta, fresh refs and isolated worktree.
- [x] Rectify owner documents and withdraw old visual request with original backups.
- [x] Audit previous candidate separately and write bounded new application spec.
- [x] Review documentation for remaining operative contradictions and complete source map.

## Task 2 — identity repository, ACL, session and migration

Files: src/lib/identity/\*_; tests/unit/identity-_; tests/rules/identity-\*;
firestore.rules, storage.rules; relevant schema/architecture owner sections.

- [x] Define typed account/membership/character/assignment and immutable inspection contracts.
- [x] Write and run failing behavioral checks for two sibling PCs, same-PC competing claims,
      owner release, reciprocal read and no cross-owner write before implementing transactions.
- [x] Implement repository and commit-time rules with version checks and unknown-path denial.
- [x] Write/run failing generation tests (A→B→A, late callbacks, unsent writes, revoke/offline),
      implement one session controller and authenticated asset lifecycle.
- [x] Write/run failing six-fixture migration/roundtrip/privacy partition checks; implement
      copy-only snapshot/dry-run/idempotent apply/recover with original bytes preserved.
- [x] Prove offer/receipt ACL boundaries without implementing full library materialization.
- [x] Run focused tests and supply exact APIs, red/green logs and bounded review package.

## Task 3 — mock-conforming P02 runtime

Files: src/features/identity/\*\*; new V2 application entry; EN/IT identity strings;
minimal scoped CSS, browser behavioral checks and evidence scripts.

- [x] Integrate repository with Firebase Auth/session controller; no legacy App/store startup.
- [x] Verify actual account→roster→invite→two assignments→DM inspection, with unit/rules
      behavioral red/green and browser regression red/green as detailed below.
- [x] Build account, roster, invite, campaign membership and immutable detail surfaces using
      the exact approved mock composition; implement only the P02 boundaries from the spec.
- [x] Verify changes of account/character/campaign, pending/cancel/error/offline/revoke,
      long Italian identities, authenticated assets, keyboard/focus and portrait fallback.
- [x] Capture real new runtime EN/IT desktop/phone and compare with identified mock images.

## Task 4 — acceptance and delivery

- [x] Actual independent specification/correctness review; address findings and reverify.
- [x] just ci; pnpm test:rules (demo-d20folio); just ci-srd-only; format/link/i18n.
- [ ] Actual visual fidelity review and curated comparison images delivered to owner.
- [x] Reconcile sole PROGRAM_STATUS, HANDOFF, commands/results/skips, SHA and gate receipts.
- [x] Deliver one full recursive successor prompt; any remaining gate continues P02.

## Historical verification record — 6 September candidate

Data review R1–R8 and UI U1–U6 addressed, with independent source/test rereviews.
First full CI attempts found structural test/build issues; all were corrected, without
baseline exemptions. Fresh composed `just ci`: 857 app files / 19,208 tests and 7 Functions
files / 129 tests pass; typecheck/lint/build/PWA pass. Full rules gate: 6 files / 167 pass.
Formatting and 84 local file links pass. SRD-only: 678 files / 13,628 pass, 2 intentional pack-composed skips; build/PWA pass.
Browser red/green: dialog Escape focus restoration. Real emulator flows exercise two PCs,
assignment release/reassign, separate selection/inspection, account switch, invite cancel,
DM notes and revocation through a second authenticated session, plus offline assignment denial.
The initial comprehensive browser script was exploratory; do not misrepresent every journey
as having had an intentionally failing pre-implementation browser test. Unit/rules red/green
logs cover the new contracts. Captures compare actual runtime to Astra 0.9.3; owner gate remains.
