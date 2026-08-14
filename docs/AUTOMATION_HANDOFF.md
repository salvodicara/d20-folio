# Combat automation continuation handoff

> **Branch-scoped handoff — 2026-08-14.** Read this before changing combat automation. This file
> records what is actually proved on the branch, what is still open, and the safest continuation
> path. It is deliberately more conservative than older "100% automation" wording: those claims
> are not a completion certificate.

## Fable / Claude Code restart brief — 2026-08-14

The owner is deliberately moving this epic to a fresh Claude Code session because the originating
session became too long. Resume from the exact worktree and dirty state below; do not reconstruct the
work from chat history, reset files, clean untracked files or assume that an uncommitted hunk is
disposable. The durable goal is one canonical deterministic D&D 2024 mechanics engine, not a collection
of feature-specific automations.

### Frozen takeover state

- App worktree: `/Users/salvatoredicara/Workspace/d20-folio-combat-automation-gaps`
- Branch: `feat/combat-automation-gaps`
- Local and remote head: `5cda7e63163c` (`feat(engine): freeze exact event audiences`)
- Dirty state at handoff: **213 tracked files changed + 89 untracked files**. These include other
  intentional application/item-resource/test work. Preserve all of it and identify ownership before
  staging; never use `git add -A` or a destructive cleanup.
- Pack worktree: `/Users/salvatoredicara/Workspace/d20-folio-content-automation-data`, branch
  `feat/automation-data`, clean at `4931c47a250f`; the app's `content-pack` symlink targets it.
- No branch has been merged or deployed. The owner permits coherent checkpoint commits and pushes on
  the feature branch. **Do not run the global/full gate for those pushes.** Run the authoritative full
  gate exactly once, after final convergence and test-pattern reconciliation, immediately before the
  owner-authorized integration to `main`. Never use `--no-verify`; never deploy without separate owner
  approval.

The newest local slice attempts to remove causal end-latching from compiler prefix projection. Its
owned implementation/proof files are:

```text
.changeset/calm-projections-wait.md
PROGRESS.md
docs/ARCHITECTURE.md
docs/AUTOMATION_HANDOFF.md
docs/MECHANICS.md
src/lib/mechanics-compiler.ts
src/lib/mechanics-operation.ts
src/lib/mechanics-program.ts
src/lib/mechanics-transaction-projection.ts       # new
src/types/mechanics-operation.ts
tests/unit/mechanics-operation.test.ts
tests/unit/mechanics-program.test.ts
```

It replaces a projected `MechanicsCausalState` with an authenticated process-local projection carrying
the exact prefix world and cumulative inventory leases, privately bound to its causal basis. The final
`projectOnly` branch no longer performs phase acceptance or a final causal rebase. This slice is now
**closed**: the phase-CAS fixture was rebuilt per the invariant (a one-execution-ahead origin is
constructible only through the kernel while its exact frame is active), the basis re-proof was
adjudicated and made unambiguous in the API (`conformMechanicsCausalState` at both kernel entries; a
rebase call now always means a genuine post-transaction closure), and the ephemeral-registry doctrine
was reconciled (registries authenticate kernel provenance; they are never a second history, progress or
persistence model). Detail in the 2026-08-14 closed checkpoint below.

The existing `graphify-out` index is stale/noisy for this frontier and literal token matching pulled in
unrelated skill code. Use it only as a navigation hint; current code, focused tests, actual composed data
and independently verified 2024 rules are the evidence.

### Required continuation order

1. ~~Close the transient projection proof above and checkpoint it with only focused verification.~~
   **Done 2026-08-14** — see the closed checkpoint below.
2. ~~Repair compiler continuation semantics.~~ **Done 2026-08-14** — continuations exist only for
   genuine user responses: the private fiber binds the exact issuance causal state by identity plus the
   reviewed input, cursor, consumed response prefix and issued request; consumption is single-use even
   when the resumed compilation then rejects; resumption must extend the prefix by exactly one answer to
   the issued request, an unanswered/unconsumable/unused response fails closed, and `needs-coordination`
   carries only its typed coordination value — the coordinator mutates state and restarts ordinary
   compilation. The end-to-end accept path becomes exercisable with the first observation-bearing step
   compiler (continuation order 4); every reject path is proved now.
3. ~~Build one bounded depth-first fixed-point coordinator.~~ **Done 2026-08-14** —
   `runMechanicsCausalAction` (`src/lib/mechanics-coordinator.ts`) runs one complete causal action to
   its bounded fixed point: root review, root creation, the LIFO compile loop, frozen audiences with
   per-audience baseline depths, subscriber dispatch with intrinsic trigger-event dedup, readable
   end-wave delivery then finalization, boundary checkpoints via a non-finalizing checkpoint drive, and
   exactly one final `planMechanicsWorldAction` journal draft. Resumption is replay: answer/response
   ledgers keyed by deterministic frame identity and request id; no coordinator state serializes.
   Proved: the phase-end cascade in one action, wave-coordinated Concentration replacement,
   needs-answer suspension/replay, budget exhaustion and pending-frame entry rejection. The boundary
   path and response-accept path get their end-to-end proofs with the entity/resource compilers
   (continuation order 4).
4. ~~Complete the remaining authored step compilers and reviewed-payment prelude.~~ **Done
   2026-08-14** — all 24 authorable step kinds compile: vitality (damage through effective standing
   defenses with allocation suspend/resume, healing, atomic Temporary-HP source+grant, exhaustion,
   stabilize, death), lifecycles (closed-blueprint entity/inventory creation, availability, ends,
   terminal `end-program` latched at the frame pop), resources (reviewed-payment prelude compiled
   exactly once, change/recover/state with recorded-observation resume), `turn-claim` with
   caller-supplied guarded projections, and reactive `incoming-damage-adjustment` as an exact
   compensating reduction. The data-shaped audit residue (table-override authorization,
   source-specific THP teardown, death-prevention standing policies, enchantment attach/transfer,
   same-frame created selectors, explicit critical-hit input, replayable manual outputs) acquires its
   real consumers in continuation orders 5–6.
