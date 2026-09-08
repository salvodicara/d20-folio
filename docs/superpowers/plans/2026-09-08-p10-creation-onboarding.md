# P10 Creation and Onboarding Implementation Plan

> **For agentic workers:** Use Superpowers executing-plans with TDD, independent review and
> verification. Independent delegated work uses its own isolated worktree and disjoint ownership.

**Goal:** Complete the guided first-character and recoverable import journeys in new V2.

**Architecture:** One normalized creation composer consumes explicit catalogue or Library snapshots.
Origins retain their existing authoritative aggregate; class acquisition and initial personal state
join them in one creation transaction and exact P03 receipt. P09 owns all navigation; one retained
draft controller owns editable/pending creation data.

**Tech Stack:** Existing React19, TypeScript, Firebase, Vitest, Playwright; pinned Node24.16.0 and
pnpm11.2.2 through `scripts/worktree/bootstrap-worktree.sh --run`. No new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-09-08-p10-creation-onboarding-design.md`.

## Global constraints

All spec sections apply to every task: approved Astra0.9.3 plus r2; new app/no legacy bridge;
D&D2024 and transferable BG3/Beyond behavior; complete official/custom choices; same future engine,
editable authoritative combat and causal undo acceptance; transversal clarity; standing delivery
delegation with actual images and independent review; V2 only/no deployment or real-data writes.
Keep EN/IT, scoped drafts, source/copy separation, private pack read-only and source licensing.
Only PROGRAM_STATUS owns frontier, gates, owner and integration facts. Each commit has a changeset,
Conventional Commit and sole owner author. Never bypass hooks.

## Exact authority contract after pre-code review

The spec's Concrete persistence and trust decisions section controls all tasks. Five-document
creation writes parent, origins/build, classes/build, loadout/initial and exact operation receipt.
Initial grouped loadout and individual homebrew copies share the same generalized P05 item model
and repository API, with disjoint IDs and one location per instance. No parent equipment/spell
arrays duplicate those copies. Answer-bound resolvedChoices preserve selected pool snapshots outside
immutable roots. Import stores reconciliation/import with classification, unresolved categories,
sourceHash, revision and exact receipt; repeat bytes retain the original destination/review and
classification correction requires explicit CAS. Catalogue semantic authenticity is verified in
client repository/read boundaries; rules protect shape/ownership/receipt and do not claim to run
the adapter. Raw SDK catalogue forgery is recovered as incompatible, never labeled official.

Included custom gear/spells use loadout.sources (one immutable root snapshot per identity) and an
explicit bundled-source item snapshot with source key/dependency path/definition, checked against
that frozen closure. No child LibraryVersion is fabricated and no floating current-origin pointer
is allowed. Regression: received root with private child after offer revocation, create/read/state
edit, then replace origin; item snapshot/state remain exact without foreign-child reads.

## Task 1 — Explicit content sources and extensible choice pools

Own `src/lib/homebrew/{origins,origin-build,classes,class-composition}.ts`, shared source helpers,
affected source consumers, P05 instances/repository and owning homebrew documents. Tests cover existing Library behavior and
new catalogue source discrimination. Keep LibraryVersion unchanged. Introduce:

```ts
interface CatalogueSnapshot {
  kind: "catalogue";
  schema: 1;
  catalogue: string;
  release: string;
  adapterVersion: number;
  entryId: string;
  definition: LibraryDefinition;
  sourceData?: JsonValue; // exact selected-source mechanics retained for later normalization
}
type DefinitionSnapshot = LibraryVersion | CatalogueSnapshot;
```

Nested dependencies need the same explicit distinction. Helpers provide identity, canonical source
and definition without invented owners/grants. Catalogue claims become verified only against the
actual pinned adapter output. Existing source changes still require exact owner-library versions.
Add typed catalogue-pool descriptors to the shared choice vocabulary; materialize selected closure
only, with stable path answers and no32-option truncation. Add modeled expertise/spell selections and
starting equipment declarations needed by creation, preserving unknown fields and diagnostics.

- [ ] Write failing snapshot roundtrip/source-identity tests: catalogue has no owner/opId; authentic
      Library versions remain byte-equivalent; forged metadata cannot change canonical identity.
- [ ] Run focused tests and preserve red log under external evidence.
- [ ] Implement source helpers and exact decoder/conformance branches; update common readers and
      normal origin candidate source-change logic, retaining old single-root operations.
- [ ] Test large catalogue pools with only selected closure, invalid pool kind, stale selected option,
      unknown policy preservation, unchanged custom parent closure and existing nine-family regressions.
- [ ] Reconcile homebrew source/model docs and commit with changeset after focused green tests.

## Task 2 — Catalogue adaptation and pure creation composition

Own `src/lib/character-creation/{catalogue,model,compose,import-review}.ts` and focused tests.
Catalogue reads composed `src/data` entries via existing @pack seam, never through the legacy runtime.
The composer accepts one draft and resolved snapshots, produces choices/facts/diagnostics and a
validated creation result; UI does no rule arithmetic.

```ts
type CreationMethod = "standard" | "points" | "manual";
// Draft contains stable ID, owner, name, step, base scores/method, selected source snapshots,
// path-keyed answers, scoped exceptions and retained inactive answers.
// Preview contains active choices, attributed facts, final scores, selected gear/magic,
// comparison and blocking diagnostics. Confirmation consumes exactly this validated draft.
```

Adapt all composed class/species/background/feat choices, including skill, expertise, tools,
languages, ability, spells/cantrips, feats, bundles and resistance. Typed declarations rather than
prose supply the semantics. Class feature acquisition uses first-class scopes and class levels.
Preserve mechanics not needed for creation for the future engine; do not pretend to execute combat.
Starting equipment expands package choices and quantities once. Magic distinguishes spellbook,
known/prepared, free-cast source and casting ability; required selections are not empty placeholders.

- [ ] Write red tests for fighter, wizard, Human feat cascade, background ASI and gear; all catalogue
      classes must have a complete level-one acquisition path in composed and SRD-only modes.
- [ ] Implement adapter and composer with pure, typed functions and provenance-aware results.
- [ ] Test standard permutation,27-point costs, manual bounds/exception attribution, source changes
      preserving inactive answers, duplicate expertise/proficiency and no background ASI double-count.
- [ ] Test custom class/origin with official dependent choices and exact pinned custom snapshots.
- [ ] Add import edition analysis independent of schema3; missing edition stays unknown,2014 shows
      reconciliation categories, custom/overrides and exact original retained.
- [ ] Reconcile Character Schema/Architecture/Mechanics owners; focused green and changeset commit.

## Task 3 — Atomic creation, recovery and rules

Own `src/lib/character-creation/{repository,draft}.ts`, exact creation rule predicates and tests.
Use existing generic OperationController with frozen envelope, exact receipt and session tickets.
Receipt identity and target ID are allocated once, verified locally, then preserved through retry.

```ts
// CreationRepository: intent(validatedDraft) -> frozen operation;
// commit(operation, check?) -> exact receipt; reconcile(operation) -> receipt | null.
// Frozen operation binds uid, scope, opId, characterId, base absence and complete output.
// Retained draft owns editable data + pending envelope; storage readback precedes commit.
```

- [ ] Red tests: all-or-none parent/origins/class/initial-state/receipt; second identical commit resolves
      once; existing conflicting ID fails without writes; forged Library source or target fails; client catalogue mismatch fails separately.
- [ ] Implement one bounded Firestore transaction, receipt-first reconciliation and exact source reads.
      All reads precede writes; no post-creation chain or cross-owner write. Private notes remain private.
- [ ] Add rules get/list/write matrix owner/member/DM/admin/anon/blocked, source/receipt mismatch,
      absent parent guard, normal origin updates unaffected and documented access-call budget.
- [ ] Red then green retention tests: offline, write/readback failure zero sends, unknown stable intent,
      restored envelope only reconciles, A→B→A invalidation, late ack cannot retire a newer draft.
- [ ] Test six fixture import/dry-run/apply-twice/recovery and preserved originals; no write-back.
- [ ] Reconcile rules/persistence owner docs and changeset commit after focused green.

## Task 4 — Wizard, import comparison and shell integration

Own `src/features/character-creation/*`, IdentityApp/Workspace wiring, navigation/registry and EN/IT
locale keys. Consume the pure preview, repository and single draft controller from Tasks2–3.
Use existing identity tokens/control primitives, shared source readers and approved mock composition.

- [ ] Write failing interaction tests for first-run Create, six named steps, retained Back/Forward,
      class-change review, invalid choices and explicit final confirmation.
- [ ] Add one P09 creation route with safe step references. Make Create and Import discoverable from
      Characters and search. Creation opens inspection only; does not change active actor or assignment.
- [ ] Implement read-then-choose source picker, visible child cascades, complete choices, live summary,
      ability methods, gear/magic and comparison. Guided controls use domain names, help and units.
- [ ] Implement import format/edition distinction and explicit review before existing idempotent copy
      apply; original download and unresolved categories visible. Fence late file/navigation callbacks.
- [ ] Test storage/error/offline/unknown screens and all return paths; no fake saved status or replay.
- [ ] Reconcile DESIGN and changeset commit after unit/type/lint checks.

## Task 5 — Real runtime, independent review and integration

External evidence directory owns all scripts/config/logs/images. Use fresh demo-only emulator cluster
with current rules and optimized candidate; Google app/provider login for independent accounts.
Preserve all failed runs and genuine backend receipts. Never reuse a populated P09 cluster as seed.

- [ ] Run ordinary official martial/caster and custom creation, nested choices, change parent/back,
      review/confirm and inspect authoritative documents/receipt. Exercise import comparison/recovery.
- [ ] Run offline/CAS/unknown after real commit/storage/auth/revocation/A→B→A and exact route returns.
- [ ] Capture dark EN/IT1440x900,1280x800,390x844 every changed surface, comparison/cascade/error.
      Independently open images and review source/spec/UI; fix and rerun affected paths.
- [ ] Run fresh full composed `just ci`, `just ci-srd-only`, full demo rules and six originals recovery.
      Store source/build/rules/fixture hashes and precise applicability; no count-only closure.
- [ ] Send curated actual images, reconcile PROGRAM_STATUS and external handoff/manifest.
- [ ] Fresh fetch/rebase origin/v2, revalidate changes, hooked explicit HEAD:v2, verify remote SHA.
      Stop only owned services and remove only clean owned worktrees after remote proof.
- [ ] Deliver exactly one complete successor prompt after all P10 exits; carry all spec global
      contracts and recursive same-block recovery rule. Do not execute P11a or deploy.

Catalogue snapshots may retain bounded optional `sourceData` for the exact selected typed source.
The adapter verifier binds it together with the normalized definition. This preserves combat
mechanics that P10 does not execute without injecting unknown fields into strict acquisition data.
It grants no facts by itself and is not a second engine, an automation result, or permission to
interpret prose. The future common engine must explicitly normalize and verify those mechanics.

### Independent import persistence slice of Task 3

`import-repository.ts` owns first import and explicit classification revision operations. Import
intent binds stable SHA256 destination, projected mechanical output and review to one P03 envelope;
original bytes/private notes stay outside the account receipt and only in private import/notes.
Live intent tickets retain the original until commit; restored envelopes can reconcile but cannot
regain send authority. The transaction writes parent/archive/notes/reconciliation/receipt together.
A separate review operation compares existing character authority and complete reconciliation base,
never edits original bytes or sheet mechanics. A different intent for an already-created hash must
open/review the existing copy, not overwrite its classification or invent a matching receipt.
