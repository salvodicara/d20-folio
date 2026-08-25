# Automation K1 Kernel Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to implement this plan task-by-task. Every behavior
> begins with an observed causal RED and every task receives independent specification review
> before the next task starts.

**Goal:** Freeze one strict, serializable, deterministic command contract and one pure
`resolveCommand` implementation that browser code and the standalone Functions build consume from
the same root source, without changing a live caller, persistence path, UI surface, or Firebase
authority.

**Architecture:** K1 adds a small target-named command kernel around a single resource-spend proof
vertical. Versioned codecs reject hostile or ambiguous wire values before resolution; the resolver
returns only semantic requests, rejections, previews, or committed patches/events/revisions and a
bounded inverse receipt. The current `src/lib/mechanics-command.ts` remains the sole unchanged
temporary caller adapter. A root build script uses Functions-local esbuild to bundle the canonical
root kernel into the existing CommonJS Functions entrypoint, so no source copy or deploy-time
`file:` dependency exists.

**Tech Stack:** strict TypeScript, Vitest fast project, synchronous canonical SHA-256 already owned
by `src/lib/canonical-fingerprint.ts`, esbuild installed only in the standalone `functions/`
package, pnpm at root, npm in `functions/`.

**Authorities:**

- `docs/PRODUCT_CONSTITUTION.md`
- `docs/GOLDEN_RULES.md`
- `docs/ARCHITECTURE.md`
- `docs/MECHANICS.md`
- `docs/plans/2026-08-24-automation-first-product-reset.md`
- `docs/superpowers/plans/2026-08-25-automation-first-wayfinder.md` §9
- `docs/superpowers/plans/2026-08-25-test-portfolio-reset.md` K1 proof row
- `docs/superpowers/status/2026-08-25-automation-capability-ledger.md`
- `docs/superpowers/status/2026-08-25-causal-branch-disposition.md`
- T0 `READY` report at
  `/Users/salvatoredicara/Workspace/Codex/wayfinder-program-controller/evidence/automation-t0-2026-08-25/t0-exit-audit.md`

## Frozen scope and preflight evidence

- Worktree: `/Users/salvatoredicara/Workspace/d20-folio-automation-k1`
- Branch: `feat/automation-k1`
- Initial `HEAD`, `origin/main`, and merge base:
  `9fa32980abfc08e32e06853bd29823b947496f49`
- Mode: COMPOSED, with the existing `content-pack` link; no content seam is edited.
- Toolchain observed: Node `24.16.0`, pnpm `11.2.2`, npm `11.13.0`, Temurin
  `25.0.3+9`; `core.hooksPath=.githooks`; pre-commit and pre-push are executable.
- `just setup` ran from this worktree using the integrated recipe. It installed 476 standalone
  Functions packages; `functions/node_modules` exists and `npm --prefix functions ls --depth=0`
  is complete. Root and Functions manifest/lockfile hashes were unchanged by provisioning.
- Pre-edit K1 command exited `1` only because both normative target tests were absent. This is a
  baseline observation, not a causal RED.
- Pre-edit `just ci` exited `0`: typecheck and lint passed; 798 Vitest files / 18,454 tests passed;
  Functions 7 files / 129 tests passed; the PWA build completed.

## File ownership and worker partition

All workers share this worktree, are not alone in the codebase, and must not revert, stage,
reformat, or otherwise absorb another worker's changes. Tasks execute serially.

| Task                      | Exclusive implementation ownership                                                                                                                                                                                                                                                        | Must not edit                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1 — complete root kernel  | `src/types/{command,rule-definition,effect-instance}.ts`; all new `src/lib/command/**`; `tests/unit/resolve-command.contract.test.ts`; `.changeset/automation-k1-kernel.md`                                                                                                               | Functions files, golden test, existing mechanics/callers/docs                                         |
| 2 — shared build + golden | `scripts/build-functions.ts`; `functions/{package.json,package-lock.json}`; minimal `functions/src/index.ts`; inspect but do not expect to change `functions/tsconfig.json`; `tests/unit/resolve-command.golden.test.ts`; `docs/MECHANICS.md`; `.changeset/automation-k1-shared-build.md` | root manifests/lock, other Functions sources, Task 1 production/test, portfolio/status/Wayfinder docs |