5. Compile the actual SRD + private pack corpus into that one runtime and generate clause-level coverage
   from real authoring data. A deterministic clause is green only with structured data, compiler,
   runtime consumer, persistence/undo behavior and conformance tests. Classify unavoidable physical-roll,
   spatial/table and narrative boundaries explicitly.
6. Cut solo play, live encounter, offline peer delivery and NPC/monster execution over to the same
   transaction runtime. Migrate live data under snapshot verification, then delete spent scripts and
   every legacy/parallel executor, adapter and dangling field. At every point there is one supported
   model, not old+new compatibility paths.
7. Reconcile the parallel agent's newer testing patterns only after integrating current `main`, run the
   independent convergence review, rebase, then run the one full dual-build gate before asking the owner
   to integrate.

Model real-table cases, including nested reactions, same-event audiences, source ending, same-id ABA,
multi-target and multi-hit actions, replacement effects, concentration, zero HP/death, final item use,
summons/polymorph, rests and clocks, offline recipients, stale retries, undo/redo and explicit DM/player
override. The app never rolls dice: it requests only irreducible physical-roll faces or table facts and
then computes every deterministic consequence.

### Required final explainer

Completion includes a self-contained, responsive, keyboard-accessible interactive HTML presentation,
Italian-first (an EN toggle is welcome), explaining the finished engine to the owner. It must be derived
from the actual final code, generated coverage and tests, never from aspirational status prose. Include:

- an interactive single-source architecture graph from authored rule to review, compiler, physical
  transaction, causal coordinator, events/end waves, journal, persistence and UI;
- step-through real-play scenarios for attacks/saves/damage, nested reactions, Temporary HP,
  Concentration/zero HP, resources/items/spells, turn/rest boundaries, summons/polymorph, offline peer
  effects, overrides and undo/redo;
- an edge-case explorer and clause-level coverage matrix distinguishing deterministic automation,
  physical input, table/spatial facts and narrative-only rules;
- direct proof references to the responsible modules/tests and a section explaining why each invariant
  and architecture choice is optimal under the non-VTT, offline-first and override-first constraints;
- an honest completion verdict. State “complete/optimal for the current rules and product constraints”
  only if the generated corpus evidence and final gates prove it; otherwise expose every residual gap.

Keep public/private licensing partition intact: the report must not leak pack-only prose, fixture names or
non-SRD content into the public repository. Prefer a sanitized public report at
`docs/automation-engine-explainer.html`; if private evidence is essential, generate a separate ignored
private companion rather than weakening the boundary.

### Copy/paste objective for the new session

```text
Resume the exact dirty worktree documented in docs/AUTOMATION_HANDOFF.md and finish the canonical
deterministic D&D 2024 mechanics engine end-to-end. Automate every knowable consequence across combat,
solo play, spells, items, resources, conditions, time/rests and entity lifecycles; request only physical
dice/table facts the app cannot know; keep first-class overrides, exact undo/replay and offline delivery.
There must be one source of truth and one runtime for solo, encounters, peers and NPCs. Migrate and delete
all legacy/parallel models instead of preserving compatibility paths. Prove completeness from the actual
SRD + private-pack corpus clause by clause, not from existing documents or prior completion claims.

Start by auditing and closing the uncommitted projection-capability slice and its failing focused test,
then follow the ordered continuation in the handoff: authentic response resumption, bounded causal
fixed-point coordinator, remaining physical compilers/payments, corpus transcription, application cutover
and legacy deletion. Preserve every unrelated dirty change. Use focused verification and checkpoint
commit/push milestones on feat/combat-automation-gaps; do not run the full gate on feature-branch pushes.
Reconcile latest main/test patterns and run the full dual-build gate only once at the true end, immediately
before owner-authorized main integration. Never deploy without separate approval.

At the end, produce the Italian-first interactive HTML architecture/coverage presentation specified in
the handoff, with graphs, contextual step-through examples, hidden edge cases, proof links and an honest
evidence-backed explanation of why the final model is optimal for the current rules and constraints.
Do not stop at a plan or partial scaffold. Make decisions autonomously except for the repository's four
owner forks, keep canonical docs current, checkpoint coherent milestones, and continue until the complete
definition of done is genuinely satisfied or a real owner fork is reached.
```

## Where to continue

The application work is here:

```text
/Users/salvatoredicara/Workspace/d20-folio-combat-automation-gaps
branch: feat/combat-automation-gaps
remote: origin/feat/combat-automation-gaps
```

The matching private content-pack work is here:

```text
/Users/salvatoredicara/Workspace/d20-folio-content-automation-data
branch: feat/automation-data
remote: origin/feat/automation-data
```

Do not duplicate a mutable branch head in this document: `git rev-parse HEAD` and
`git rev-parse origin/feat/combat-automation-gaps` are the authorities. The paired pack checkpoint is
currently pushed at `4931c47a`; verify its branch before composed work.

The app worktree's `content-pack` symlink points at that pack worktree. Keep both branches paired.
The Codex-generated worktree at
`/Users/salvatoredicara/.codex/worktrees/d6a5/d20-folio` is on the older
`codex/fix-encounter-ui` branch; it is **not** the continuation worktree. The owner wants manually
created worktrees under `~/Workspace` from now on.

Neither branch has been merged into `main` or deployed. Do neither without the owner's explicit
approval. Do not modify or revert the AGPL/legal changes made by the other workstream.

### 2026-08-05 continuation checkpoint

The pushed app head has advanced locally to `ebc9359fd8896729f37b80c51d4d095844c7982b` and the paired
pack head to `2b2abeadcc5b76d1a3db38fcf8f9c4db6d66da91`. The working trees after those heads contain the
active physical-item resource slice described below; it is intentionally unpushed while the composed
catalogue wave, migration proof and complete dual-build gate are still in progress. Preserve both
working trees as one change set.

### 2026-08-12 canonical-engine checkpoint

The active continuation has ratified and implemented the first exact foundation for the one-model
cutover: monotonic material/entity/item/occurrence identity; one program-root authority receipt; direct
child effects; typed public command answers and trigger evidence; recoverable root/phase CAS frames; and
cause-complete terminal transactions. `MechanicsIntent` now contains only action guards plus that frame,
so program/source/roles/bindings cannot drift across command, suspension and execution. Root creation is
targetless and post-event derivation discriminates it from effects.

The operation layer has also stopped eagerly closing the world after ordinary damage, resource,
vitality or occurrence-create mutations. Ending sources must remain readable for the future coordinator;
Concentration replacement now requires an explicit end barrier. Exact inventory leases allow a final-use
tombstone only during its originating transaction, and final material cleanup cannot discover or end an
active occurrence. The focused foundation suites pass; no full branch gate was run, by owner rule.

Do not mistake this checkpoint for an executor. The deleted parallel program planner never became a
supported path: typed world operations flow only through the physical transaction kernel, and the final
coordinator will call `planMechanicsWorldAction` exactly once after every frame, event and end wave drains.
The next work is that causal coordinator, followed by corpus/application cutover and deletion of every
old effect-program or handwritten executor path.

### 2026-08-12 causal-kernel hardening — checkpoint closed

The operation cause no longer accepts an authority receipt. Installed authority is independently resolved
from a trusted immutable snapshot; program authority comes from the exact persisted root generation; the
kernel then binds the recomputed cause to the installation owner and adds definition/installation guards.
Resolution groups simulate one ordered atomic transaction and retain exact before/after world projections
for every applied operation so ordinary post-events are derived from exact stages; only the complete
transaction result is a reusable causal-state receipt.

The adversarial pass withheld closure until the final invariant became stricter:
the only hostile entry begins from a closed world; ending causes are latched as explicit pure transient
state on their exact occurrence generations; and only typed kernel-produced continuations may advance an
operation or table boundary. No self-declared history, hidden `WeakMap`, serialized continuation or
resolver-returned replacement world is authoritative. Suspensions replay their fenced inputs and answers
from the closed basis. Every mutable non-self `EntityRef` also carries its ordinal so a same-id replacement
cannot satisfy an old target, actor, owner, encounter participant, duration rule or event.

Closure uses one bounded indexed worklist and one cumulative request for observed boundaries, explicit end
requests and leases. `beginMechanicsBoundary` / `advanceMechanicsBoundary` replace the deleted closure
callback: a completion is bound to the whole continuation; an empty wave retains its boundary; and any
wave created or extended while subscribers run becomes another source-readable checkpoint before removal.
Historical clock evidence remains valid only across the exact encounter hand-off owned by the cursor.

The authentic event census is closed: operation stages emit damage taken, zero HP and resource depletion;
re-proved end waves emit source ending. Finalization re-proves the exact wave, returns its resulting world
and does not fabricate generic change events with no authored consumer. The universal physical-D20 kernel
is included as a direct program-runtime dependency; it rejects non-canonical numeric aliases and records a
table-declared two-failure Death Save separately from a natural 1. Focused verification passed 408 tests
across the 20 directly affected suites. The active work now moves to the single `MechanicsProgram` step
compiler, which has since reached the effect/lifetime/boundary slice recorded below. The fixed-point
coordinator, suspension replay and one final journal draft remain open. By owner rule no global branch
gate ran for this checkpoint.

### 2026-08-12 exact physical operations — checkpoint closed

Every program/effect/entity/inventory create operation now carries its exact preallocated generation and
compares it with the material's monotonic allocator. Entity/item creation writes one dedicated
`material-lifecycle` atomically; validation rejects duplicate ownership. Allocators are identity
high-water state and therefore survive undo/redo even when ordinary timeline/encounter state reverses.
Inventory transition/end addresses one exact copy, holds exact causal leases and compare-and-swaps any
inbound enchantment bearer rather than relying on an order-sensitive world scan.

Availability/controller changes operate on exact generations, including dismissed entities. Dismissal of
a non-current participant atomically reconciles local/shared encounter membership before closed-world
validation and releases a character's final shared clock lease. Dismissal of the current participant
returns an exact `needs-boundary` continuation without mutation: only the authenticated end-turn
continuation may finish the removal, ordinary cleanup fails closed, and the future coordinator owns the
successor's start-turn observation. Controller validation spans the loaded world and rejects cycles,
so every controller rewrite (and controlled create) shares one semantic graph collision address. Encounter
membership has the same explicit semantic dependency; only allocator collisions are automatically ordered
by generation.

`turn-claim` authoring and terminal operations are now isomorphic to the claim-bearing canonical turn
commands. `start-turn`/`end-turn` remain exclusive to `beginMechanicsBoundary` /
`advanceMechanicsBoundary`. Exact hostile boundaries inspect only own enumerable data descriptors, so
array accessors are rejected and stateful proxy values are snapshotted once before conformance. Every
cause is pre-authorized against the common action basis, never against a world already mutated by an
earlier operation. Ordered steps expose only transaction-local world projections; one final causal rebase
preserves an existing latched wave and discovers the net new wave, making source-create + Temporary-HP
grant atomic. Timeline-bound creation reads the owning material's clock binding, and the closed parser
rejects a current combatant left in `between-turns`. Neither projection nor causal rebase can rewrite
protected journal epoch/revision/actions or character build revision. The independent operation-layer
P0/P1 review's then-known gaps are closed. The focused kernel proof is 401 tests across 14 suites; no
global gate ran. Compiler progress since this checkpoint is recorded below; one fixed-point
subscriber/end-wave coordinator and one `planMechanicsWorldAction` call producing one journal draft
remain open.

### 2026-08-14 authenticated compiler-prefix projection — checkpoint closed

Compiler prefix projection is now a distinct process-local capability, not a causal state in disguise.
Its public frozen value carries the exact projected world and cumulative inventory-source leases; a
private runtime fiber binds those values to the original trusted causal basis. Projection performs no
end discovery, causal rebase or pending-phase acceptance, so an intermediate root/child ending and an
empty Temporary-HP source stay unlatched while later operations in the same compiler expansion can make
their lifetime conditions false. A cloned, spread, serialized or reconstructed projection has no fiber
and fails closed.