The controller owns only this reviewed plan and `.changeset/automation-k1-plan.md`. Reviewers are
read-only and never share implementation ownership.

## Exact public contract to freeze

### Primitive codecs and numeric domains

All stable IDs are strings accepted by exactly one namespace codec and shaped
`<namespace>:v1:<token>`, where token matches `[a-z0-9][a-z0-9._-]{0,95}`. Namespaces used now are
`cmd`, `state`, `entity`, `resource`, `rule`, `source`, `effect`, and `ruling`. Derived IDs are
`req:v1:<64-lowercase-hex>`, `patch:v1:<64-lowercase-hex>`,
`event:v1:<64-lowercase-hex>`, and `receipt:v1:<64-lowercase-hex>`. A fingerprint is only
`fp:v1:<64-lowercase-hex>`. Thus the frozen G0 aliases become, for example,
`cmd:v1:k-spend-001`, `rule:v1:focus`, `state:v1:pc-a`, `entity:v1:pc-a`, and
`resource:v1:focus`; fingerprints and derived IDs alone carry digests.

`SerializableValue` permits null, booleans, finite numbers other than negative zero, strings,
dense arrays, and ordinary string-keyed data-property objects. Revisions, resource quantities,
amounts, cardinalities, and geometry use integers only. Revisions are `0..MAX_SAFE_INTEGER-1` so a
successful transition can add one; resource values are `0..MAX_SAFE_INTEGER` with
`current <= maximum`; a spend amount is `1..MAX_SAFE_INTEGER`; target counts are `1..32`; geometry
distance is `0..1_000_000` feet. No resolver arithmetic may overflow a safe integer.

The hostile prewalk bounds the whole value to 64 KiB of canonical JSON, depth 32, 4,096 visited
values, 256 array entries, strings 1,024 characters, and IDs 128 characters. It rejects cycles,
sparse arrays, accessors, unsafe keys, symbols, exotic prototypes, unknown fields, negative zero,
non-finite/unsafe numbers, and duplicates. Set-like input arrays are copied and sorted by stable ID;
duplicates reject. Sequence-semantic arrays (patches, events, revisions and receipt history) retain
their validated order. Objects are canonicalized by the existing pure `canonicalJson` owner.

### Exact command, world, rule, and effect shapes

The TypeScript interfaces are field-for-field equivalent to the following; there are no optional
wire fields and exact-key decoding rejects additions:

```ts
type RevisionRef = { stateId: StateId; revision: number };
type ResourceState = { resourceId: ResourceId; current: number; maximum: number };

type WorldState = {
  schemaVersion: 1;
  stateId: StateId;
  revision: number;
  resources: readonly ResourceState[]; // unique, normalized by resourceId
  effects: readonly EffectInstance[]; // unique, normalized by effectId
};

type UseRuleCommand = {
  schemaVersion: 1;
  kind: "use-rule";
  commandId: CommandId;
  payloadFingerprint: Fingerprint;
  actorId: EntityId;
  subjectId: EntityId;
  ruleId: RuleId;
  ruleVersion: number; // positive safe integer
  expectedRevision: RevisionRef;
  choices: Readonly<Record<string, SerializableValue>>;
};

type UndoReceiptCommand = {
  schemaVersion: 1;
  kind: "undo-receipt";
  commandId: CommandId;
  payloadFingerprint: Fingerprint;
  actorId: EntityId;
  subjectId: EntityId;
  expectedRevision: RevisionRef;
  receipt: CommandReceipt;
};

type SemanticCommand = UseRuleCommand | UndoReceiptCommand;

type ResolveCommandInput = {
  schemaVersion: 1;
  mode: "preview" | "commit";
  ruleDefinition: RuleDefinition | null; // required for use-rule, null for undo
  world: WorldState;
  command: SemanticCommand;
  externalAnswers: ExternalAnswers;
  priorReceipt: CommandReceipt | null; // trusted lookup by commandId for commit retry only
};
```