Compilation still re-proves the reviewed input and causal basis once. Each context refresh then
authenticates the prefix capability and validates its readable world against that already-conformed basis
and its exact pending frames; it never conforms or rebases the projected world. The compiler continues to
expand every operation of one authored step into one atomic transaction, and only its final simulation—or
the real phase-commit transaction—performs the single causal rebase that discovers and latches net
endings.

The closing review resolved both interrupted points. First, the basis-vs-prefix distinction is now
expressed in the API, not only in discipline: the transaction kernel and the resolution-group conformer
re-prove the caller's already-authentic basis through `conformMechanicsCausalState` — a fixed-point
re-proof that rejects any state whose canonical form differs from itself — so nothing on the prefix path
ever calls a rebase, and a rebase call is always a genuine post-transaction closure. Second, the
phase-CAS proof was rebuilt per the invariant rather than the assertion: a world holding a
one-execution-ahead program origin cannot be parsed at rest, so the fixture creates its mid-frame child
through the real kernel transaction while the exact recoverable frame is active. The ephemeral
`WeakMap`/`WeakSet` registries (kernel causal states, event emissions, subscriber selections, compiler
continuations, transaction projections) are possession proofs that authenticate kernel provenance of a
process-local value; every authoritative fact stays inside the frozen value and the causal state, so a
registry can never become a second history, progress or persistence model — this supersedes the older
blanket "no hidden `WeakMap`" wording. Focused verification: 237 tests across the five directly affected
suites. No global branch gate ran, by owner rule. The bounded fixed-point subscriber/end-wave
coordinator, remaining compiler/corpus work, runtime cutover and final journal draft remain active; this
checkpoint is not an engine-completion claim.

### 2026-08-12 compiler/provenance vertical — initial checkpoint

Every effect and material lifecycle now carries structured program-step provenance: exact root
generation, phase, execution, step and stable expansion slot. The parser proves the tuple against the
root's frozen authority program, validates the step/occurrence-kind mapping, rejects duplicate emissions
and permits a one-execution-ahead origin only under an exact active pending frame. Program
register mutation is now its own exact compare-and-swap operation and participates in collision analysis.

At this checkpoint the sole `compileMechanicsFrame` entry point gained its first honest executable slice.
It re-reviews the frozen intent against the current basis, consumes only the exact nonterminal LIFO top
cursor, and emits at most one authentic simulated step segment. Replay is resolved before push by the
prepare/coordinator boundary. Root allocation happens separately before push; the final phase CAS is a
single-operation segment. Its result is the closed compiler status union; unsupported terminal steps
reject explicitly.
Resource selectors exposed to future subcompilers are deduplicated and sorted by exact resource key.

The physical transition is now split. `program-root-create` is the sole allocator: it derives every phase
at execution zero plus authored initial registers and emits no completion event.
`program-phase-transition` performs only the selected phase CAS, is final, and alone emits
`program-phase-end`. Compiler barriers carry an opaque process-local continuation whose private fiber
binds the immutable reviewed frame, exact pending cursor, response prefix and any frozen barrier
generations; it retains no projected world or second progress model. Cloning or changing the authority,
facts, frame or causal lineage invalidates it. Nothing in that continuation is persisted, and the
coordinator owns its eventual resumption.

The pending-frame kernel is now closed. Its bounded unforgeable causal state carries one exact LIFO stack;
all frames validate provenance already present, while only the semantic top may execute, advance or
complete. Root creation is a standalone installed-authority segment before push. Each authored step becomes
at most one authentic simulated segment with consecutive expansion slots, and the final phase CAS is a
single-operation segment that atomically marks the top `phase-complete` and, in the same causal rebase,
latches every lifetime made due by the new phase state. Boundary/end-wave/cleanup flows
preserve and re-prove the stack. No pending frame or compiler continuation is serializable.

The parallel real-play compiler audit invalidated any broader “all remaining gaps closed” reading. Before
the complete compiler can be called correct, the audit identified table-override authorization independent
of the program's operational cause; source-specific Temporary-HP replacement teardown; guarded effective
damage/healing/Exhaustion facts and death-prevention interrupts; payment debits; exact resource
cardinality; closed entity/item blueprint materialization; same-frame created selectors; enchantment
attach/transfer; and replayable manual outputs. These are engine responsibilities, not reasons to ask the
user unnecessary questions. No global branch gate was run; only focused verification is used for branch
engineering.

### 2026-08-12 exact program-phase completion — closed checkpoint

`ProgramOccurrence.phaseState` is now the sole completion truth. After the complete atomic transaction,
causal rebase resolves each `program-phase-end` child against the exact root generation, phase and authored
execution: current and overdue executions latch `program-phase-completed`, future executions remain live,
and exact generation closes same-id ABA. The cumulative closure request deliberately carries no duplicate
completion list. An applied `program-phase-transition` also emits the authentic exact
`program-phase-end` post-event consumed by subscribers. Every non-invocation evidence is bound to that
event's exact id and the matching phase CAS receipt, and phase events trail ordinary events from the same
complete transaction. Latched occurrences remain readable for authority/subscriber delivery but disappear
from every effective projection, allowing exact same-action replacement without overlapping active state.
Hostile review still rejects their raw world; causal review/compiler access first re-proves the complete
transient and uses only the canonical state, so a forged context fails closed. Focused verification is green
(254 tests across the nine directly affected suites); by owner rule this branch checkpoint runs no global
gate. The next checkpoint below records the effect/lifetime/boundary slice that followed.

### 2026-08-12 effect, lifetime and qualitative-boundary compiler — checkpoint closed

`compileMechanicsFrame` exactly compiles condition, standing, Concentration and polymorph starts from
the current authentic causal segment. Target expansion has stable slots, standing marks materialize by exact
broadcast/zip cardinality, and every clock-bound lifetime resolves against the owning material.
Concentration has one canonical target derived from the receipt's caster anchor; authoring can no longer
provide a second target that could drift.

Semantic effect endings now select one deterministic active set. A condition removal is global across
all roots for the exact target + condition, matching a deliberate cure or table override. Standing,
Concentration and polymorph endings are root-scoped and additionally match the complete standing fact,
caster or form identity, so ending an older source cannot kill an identical replacement from another
root. Authored `occurrence-end.childStepId` uses the same producer-kind authority as persisted origin
validation and selects every active direct child of that producer for the exact root generation, including
Temporary-HP and entity/inventory lifecycle children; `end-program` is the only root terminator. Empty
selections are idempotent no-ops. Nonempty selections and committed exclusive replacements
still return `needs-coordination`; the fixed-point coordinator must latch/finalize them and retry the
frame. That coordinator is not complete, and same-frame conflicting exclusive starts fail closed.

Program conformance rejects unreachable phase lifetimes before execution: same-phase and strict
downstream expiry are valid, while backward/sideways one-shot targets and source-end feedback cycles are
not. Rest and day-phase lifetimes now use the material timeline's exact high-water allocator. Boundary
`N` is allocated and the counter advanced before its checkpoint; rules record a minimum ordinal and match
the same selectors at any later ordinal, so an effect created during `N` begins at `N + 1` and cannot
expire retroactively. Shared-clock rebase uses the destination's current first-unused ordinal. The
branch-only `MaterialState` shape is schema 4; no schema-3 `MaterialState` was deployed or persisted, so
there is no live migration or compatibility path.

Boundary checkpoints now carry the exact newly observed boundary, or `null` for a pure wave extension,
and only the kernel's fail-closed completion constructor can brand their continuation. During
`source-end`, an unavailable entity actor remains authoritative only through an exact still-readable
program root it owns; installed, stale, removed and foreign authority paths still reject.

Only focused affected-suite verification was run for this engineering checkpoint. The sole global gate
remains reserved for the final convergence, rebase and push to `main`. Remaining work includes the
fixed-point coordinator, payment/vitality/material/resource compilation, the other audited prerequisites,
corpus transcription, persistence/application cutover and complete deletion of superseded executors.

### 2026-08-12 exact event audience and dispatch — checkpoint closed

Every authentic event is now an opaque process-local emission paired with the exact world that can prove
its meaning: an ordinary event carries its producing operation stage's `after` world, and
`source-ending` carries the re-proved readable end-wave world. The selector proves complete semantic
trigger eligibility on that emission world and freezes the audience in canonical root-generation/phase
order. Compiler/simulation results therefore expose authenticated emissions, not a bare event list.

Dispatch allocates the selected phase's current expected→next CAS only when the coordinator reaches that
audience member. It re-proves exact root generation and immutable authority but deliberately does not
re-evaluate mutable predicates whose emission-time truth selected the subscriber. Only a kernel-issued
selected-event frame may run on a readable-ending root; a `source-ending` child must resolve that exact
owning program root, and the frame pins end-wave finalization through `phase-complete` until its exact LIFO
pop. Cloned or forged emissions/selections, reuse, stale authority, same-id ABA, repeated delivery and
roots/phases created after emission all fail closed.

Only focused affected-suite verification ran; by owner rule no global branch gate ran. The bounded
fixed-point state coordinator that drains these audiences and end waves remains open, together with the
other runtime-cutover work above. This checkpoint is not an engine-completion claim.

## Product doctrine

The target is a table companion, not a VTT:

- Automate every deterministic consequence that the app can know.
- Never invent spatial facts, hidden rolls, line of sight, table rulings, or other facts the app
  cannot observe. Ask for the minimum missing fact at the moment it matters.
- The app never rolls dice. It presents formulas and accepts physical-roll results.
- Use the same resolution behavior in solo play and encounters.
- Make every automatic result reviewable and reversible; DM/player correction and homebrew override
  are first-class behavior, not exceptional escape hatches.
- Persist state before navigation can erase it. Peer effects must work while the recipient is
  offline.
- Overview first, details on demand; expose only decision-relevant information.
- Public SRD and private pack are one product scope but remain a hard licensing partition. Update and
  test both in the same motion.

## Honest status

Automation is **materially better but not complete**, and the present architecture is **not yet the
state-of-the-art endpoint for corpus-wide automation**.

What is good and worth preserving:

- typed source data flows through grants/resolved actions rather than English-regex interpretation;
- solo and encounter effects increasingly share the target-review and transaction path;
- effect provenance, timers, offline peer delivery, combat-state persistence and exact undo have
  reusable seams;
- the real six-character team fixtures now pin many high-frequency contracts;
- the branch contains 32 app feature commits and the paired pack branch contains 36 commits, all
  separated into small milestones before this handoff.

What is not yet good enough:

- authoring is split among `Grant`, `SrdActionDef`, `ActionData`, spell-specific fields, item charge
  fields and several one-off adapters;
- `src/lib/smart-tracker.ts` and `src/lib/grants.ts` are large compilers with growing conditional
  surfaces, while `CombatResolver.tsx` and `TurnEconomyProvider.tsx` still mix orchestration with UI;
- attack/save/damage-reduction receipts now preserve turn occurrence, target and honest exact-vs-aggregate
  instance identity, and their economy owner commits atomically; damage-dealt facts and an explicit
  critical-hit resolver input are still missing;
- the coverage matrices are manually curated and can be green while a declaration has no complete
  runtime consumer;
- older docs contain closed-audit language that proved too optimistic. Treat them as evidence and
  history, not as a substitute for code/data/source inspection;
- PC damage now has one pure `reducePcDamage` kernel for open-sheet and fresh-read peer state; multi-hit
  inputs cross it as ordered packets, so Death Ward, damage at 0 and retaliation are no longer action-total
  approximations. The own-sheet encounter adapter still stops at optimistic projection consumption: it does not yet
  apply/reverse returned Warding Bond partner transfers or transactionally revoke/restore the consumed
  campaign occurrence. Do not claim that local projection filtering is a reload-durable inverse;