`RuleDefinition` is one closed K1 member behind a typed extension map, not a generic operation
language:

```ts
type RuleProvenance = {
  kind: "srd" | "content-pack" | "homebrew";
  sourceId: SourceId;
  sourceVersion: number; // positive safe integer
};
type ActorTarget = { kind: "actor" };
type SelectedTarget = {
  kind: "selected-targets";
  min: number;
  max: number;
  candidateIds: readonly EntityId[]; // unique/sorted, 1..32, min <= max <= length
};
type ResourceSpendRuleDefinition = {
  schemaVersion: 1;
  kind: "resource-spend";
  ruleId: RuleId;
  ruleVersion: number;
  fingerprint: Fingerprint;
  provenance: RuleProvenance;
  resourceId: ResourceId;
  amount: number;
  target: ActorTarget | SelectedTarget;
};
interface RuleDefinitionKindMap {
  "resource-spend": ResourceSpendRuleDefinition;
}
type RuleDefinition = RuleDefinitionKindMap[keyof RuleDefinitionKindMap];
```

Future slices may augment the type map only while holding the serial `src/lib/command/**` lease and
must extend the strict decoder and the same resolver. No handler registry, DSL, compiler,
executable payload, or reducer abstraction is introduced. H1 alone owns Homebrew authoring,
compilation, lifecycle, persistence, sandboxing, provenance policy, and pins. The kernel import
allowlist explicitly permits the already-audited pure `src/lib/grants.ts` seam; a type/graph proof
asserts `Grant` remains normalized rule IR and is never assignable to or embedded as
`SemanticCommand`, `CommandPatch`, or `EffectInstance`.

`EffectInstance` is exactly:

```ts
type EffectDuration =
  | { kind: "until-revision"; stateId: StateId; revision: number }
  | { kind: "until-rest"; rest: "short" | "long" }
  | { kind: "until-dismissed" };
type EffectInstance = {
  schemaVersion: 1;
  effectId: EffectId;
  ruleId: RuleId;
  ruleVersion: number;
  ruleFingerprint: Fingerprint;
  sourceId: EntityId;
  targetId: EntityId;
  appliedByCommandId: CommandId;
  startedAt: RevisionRef;
  duration: EffectDuration;
};
```

Every value in `WorldState.effects` is therefore committed activity. There is no `active` /
availability flag, translated text, arbitrary payload, or persistence lifecycle. An
`until-revision` endpoint must refer to the same state and be strictly after `startedAt.revision`.

### Exact external observation seam

Requests and answers share one of these four kinds and exact fields:

```ts
type SelectedTargetsRequest = {
  kind: "selected-targets";
  requestId: RequestId;
  min: number;
  max: number;
  candidateIds: readonly EntityId[];
};
type TableGeometryRequest = {
  kind: "table-geometry";
  requestId: RequestId;
  pairs: readonly { fromId: EntityId; toId: EntityId }[];
};
type ObservedOutcomeRequest = {
  kind: "observed-outcome";
  requestId: RequestId;
  valueType: "integer" | "boolean" | "stable-id";
  minimum: number | null;
  maximum: number | null;
  allowedIds: readonly SourceId[];
};
type RulingRequest = {
  kind: "ruling";
  requestId: RequestId;
  rulingIds: readonly RulingId[];
};
type ExternalInputRequest =
  | SelectedTargetsRequest
  | TableGeometryRequest
  | ObservedOutcomeRequest
  | RulingRequest;

type SelectedTargetsAnswer = {
  kind: "selected-targets";
  requestId: RequestId;
  targetIds: readonly EntityId[];
};
type TableGeometryAnswer = {
  kind: "table-geometry";
  requestId: RequestId;
  distances: readonly { fromId: EntityId; toId: EntityId; feet: number }[];
};
type ObservedOutcomeAnswer = {
  kind: "observed-outcome";
  requestId: RequestId;
  value: number | boolean | SourceId;
};
type RulingAnswer = {
  kind: "ruling";
  requestId: RequestId;
  rulingId: RulingId;
  accepted: boolean;
};
type ExternalAnswer =
  | SelectedTargetsAnswer
  | TableGeometryAnswer
  | ObservedOutcomeAnswer
  | RulingAnswer;
type ExternalAnswers = { schemaVersion: 1; values: readonly ExternalAnswer[] };
```