- the current public + pack matrices still contain many `partial`/`narrative` rows. Some are correct
  table/VTT boundaries, but they have not all been reclassified clause by clause against the actual
  2024 source and runtime.

Therefore do not claim "all mechanics automated" until the generated coverage/conformance gate
described below exists and passes.

## What this branch implemented

The app history from `origin/main` through feature head is the authoritative detail:

```bash
git log --reverse --oneline origin/main..HEAD
```

The main delivered seams are:

- resilient encounter effect delivery, including offline party members and NPC allies;
- reactive hit and incoming-damage effects;
- one pure PC damage transition shared by character-store and peer-campaign reducers, including explicit
  raw/resolved intake, Temporary HP, dying/knockout/massive-death state and exact zero-HP-floor identity;
- persisted occurrence-based attack/save/damage-reduction facts with owner-validated hydration and exact
  action/Attack-swing/Reaction undo;
- variable-level charged-item casts and activated-item tracker/timer lifecycles;
- bounded free-cast spell pools routed through ordinary cast resolution;
- variable healing pools, deterministic condition cures and exact resource undo;
- generic feature-effect resolution, including physical rolled healing/temp-HP inputs;
- 2024 Rage lifecycle, maintenance, spell/concentration/equipment blockers and exact undo;
- Monk Focus/Mercy/Deflect/Uncanny Metabolism/Wholeness of Body contracts;
- Bardic Inspiration and Musician/Heroic Inspiration delivery;
- recorded physical-roll trackers such as Portent;
- the current team Wizard, Rogue/Assassin and Paladin/Vengeance combat contracts;
- condition/effect provenance, explicit lifetimes, rest reconciliation and exact-target occurrence
  expiry;
- selectable damage riders, activation-scoped resources and source-qualified condition immunity;
- equipment combat actions, inherited feat-spell-choice repair and Alert initiative swaps;
- Divine Fury on weapon or Unarmed Strike, including ranged weapons and per-hit damage-type choice;
- paired pack-side feature data for rolled healing/Temporary HP, condition removal and timed active
  states;
- one locale-free entered-D20 kernel with live-character adapters for Death Saves and damage-triggered
  Concentration saves, including exact physical-face input, natural-face policies, Exhaustion and
  Advantage/Disadvantage netting;
- a persisted per-character FIFO of Concentration saves (one row per authored damage packet), canonical
  failure teardown, malformed/stale prompt rejection and whole-command causal undo/replay.

This list means those specific regressions have structured implementations and tests. It does **not**
mean the entire D&D corpus has been certified.

## Six live-team fixtures

The private fixtures are in `content-pack/fixtures/team/*.json`. They are the first conformance gate,
not the scope boundary. Their private names and non-SRD build details deliberately stay out of the
public repository. Inspect the fixtures and `content-pack/docs/AUTOMATION_COVERAGE.md` in the paired
worktree for the exact contracts.

One imported feat spell choice is intentionally incomplete. The UI offers **Complete choices**
repair; do not infer or write a spell choice the player did not make.

## First architecture proving case

The paired pack coverage matrix identifies an unimplemented active-state-gated, once-per-turn
on-hit rider. It is an excellent first proving case for the next architecture because it needs all
of these facts together:

- a parent state must be active;
- once per turn;
- trigger only after a successful attack;
- select the creature hit;
- adjudicate a WIS save against the actor's spell save DC;
- apply Frightened until the end of the actor's next turn;
- preserve exact log, undo and redo behavior.

The current receipt path does not represent generic attack/save success consistently, and grouped
multiattack receipts lose per-swing success. `SrdActionDef`/`ActionData` can express exact-action
prerequisites but not a generic "successful attack this turn" prerequisite. Adding a Warlock-specific
boolean would deepen the problem. Use this feature to prove the canonical intermediate
representation instead.

## Required architecture direction

Do this incrementally; do not rewrite the application in one pass.

1. Define one canonical, locale-free combat intermediate representation for author intent and the
   resolved plan. It must express actor, source, cost, targeting policy, observed inputs, attack/save
   outcome, deterministic effects, duration, cadence, provenance and override metadata.
2. Compile features, spells, weapons, items and homebrew into that representation with pure adapters.
   Existing data shapes may remain authoring conveniences temporarily, but consumers must stop
   learning each source dialect.
3. Produce one pure transaction plan from resolved action + current state. The plan should be a list
   of validated operations with an inverse/receipt; React renders and commits it but does not encode
   rules.
4. Use that same transaction runtime for own-sheet solo play, live encounter targets, offline peer
   delivery and encounter-owned NPCs/monsters.
5. Persist explicit outcome facts: per-attack/per-target success, save outcome, resource spend,
   applied occurrence ids, before/after values and source/action identity. Grouped UI may summarize
   events, but must not destroy the facts needed by cadence, logs or undo.
6. Represent table-only residuals explicitly (`manual-observation`, `spatial`, `narrative`, etc.). A
   manual boundary is valid; an unclassified prose fallback is not.
7. Generate clause-level coverage from the composed catalogues. A deterministic clause is green only
   when it has structured authoring data, a compiler, a runtime consumer and a conformance test.

Keep the existing stable seams while migrating: `ResolvedAction`, combat effect occurrence ids,
combat-state subdocs, target snapshots, `campaign-io` transactions and the current undo fence are
useful foundations.

### Proved first transaction slice: physical item resources

The current working tree proves the smallest version of that direction for one bounded domain rather
than beginning with a speculative whole-engine rewrite:

- every durable magic-item copy has a stable `instanceId`; a counter is addressed by
  item + copy + resource, never by catalogue item id alone;
- catalogue `ResourceSpec` data declares capacity, initial state, exact recovery events and depletion
  consequences, while `session.itemResources` is the only mutable owner for a migrated item;
- `lib/resources.ts` is a locale-free, roll-free planner. It either rejects, asks for irreducible
  physical-roll facts, or returns one compare-and-swap operation plus a serializable receipt;
- the shared provider collects every requested fact before mutation, revalidates the exact equipped /
  attuned / magical copy, and commits one operation or one whole recovery batch;