Pair/distance lists are unique and normalized by `fromId`, then `toId`; answer request IDs are
unique and normalized. Integer observed outcomes are bounded by their request; boolean requests
require null bounds and no IDs; stable-ID requests require a non-empty unique allowed-ID list and
null bounds. K1 produces only selected-target requests, but all four wire variants are frozen for
C1/O1/F slices. They contain no generated die, knowable choice, cost, DC, or consequence.

### Exact patches, events, receipts, outcomes, and rejection vocabulary

```ts
type SetResourcePatch = {
  schemaVersion: 1;
  kind: "set-resource";
  patchId: PatchId;
  stateId: StateId;
  resourceId: ResourceId;
  before: number;
  after: number;
};
type CommandPatch = SetResourcePatch;
type ResourceChangedEvent = {
  schemaVersion: 1;
  kind: "resource-spent" | "resource-restored";
  eventId: EventId;
  actorId: EntityId;
  subjectId: EntityId;
  ruleId: RuleId;
  resourceId: ResourceId;
  amount: number;
};
type CommandEvent = ResourceChangedEvent;
type RevisionChange = { stateId: StateId; before: number; after: number };
type CommandReceipt = {
  schemaVersion: 1;
  receiptId: ReceiptId;
  commandId: CommandId;
  payloadFingerprint: Fingerprint;
  resultFingerprint: Fingerprint;
  patches: readonly CommandPatch[];
  events: readonly CommandEvent[];
  revisions: readonly RevisionChange[];
  inversePatches: readonly CommandPatch[];
};
type NeedExternalInput = {
  status: "need-external-input";
  commandId: CommandId;
  request: ExternalInputRequest;
};
type Rejected = { status: "rejected"; reason: RejectionReason };
type ResolvedFacts = {
  commandId: CommandId;
  payloadFingerprint: Fingerprint;
  resultFingerprint: Fingerprint;
  patches: readonly CommandPatch[];
  events: readonly CommandEvent[];
  revisions: readonly RevisionChange[];
};
type Preview = ResolvedFacts & { status: "preview" };
type CommitResult = ResolvedFacts & {
  status: "committed";
  receipt: CommandReceipt;
};
type ResolutionOutcome = NeedExternalInput | Rejected | Preview | CommitResult;
```

`RejectionReason` is the closed union:

```text
invalid-input | command-too-large | command-too-deep | command-too-complex |
unknown-field | invalid-number | invalid-id | duplicate-id | unknown-command-kind |
unknown-rule-kind | command-payload-mismatch | command-id-payload-mismatch |
rule-fingerprint-mismatch | rule-reference-mismatch | state-mismatch |
revision-mismatch | answer-request-mismatch | invalid-external-answers |
illegal-target | resource-unavailable | insufficient-resource | invalid-receipt |
invalid-patch | no-change
```

No rejected result carries a patch, event, receipt, partial conformed value, translated explanation,
or attacker-controlled echo. The historical G0 `NoChange` carrier is explicitly reconciled with
the newer authoritative four-outcome union: K1 emits `Rejected("no-change")` if a validated future
handler calculates zero changes; an unknown/no-op rule kind is `unknown-rule-kind`. It does not add
a fifth `NoChange` outcome or a no-op handler.

### Non-circular canonical identity projections

`src/lib/command/identity.ts` wraps the existing `canonicalJson` / `canonicalFingerprint`; it does
not implement another JSON formatter or SHA-256. Each digest hashes the canonical object below,
including the literal `codec` discriminator. “Without X” means the field is absent, not null:

| Value                       | Exact canonical hash projection                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule fingerprint            | `{codec:"rule-definition:v1", definition:<RuleDefinition without fingerprint>}`                                                                     |
| Command payload fingerprint | `{codec:"semantic-command:v1", command:<SemanticCommand without commandId and payloadFingerprint; undo command replaces receipt with receiptId>}`   |
| Request ID                  | `{codec:"external-request:v1", commandId, payloadFingerprint, ruleId, ruleVersion, stateId, expectedRevision, request:<request without requestId>}` |
| Patch ID                    | `{codec:"command-patch:v1", commandId, index, patch:<patch without patchId>}`                                                                       |
| Event ID                    | `{codec:"command-event:v1", commandId, index, event:<event without eventId>}`                                                                       |
| Result fingerprint          | `{codec:"resolution-result:v1", commandId, payloadFingerprint, patches, events, revisions}`; preview and commit deliberately share this value       |
| Receipt ID                  | `{codec:"command-receipt:v1", commandId, payloadFingerprint, resultFingerprint, patches, events, revisions, inversePatches}`                        |

Stable command IDs are caller/executor-issued versioned tokens, not payload hashes. The payload
claim prevents malformed input; idempotency collision is proved through
`ResolveCommandInput.priorReceipt`: on commit, a matching command ID plus matching payload
fingerprint returns the receipt's exact committed result without reevaluation or a second revision;
the same ID with another fingerprint returns `command-id-payload-mismatch`. A non-null prior receipt
with another command ID, or any prior receipt in preview mode, is `invalid-receipt`. Receipt codecs
recompute result and receipt digests before replay, so a mutated receipt never passes by preserving
only its ID.

## Resolver behavior frozen by K1

`resolveCommand(input: unknown): ResolutionOutcome` is synchronous and pure. It always runs the
strict codec first and never throws hostile input through the boundary.

1. Reject mismatched command payload claim, prior-receipt identity, rule fingerprint/reference, state identity,
   duplicate IDs, invalid revision, unavailable rule/resource, or insufficient resource without a
   patch/event/receipt.
2. If a selected-target rule lacks its one matching answer, return one bounded
   `NeedExternalInput`. Reject wrong request IDs, answer kinds, candidates, or bounds.
3. For `preview`, calculate the exact resource patch, semantic event, and `revision n→n+1`; return
   no receipt and do not mutate the frozen input.
4. For `commit`, return the same ordered patch/event/revision plus a deterministic inverse receipt.
   Identical input produces byte-identical canonical output. A supplied matching `priorReceipt`
   returns the already-committed bytes, while a changed payload under its command ID rejects.
5. For `undo-receipt`, require the receipt's state/revision fence and every current value to match;
   apply the whole inverse logically or reject atomically. Undo preview returns the inverse
   patch/event/revision without a receipt. Undo commit advances once and emits a new receipt whose
   inverse patches are the source receipt's forward patches. Passing that new receipt through the
   same `undo-receipt` branch is redo; it advances once more. Any intervening remote revision blocks
   that next undo/redo with `revision-mismatch` and zero output.
6. `retainCommandReceipts(receipts, max)` rejects invalid bounds and keeps the newest exact `max`
   receipts in order; it owns no store, listener, or persistence.

## Compatibility and deletion law

- Existing public callers continue only through the already-live `src/lib/mechanics-command.ts`
  and its current store adapter. K1 does not edit or invoke that path, so no event is dual-dispatched
  and no new write path appears.