- undo is causal against the committed revision and redo replans the same entered facts against live
  state. Stale state, cancellation, an unequipped owner or a lost Reaction claim mutates nothing;
- Short Rest, Long Rest, Dawn and Dusk are distinct typed events. Dawn/Dusk are explicit Table Clock
  declarations, never device-time inference or a Long Rest alias;
- Inventory, the resource rail, rests, item casts, item actions and alternate action costs consume the
  same planner/commit seam; disposed copies stop supplying both actions and passive grants.

The proof catalogue began with Wand of Magic Missiles, Winged Boots and the paired-pack Spirit Board.
It now also contains the first 24-item source-verified public scalar wave plus the pack Mythallar Cloak,
Niko's Mace and Wave: 30 physical-resource items in all. Wave proves two independent pools on one copy;
the pack trio also proves entered d10/d6/d3 Dawn recovery without a false Long-Rest alias. The composed
migration catalogue fingerprint is pinned to the reviewed resource set, so adding or changing any item
fails before a live document can be planned. That proves counter ownership/payment only for properties
that already have structured executable authoring; several non-spell properties on the same items remain
open and must not inherit a false green status from the counter. No legacy item-id tracker,
`ref.charges` owner or Dawn/Long-Rest compatibility path may be deleted until the one-off migration has
converted and verified every live current character **and every saved snapshot**. Complex item
collections, linked meters, elapsed-time cooldowns and table-conditioned spends remain explicitly open;
do not force them into the scalar counter merely to make a matrix green.

The one-off is prepared at `scripts/migrate-item-resources.ts` but has **not** touched production. Its
contract is deliberately fail-closed: it loads the pinned SRD-only or composed resource catalogue,
discovers both current character documents and every `snapshots` subcollection, preserves unrelated raw
Firestore values, reuses valid identities, assigns missing ids deterministically, rejects ambiguity, and
plans the entire corpus before a write is possible. The modes are:

```sh
# read-only plan (default)
node --import ./scripts/alias-loader.mjs scripts/migrate-item-resources.ts

# read-only completion/idempotency assertion
node --import ./scripts/alias-loader.mjs scripts/migrate-item-resources.ts --check

# apply only after a green dry-run: fresh absolute directory, recoverable tagged backup first
node --import ./scripts/alias-loader.mjs scripts/migrate-item-resources.ts \
  --apply --backup /absolute/fresh/private/item-resource-backup
```

Production access requires an explicit service-account credential for exactly `d20-folio`; apply also
requires a fresh `0700` backup directory, writes `0600` tagged-value documents plus hashes/update times,
uses one ≤500-document batch with `lastUpdateTime` preconditions, then rereads every changed document and
reruns global plus idempotency verification. After the owner runs apply and `--check` succeeds, remove the
legacy owners/read paths and delete the spent script in the same closure wave (golden rules 10 and 22).

### Current execution/persistence diagnosis

The physical-item seam is not yet the application-wide transaction runtime. Production execution is
still divided among four paths:

1. `cost-engine.ts` plans serializable scalar mutations but is used mainly by conversions/tests;
2. `TurnEconomyProvider` is the primary combat executor and hand-orchestrates payment, action economy,
   effects, logs and closure-based undo;
3. `SpellsTab` duplicates substantial cast/payment/concentration behavior outside combat;
4. `characterStore` owns many composite resource/rest/state mutations and broad snapshot inverses.

The first generic command member is now proved for `resource-conversion`. It captures only stable
source/conversion ids plus the player's selected level or amount; every execute/redo re-resolves the live
grant and legal option, canonicalizes every touched normal-slot/Pact-slot/tracker owner, and commits them
through one whole-character Zustand compare-and-swap. One stale leg means zero mutation, notification or
persistence flush. The serializable receipt supplies the exact reverse plan; source removal does not block
undo, while any intervening owner/capacity change leaves undo retryable. `ResourceConversions` no longer
calls the sequential low-level mutators or stores stale `CommitOp[]` closures.

The first source-authored spell correction wave is also deliberately narrow and proved in both build
modes: Feather Fall, Hold Person and Slow now carry exact target-cardinality facts; Conjure Barrage and
Conjure Volley carry exact Force-damage/save facts and Barrage's upcast packet. This closes those data
defects only. Reactive eligibility, repeat saves, geometry/materials and delayed or phased effects still
require the shared cast/effect transaction architecture below.

Owner-character autosave, the combat subdocument, local logs and campaign-owned peer/NPC effects also
have different persistence boundaries, so a logical action cannot yet honestly claim cross-document
atomicity. Extend the proved locale-free `MechanicsCommand` union incrementally: a future member may
return `needs-input`, `rejected` or a serializable plan with expected state, owner operations, turn
operations, log facts and explicit external intents. Local owner state must keep committing as one checked
mutation and emitting a causal receipt. Campaign-owned external effects require idempotent intent delivery
and compensation; they must not be described as a Firestore transaction with an unrelated owner doc.

The entered-D20 kernel is intentionally below that future transaction runtime and never rolls dice.
`lib/d20-test.ts` validates the exact one/two physical faces required by the net roll mode and resolves
the selected natural face, total and policy outcome; `lib/character-d20-tests.ts` rebuilds Death Save or
Concentration facts from the live character at commit/replay. Solo damage persists one
`PendingConcentrationSave` for each ordered damage packet and resolves the FIFO head with causal undo.
Campaign-target damage still needs the shared resolver to load the target PC's parent character session,
enqueue the same prompt in that target's combat subdocument and include it in the campaign inverse; do
not duplicate a second Concentration-save implementation inside `campaign-io`.

Migration order is deliberately narrow: rail slots/trackers/inspiration and conversions first; then one
Cast command shared by Spells and combat; then action-economy claims, attacks and Reactions; then combat
outcome/external-effect intents; finally rests and turn boundaries. Delete each handwritten path only
after parity tests prove the new consumer in SRD-only and composed builds.

## Corpus audit method

Do not trust `docs/AUTOMATION_BACKLOG.md` or either coverage matrix as the initial input. Regenerate
truth from the actual composed data and the 2024 source, then reconcile the docs.