- K1 introduces no second temporary adapter and does not adapt `mechanics-command.ts` into the new
  kernel yet. The full serial command lease is K1 → C1 → O1 → F1–F6. Each owner migrates only its
  domain caller after parity; X1 owns domain convergence/deletion and Tactical Task 15 alone owns
  live visual caller removal after its gate.
- No file from the frozen causal worktree is copied or imported. Accepted behavior is re-authored
  against literal RED fixtures. Before every review run:

```bash
rg -n 'ActionJournal|MechanicsAuthority|runtime-action|declared-combat|causality|journal|runtimeCommit' \
  src/types/command.ts src/types/rule-definition.ts src/types/effect-instance.ts \
  src/lib/command tests/unit/resolve-command.*.test.ts scripts/build-functions.ts
```

Expected: no runtime source/import or output vocabulary match; explanatory negative assertions in
tests/comments must be reviewed and kept only when they prove the deletion law.

- Only the target-named modules listed in task ownership may land. No generic engine framework,
  handler registry, event bus, workflow DSL, command queue, Firebase wrapper, copied reducer, or
  speculative abstraction is permitted.
- No legacy test or runtime source is deleted in K1; T0/X1 own representation-test deletion.

---

### Task 1: Implement the complete root contract and sole resolver by causal TDD

**Files:** only Task 1 ownership above.

- [ ] **RED 1 — exact schemas and versioned canonical identities.** Create the retained
      `resolve-command.contract.test.ts` first with literal compile/runtime cases for every exact shape,
      reordered object keys, locale-independent bytes, exact hard-coded SHA-256-derived fingerprints,
      all ID namespaces, distinct payloads, a forced payload mismatch, a forced rule fingerprint
      mismatch, and every projection in the table above. Derive expected digests with an independent
      one-off Node `crypto` command, then hard-code them; never compute expected values with the code
      under test.

Run:

```bash
pnpm exec vitest run --project fast tests/unit/resolve-command.contract.test.ts
```

Expected RED: module/import or exported encoder is missing. Record the failure text in the SDD task
report before creating `identity.ts`.

- [ ] **GREEN 1.** Add the three frozen type files and the smallest identity wrappers around the
      current canonical SHA-256 owner. Re-run the exact command; expect the identity cases green.
- [ ] **RED 2 — strict closed decoding inside the retained lane.** Add exhaustive table cases for
      every exact-key/numeric/ordering rule plus unknown root/nested fields, NaN,
      Infinity, negative zero, unsafe integers, oversized input, depth overflow, cyclic values, sparse
      arrays, getters, unsafe keys/prototypes, duplicate resources/answers, malformed IDs, invalid
      answer kinds, and request mismatch. Each expected result is one literal rejection reason and no
      partial value.
- [ ] **GREEN 2.** Implement `codec.ts` with exact-key helpers and one bounded prewalk; reuse
      canonical JSON rather than duplicating canonicalization or SHA-256. Deep-freeze the conformed
      value so later stages cannot mutate it. Re-run the focused Task 1 command.
- [ ] **RED 3 — exact outcome state machine.** Add literal
      actor-target fixtures for insufficient resource, revision mismatch, preview, and commit; add a
      selected-target fixture for request, matching answer, wrong request, and illegal target. Assert
      exact patches/events/revisions and absence of a receipt in preview.

Run:

```bash
pnpm exec vitest run --project fast tests/unit/resolve-command.contract.test.ts
```

Expected RED: `resolveCommand`/module is missing. Preserve that failure before implementation.

- [ ] **GREEN 3.** Implement one direct exhaustive resolver over the two semantic command branches
      and the single rule kind. No registry, reducer abstraction, mutable class, or asynchronous seam.
- [ ] **RED 4 — receipt replay, collision, undo, redo, and bounds.** Before receipt code exists, add
      exact tests for identical commit input, matching `priorReceipt` replay, changed payload under the
      same ID, undo preview, committed `rev8 → undo rev9 → redo rev10`, one invalid inverse leg,
      current-value mismatch, a remote revision 11 blocking the next operation, and retention
      `[r1,r2,r3] → [r2,r3]` at bound 2.
- [ ] **GREEN 4.** Add deterministic receipt construction and the pure retention helper. Reuse the
      same patch builder for preview/commit, and reverse literal patches only after all inverse legs
      validate. Re-run until all Task 2 tests pass.
- [ ] **RED 5 / GREEN 5 — import and Grant boundary.** Before adding the graph scanner, add synthetic
      allowed/forbidden module strings and observe the missing scanner assertion fail. Use the TypeScript
      parser in the test to read the real
      `src/lib/command/**/*.ts` import graph. Prove imports of `react`, Firebase, Zustand, i18n,
      features, components, presenters, or causal/runtime modules fail the guard; prove the real graph
      imports only `src/types`, `src/lib/canonical-fingerprint.ts`, the specifically allowed pure
      `src/lib/grants.ts`, and target command modules. Add compile-time/type assertions that Grant is not
      command/patch/effect state. Seed one temporary forbidden import, observe the real-graph guard fail,
      then remove it.
- [ ] **Sensitivity ledger.** For every assertion introduced after its production behavior already
      exists, do not call it RED: name and apply one isolated deliberate mutation (wrong projection
      exclusion, disabled exact-key check, wrong request binding, altered cost, non-atomic inverse,
      missing revision fence, or forbidden import), record the intended named failure, then restore.
      Every test must have either its pre-code RED above or one recorded sensitivity mutation.
- [ ] Run mutation checks for unknown fields, duplicate detection, `-0`, each identity projection,
      spend cost, revision fence, redo inverse, and prior-receipt mismatch; restore after each.
- [ ] Run the required focused command (the golden file is not created until Task 2, so Task 1 uses
      its one-file command), `pnpm typecheck`, lint, and `git diff --check`.
- [ ] Create `.changeset/automation-k1-kernel.md` with text
      `Freeze the strict command contract and add its pure deterministic resolver.`
- [ ] Independent task reviewer checks all four outcome variants, atomicity, repeatability,
      collision behavior, import direction, absence of dual dispatch, and Ponytail simplicity. Fix and
      rereview until READY.
- [ ] Commit only Task 1 files as `feat: add deterministic command kernel`.

### Task 2: Bundle the same kernel into Functions and prove golden byte identity

**Dependency:** reviewed Task 1 commit. **Files:** only Task 2 ownership above.

- [ ] **RED 1 — real Functions boundary.** Create `resolve-command.golden.test.ts` with one frozen
      `rule:v1:focus` fixture (`state:v1:pc-a@7`, `resource:v1:focus=2/2`, spend `1`) and a completely literal expected
      canonical `CommitResult`. Import the root/browser entry, build the Functions artifact, load its
      exported resolver, and compare the two canonical byte strings to each other and to the literal.
      Run the T0 focused command and preserve the failure caused by the missing Functions export/build
      script.
- [ ] Add `esbuild` as an exact compatible direct dev dependency only in
      `functions/package.json`/`functions/package-lock.json`; use npm's lockfile operation. Verify root
      `package.json` and `pnpm-lock.yaml` hashes remain unchanged.
- [ ] Implement `scripts/build-functions.ts` as an importable `buildFunctions()` plus direct CLI.
      Resolve esbuild through a `createRequire` rooted at `functions/package.json`; bundle
      root `src/lib/command/index.ts` to `functions/lib/command-kernel.cjs` as Node 24 CommonJS with
      sourcemap. Resolve `@/` to root `src/`. The normal Functions `tsc` continues to emit its existing
      source tree and `lib/index.js`; it does not compile browser source.
- [ ] Change Functions `build` to run its existing `tsc` and then the builder. Keep
      `functions/tsconfig.json` byte-identical unless a witnessed compiler failure proves a minimal change
      necessary. In `functions/src/index.ts`, use `createRequire(__filename)` to load the generated
      `./command-kernel.cjs` through a two-function structural type and re-export only `resolveCommand`
      and `canonicalResolutionJson`. No root type copy, callable, Firebase behavior, secret, endpoint,
      output path, or asset path is added or changed.