For every rule-bearing clause:

1. classify it as deterministic, requires physical roll/input, requires table observation/spatial
   knowledge, or narrative only;
2. for deterministic clauses, trace authoring data → compiler → consumer → persisted result → undo;
3. for physical input, verify the app asks only for the irreducible value and then applies all known
   consequences;
4. for table-only clauses, provide a concise reminder or override at the decision point;
5. test SRD-only and composed builds, solo and encounter modes where applicable;
6. update the generated matrix and canonical docs from the same truth source.

Prioritize the six team fixtures for regression risk, then finish the whole corpus. "Team-first" must
never become "team-only."

## Verification performed

At feature head `0034c99`:

- targeted feature/smart-tracker suites: 366 tests passed;
- pre-commit fast gate: 496 files / 15,671 tests passed;
- the first full pre-push attempt timed out in three cases in
  `content-pack/tests/unit/turn-economy-undo.test.tsx` while waiting for `combat-resolver`;
- that file passed alone, 45/45, in 12.61 seconds;
- the repeated full pre-push gate completed and the remote app branch reached `0034c99`.

Treat the timeout as a real test-harness reliability issue, not proof of a product defect and not
something to bypass. Never use `--no-verify`.

Useful starting commands:

```bash
cd /Users/salvatoredicara/Workspace/d20-folio-combat-automation-gaps
git status --short --branch
git fetch origin
git log --oneline --decorate -12
readlink content-pack
pnpm test --run content-pack/tests/unit/turn-economy-undo.test.tsx
pnpm tsc -b
```

Before eventual integration, both build modes and the full local gate must pass, then run the
independent ponytail convergence review, rebase on current `origin/main`, and ask the owner before
merging. Do not deploy until the owner separately approves it.

## UI/dogfood status

This branch also contains earlier dogfood work around encounter persistence, healing, initiative,
custom combatants, target context, Chronicle output, legal textures, dev/prod parity and the zombie
crop. Some pieces were owner-tested, but this handoff does **not** certify every visual request as
complete. In particular, do not conflate engine closure with approval of the encounter summary,
target selector, custom-monster dialog or other visual polish. Golden rule 25 still requires owner
screenshot approval for visual changes.

## Definition of done

The automation epic is done only when all of the following are true:

- the canonical IR and one transaction runtime serve features, spells, weapons, items and homebrew;
- every composed-catalogue deterministic clause is generated-green with a real consumer and test;
- every residual manual/table boundary is explicitly classified and minimally presented;
- solo, online encounter, offline peer and NPC paths share conformance behavior;
- resource, Temporary HP, HP, conditions, durations, concentration, equipment and cadence remain
  consistent through navigation, reload, undo and stale redo;
- the six live fixtures and corpus-wide SRD + pack suites pass;
- UX is owner-approved in both themes and responsive layouts;
- full hooks pass without bypass, the branches are rebased, and the owner explicitly authorizes the
  merge and later deployment.

### 2026-08-14 second block — engine surfaces + the deletion map

Orders 1–5 remain closed; order 5's spell corpus stands at **259/422 executable** with the
authored-program channel (`spell.mechanicsProgram`, Fire Shield worked example) and the
possession-safe `root-pulse` trigger executing recurring phases end-to-end over the PERSISTED
world (serialize → parse → advance authenticates). Order 6 is a live rollout: the Spells tab
dual-dispatches engine-executable casts (modal protocol → one journal commit + exact undo), the
pulse surface declares armed phases, and the bridge mirrors hp/slots/exhaustion/concentration.

**The deletion map (executes when the canonical runtime covers each flow):**

1. **Branch-born intermediate combat generation** (`combat-economy`, `combat-effect-atomic`,
   `combat-effect-command`, `combat-effect-io`, `combat-effect-lifecycle*`,
   `combat-effect-planning-state`, `combat-effect-program`, `combat-effects`, `combat-outcomes`,
   `combat-transition`, `automation-compiler` — none exist on `main`): the migration's own
   half-way runtime. Deleted per-flow as feature/weapon/item transcription plus the encounter
   world land. (`combat-effect-state-reducer` was stillborn — already removed.)
2. **Main-era legacy** (`cost-engine`, `smart-tracker` consequence paths, `combat-hp`,
   `combat-resolution`, `combat-state`, `combat-state-io`, `spell-combat-castable`): survives the
   longest — it serves the live UI for everything not yet transcribed. Falls with the final
   surface cutovers.
3. **Item-resource bridge** (`item-resources`, `item-resource-commands`,
   `item-resource-boundaries` + `src/lib/resources.ts` item-command block): completed on the
   branch to restore boot; deleted when items resolve through the engine's material
   inventory/payment model.
4. **Legacy `effectProgram` fields** on the 15 authored spells + `SUPERSEDED_LEGACY_PROGRAMS`:
   dropped with generation 1's executor once the authored `mechanicsProgram` twins are live.
5. **Bridge mirrors + `characterWorldState` legacy derivation**: dropped with the one-off live
   document migration (schema-4 world becomes the only source; pre-world docs derive once,
   fixtures re-validated).

Remaining order-5/6 work: the feature-action long tail beyond the transcribed families —
pool-spend at a chosen amount + pool-priced cures, the declarative save/auto/attack-roll attacks,
tracker payments, conditions/cures, standings and weapon attacks (with Graze/Topple) are DONE with
Play-tab dual dispatch (42/231 composed actions executable; the honest boundaries: class-die
sentinels, check flows, damage-reduction reactions, alternate costs, attack sequences,
level-scaled die faces, granted dice, top-ups, turn facts —
`docs/automation-coverage.feature-actions.generated.json`); item transcription; the
encounter/adversary world; the 14 authored programs (agent in flight); then the deletions above,
the document migration, order 7's single full dual-build gate, and order 8's explainer. Solo
per-turn caps stay table-classified: the `turn-claim` step compiles only under an encounter
turn-economy projection, so kernel-side cap enforcement lands with the encounter seam.