- [ ] **GREEN 1.** Run the focused command. It must pass the literal direct result, identical retry,
      and browser/Functions canonical byte equality. Inspect `functions/lib/index.js` only as a build
      artifact plus `functions/lib/command-kernel.cjs`; never stage either.
- [ ] **RED/GREEN 2 — source identity sensitivity.** Temporarily mutate the root resource event or
      cost application and confirm both direct and rebuilt Functions results change/fail together;
      restore. A stale copied bundle or file dependency must fail the test.
- [ ] Update only the narrow K1 section of `docs/MECHANICS.md`: current one-kernel contract,
      unchanged legacy adapter/no-cutover state, browser/Functions shared-source build, and explicit
      full C1/O1/F1–F6/X1 deletion handoff. Do not rewrite historical runtime sections owned by X1.
- [ ] Run from a clean standalone install:

```bash
npm --prefix functions ci --prefer-offline --no-audit
npm --prefix functions ls --depth=0
npm --prefix functions run lint
npm --prefix functions test
npm --prefix functions run build
```

- [ ] Run focused K1, `pnpm typecheck`, root lint, `pnpm build`, `git diff --check`, the deletion
      search, and confirm `git status` contains only K1-owned paths.
- [ ] Create `.changeset/automation-k1-shared-build.md` with text
      `Share the canonical command kernel between browser and Cloud Functions builds.`
- [ ] Independent task reviewer checks real build execution, CommonJS/asset compatibility,
      byte-equivalence, lockfile integrity, no copied source, minimal export, docs accuracy, and
      security/supply-chain boundary. Fix and rereview until READY.
- [ ] Commit only Task 2 files as `build: share command kernel with functions`.

## Broad final review and verification

- [ ] Generate the SDD broad review package across both reviewed implementation task commits and
      include the already-reviewed plan commit in the initial-base comparison.
- [ ] Independent architecture/correctness/security reviewer checks the whole K1 contract against
      the constitution, reset, Wayfinder, G0 accepted rows, T0 mapping, and this plan. Require zero open
      Critical/Important/Minor findings.
- [ ] Run `ponytail-review` over the complete diff. Delete speculative helpers, duplicate canonical
      logic, unused flexibility, pass-through wrappers, and comments that preserve rejected runtime
      vocabulary; rereview any material change.
- [ ] Run fresh, unabridged final gates:

```bash
pnpm exec vitest run --project fast tests/unit/resolve-command.{contract,golden}.test.ts
pnpm typecheck
pnpm lint --max-warnings 0
pnpm build
npm --prefix functions run lint
npm --prefix functions test
npm --prefix functions run build
just ci
git diff --check
```

`just ci-srd-only` is deliberately not required unless the final diff actually touches
`src/data`, SRD/private composition, content-pack aliases, or licensing guards. If it does, stop the
scope expansion, reconcile ownership, and run that gate.

## Integration procedure

- [ ] Verify every commit is Conventional, has exactly its own patch Changeset, and author and
      committer are only Salvatore Di Cara with no trailers. Never use `--no-verify`.
- [ ] `git fetch origin main`; record pre-rebase local and remote SHAs. Rebase onto fresh
      `origin/main`. If upstream or the tree changes, regenerate review packages and rerun the complete
      applicable review/gate set on the rebased SHA.
- [ ] Confirm the branch contains only K1-owned changes, the causal worktree remains untouched, and
      B00's worktree was not read as target architecture or modified.
- [ ] Push exactly `git push origin HEAD:main`, then require `git ls-remote origin refs/heads/main`
      to equal local `HEAD`.
- [ ] Stop after remote confirmation. Do not deploy, migrate live data, publish a release, remove
      this worktree, or delete this branch; cleanup belongs to the Program Controller.
