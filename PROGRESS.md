# d20 Folio — Progress Tracker

> **Living roadmap. EVERY agent keeps this current** — update phase status / tick items as you ship.
> This file holds the FORWARD plan only. Shipped detail lives elsewhere by design (golden rule 6):
>
> - **Releases** → `CHANGELOG.md` (minted from `.changeset/*.md`).
> - **Granular history** → git.
> - **The open gap frontier** (per-seam, per-entity) → `docs/AUTOMATION_BACKLOG.md`.
> - **How it works today** (incl. the architecture invariants the R1–R8 campaign locked in) → `docs/ARCHITECTURE.md`.

## Active epic — The BG3 corpus-studied visual identity (owner-ratified 2026-07-30)

> **Phase-3 rollout status (2026-07-31):** Sheet ✓ · Compendium ✓ (protruding index tabs, one
> construction) · Campaigns ✓ · dialogs/portals ✓ (wb-scoped shells, leather plates, the
> frame's-margin law, ONE scroll primitive + guard) · all page roots ✓ · wizards ✓ (scope only —
> the ritual register stays) · login/error/loader ✓. Remaining niceties live in the epic notes
> (mobile layout exploration, admin rework).

> **Admin rework SHIPPED (2026-07-31, owner-grilled):** omni-search (users · characters →
> owner's row · campaigns → DM's row, lazy char index) + campaigns-style disclosure rows
> (actions inside the detail) + bounded list (25 + show-more). Overview + bug inbox unchanged.

> **EPIC CLOSED (2026-08-01):** the BG3 corpus-studied visual identity epic is COMPLETE —
> rollback → grammar → hero cockpit → full rollout (every surface family incl. dialogs/portals),
> the protruding index-tab construction, the two-style law (working plate vs parchment), the
> remastered tome leaves, and the refreshed README screenshots (six WebP shots of the shipped
> identity, compendium row added). The statblock-contrast a11y job turned out already
> resolved (statblock-ink-contrast.spec green in both themes, full e2e matrix confirming);
> the one leftover is the pack-side MM corpus (its own standing job).

The post-v0.22.0 **chrome-reset visual identity was REJECTED by the owner** (2026-07-30: the
corner knots, the missing borders, the plate/veil material, the compendium treatment — "the
deployed v0.22.0 looks much better") and **surgically rolled back**: `index.css` + `folio.css` +
the ornament-bearing components are the v0.22.0 vocabulary again, while every post-v0.22.0
FEATURE (bestiary statblock, encounter picker, header-as-disclosure, realm scenes + backdrop
crossfade, all a11y/i18n fixes) survives through the delimited feature-layer appendix
(`DESIGN.md` → "Post-v0.22.0 feature layer"). This wave also RE-CUT **golden rule 25**: the
owner's screenshot approval is now a BLOCKING pre-merge gate for every visual change — `main`
only ever holds visually-approved work (owner, 2026-07-30). The forward plan (every gate
blocking on owner screenshots):

1. **Phase 1 — DONE, GATE 1 PASSED** (owner-approved 2026-07-30): the visual rollback (this
   wave), merged on this approval.
   1b. **Phase 2 first merge — DIVIDER RATIFIED** (owner, 2026-07-30, "adesso è perfetto"):
   the `.wb` grammar scope on the cockpit (struck gold, leather plates, the carved
   medallion tiles kept, ledger voice) + the RICALCO ornament pipeline proven end-to-end —
   a CC0 engraved center-loop divider, its internal rule removed by vector surgery, resting
   seamlessly ON the app's own separator. Owner-ratified METHOD for the whole epic:
   screenshots → discussion → merge only on explicit agreement; goal = "wow, curato,
   professionale", copy BG3 as much as legally possible and sometimes better, and ONE
   unified design vision across every surface (never progressively-added layers).
2. **Phase 2**: study a gathered BG3 UI reference corpus (`~/Workspace/bg3-ui-study/`, never
   committed) → extract MEASURED construction rules (frame anatomy, corner geometry, stroke
   weights, proportions, palette, typography) → write the grammar spec into `DESIGN.md` → build
   ONE hero surface (the character sheet) in the new grammar, both themes. GATE 2 = side-by-side
   ratification. Rules: grammar-faithful ORIGINALS only (no traced Larian art in the public
   repo), NO from-scratch SVG invention — every ornament derives from the measured corpus.
3. **Phase 3**: roll the ratified grammar out per surface group — Sheet → Compendium → Campaign
   → Wizards → Shell — one worktree + one blocking gate each, `impeccable`-reviewed.

## Current state

> **Continuation handoff (2026-08-04):** `docs/AUTOMATION_HANDOFF.md` is the exact branch-level
> starting point for the next session: worktrees, pushed heads, verified behavior, known gaps,
> architecture diagnosis and definition of done. The deterministic audit below is substantial but
> is **not** a corpus-wide completion certificate.

> **Engine-model ratification (owner, 2026-08-12):** the destination is one canonical,
> storage-aware deterministic action engine for solo, campaign, spells, features, items and every
> other executable rule. Existing document or Firestore decisions remain only when they are still
> optimal. Every knowable consequence is automatic; irreducible rolls/table facts enter as typed
> observations; every result remains explicitly overrideable and reversible. No compatibility
> architecture may survive the cutover: migrate and verify live data, then delete every superseded
> field, parser, writer, fallback, test, script and reference so the repository and production data
> expose exactly one current model.

**Canonical engine foundation checkpoint CLOSED on branch (2026-08-12; runtime cutover ACTIVE):**
the new core now has exact monotonic material identity, one targetless program-root authority carrier,
direct child effects, immutable capability/authority receipts, recoverable create/advance execution
frames, typed trigger evidence and cause-complete atomic transactions. Commands cannot inject actor,
program, roles, source or bindings; item/resource identities include physical ordinals; forged, missing
or unused causes and stale root CAS receipts fail closed. Terminal mutation no longer implicitly erases
Concentration or other sources before their end subscribers can run, and Concentration replacement is an
explicit causal barrier. Focused foundation verification is green. This is deliberately not the engine
completion claim: the MechanicsProgram terminal compiler, subscriber/end-wave coordinator, multi-frame
suspension replay, full SRD+pack transcription, UI/store/Firestore cutover, autonomous live migration and
legacy deletion remain active. Branch checkpoints run no global gate; the sole authoritative gate stays
reserved for the final rebased push to `main`.

**Canonical causal-kernel hardening checkpoint CLOSED on branch (2026-08-12; compiler/coordinator
ACTIVE):** operation authority is independently resolved from the trusted capability snapshot or exact
persisted root generation, never accepted inside a cause; actor ownership and immutable
definition/installation guards fail closed. Every mutable non-self entity and every occurrence authority
carries its physical generation, closing same-id ABA across targets, actors, owners, participants,
durations and delayed events. Ending causes and the one cumulative closure request live in explicit pure
transient causal state. Table progression is now a `begin`/`advance` state machine whose continuation is
bound to its complete checkpoint; a wave created or extended during event delivery always produces a new
source-readable checkpoint before finalization. The old resolver-returned-world API is deleted. The
authentic event surface is deliberately closed to damage taken, zero HP, resource depletion and source
ending; finalization re-proves the exact wave and returns the resulting world without synthetic catch-all
events. The universal physical-D20 dependency is branch-complete too: exact inputs reject numeric aliases,
and table-entered two-failure Death Saves retain provenance distinct from a natural 1. Focused cross-seam
verification is green (408 tests across 20 directly affected suites); by owner rule no
global branch gate ran. The single step compiler has since reached the effect/lifetime/boundary slice
below; the fixed-point subscriber/suspension coordinator and one final journal draft remain open.

**Exact physical-operation checkpoint CLOSED on branch (2026-08-12; compiler/coordinator ACTIVE):**
program/effect/entity/item creation now carries exact preallocated generations and atomic lifecycle
ownership; every allocator is monotonic high-water state that undo/redo cannot lower. Inventory
transition/end uses exact generation leases and an explicit inbound enchantment-bearer CAS. Non-current
entity dismissal removes its exact generation from local and shared encounters before closed-world
validation and releases a final shared clock lease. Current-participant dismissal instead returns an
exact `needs-boundary` command carrying that generation: the boundary emits the authentic end/time/start
sequence while excluding it from successor selection (or returns a sole-participant encounter to
initiative), then the retried operation owns the dismissal and membership removal. Historical cleanup may
remove a current participant only inside that exact complete-turn continuation before a successor starts;
every other boundary fails closed. Controller links are cross-document exact references, global cycles
fail closed, and their complete graph dependency participates in collision ordering. The access model
distinguishes shared reads, table-owned semantic writes and immutable allocator precedence; embedded
effect, item and entity references are part of the footprint, so no hidden validation scan can make
execution order-dependent. Program terminal turn steps are claim-only; encounter lifecycle alone may
start/end a turn. Exact hostile boundaries reject accessor arrays and proxy traps without evaluating
them or rereading stateful proxy values. Every cause is authorized against the same immutable action
basis before mutation. Ordered terminal steps now produce transaction-local world projections and one
final causal rebase, so newly satisfied end rules observe the atomic net result while already-latched
waves remain readable; this closes the real create-source/assign-Temporary-HP lifecycle. Timeline-bound
creation collides on the owning document's clock binding, and a persisted current combatant must be in
`own-turn`. Transaction projection and causal rebase also preserve every document's journal
epoch/revision/actions and a character's build revision. The independent operation-layer P0/P1 audit's
then-known gaps are closed. The focused kernel proof is 401 tests across 14 suites, with no global branch
gate run. Compiler progress is recorded below; payment/vitality/material/resource compilation, one bounded
fixed-point causal coordinator and one final reversible journal draft remain active.

**Compiler/provenance vertical ACTIVE on branch (2026-08-12):** persistent effects and material
lifecycles now carry exact structured origin `{root, phase, execution, step, slot}` validated against the
root's frozen program; duplicate or semantically mismatched emissions fail closed, including across a
transaction's pending next execution. Register mutation is an individual compare-and-swap physical
operation. Root allocation is a standalone zero-state segment before the exact frame is pushed. The
prepare/coordinator boundary recognizes replay before push; `compileMechanicsFrame` then re-proves reviewed
input and compiles only the authored step named by the exact nonterminal LIFO top cursor. The final phase
CAS is its own segment.
Its executable slice now
includes register/manual work plus exact condition, standing, Concentration and polymorph starts and
semantic end selection; unsupported steps still reject explicitly. The follow-up real-play audit found
additional P0 prerequisites (separately authorized overrides, THP source replacement, guarded effective
defense/healing/Exhaustion facts and death interrupts, reviewed payment debits, resource cardinality,
closed materialization, same-frame created selectors and enchantment transfer), so this is an honest
vertical rather than an engine-completion claim. Focused verification only; the sole full gate remains
reserved for the final rebased integration to `main`.

**Exact program-phase completion checkpoint CLOSED on branch (2026-08-12; compiler/coordinator
ACTIVE):** the exact program root's `phaseState` is the sole completion truth. One post-transaction causal
rebase derives `program-phase-completed` from the child's exact root generation, phase and execution,
latching current or overdue lifetimes while future executions remain live; the closure request carries no
duplicate completion state, and exact generation closes same-id ABA. Applied `program-phase-transition`
stages emit the authentic exact `program-phase-end` post-event for subscribers after ordinary events. Every
non-invocation evidence and its phase CAS receipt share that exact event id. Ending sources stay structurally
readable but are absent from every effective projection, so replacements can begin without double-active
state. Hostile APIs still reject a raw latched world; causal review and compilation re-prove the entire
transient and use only its canonical result. Focused verification is green (254 tests across nine suites);
by owner rule no global branch gate ran. The effect/lifetime/boundary checkpoint below is the current
continuation truth.

**Exact root/phase split + pending-frame checkpoint CLOSED on branch (2026-08-12; coordinator
ACTIVE):** root allocation and phase completion now have separate physical meanings.
`program-root-create` derives the complete zeroed phase map and initial registers without publishing a
completion; final `program-phase-transition` performs the exact selected-phase CAS and alone publishes
`program-phase-end`. Register writes remain individual CAS operations between those boundaries. A bounded,
unforgeable causal state now owns the exact LIFO frame stack: root creation is a standalone segment before
push, program operations belong only to the exact top cursor, and final phase CAS atomically marks that top
complete while the same causal rebase latches every lifetime made due by the new phase state. Compiler
barriers may bind the immutable input/cursor and frozen target generations, but never a
second world or progress model. Only focused verification runs during branch engineering; the global gate
remains reserved for final convergence. The per-step segmented compiler is closed; the active next slice
is the bounded fixed-point subscriber/end-wave coordinator.

**Effect/lifetime/qualitative-boundary compiler checkpoint CLOSED on branch (2026-08-12;
coordinator/runtime cutover ACTIVE):** exact condition, standing, Concentration and polymorph starts now
compile with stable target slots, structured provenance and enforceable lifetimes. Concentration has no
authored target: the receipt's exact caster is its single source of truth. Semantic condition removal
selects every active exact target + condition occurrence across roots, while standing, Concentration and
polymorph end selections are restricted to the current root plus the full fact/caster/form identity. Empty
sets are idempotent; nonempty sets and committed exclusive replacements remain explicit
`needs-coordination` barriers for the unfinished fixed-point coordinator, and same-frame conflicting
exclusive starts fail closed. Authored `occurrence-end` has one exact `childStepId` grammar that selects
all active direct children of that producer for the current root generation; `end-program` alone terminates
the root. Program conformance now rejects unreachable phase lifetimes and source-end
feedback. Rest/day boundaries allocate an exact monotonic ordinal before the checkpoint; rules match the
same selectors at or after their stored minimum, so effects created during boundary `N` begin at `N + 1`
and survive `N`. Shared-clock rebase resets that minimum from the destination timeline. The branch-only
`MaterialState` shape is schema 4; no schema-3 state was deployed or persisted, so no live migration or
compatibility path is needed. Checkpoints expose their exact boundary (or `null` for wave-only extension),
and only the kernel can brand a completion; an unavailable source retains authority solely through its
exact readable owned root. Focused verification is green (275 tests across nine affected suites); the only global gate remains
the final post-convergence, post-rebase push to `main`. Payment, vitality, material/resource steps, the
fixed-point subscriber/end-wave coordinator, remaining audited prerequisites, corpus transcription,
persistence/UI cutover and complete deletion of superseded executors remain active.

**Exact event-audience/dispatch checkpoint CLOSED on branch (2026-08-12; coordinator ACTIVE):** every
event is now an opaque process-local emission paired with its producing stage's exact `after` world, or
for `source-ending`, the re-proved readable end-wave world. Full semantic trigger proof freezes a canonical
root-generation/phase audience at emission; dispatch later allocates the current phase CAS, re-proves the
exact live root generation and authority, and does not re-evaluate mutable predicates. Only kernel-issued
selected-event frames may execute on readable-ending roots, `source-ending` children must resolve their
owning root, and those frames pin finalization through `phase-complete` until exact LIFO pop. Clones,
forgeries, reuse, ABA, stale authority and roots/phases created after emission fail closed. Only focused
affected-suite verification ran; by owner rule no global gate ran. The bounded fixed-point state
coordinator and the remaining compiler/runtime cutover are still active; this is not engine completion.

**Authenticated compiler-prefix projection checkpoint CLOSED on branch (2026-08-14; coordinator/runtime
cutover ACTIVE):** successful prefix projection is now a distinct process-local capability whose frozen
public value carries the exact projected world and cumulative inventory-source leases while a private
runtime fiber binds both to the original trusted causal basis. It is never a causal-state receipt: prefix
projection performs no end discovery, causal rebase or pending-phase acceptance, and clones, spreads,
serialization and reconstruction fail closed. Compiler context refresh authenticates that capability and
validates its readable world against the already-conformed basis and exact pending frames without
conforming or rebasing the projection. One authored step still expands into one atomic transaction; only
final simulation or the real phase commit performs the single causal rebase and latches the net endings.
The closing review resolved both open points: the kernel's transaction entries now re-prove the
already-authentic basis through `conformMechanicsCausalState` (a fixed-point re-proof that fails closed on
any non-canonical state) so a basis re-proof can never read as a world rebase, and a world containing a
one-execution-ahead program origin is constructible only through the kernel while its exact recoverable
frame is active — the phase-CAS proof builds its mid-frame state through the real create transaction.
Only focused affected-suite verification ran; no global gate ran. The fixed-point subscriber/end-wave
coordinator, remaining compiler/corpus work, runtime cutover and final journal draft remain active; this
is not an engine-completion claim.

**Application cutover OPEN — the world landed (2026-08-14):** every character now owns one
persisted mechanics world (`session.world`, schema-4 `CharacterMaterialState`), derived exactly once
from the legacy session and re-proved fail-closed on load. Casting runs through the replay-driven
`useMechanicsCast` hook → coordinator → one canonical `reduceActionJournal` commit with exact
undo (`undoCharacterAction`), all proved against the real mock and the transcribed corpus
(Cure Wounds end-to-end in the store test; the full requirement protocol in the hook render test).
Legacy session fields the world supersedes are write-through mirrors (a golden-rule-10 rollout
bridge deleted with the final document migration). The generated clause coverage report
(`docs/automation-coverage.generated.json`) counts 422 composed spells, 190 with complete
executable programs, 2107 clauses classified. Remaining cutover waves: boot-blocker consumer
migration (in flight), combat/rail/item surfaces, the legacy executor deletions, and the live
document migration. Focused verification only; no global gate ran.

**Corpus transcription OPEN → first family CLOSED on branch (2026-08-14):** the transcriber
(`src/lib/mechanics-transcription.ts`) compiles each composed spell's declarative facts into one
authored `MechanicsProgram` plus an honest clause-level classification DERIVED from the fields the
entity actually declares (slot payment, targeting/area, saving throw, damage components with
save-half and upcast scaling via the new `input.<id>.level` slot-level bindings, healing, Temporary
HP, condition application with structured lifetimes, cures, concentration with a `source-end` →
`end-program` release phase, root duration via the new authored program `lifetime`). A clause is
`automated` only when the emitted structure passes program conformance; physical rolls are
`physical-input`; area occupancy is `spatial`; table-owned ends and unstructured durations are
`table`; anything declared but not yet expressible is `unsupported` — never silently green. The
corpus-wide guard sweeps every composed spell with zero gaps, and the transcribed Fireball runs
END-TO-END through the coordinator over the real needs-answer protocol: slot debited 2→1 under a
caller-guarded slot definition, targets chosen, save rolled against the bound DC and failed, the
shared 8d6 observation applied full, the character correctly falling dying at 0 HP. Attack-gated
spells, pooled healing/THP, creature-type-gated bonus damage, cast-mod damage terms, recurrence,
follow-ups, deferred resolution, repeat saves and the 21 legacy `effectProgram` pioneers remain
explicit `unsupported` boundaries for the next transcription waves. Focused verification only; no
global gate ran.

**Boot restored + engine surfaces LIVE on branch (2026-08-14, second block):** the work worktree
boots again in real Chromium with a clean console — the missing item-resource persistence/command
family (`decodeItemResourceState`, the self-verifying `planResourceCommand`/`applyResourceOperation`
planner with exact reverts, the catalogue resource dialect) was implemented against its consumer
tests (204 green), and local dev no longer initializes App Check (localhost is not a registered
reCAPTCHA domain; `VITE_APPCHECK_DEBUG=true` stays the dev opt-in). The Spells tab now DISPATCHES
engine-executable SRD casts to the deterministic runtime outside combat (lazy `EngineCastFlow` →
the protocol modal: slot, targets, table-entered armor class for attacks, every physical die → one
canonical journal commit with exact undo); not-yet-transcribed spells keep the legacy transaction
until its deletion wave. Standing-buff casts (Hex's mark + active key, Divine Favor), pulse-phase
condition re-application (Web, Sleet Storm), full-restore healing and the `cantripInstances` beam
model (Eldritch Blast — first legacy `effectProgram` fully superseded) landed as waves 6–8;
`mechanicsProgram` opened the hand-authored canonical-program channel (clause classification
derived from the program itself) with Fire Shield as the worked example (choice → per-form
standing → `standing-present`-gated retaliation). The kernel gained the possession-safe
**root-pulse trigger** (the root's possessor declares each recurring/reactive event; single-use by
advance CAS on execution + trigger event id) and the coordinator now admits non-create roots by
pushing their frame before review — Moonbeam's pulse runs END-TO-END (register-scaled 3d10, failed
save, exact phase-state CAS), and the full serialize→parse→advance round-trip over the PERSISTED
`session.world` authenticates (the pulse surface: `useMechanicsPulse` + `EnginePulseStrip` reuse
the cast modal protocol). The consumer layer moved onto the canonical contracts in the same block
(d20 request/observation API across combat surfaces, the restored grant schema with the per-spell
free-cast tracker suffix — fixing a real shared-tracker regression — exact store d20 result types,
campaign fixtures on the migrated encounter model; tsc 556→171 via three agent sweeps), and the
rollout bridge now mirrors engine-held concentration (engine transitions only). Coverage:
**259/422 spells executable, ~36 unsupported clauses** — the remaining blockers are the 14 legacy
`effectProgram` migrations (authored-program agent in flight), consumable/pool-split healing,
two-target-set combos, and singletons. Focused verification only; no global gate ran.

**The cutover convergence waves CLOSED on branch (2026-08-14 fourth block through 2026-08-19; ten
checkpoint commits, public 549d9da..7112cd3 + pack bcc90a17/62a36ae7):** the S9 typed item-resource
wave consolidated (per-instance counters, atomic table-entered spend/recovery, the universal
entered-d20 kernel for death and concentration saves, the MechanicsCommand CAS path; PDF ledger and
dev-scenario builder aligned to the post-migration model; full census 18,943/18,943 green at the
consolidation point). Then, in one continuous multi-agent push: (1) the ADVERSARY ENCOUNTER WORLD —
the campaign encounter document carries an additive engine-owned layer re-proved fail-closed and
overlaid with doc-owned facts, DM damage/heal/condition taps and the universal resolver dispatch
through booked boundary programs, turn stepping fires the kernel's `complete-turn` (expiries
mirrored onto chips + chronicle in the same write), and chronicle undo reverts exactly through the
shared-root journal; (2) the TRANSCRIPTION FIXPOINT — zero blocked SRD spells (286/422 executable;
actions 45/231), the eight blockers automated with coordinator proofs (Divine Smite, Goodberry via
closed conjured-item blueprints, Ice Knife, Vampiric Touch over the new landed-damage ledger, Wall
of Fire, Geas, Greater Restoration, Mass Heal via expanded per-target integer inputs), turn-claim
emission from declared per-turn caps, and the feature-attack/pool-spend/weapon families (Graze and
Topple automated; census generated beside the spells file); (3) SOLO COMBAT ON THE CANONICAL TURN
WORLD — a local single-participant encounter on the character material, End Turn firing the kernel
boundary so booked lifetimes expire exactly, Extra Attack and per-turn caps enforced by the kernel,
economy mirrors exact; (4) the FIRST UI-READ MIGRATIONS — the sheet reads world standing
occurrences through one projection seam (engine Shield lifts AC with no legacy chip; a pre-existing
concentration-mirror resurrect bug fixed; every authoritative concentration drop ends the engine
occurrence canonically), and RESTS commit one journal action chaining end-encounter, RAW
advance-time and complete-rest with recoveries as world transitions; (5) PC PARTICIPANTS join the
shared encounter by identity-carried lease (members commit their own kernel start-encounter
boundary, pass-off boundaries fire per observed round, cross-material actions correlate as two
commits sharing one deterministic seed — the offline-first split-owner topology cannot carry the
kernel's atomic multi-document finalize, documented at the seam); (6) DISPATCH CLOSURE — runtime
context enrichment (monk class-die actions run end-to-end), Goodberry conjures and consumes in-app,
Mass Heal splits in the modal, one shared spell-gate truth serving SpellsTab, PlayTab and reaction
cards, and the two-action concentration swap (a coordinator replacement-livelock defect found and
documented; fix in flight). The Warlock pact-slot seed bug (wrapped cell rejected by the parser,
silently degrading every pact caster) was found and regression-pinned. Remaining active: the last
dispatch gaps (pact casts through the gate, target-bound standings, maintainers/use-applies), the
legacy deletion map L0-L3 (effectProgram fields + the branch-born combat-effect generation + the
main-era executor + bridge mirrors with the one-off live-document migration), convergence, and the
Italian architecture explainer. Focused verification only per wave; the one full dual-build gate
remains reserved for convergence.\*\*

**The fourteen authored programs CLOSED on branch (2026-08-14, third block):** every spell that
still carried only a legacy `effectProgram` now holds a hand-authored canonical-runtime program —
Ensnaring Strike, Searing Smite, Dragon's Breath, Acid Arrow, Spike Growth, Phantasmal
Force, Phantasmal Killer, Vitriolic Sphere, Contagion, Delayed Blast Fireball, Prismatic Spray,
Prismatic Wall, Storm of Vengeance and Weird — using register-driven counters (Delayed Blast's
beam accumulator rolls `register.beam-accumulator` d6 at detonation), choice-branched standing
keys (Dragon's Breath's five elements), repeat-save pulses with `end-program` on success, the
physical-table d8 ray rows of the prismatics, and possessor-declared `root-pulse` cadences for
every legacy `manual`/turn event. End-to-end proofs: Searing Smite (cast → strike → failing burn →
succeeding burn ends the program and its standings) and Delayed Blast Fireball (two accrues → 14d6
detonation, 42 damage, root consumed). Each deliberate simplification vs the legacy model is
recorded in the authoring agent's honesty ledger (per-target petrification series and destroy
qualifications stay table-owned; Contagion's root survives as the disease carrier because children
die with their root). The automation corpus registers the canonical `mechanics-program` handler
beside the legacy one. **Spell corpus stands at 273/422 executable, 8 spells blocked on 22
unsupported clauses out of 2,716 (99.2% resolved); the ~141 remaining non-executable spells are
purely narrative (no mechanical steps to automate).** The FEATURE-ACTION wave opened in the same
block: `transcribeFeatureAction` compiles the tracker-payment family (Second Wind end-to-end:
seeded pool 2→1, 1d10 + resolved class bonus, the spent use mirrored onto the legacy tracker),
with the 166-action census mapping v2 (standing/spend-only ≈42, feature attacks 4, cures 3).
Focused verification only; no global gate ran.

**Transcription waves 2–5 CLOSED on branch (2026-08-14):** the attack gate (per-target-slot attack
requests vs bound armor class with the caster's attack bonus; hit/crit damage through two
outcome-expanded roll inputs — crit dice doubled, flat bonuses never; misses self-resolve their
empty roll requirements engine-side), combined attack-then-save gates (Ray of Sickness: the save
only on a landed hit via an `answer-d20` predicate), per-instance dart rolls (Magic Missile),
2024 cantrip scaling (damage dice by character level, or `cantripInstances` scaling beam SLOTS
with fixed dice — Eldritch Blast is the first legacy `effectProgram` fully superseded
declaratively), flat + full-restore healing (Heal / Power Word Heal), and RECURRENCE — a
table-signaled `pulse` phase re-running the whole resolution suite with phase-prefixed identities,
the cast level carried by a program register, deferred zones (Moonbeam) resolving nothing at cast,
and repeat-save `end-program` (Searing Smite). Two kernel laws landed with the waves: omitted-input
selectors resolve to zero targets at compile (review-completeness proves omission), and
turn-boundary lifetimes outside an encounter freeze to their 6-seconds-per-turn timeline
equivalent. Coverage now: 422 composed spells, 234 executable programs, unsupported clauses down
to 49 (15 legacy `effectProgram` migrations + healing-pool/consumable, two-target-set combos,
deferred standing riders, per-part cast-mod attribution, and singletons). Scorching Ray,
Fire Bolt, Magic Missile, Ray of Sickness (hit and miss paths), Moonbeam (deferred cast) and
Eldritch Blast (3 beams at L11: hit/crit/miss) all run END-TO-END through the coordinator
protocol. Pulse EXECUTION end-to-end awaits the table-authority action seam (the
`manual-table-event` evidence demands a material-authority actor) — queued with the cutover.
The 6 live-team fixtures derive canonical worlds (pack conformance suite green). Focused
verification only; no global gate ran.

**Authored step census COMPLETE on branch (2026-08-14):** every one of the 24 authorable
`MechanicsStep` kinds now compiles into exact kernel operations — the last two being `turn-claim`
(one `turn-economy-transition` per resolved combatant, its effective projection supplied by the
caller and re-emitted by the kernel as a commit-validated fingerprint guard) and
`incoming-damage-adjustment` (conformance-locked to `damage-taken` phases; the reaction compiles as
an exact compensating reduction bounded by the triggering resolution's effective damage, proved
end-to-end by a Deflect-style ward reducing 6 incoming fire to 3 within the attacker's own causal
action). The remaining audit items — table-override authorization, source-specific Temporary-HP
replacement teardown, death-prevention standing policies, enchantment attach/transfer, same-frame
created selectors, the explicit critical-hit resolver input and replayable manual outputs — are
data-shaped: they acquire their real consumers during corpus transcription and application cutover
and are tracked there. Focused verification only; no global gate ran.

**Resource and payment compilers CLOSED on branch (2026-08-14):** the reviewed-payment prelude now
compiles every resolved resource debit (chosen slot/pool payments and d20/dice riders) exactly once,
deterministically before the first authored step of the frame's first segment; authored
`resource-change`, `resource-recover` and `resource-state` steps execute through exact
`resource-transition` operations. Resource definitions resolve fail-closed from caller-guarded
`resource-definition` facts or the capability snapshot's own closed pool specs (whose guard the
compiler then emits itself), and kernel `needs-observation` requests attach recorded dice
observations from the response ledger and retry — proving the full suspend/record/resume cycle for a
rolled Dawn-style recovery end-to-end. The review layer now issues possession-proofed reviewed
intents: mutable eligibility (payment affordability, target liveness) is proved exactly once against
the closed basis that reviewed it, and later compile segments authenticate the same frozen value
instead of re-deriving truths the action itself has legitimately consumed — a cloned or reconstructed
review still re-derives fully and fails closed on any drift. Focused verification only; no global
gate ran.

**Lifecycle step compilers CLOSED on branch (2026-08-14):** authored `entity-create`,
`inventory-create`, `entity-change`, `entity-end`, `inventory-change`, `inventory-end` and
`end-program` now compile into exact kernel operations. Creations materialize from CLOSED blueprints
carried inside the capability snapshot (`snapshot.blueprints`, canonical opaque records re-proved by
the full material conformer at the exact point of use, so catalogue lookups never happen at runtime
and a malformed blueprint fails the authored step closed); each creation writes its material
lifecycle with the resolved lifetime and exact preallocated generations. `end-program` is conformance
-enforced terminal and its root end request travels through the compiled segment to the coordinator,
which latches it at the frame's pop — the only moment the kernel permits an ordinary frame's own root
to end — so a one-shot program's damage persists while its root, children and lifecycles vanish in
the same causal action. Proved end-to-end: the one-shot damage program, a closed-blueprint companion
summoned under the caster's control, and a conjured item copy. Focused verification only; no global
gate ran.

**Vitality step compilers CLOSED on branch (2026-08-14):** `compileMechanicsFrame` now compiles
authored `damage`, `heal`, `temporary-hit-points`, `clear-temporary-hit-points`, `exhaustion-change`,
`stabilize` and `death` steps into exact kernel operations. Damage builds one packet per expanded
target, resolves it against the target's effective defense profile (standing `damage-defense` facts
merged with the custom-template/override material profile), consumes recorded damage-allocation
observations and suspends with a single-use continuation when the table must allocate a flat
adjustment; creature maximums come from caller-guarded `hit-point-maximum` facts (re-emitted and
validated by the kernel) or the material template, and zero-HP policy defaults to the 2024 rule
(characters fall dying, other creatures die). Temporary HP creates its per-target source occurrence
and grant atomically, with the emptied source discovered and ended by the causal wave. Proved
end-to-end through the coordinator: multi-part damage through resistance firing a damage-taken
reaction in the same action, allocation suspend/resume (the response-accept path), source-bound THP
grant/clear with automatic source ending, exhaustion gain, and fail-closed missing-maximum
rejection. Focused verification only; no global gate ran.

**Bounded causal fixed-point coordinator CLOSED on branch (2026-08-14):** `runMechanicsCausalAction`
is the one driver for one complete causal action: root review against the closed entry basis, the
standalone root-create transaction, the LIFO pending-frame compile loop, frozen event audiences
dispatched depth-first at their exact baseline depth, subscriber frames with intrinsic
trigger-event-id dedup, readable end waves delivered exactly once per basis then finalized, boundary
checkpoints driven by a non-finalizing checkpoint mode, terminal material cleanup, and exactly one
`planMechanicsWorldAction` journal draft. Suspension is replay-shaped: review requirements and compiler
requests surface with deterministic frame identities, and the caller re-invokes with extended
answer/response ledgers — nothing coordinator-owned serializes. Proved end-to-end: a two-phase
program-phase-end cascade completing in ONE action, wave-coordinated Concentration replacement across
roots, needs-answer suspension and replay, work-budget exhaustion, and pending-frame entry rejection.
The boundary path and the response-accept path get their end-to-end proofs with the entity/resource
compilers. Focused verification only; no global gate ran.

**Authentic response resumption CLOSED on branch (2026-08-14):** compiler continuations now exist only
for genuine user responses. The private fiber binds the exact issuance causal state by identity plus the
reviewed input, expected cursor, consumed response prefix and issued request; consumption is single-use
even when the resumed compilation then rejects; resumption must extend the prefix by exactly one answer
to the issued request; an unanswered, unconsumable or unused response fails closed. `needs-coordination`
now carries only its typed coordination value — the coordinator latches/finalizes end state and restarts
ordinary compilation on the mutated basis instead of resuming a fake continuation. The accept path
becomes exercisable with the first observation-bearing step compiler; every reject path is proved now.
Focused verification only; no global gate ran.

**Deterministic automation gap sweep — ACTIVE (2026-08-04):** six truth-gated milestones are closed and
branch-pushed: persistent/reactive-effect lifecycle, target-bound on-hit retaliation, variable-level
charged-item casts, activated-item tracker/timer lifecycle, bounded spell-pool execution, and variable
healing-pool execution. Lay On Hands now applies reviewed healing and paid condition cures together with
one exact live-validated pool debit; Recover Vitality chooses its d10 count before target review, then
heals from the entered roll. Both share solo/encounter targeting, peer-offline delivery, exact resource
undo and stale-redo guards; own-sheet effects reverse with that same undo, and inline homebrew actions use
the same typed capability. Divine
Intervention, War God's Blessing and multi-spell items now rejoin the ordinary resolved-spell pipeline after
the spell pick: configuration precedes target review; action economy, deterministic effects, concentration,
structured log/Chronicle provenance, exact tracker payment and undo share one path. Typed source overrides
also preserve fixed save DCs and War God's Blessing's concentration-free 10-round persistent/recurring
state. Item-only spell visibility cannot invent a class-slot route, shared-resource homebrew pools select by
stable source id, and stale commit/redo proposals cannot overdraw live slots or charges. The remaining
deterministic corpus audit follows as separate, truth-gated milestones; queued UI dogfood remains after
engine closure. Nothing from this sweep merges to `main` without the owner's final permission.

**Canonical PC damage transition CLOSED on branch (2026-08-05):** open-sheet/solo damage and
fresh-read peer-PC damage now share one pure reducer for resolved-vs-raw intake, Temporary HP, damage at
0 HP, Stable reset, critical failures, knockout/massive death, Unconscious, Warding Bond transfer and
Death Ward consumption. Focused adapter-parity tests execute the same packets through both production
paths. A duplicated local active key + projected occurrence is consumed together and removed from the
current projection, preventing a second local trigger. **Next orchestration seam:** self-target encounter
damage must revoke/restore the consumed occurrence in the authoritative campaign ledger and apply/reverse
returned partner transfers through the shared transaction. The current optimistic projection filter is
intentionally not claimed as reload-durable or as the complete inverse.

**Occurrence-based combat outcomes CLOSED on branch (2026-08-05):** reviewed attacks, saves and
damage-reduction reactions now emit locale-free receipts keyed by exact turn, action use, target and,
when the table supplied it, exact instance. Aggregate hit counts remain explicitly aggregate instead of
inventing ray/swing order. A monotonic persisted ordinal keeps repeated uses distinct; actions, Attack
swings and the spent Reaction own their occurrence ids, so hydration rejects dangling/forged receipts and
undo/re-arm removes only the matching facts. Follow-ups use typed predicates (`requiresOutcomeThisTurn`),
with Deflect Attacks redirect migrated off its former coarse success boolean. Critical hits are admitted by
the engine contract but remain unproduced until an explicit table input is added to the resolver UI.

**Ordered combat occurrences CLOSED on branch (2026-08-05):** multi-hit attacks, rays and missiles
now cross defenses, Temporary HP, 0-HP rules, one-shot floors and successful-hit retaliation one entered
packet at a time instead of collapsing into one total. Death Ward can stop the first qualifying packet
without erasing later hits; damage at 0 accrues per hit; per-hit retaliation repeats while its exact
effect remains active. Ordinary actions, Attack swings and Reactions now publish their owner plus all
validated receipts in one Zustand mutation, and every undo/re-arm removes or restores that pair in the
same mutation, so the persisted turn writer cannot observe an owner/fact half-state. Fixed and timed
active states also share the same declarative `endsEarlyOn` trigger consumer. The separate campaign
effect/inverse transaction remains the next orchestration seam described above.

**Entered-D20 lifecycle vertical CLOSED for solo play on branch (2026-08-05):** one locale-free,
JSON-plain kernel now validates the exact physical d20 face input, nets Advantage/Disadvantage, selects
the natural face and resolves typed outcomes without rolling. Death Saves rebuild live all-save,
Exhaustion and critical-threshold facts at every commit/replay. Damage while concentrating persists one
FIFO prompt per authored packet with its exact capped DC; resolution rebuilds the live CON save and
Concentration-only facts, then advances the queue or runs the canonical full teardown. Malformed or stale
prompts fail closed, and Death Saves, save results and lethal damage all own causal compare-and-swap
undo/replay across character, log, active effects and the persisted queue. The campaign-target bridge
remains part of the shared resolver transaction: it must load the target PC's parent session, enqueue the
same combat-subdocument prompt and reverse it with the campaign effect rather than adding a second rules
path in `campaign-io`.

**Physical magic-item resource architecture CLOSED on branch (2026-08-05; corpus migration ACTIVE):**
mutable items now have exact physical-copy identity and a typed catalogue-defined counter model with
strict persistence parsing, pure spend/gain/recovery planning, whole-item revisions, atomic multi-copy
boundaries and causal fact-preserving undo/replay. Combat actions, item spell casts, alternate costs,
Inventory controls and rests share one command/input/CAS provider; a cancelled roll, lost reaction,
unequipped owner or stale state changes nothing. Dawn and Dusk are explicit Table Clock declarations,
not Long Rest or device-time aliases, and exact recovery cadence renders in EN+IT. A disposed copy stops
contributing every grant and intrinsic equipment calculation. The typed scalar proof set is now 30
items: 26 public items plus the pack Spirit Board, Mythallar Cloak, Niko's Mace and Wave. The public
set is the original Wand of Magic Missiles/Winged Boots pair plus the first 24-item source-verified
counter wave; it includes variable-cost wands/staves, explicit last-charge rolls and their distinct
destroyed/nonmagical outcomes. The pack closure removes three false Long-Rest/Dawn tracker aliases:
Mythallar and Niko now recover their entered d10/d6 charge rolls at Dawn, while Wave owns an entered
d3 charge pool and an independent full-at-Dawn Globe use. This closes exact counter ownership and payment
for the casts/properties already structurally authored; it deliberately does **not** claim the same
items' still-prose-only properties (for example Reflect Enchantment, Insect Cloud and Tree Form). The
composed magic-item census is repairing those action clauses and migrating the remaining scalar,
multi-resource and collection corpus in separate source-verified waves. Item-id trackers,
`ref.charges`, the false Long-Rest/Dawn alias and the one-off live migration cannot be removed until the
catalogue guard reaches zero and every live current doc + saved snapshot passes the post-migration check.
The guarded one-off `scripts/migrate-item-resources.ts` is prepared and locally proved in composed and
SRD-only modes: dry-run/check are read-only, apply requires a fresh private backup directory, every write
uses the discovered `updateTime` precondition in one ≤500-document batch, and reread/global/idempotency
checks follow. It has **not** been run against production; the autonomous snapshot-verified live apply
and immediate superseded-path/script deletion remain open.

**MechanicsCommand transaction seam — resource conversions CLOSED on branch (2026-08-05):** Font of
Magic in both directions, Nature Magician and Pact-slot recovery no longer execute captured
`CommitOp[]` through sequential clamping mutators. A locale-free `resource-conversion` command stores
only the stable source, conversion and player's selected level/amount; every execute and redo re-resolves
the live grant, class gate, affordability and headroom, rejects non-safe numeric facts, and compiles all
touched owners into one canonical compare-and-swap plan. The character store validates every leg against
one snapshot, mutates slot/tracker maps in one Zustand notification and schedules one persistence flush;
undo applies the receipt's exact causal inverse and stays retryable on conflict. This is the first generic
owner-state command member, not a claim that casts/actions or campaign-owned effects have migrated yet.

**Composed spell-source census — first exact data wave CLOSED on branch (2026-08-05):** the audit
started from the actual public + private spell catalogues and 2024 rules source rather than prior
coverage claims. Feather Fall now carries its exact five-creature target ceiling, Hold Person models
one additional target per upcast level, Slow carries its six-enemy ceiling, and Conjure Barrage /
Conjure Volley now expose their exact Force-damage and Dexterity-save packets (including Barrage's
upcast progression). Trigger eligibility, repeat-save lifecycles, geometry and material handling stay
explicitly outside this narrow data correction and remain engine work, not falsely claimed automation.

**Live-team truth audit — activation-scoped resources CLOSED on branch (2026-08-04):** Santaera's
future Zealot progression exposed a false rest approximation: Fanatical Focus is once per Rage, not
once per Short Rest. `TrackerSpec.refreshOnActivationOf` now declares that lifecycle using the same
stable active-state key as Rage. A fresh activation refills every linked tracker atomically; repeat
commits against an already-active state and the explicit Extend Rage action do not. The standard
action undo restores the exact prior tracker state. Resolved trackers, custom/homebrew tracker data,
compendium copy and the live feature ledger all share the primitive, and the real Santaera fixture at
level 6 proves activation, recovery metadata and reversal without any Barbarian-specific store code.

**Live-team truth audit — source-qualified condition immunity CLOSED on branch (2026-08-04):**
Chiaviddu's Fey Ancestry now models immunity to the `sleep` spell's Unconscious effect without granting
blanket immunity to Unconscious. `condition-immunity.sourceId` is a generic data primitive carried from
the grant aggregate through live party stats and encounter target snapshots. The universal resolver
uses it only to suppress the safe automatic default; the target card labels the immunity and still lets
the table explicitly apply the condition as an override. Public evaluator/resolver regressions and the
real Chiaviddu fixture lock the distinction without an Elf- or spell-name branch in React.

**Persistent-spell lifetime contract CLOSED on branch (2026-08-04):** the composed-catalogue census
found 34 persistent spell effects whose mechanical grants could activate but had no structured expiry.
Every spell-owned `while-active` state now declares its real fixed lifetime; Hex and Hunter's Mark add
slot-level duration tiers. One pure selector feeds cast configuration before target review, self timers,
exact-target encounter effects and Short/Long Rest expiry from the stored cast level. A whole-catalogue
guard (mutation-proved against Bane) prevents any future persistent spell from shipping without an
enforceable duration or with inconsistent minute/round math. The six-fixture feature audit continues.

**Condition-lifetime + explicit Rage maintenance CLOSED on branch (2026-08-04):** every condition
application in the composed spell catalogue now declares a typed maximum: source/Concentration,
fixed time, exact actor/target turn boundary, or manual table-observed end, with per-condition
overrides and slot tiers where RAW differs. Encounter occurrences expire independently; Geas resolves
30 days / 365 days / indefinite before target review; Symbol keeps its 1- versus 10-minute outcomes;
solo casts persist the same occurrence shape in `combat/state`, survive route/reload, compose with the
campaign projection and expire at the same exact boundary. Expired source state ends Concentration and
one undo restores the full timer/cast/log projection. Whole-catalogue guards cover initial and recurring
applications. The same audit found that Rage's documented
Bonus-Action maintenance was only a cost-free override: Santaera now gets a real **Extend Rage** action,
available only while raging, occupying the durable Bonus slot without consuming another Rage use.
Feign Death now projects Speed 0, Poisoned immunity and every non-Psychic resistance in addition to its
two conditions. The non-VTT early exits remain explicit corrections rather than fabricated observation.

**Live-team truth audit — Divine Fury damage choice CLOSED on branch (2026-08-04):** Santaera's
Zealot rider no longer silently forces Radiant damage. `damage-rider` now models a non-empty
per-hit type choice as first-class data; aggregation keeps a backward-compatible fallback while the
shared rider chip shows every option and `CombatResolver` requires the actual choice whenever the
rider is used. The selected type enters the ordinary per-component defense math, transaction and
undo path. The primitive is feature-agnostic, so future content and homebrew riders inherit the same
behavior without a Zealot branch. Public pipeline tests and the imported Santaera contract pin
weapon and Unarmed Strike parity. The six-fixture deterministic census continues.

**Live-team truth audit — Barbarian/Monk follow-up CLOSED on branch (2026-08-04):** two remaining L3
facts that were still prose now use reusable engine primitives. Primal Knowledge projects a typed
optional STR ability onto its five active checks only while Rage is active; the cockpit and PDF share
the same derivation and passives remain unchanged. Deflect Attacks now asks for the observed incoming
amount/type and physical d10 roll, adds DEX + Monk level, routes only the remainder through the ordinary
defense/Temporary-HP/undo pipeline and exposes its 1-Focus redirect only when that reduction reached 0.
The successful Reaction receipt survives navigation/reload. Redirect then uses the ordinary free-target
→ DEX-save → entered-damage → resource/log/undo flow. Martial Arts dice scale by Monk level and Deflect
Energy widens eligible types at L13 (every damage type) through the generic level-threshold resolver.
Public unit contracts and the real Santaera/Bo fixtures lock both behaviors; the wider deterministic
corpus audit continues.

**Live-team truth audit — Divine Fury attack scope CLOSED on branch (2026-08-04):** the audit caught
a green-test rules defect: Santaera's Divine Fury was restricted to melee weapons even though the 2024
feature applies to any weapon or Unarmed Strike. The reusable `weapon-or-unarmed` rider scope now covers
melee weapons, ranged weapons and Unarmed Strikes through the one shared attack resolver. Public
SRD-only scope regressions plus Santaera's real Shortbow/Greatsword/Unarmed rows prevent the content
contract from silently narrowing again.

**Live-team truth audit — Rage contract CLOSED on branch (2026-08-04):** the Barbarian fixture exposed
a stale 2014 maintainer and two missing 2024 restrictions. Rage now declares no-spell/no-Concentration
and Heavy-armor/Incapacitated incompatibilities as generic active-state data. Every cast route is
hard-gated, activation ends held Concentration with exact undo, condition/equipment changes end the
state, and taking damage no longer falsely maintains it. Fixture-driven regressions cover activation,
duration, blockers, aggregate effects and the composite undo. Bard/Wizard/Rogue/Paladin fixture audits
continue as separate truth-gated milestones.

**Live-team truth audit — Monk contract CLOSED on branch (2026-08-04):** the fixture exposed a
false-positive automation claim: Uncanny Metabolism restored Focus on every Initiative without spending
its 1/LR use and never applied its heal. It is now one optional atomic action that spends the use,
restores Focus, resolves the entered Martial Arts die + Monk level as healing, persists immediately and
undoes exactly. The generic action schema now supports tracker top-ups (including homebrew overrides),
and the target compiler no longer misclassifies explicit self-target effects as enemy-only in solo play.
Step of the Wind now exposes both the free Dash and the 1-Focus Dash+Disengage/double-jump variant. The
real Bo fixture proves the rendered action → target review → healing/resource commit → undo path.

**Live-team truth audit — Bard contract CLOSED on branch (2026-08-04):** Bardic Inspiration
previously spent the Bard's use but delivered no die. It is now one typed ally-target effect: the
level-scaled die reaches an online or offline party member, or an encounter-owned NPC ally, through the
same reviewed transaction as other combat effects; persists in the recipient's `combat/state`; appears
in target context; logs exact actor/action provenance; and has explicit spend/correction and rest expiry.
The additive read fallback preserves existing held dice while establishing the subdoc as the only new
write home. Pure support actions no longer create fake attack declarations. The real team fixture
locks CHA uses, d6 scaling and the ally/exclude-self target contract. The live Bard's Musician feat now
models Encouraging Song as a 1/rest generic resource action: its `PB` target cap resolves before review,
Heroic Inspiration reaches online/offline PCs or NPC allies without stacking, the target card exposes an
already-held token, and the Chronicle records actor + action provenance. Heroic Inspiration now shares the
combat-state SSOT and additive legacy fallback used by held Bardic dice, so spending and peer delivery cannot
fork parent/subdoc state. Wizard/Rogue/Paladin fixture audits
continue as separate truth-gated milestones.

**Live-team truth audit — Diviner Portent contract CLOSED on branch (2026-08-04):** the tracker
previously counted uses but discarded the two d20 results the player must physically roll after a
Long Rest. A generic recorded-roll tracker now stores one bounded value per remaining use, spends the
exact chosen result with correction/undo, survives navigation plus schema-3 export/import, and clears
through the normal recovery seam. The app still never rolls dice. The same opt-in is available to
homebrew feature trackers, and the real Wizard/Diviner fixture locks the 2→3/LR d20 contract. The
fixture's combat-spell audit is closed in the next milestone below; Rogue/Paladin follow.

**Live-team truth audit — Wizard combat-spell contract CLOSED on branch (2026-08-04):** Briox's full
prepared combat loadout now has a fixture-level resolver contract. Shield declares its real trigger and
expires at the exact next turn-start with composite undo. Mind Sliver persists a typed −1d4 on the exact
target's next save, shows it during target review, consumes it only when that save is adjudicated and
restores it on undo. The audit also caught two omitted cantrip riders: Chill Touch now blocks HP recovery
for PCs (including offline peers) and exact monster instances without blocking condition cures; Ray of
Frost projects its −10 ft/−3 m Speed until the caster's next turn. Ice Knife, Sleep, Magic Missile and
Cloud of Daggers are locked to their attack/save, free-target, instance and recurrence shapes; Misty Step
and Mage Hand correctly remain table-positioning actions because the app is not a VTT.

**Live-team truth audit — Rogue/Assassin contract CLOSED on branch (2026-08-04):** Chiaviddu exposed
three prose-shaped seams. Sneak Attack is now a Finesse-or-Ranged `damage-rider` whose per-turn tracker
is spent only with the reviewed hit and restored by the same undo. Steady Aim persists its one-attack
Advantage and movement lock through navigation, consumes only the roll on the next attack, and rejects
use after movement. Cunning Action is three real Bonus Actions—Dash, Disengage, Hide—routing through
the universal movement/economy/Stealth-check seams. Assassinate's round-1 Rogue-level damage now appears
only after Sneak Attack is entered on the same hit; the target/order facts remain table-supplied. The
real fixture locks all four contracts plus Alert and the subclass's scoped initiative/first-strike rules.
The Paladin and final six-fixture conformance passes follow.

**Live-team truth audit — Paladin/Vengeance contract CLOSED on branch (2026-08-04):** the real fixture
exposed a false default Fighting Style and four target-state gaps. Class inference now grants only the
features named by the level table plus the selected subclass; an explicit historical choice remains
lossless, but an orphan catalogue option can never silently add +1 CA. Bless projects +1d4 to every
attack/save on each selected ally for the Concentration lifetime. Vow of Enmity is a feature-owned exact
target mark; after that creature reaches 0 PF its free transfer preserves the original duration and spends
no second Channel Divinity. Divine Smite adds its separate +1d8 only for Fiends/Undead. Searing Smite
separates initial damage from the bound target's start-turn damage/save loop, preserves upcast level,
ends both sides on a successful save and restores them on undo. Compelled Duel now records its exact
failed-save target for the Concentration lifetime. The real fixture locks CA 20, Lay On Hands 15, Channel
Divinity 2, Lucky 2 and every resolved target contract. The final six-fixture conformance pass follows.

**Live-team truth audit — six-fixture combat conformance CLOSED on branch (2026-08-04):** the final
Carretto pass imports all six real portable characters and pins every battle-bearing action they expose.
Any character now gets one resolved Unarmed Strike; Martial Arts and Flurry reuse that compiler, enforce
their prior-Attack/once-per-turn rules and emit the real one/two-strike sequence (three from Monk 10).
Reckless Attack is one reversible free action ending at the next turn start; Danger Sense is declaratively
suspended by Incapacitated. Bane/Bless affect exact targets' attack/save rolls, Faerie Fire affects
incoming attacks against freely selected failed-save targets, and Vicious Mockery affects only the
target's next attack. Hex/Hunter's Mark are target marks, not fake immediate damage. Species/feat spells
derive DC and spell attack from their own ability even without a class Spellcasting block (Chiaviddu's
Drow Faerie Fire = CHA DC 12). Contracts cover the Bard, Diviner, Assassin, Vengeance Paladin, Mercy
Monk and Zealot Barbarian; condition lifetime and remaining corpus seams continue separately.

**Live-team truth audit — Alert contract CLOSED on branch (2026-08-04):** Alert's +PB initiative bonus
was already computed, but its willing-ally Initiative Swap was still prose. During gathering, the DM can
now choose an Alert-bearing PC and any willing PC/NPC ally with initiative. The encounter stores only
that reviewed pair, applies it over the live preview without rewriting either raw d20, and freezes the
result through the existing turn-order SSOT. The choice can be replaced or removed before turns begin;
invalid/enemy/dangling pairs are rejected or cleaned. UI and reducer/view regressions cover apply,
reopen, remove, sequential swaps, NPC allies and participant removal; Bo and Chiaviddu's real fixtures
pin the feat and their exact +PB totals. The real-team long-tail audit continues with Lucky and Savage
Attacker.

**Live-team truth audit — Origin-feat follow-up CLOSED on branch (2026-08-04):** Lucky now exposes its
two distinct PB/Long-Rest spends (grant Advantage to self or impose Disadvantage on an attacker) through
one shared tracker, while Santaera's Savage Attacker contract is pinned to once per turn and weapon-only.
Briox then exposed a grandfathered Magic Initiate choice whose known spell had never received its free-cast
provenance. The engine now detects only that verifiable absence and routes the player through the normal
feat spell picker; selecting an already-known spell enriches the existing ref without duplication, fixture
rewrites, guessing or overwriting another feature's provenance. Once complete, the ordinary cast/resource/
undo pipeline takes over. The six-fixture long-tail audit continues with equipment and item resources.

**Live-team truth audit — equipment combat contract CLOSED on branch (2026-08-04):** the real fixtures
now pin the Bard's imported Potion of Healing (Bonus Action, 2d4+2, exact quantity spend), both carried
shortbows to their exact 20-arrow stocks, the Paladin's custom weapon overrides (+6 / 1d8+4) and
plate+shield AC 20, plus the worn Half Plate/Plate Stealth Disadvantage. The discovered deterministic
gap is closed generically: ordinary equipment can own the same declarative tracker/action shape as a
feature. The Barbarian's Healer's Kit therefore exposes one ten-use Utilize action that targets only an
unstable 0-HP PC, works for an offline table-mate, preserves 0 HP + Unconscious, sets the death-save track
to Stable, writes exact Chronicle provenance, survives Long Rest as a manual stock, and undoes exactly.
The six-fixture long-tail audit continues with remaining inventory/resource lifecycle seams.

**CODE-COMPLETE encounter correction + battle-resolution overhaul — HELD for owner screenshot approval
(2026-08-03):** dogfooding found two encounter UI regressions: the light-theme compact single-encounter topbar chip inherited dark
ink for its nested glyph/count despite the carved socket's correct fixed ink, and the end-encounter
Chronicle dialog bypassed the shared modal body/footer spacing grammar. The compact lead now inherits
the socket's fixed light ink (real-Chromium dark/light + single/multi/desktop coverage; 9.40:1 in the
reported light case). The dialog now composes `ModalBody` + `ModalFoot`, owns one shared scroll region,
and renders with the canonical safe field/pinned actions across dark/light × desktop/mobile. The
systemic seam is closed too: every `ModalShell` host is source-derived by the modal guard and must use
`ModalBody`, `ModalScrollColumn`, or the reviewed compound-app `ModalStage`; raw nested scrollers and
unreviewed stages fail CI. The active summary is now one compact struck-folio command dossier with an
attached Chronicle timeline rather than a loose dashboard row.

The battle mechanic now resolves structurally modeled attacks, saves (including non-damage saves such as
Vicious Mockery), damage, healing, multi-instance/area effects and condition changes through one compact,
responsive target/outcome/effect modal. Harm defaults to enemies, healing to allies, while **Any creature**
and per-target conditions preserve rulings/homebrew. Effects wait behind the real action/cast/reaction
commit and land as one generic, transaction-safe batch; cancelling any nested choice spends/applies
nothing. Legacy monster groups conform idempotently into separately named/targetable creature instances.
The DM can directly override every live value and now one-tap reverses both monster HP and condition
Chronicle mistakes. Finally, initiative entry was reproduced in real Chromium: the old re-sort teleported
the edited card by ~283px; scroll compensation plus a reduced-motion-safe FLIP transition now explains
the move continuously. Per-roll and once-per-cast damage bonuses are now distinct engine facts: Empowered
Evocation remains valid on Magic Missile but is assigned to exactly one reviewed damage roll instead of
being multiplied across every dart. The same audit closed Potent Cantrip's stale prose-only gap through a
generic spell-outcome grant: declared misses/successful saves now deal half damage automatically while
additional effects remain gated. Life Cleric healing now follows the same doctrine: Blessed Healer applies
one slot-scaled self-heal only when another creature is healed, and Supreme Healing computes the scaled
maximum with no fake roll input. Unit, rules and focused Chromium regressions cover the seams. Not merged pending
the visual gate (golden rule 25).

**URGENT dogfood corrections — CODE-COMPLETE, HELD for owner visual approval (2026-08-03):**
peer healing/damage/conditions now fresh-read and update the recipient's narrow `combat/state` directly
in the same transaction as the Chronicle, so the recipient may be offline; campaign membership rules
permit only that combat slice and revoke immediately on removal. Turn economy persists under an exact
fight/round/actor key through a field-scoped writer, so group↔sheet navigation neither resets actions nor
clobbers concurrent HP. The resource rail also dropped its obsolete pre-commit preview: a committed cast
now has one slot debit and one durable turn receipt, never a second “pending” gem after navigation.
Slot/tracker mutations also coalesce an immediate save flush after the composite cast, closing the
short receipt-vs-resource race without making ordinary text editing write on every keystroke.
The bypass dev runtime now reproduces the production document lifecycle instead of mixing regenerated
fixtures with no-op persistence: one versioned local replica backs character parent state, the separate
combat subdoc and campaigns, including optimistic/local echoes, cross-tab snapshots and hard-reload
survival. Fixtures are seed-only and `?reset-dev=1` explicitly reseeds them. Real-browser proof casts Bane
(L1 2/4 → 1/4), hard-navigates sheet→campaign→sheet and reloads again; the spent slot and durable “Used”
turn receipt remain aligned on every mount (the former bypass reset reproduced 2/4 + available).
Manual dogfood now has a stronger one-command lane too: `pnpm dev:emulators` starts and owns a seeded,
demo-project-only Auth/Firestore/Storage/Functions sandbox, auto-signs into a real local Auth account and
runs the production adapters/rules/listeners/transactions instead of any bypass. The local replica remains
only the fast screenshot/E2E lane; permission, multi-client, offline, Storage and callable checks use the
emulator sandbox.
Gathering adds explicit self skip/rejoin and DM partial begin; NPC allies are
first-class, targetable, budget-neutral combatants with one reversible side field. Legal composes the
Compendium tome texture in both themes. Publishing a GitHub Release now triggers the tag-pinned deploy;
manual dispatch/local deploy remain fallbacks and ordinary pushes never ship. Emulator rules (134) plus
focused state/engine/UI regressions are green; screenshot matrix and full gates remain before merge.

**Released on `main` at v0.23.1** — the same version **deployed to production**
(https://d20-folio.web.app, workflow-confirmed live 2026-08-03), so `main` and live are currently **in
step**. Deploys stay owner-gated (golden rule 22), so `main` may run ahead of live at any time.
**6 real users** have been playing since 2026-06-08. The repo went **open-source + split-repo**
(2026-07-17), the **full-BG3 identity pivot** is **COMPLETE** (asset integration closed 2026-07-24 —
PROMPT*12–25 all resolved, the ledger below; the tome-leaf remasters 28/29 closed 2026-08-01), and
Claude Code/Codex project parity is **SHIPPED** (2026-08-02 — one shared briefing and one shared
Impeccable installation, exposed through each harness's native discovery path), and
the **DDB-parity feature epic** is now **ACTIVE** (OPENED 2026-07-23) with its **bestiary flagship
SHIPPED** (2026-07-24), the **encounter picker SHIPPED** (2026-07-25; bestiary-first), the
**2024-DMG XP-budget difficulty calculator SHIPPED** (2026-07-25; the DM-only budget readout),
**companions/extras SHIPPED** (2026-07-25), the **account-level homebrew library SHIPPED**
(2026-07-30; ladder rung (a)) and **quickbuild SHIPPED** (2026-07-30 — creation now OPENS on a
ready-made build, with a Randomize reroll) and **share links SHIPPED** (2026-07-31 — public
read-only character links, the native share sheet on every link the app hands out, invitational Open
Graph previews, and the anonymous-viewer sign-in chrome on the public /view page — a single header
sign-in button, no marketing card), and the **unified Items browser CODE-COMPLETE** (2026-08-01 —
the separate Equipment + Magic Items tabs/ribbon-entries merged into ONE searchable "Items" list over
both corpora, with a smart facet rail: Magic lens · Kind spanning both datasets · magic-only
Rarity/Attunement that light up in context; in BOTH the Add-Item modal and the Compendium page. HOLDS
for owner screenshot approval, rule 25), and the **reusable custom-monster library + canonical
monster-portrait collection SHIPPED** (2026-08-02 — the encounter's Custom tab is now
a saved-monster library (5th `monster` library kind: create → saved → re-addable, with edit/delete),
and all 503 database monsters have original, consistent 4:5 generated paintings keyed by
stable id across the SRD + private pack. **Owner reversal 2026-08-02:** the earlier no-generated-default
decision is superseded now that project-owned art can be generated at quality; database portraits are
canonical and not user-overridable. Custom monsters alone retain upload/re-crop/remove at any time.
The bestiary plate preserves 4:5 composition; encounter cards resolve the same art from `srdId`
without copying URLs into Firestore. The owner approved the final compendium + encounter screenshot
matrix in dark/light and desktop/mobile (rule 25); that acceptance pass also caught and closed the
pre-existing light-theme mobile multi-encounter count-chip contrast gap, now browser-guarded); the
live head is **compendium completeness**. The
competitive map is `docs/POSITIONING.md`. **Phase 1** (single-user foundation) is complete; the **100%-automation push** and the
**R1–R8 target-architecture campaign** are both **CLOSED** (shipped, merged, deployed). The
**id-storage + GR7 i18n-leak-eradication campaign** is **CLOSED** (v0.13.0): every SRD-derived value
is a stable, mostly-branded id; every user-visible string lives in `src/i18n/**` (a new language = a
new JSON set); the GR7 leak-detector allowlist is empty; the cross-locale and dynamic-key i18n crash
classes are guard-locked. The premium B&W **PDF sheet export** (pdf-parity) shipped in the same
release. The headline **campaign features** — Party, Chronicle, Treasury, SharedNotes, Sessions — are
**shipped**. The **BG3 on-rails combat** campaign landed its **major wave on 2026-06-22** (on-hit
rider chips, the A2 duration/cadence engine, condition-consequence projection, form-swap attack rows,
and the effective-max-HP / set-score / darkvision / Epic-Boon correctness batch — git
`fe522b60`…`f68226dd`); the S1–S13 play/data seams + the cadence-mechanics wiring (2 of 4 wired) have
since shipped (S11 — the save-based action primitive — closed Dragonborn Breath Weapon, Cleric Divine
Spark/Radiance, Lupin Howl; **S11b** — the exotic Channel-Divinity sub-shapes (+WIS/+Cleric-level
additives, Divine Spark heal-or-damage, Sear Undead ability-count dice) — shipped 2026-06-25; **S13** —
effective-Speed render — shipped 2026-06-24; **S12b** — multi-instance spell dice (Magic Missile /
Scorching Ray ×N) + the Stars `diceByLevel` (Starry-Form 1d8→2d8 at L10) + **G24** spell-area recurrence
cadence (Moonbeam / Spirit Guardians / Flaming Sphere / Call Lightning) — shipped 2026-06-25; **S12c** —
leveled-spell upcast damage scaling (`damageDicePerUpcast` on 60 spells → the cast modal previews the
slot-scaled dice, Fireball L5 → 10d6) — shipped 2026-06-26). The confirmed correctness-bug frontier
(B1–B8, §D) and the structured `instantaneous`-duration fact are now **all shipped** (verified in code:
`barbarian.ts:175` `maxRounds:100`, `smart-tracker.ts:1508` `featureScalingLevel`, `cast-options`
`slotUsageKey`, `grants.ts` `hpFlatParts`, `data/types.ts:708` the `instantaneous` boolean). The **A–E
per-feature automation wave** (≈26 merges) has since landed the remaining wikidot rules-coverage
long-tail plus five new engine primitives — **slot-funded alternate recovery**
(`smart-tracker.ts` `resolveSlotAltRecovery`), **on-cast slot regain** (Diviner Expert Divination,
`on-cast-effects.ts` `resolveOnCastSlotRegain`), **incoming-attack-advantage** (Reckless Attack's
self-side defensive downside, `grants.ts:1802`), **speed-floor** (Boots of Striding and Springing,
`grants.ts:313`), and **rider extra-chips** (Artificer Replicate Magic Item cap as a second chip) — plus
the **"· active" self-labelling** of while-active effect chips and the GR7 **prose-parser deletions**
(`extractTrigger` / `extractSpellTrigger` / `extractDamageDice` retired in favour of structured tokens).
The **DM toolkit's** headline surface (the in-hub party-overview dashboard + encounter/initiative
tracker) is **shipped and live**. The **2024 core-rules SYSTEM audit (RA-01…RA-35)** is now
**fully CLOSED** (`docs/AUTOMATION_BACKLOG.md` is a dated audit record; see \_Shipped — the 2024
core-rules audit close-out*), and the tracking-doc reconciliation truth-sweep landed with it. The
forward frontier (detailed under _Next — the forward plan_) is the **ACTIVE DDB-parity feature
epic** — its **bestiary flagship SHIPPED** (2026-07-24: 330 SRD monsters EN+IT + the compendium
Monsters section; see _Shipped — the SRD bestiary campaign_), the **encounter picker SHIPPED**
(2026-07-25: the DM bestiary picker + statblock disclosure), and the **2024-DMG XP-budget difficulty
calculator SHIPPED** (2026-07-25: the pure `encounter-difficulty.ts` SRD-table engine + the DM-only
budget readout in the round bar & Add-monster modal, the custom-monster CR select, and the lair-XP
toggle — more correct than DDB's standalone tool, which still runs 2014 multiplier math). The live
head is now the **pack-side MM corpus**, advancing along the
same manifest (`docs/POSITIONING.md`) — the react-router advisory triage, and the P4 polish tail
(guided tour, compendium polish). **Bestiary SCAFFOLD + strict-2024 policy (2026-08-01):** the pack
bestiary is refactored into a **parallel-safe tranche layout** ready for the full MM fan-out —
`content-pack/data/monsters/` is now eight alphabetical tranche files (`a-b.ts … t-z.ts`) + a
pre-wired `index.ts` barrel (the `@pack/monsters` target), and the pack monster i18n is partitioned
into per-tranche fragments `content-pack/i18n/{en,it}/srd/monsters/<tranche>.json` (loaders + guards
merge them), so N fan-out agents each own disjoint files. The manifest
(`content-pack/docs/BESTIARY_MANIFEST.md`) gains the **per-tranche coverage map** (the fan-out
ownership + progress ledger): **173-monster strict-2024 roster, 11 authored (Giant Squid + the
wave-1 pilot), 162 pending.** Owner-ratified **STRICT 2024 ONLY — ZERO legacy content**: the
briefly-added 2014-legacy **Orc** + **Orc War Chief** were **removed in full** (data + EN/IT strings)
under this policy (the playable Orc race + Orc language are unrelated public-SRD entities and remain).
Nothic + Giant Squid confirmed valid 2024-MM entries and migrated. **MM wave 2 is unblocked** across
the tranches.

**Session undo/redo stack — shipped in v0.19.0, DEPLOYED live (2026-07-11):** the 5-second undo toast grew a durable
home — a per-character, session-memory, LIFO **undo stack** (`src/stores/undoStore.ts`, depth 20) with
standard redo. Every act that showed a "— Undo" toast (action/cast/attack-swing/reaction commits, HP
damage/heal/temp, death saves, out-of-combat tracker spends, conditions, concentration, resource
conversions, Arcane Recovery / Divine Intervention, maintained-state End) now also lands on the stack;
the toast's Undo button, the **⌘Z / ⌘⇧Z** cockpit accelerators (`useUndoRedoShortcut`), and the sheet's
**on-page Undo · Redo controls** (the Binder's Fob ⟲ ⟳ coins on desktop; the Signet's bloomed ⟲ ⟳
pair on mobile) all reference the ONE reverse-applier (golden rule 6).
Own-sheet-only (shared campaign docs excluded — no `undoStore` import under `features/campaigns/`);
fenced by rests / level-up / build edits / import / snapshot restore / character switch / remote
snapshot; encounter turn-start purges only the turn's economy while HP/condition undos survive; solo
End Turn compacts the turn. The 12 adversarial cases are pinned. Full contract: `docs/ARCHITECTURE.md`
("The session undo stack"); the control recipe: `DESIGN.md` §5. **Explicit non-goals (recorded so
nobody "finishes" them):** reload/persistence survival of the stack, shared-doc undo, a history
dropdown, undo-rest (a future whole-session-snapshot entry), Ctrl+Y, rebindable keys.

**Sheet management system — the FOB FAMILY, both homes ratified (owner, 2026-07-11; shipped in
v0.19.0, DEPLOYED live 2026-07-11):** the sheet's whole management chrome (Undo · Redo · Edit · ⋯) lives OFF the masthead in
two homes split by ONE seam (`useBinderFobHome`), so the masthead is pure identity + vitals aligned
against the name on EVERY viewport. **DESKTOP (fine pointer ≥768px) = "The Binder's Fob":** a fixed
bottom-right **coin chain** in the Rest-medallion struck-metal family (`BinderFob` — ✎ standing, ⋯
above it, ⟲ ⟳ mounting with history so the standing coins never move); the toast lane slides left of
the coin column. **MOBILE (coarse / <768px) = "The Signet":** ONE struck-metal coin fixed above the
bottom nav (`MobileSignet`), the fob collapsed — the IDLE coin bears the **`Wrench` tools glyph**
(owner-picked 2026-07-12; NOT a pencil; the de-duplication ruling fixing the owner's "the edit icon
is repeated twice"), and a tap
BLOOMS the chain (⟲ ⟳ · ⋯ · ✎ Edit — the pencil lives ONLY in the chain). The ✎ coin is the
**activated toggle** on both homes: uncolored/seal at rest, lit amber while editing, zero geometry
change, a one-tap exit (aria "Done editing" / "Fine modifica"); if the Signet chain is bloomed while
editing it shows only ⟲ ⟳ · ⋯ — never a second pencil. Long-press flips the Signet to the left edge
(persisted). Both homes are fixed, so the lit coin is always reachable at any scroll depth — no
floating deep-scroll exit, no masthead management row. The sticky "Editing"
banner stays deleted; the portrait level-up gem stays removed (the `⌃⌃ LEVEL` lineage chip carries
availability alone). Recipe: `DESIGN.md` §5 ("The sheet management chrome" + "Cockpit masthead").

**Initiative single-source re-architecture — shipped in v0.19.0, DEPLOYED live (owner-mandated root
fix, 2026-07-11):** the "DM access out of date / initiative never saves" outage is cured at the root, in
both of its layers. (1) **Immediate cause:** prod ran v0.18.0's (pre-v0.19.0) `firestore.rules`, whose combat-state
field-lock (`isValidCombatState().hasOnly(...)`) predates the 2026-07-09 `round` field — so EVERY
combat write from current `main` was silently permission-denied and mislabeled by the catch-all
stale-DM-grant toast (reproduced mechanically in the emulator: the exact client payload vs the v0.18.0
rules). The shape-lock is DELETED (rules validate authorization only; the client already parses
defensively) and a version-skew class guard pins that a future additive field can never re-open the
outage. (2) **Architectural cause:** encounter initiative rode a cross-user, client-recomputed
`dmReaders` grant. It now lives in ONE home — the campaign doc's `encounterInit` table (`uid → raw
d20`) — DM writes any row, a player their own (the rules-proven four-direction matrix), per-key
composing offline writes, atomic table reset at fight start/end (the `initiativeEpoch` machinery,
`useViewerRollStates` listeners, retry toasts, and the whole `dmReaders`/`campaignReaders` ACL
apparatus are deleted — cross-user access now derives LIVE from `attachedCampaignId` + the campaign
roster, so a DM transfer/removal converges on the next request). **DEPLOY STEP:** ship
`firestore.rules` with the same deploy (standard `just deploy` does), then run
`scripts/backfill-attached-campaign.ts --check` / `--apply` (expected pointer backfills: zero — the
2026-07-10 backfill already stamped live docs; the sweep clears the dead ACL residue). Contract:
`docs/ARCHITECTURE.md` ("Combat-mutable state" → Security + the initiative-SSOT bullet).

**Italian names re-sourced + cross-reference-consistent (2026-07-21):** every entity's canonical
Italian `name` was audited against the official **IT SRD 5.2.1** (the 2024 ruleset, parsed from the
CC-BY PDF via `pypdf`) and **288 names corrected to their official form** across both repos (spells,
magic items, equipment, class features, beasts, invocations, metamagic, feats, backgrounds,
languages, proficiencies, weapon properties) — e.g. Geas _Imposizione→Costrizione_, Acid Splash
_Spruzzo Acido→Fiotto Acido_, and dozens of items that still carried raw English. **All name
collisions resolved** (Conjure=_Evoca X_ vs Summon=_Richiama X_, Bolt=_Quadrello_, Portent=_Auspicio_)
and **every prose cross-reference aligned** to the one canonical lexeme (inflection preserved). A new
**IT-name-consistency guard** (`tests/unit/it-name-consistency.guard.test.ts` + composed pack
companion) fails the build on future collisions / untranslated regressions / retired-lexeme drift;
the authority + core glossary live in `docs/IT_NAME_REGISTRY.md`, and the D2 cascade
(`docs/GOLDEN_RULES.md`) now cites the now-available IT SRD 5.2.1 + the BG3 tier. No character-data
migration (sheets store stable ids, not display strings).

**Search matcher tokenized (rule 27 stability fix, 2026-07-21):** the ONE shared `matchesSearch`
(`src/lib/search.ts`) no longer does a whole-query `includes()` — it splits the normalized query into
whitespace tokens and matches iff EVERY token is a substring of the joined candidate corpus. Fixes
the headline IT case ("pozione guarigione" now finds "Pozione di Guarigione" — the interstitial "di"
can't break the match) and propagates app-wide through the single seam (roster · command palette ·
every picker). Order-independent, interstitial-word-tolerant, still partial-token / case- /
accent-insensitive / bilingual; `rankedSearch`'s two-tier name-over-description ranking and the
`DESC_QUERY_MIN` gate are unchanged. Contract: `DESIGN.md` §15.6.

**Compendium picker name-priority ranking (rule 27 stability fix, 2026-07-21):** the shared compendium /
add-item picker (`useCompendiumPicker`) previously FLAT-filtered with `matchesSearch`, so an entry
matching only in its DESCRIPTION sorted level with a NAME match — typing "pozione guarigione" surfaced
"Pozione di Guarigione" only THIRD (below "Calderone della Rinascita" & co., which merely mention it in
body text). It now reuses the SAME `rankedSearch` primitive the wizard pickers use: each spec exposes a
`nameText` (localized name / EN name / id + subclass) alongside its combined `searchText`, and the
picker feeds `nameOf = nameText`, `descOf = searchText` (combined) — so a NAME hit ranks above a
description-only hit, the match SET is preserved exactly (tier 2 only ever sees non-name hits, mirroring
the command palette's own name/gloss partition), and an empty query keeps natural data order. One fix
covers BOTH the Compendium page and the add-item Equipment/Magic-item tabs. Contract: `DESIGN.md` §15.6.

**v0.18.0 released + DEPLOYED live (2026-07-07):** the release bundled the **Polymorph Phase 2 Beast
catalogue** (the full CR 0–8 fill — 91 forms, +73 new, EN+IT), the **Fable dark-theme chrome refresh**
(the glowing-grimoire login splash, the war-table campaign backdrop, and the engraved
brand-crest roster watermark — the splash is now static; pointer-parallax removed), and **batch-1
mechanics** (Barbarian Relentless Rage / Fanatical Focus riders + the Artificer Tools-of-the-Trade
coverage reconciliation). **Batch-2 mechanics (v0.18.1) are now DEPLOYED live as part of v0.19.0
(2026-07-11):** the Monk Patient Defense L10 temp-HP roll-entry rider (a new `SrdActionDef.tempHpRoll` field) and the
Reckless Attack backlog true-up (its downside consumer already shipped June 2026). Two
**steering-doctrine amendments** merged: (1) live-data migrations now run **AUTONOMOUSLY** under a
snapshot-verify safety net with explicit no-backward-compat / always-optimal modeling (amended golden
rules 10, 22, the four forks); (2) tracking docs must be a **truthful live mirror** — verify-first,
reconcile drift (amended golden rule 16 — this very sync operationalizes it). **Finding:** the
mechanical-automation long-tail (seams **S1–S13**) is now effectively **CLOSED** — several
survey/backlog "open" items turned out already shipped in June (the doc drift that motivated the
rule-16 amendment; a reconciliation audit is queued as the next on-ramp).

**v0.15.0 → v0.15.2 shipped and DEPLOYED (2026-07-01/02):** the **encounter/combat single-source
re-architecture** — HP, conditions, initiative, and death saves live SOLELY in the per-character
`combat/state` subdoc, read and written by the sheet, roster, campaign hub, and DM alike
(edit-anywhere by construction, golden rule 6); the frozen `EncounterState.order[]` + the one
`useTurnState` seam (which killed the "round 6, 7, 8…" drift), the all-rolled Begin-turns gate with
DM lift-&-follow drag-reorder, the labelled topbar combat pip with its inline roll-initiative
popover, the turn-START action-economy reset, and the test-enforced resilience invariants
(HP-never-resets, frozen-order integrity, the reload-mid-combat round-trip). Plus the **campaign-hub
redesign** (slim framed header, two-band PLAY/MANAGE dashboard, the campaign's 16:9 art as the
global backdrop with crop-focal parity), **open team sheets**, **DM invite management**
(remove-member, lock-joins, one link-based invite flow), the **shared-notes reveal lens**, and
**admin god-mode** (read-only inspection of any user's characters, a bug inbox, and a cascading
`deleteUser` Cloud Function). The transitional combat-state read-fallback and its spent migration
were DELETED after every live doc migrated (golden rule 10). Detail: `CHANGELOG.md` v0.15.x,
`docs/ARCHITECTURE.md` (the encounter/combat seam), `DESIGN.md` §13.

Deferred cleanliness — the solo-round consolidation is DONE: the SOLO round moved from
`session.round` (parent doc) to the `combat/state` subdoc's `round` field (its sole persisted home,
joining the combat trio), `session.round` is DELETED entirely (field, codec entry, sanitize plumbing,
every consumer), `firestore.rules` field-locks the new `round` (+ emulator rules-tests), and the v3
portable codec DROPS `state.round` one-way at the import boundary. The live-data migration was
**applied + verified against production on 2026-07-10** (every lingering parent `state.round` copied
into the `combat/state` subdoc where it lacked one, the dead parent field dropped; 10 docs migrated,
re-run idempotent no-op; the spent one-off script has been removed — rule 10). Rationale in
`docs/ARCHITECTURE.md` → "Solo round home"; codec story in `docs/CHARACTER_SCHEMA.md`.

**Full-app bug sweep — 32 fixes (2026-07-05, v0.16.4):** a 10-lens full-app discovery workflow (the
per-surface behavioural walk × the input / navigation / concurrency / i18n lenses) plus a graphify
structural nav-analysis over `src` found and fixed **32 bugs** — **1 critical, 13 high, 9 medium, 9
low** — across character creation, campaign-write concurrency, encounter/combat play, the character
sheet, inputs, navigation, and Italian localization. Headlines: the shared campaign write seam made
concurrency-safe (atomic treasury add/take + undo, a Chronicle-save restore-history snapshot before
overwrite, no turn-rewind from a debounced monster edit); encounter membership / DM-role /
gathering-roster hardening (removing a member drops their combatant, one-campaign-per-character
enforced across two devices, a failed role write reported + rolled back); the app-wide
`InlineEditable` number field now selects-all on focus (a typed digit was inserting into — not
replacing — every numeric override); Max HP edits now target the stored base, not the boosted total;
and creation gates on class skills + caster spells before a character can be made. Gate green
(tsc · lint · coverage · build); `ponytail-review` converged. **Now DEPLOYED** — it rode the
v0.16→v0.18 release train (v0.18.0 is live).

Resolved `ponytail-review` follow-up from the sweep (no user-facing effect): the one-time
`attachedCampaignId` backfill — stamping the internal one-campaign lock onto the legacy attached
characters that carried no claim — was **applied + verified against production on 2026-07-10** (9
attachments stamped, zero conflicts / duplicate memberships / missing docs, re-run idempotent no-op;
the spent one-off script has been removed — rule 10). It closed B07's residual concurrent-attach
window on the pre-existing docs (every NEW attach already stamps the lock).

**Boot data-resilience — the "Clear site data" incident (2026-07-09, rule 27, shipped in v0.19.0,
DEPLOYED live 2026-07-11).**
Two live users reported that after Chrome's **"Clear site data"** mid-session, re-login showed **no
characters and no campaign** for a prolonged period; logout/login didn't fix it; a fresh browser
(Safari) worked immediately and the first browser then recovered on its own. **Diagnosed mechanism:**
"Clear site data" wipes the Firestore IndexedDB cache while the SDK is still running, so on reload the
first roster `onSnapshot` (and the one-shot campaigns `getDocs`) resolves from the now-EMPTY cache
(`fromCache: true`, zero docs) BEFORE the server answers — and the mid-session wipe can leave the SDK's
local layer wedged so the server answer is badly delayed. The app rendered that cache-empty result as
the **authoritative** first-run "create your first character" / "no campaigns" screen, with **no
recovery** (logout/login re-hit the same empty cache; the same Firestore instance stayed wedged). Safari
"fixed" it only because a fresh browser had a clean cache; the first browser recovered by SW/instance
refresh timing (a reload = a fresh Firestore instance), NOT causally from Safari. The "saw only another
member's HP" flash was the same partial-load state (teammates' tiny `combat/state` subdocs resolved while
the viewer's own parent doc didn't), not a scoping bug — `usePartyCombatStates` keys correctly by uid.
**Fix (root, at the shared seam): an ONLINE empty result that is only `fromCache` is never
authoritative.** The roster subscription now surfaces `fromCache` (`subscribeToCharacters` +
`includeMetadataChanges`) and `useCharacters` keeps the loader up until a server-confirmed, non-empty,
or genuinely-OFFLINE snapshot lands (offline, the cache-empty answer settles as the TRUE empty state —
same semantics as the campaigns path), converting an online never-confirmed empty into the recoverable
error state (Retry → reload → fresh instance) after a 10s confirm timeout; `listSharedCampaigns` bounds
BOTH its reads with `withTimeout` and forces a `getDocsFromServer` read when an empty result is only
`fromCache` and the browser is online (every caller handles the rejection —
`Party.attachMyCharacter`'s fire-and-forget pre-check gained a catch → `attachFailed` toast); the
campaigns error state gained a Retry affordance; and a `vite:preloadError` handler reloads once when a
wiped precache 404s a lazy chunk, its latch cleared 15s post-boot so an immediately-refailing chunk
falls to the ErrorBoundary instead of looping (`chunk-recovery.ts`). Regressions:
`roster-boot-resilience.test.tsx`, `boot-resilience-utils.test.ts`, the `campaign-io` server-confirm +
timeout-propagation cases. Detail: `docs/ARCHITECTURE.md` → "Boot data-resilience".

**Session-summary edit-in-place — the read↔edit "resize jump" (2026-07-21, rule 27).** The owner
reported the Campaign → Sessions summary swap felt "traumatic": the read view rendered markdown up to
the `NoteClamp --reading` cap, then hard-swapped to a FIXED `rows=4` (min-height 88px) textarea that
bore no relation to the content — a big instant geometry jump, compounded by an `autoFocus` scroll-yank
and an action row that changed shape (one ghost button → two default-size buttons). **Fix:** the editor
is now CONTENT-SIZED (`field-sizing: content`, `.sess-notes-edit`) seeded off the read content and
capped at the SAME reading bound, so read and edit share ONE footprint (no fixed rows, no drag handle);
focus is placed with `preventScroll`; and empty / read / edit are unified into one structure (a body
region over a right-aligned `.sess-notes-actions` row whose height is identical whether it holds one
button — Edit / Add — or two — Cancel / Save). The commit stays an explicit Save/Cancel (a recap is
authored prose — the safe choice against blur-loss; only short always-complete tokens like the session
NAME commit-on-blur). Regressions: `sessions-section.test.tsx` (seed-on-edit + Cancel-discards) and the
`session-edit-no-jump.spec.ts` e2e (the editor is content-sized with no internal scroll; the region
footprint barely changes read→edit — both fail on the old fixed box). DESIGN.md §12.

**Add-item picker — scroll-preserve + AC i18n (rule 27, 2026-07-21).**

- **Scroll-position reset regression fixed.** The Add-item equipment picker's results list snapped
  back to the top whenever the character store ticked in the background (the ~2s auto-save
  write-back, a session/HP tick): `useCompendiumPicker` keyed `useScrollMemory` on the `filtered`
  result ARRAY, whose reference is re-created on every store write because the memo closes over
  `ctx` (which holds the whole character), so a background write produced a fresh `filtered` even
  though the visible rows were byte-identical. The reset key is now the query+facet IDENTITY
  (`resultSetKey`, a stable string primitive) — scroll resets on a real result-set change and
  survives store churn. Regressions: `add-item-scroll-preserve.spec.ts` (real Chromium, the
  faithful repro jsdom cannot measure) + the `resultSetKey` reset-key-stability cases in
  `compendium-deeplink.test.ts`.
- **Equipment AC stat line fully localized.** The picker row + detail hardcoded English "AC" / "DEX"
  / "(max N)" in the armor stat line ("AC 11 + DEX"), so an IT player saw English tokens; every
  token now routes through `t()` (`equipment.ac` · `abilities.DEX_short` · `equipment.acMaxDex`) —
  an IT player reads "CA 11 + DES" / "CA 13 + DES (max 2)". Regression: the armor-AC row+detail
  cases in `compendium-browse-specs.test.tsx` (real i18next, EN + IT).

## Queued — UX feedback batch (owner, 2026-07-31)

1. **BUG — tab search toggle flashes**: clicking the search control in a sheet tab while
   its search is OPEN must CLOSE it; today it flashes (likely blur-close + click-reopen
   race). Reproduce with a failing test first.
2. **Command palette must feel mobile-native on mobile**: desktop-only entries and keyboard
   shortcut hints (⌘K etc.) must not show on mobile; desktop stays untouched — optimum on
   both platforms.
3. **Mobile horizontal-stretch doubt (design exploration)**: full-width HP/vitals tiles and
   roster cards on mobile — is it state of the art? Desktop HP is compact. Owner wants
   SOTA/industry-standard professional mobile layouts; explore via impeccable + proposals
   with screenshots.
   4b. **Cockpit tail spacing** (owner, 2026-07-31): the collapsed "Combat Algorithm" /
   "Rules Reference" sections at the sheet's foot carry huge unjustified margins — bring
   the rhythm in line with the rest of the app (professional, standard).
4. **Tab selection must not jump (Compendium type tabs + sheet tabs)**: selecting a tab —
   especially one reached by scrolling — currently causes a jump; the tab must stay exactly
   where it is. GRILLED with the owner before implementation (see the golden rule below).

## Queued — Admin panel rework (owner request, 2026-07-31)

The users list will grow: the admin panel needs (1) a POWERFUL user search ("trovare subito
gli utenti") and (2) progressive disclosure instead of the full in-place list — the
campaigns hub's expandable-section pattern, applied coherently. Requirements to grill when
the unit opens (sort/filter axes, per-user actions surface, pagination vs disclosure
threshold). Owner: "non possiamo mostrare tutta la lista utenti in place".

## Open decisions (owner)

- **AI assistant — DROPPED (owner, 2026-07-06).** The long-carried "Phase-3 multi-provider AI
  assistant" is de-scoped for good — not deferred, dropped. The deterministic engine is the
  product's intelligence; an LLM conflicts with rules-correctness (hallucination risk), zero-budget
  (API cost / BYOK friction), and offline-first (needs network), and is redundant with what the
  engine already computes. A narrow BYOK narrative-only variant was considered and also declined.
  Do not re-add.
- **Backups / PITR posture** — deliberately deferred by the owner (2026-07-02); revisit when the
  user base or data value grows.
- **Client observability** (error/telemetry reporting beyond the in-app bug report → GitHub-issue
  loop) — undecided.
- **Billing posture.** Blaze plan active on Google Cloud trial credit (£222 remaining, expires
  2026-08-22). The £1 budget alert is now backed by a hard kill-switch (SAFE-01): the `onBudgetAlert`
  Cloud Function subscribes to the `budget-kill` Pub/Sub topic and DETACHES billing when actual cost
  exceeds the budget, forcing spend to zero. **Code + tests + runbook + one-command lifecycle
  shipped** (`functions/src/budget-kill.ts`, `scripts/safe-01.sh`, `docs/BUG_REPORTING.md` →
  SAFE-01). The whole one-time setup is now `just safe-arm` (idempotent: APIs · `budget-kill`
  topic · £1 budget wired to it · the detach IAM grant · deploy `onBudgetAlert`), with
  `just safe-status` (ARMED/NOT ARMED/FIRED) and `just safe-restore` (post-fire recovery,
  defuse-before-re-attach). Owner-run (touches billing + IAM); the switch is **ARMED and verified** —
  `just safe-status` returns "✓ ARMED — every piece is in place" (verified 2026-07-23; `onBudgetAlert`
  live, no detach events), so the 2026-08-22 trial-credit expiry is now covered by the armed
  kill-switch. The detach grant is least-privilege project-scoped `roles/billing.projectManager`
  (detach-only, cannot re-link) — not the billing-account-wide `billing.admin` the first draft named.

## Phase status

| Phase                   | Scope                                                                       | Status                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Setup               | Vite/React/TS, Tailwind, custom UI layer, Firebase, CI/CD, PWA shell        | ✅ Done                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1 — Foundation          | Single-user: auth, SRD database, character CRUD + sheet, wizards, i18n, PWA | ✅ Done                                                                                                                                                                                                                                                                                                                                                                                                    |
| Automation push         | Drive to 100% of D&D 2024 mechanics, override-first                         | ✅ CLOSED — levers + data-wiring + PROSE sweeps shipped; the verified gap long-tail lives in `docs/AUTOMATION_BACKLOG.md`                                                                                                                                                                                                                                                                                  |
| UI/UX redesign (gate)   | Full Illuminated Folio visual/interaction redesign                          | ✅ Shipped — design system canonized in `DESIGN.md` (`src/index.css` + `src/styles/folio.css`); axe-clean, bilingual                                                                                                                                                                                                                                                                                       |
| Combat model            | UI-agnostic immediate-commit turn engine                                    | ✅ Shipped — `combatStore` + `cost-engine` + condition gating + rich casting (contract in `docs/ARCHITECTURE.md`)                                                                                                                                                                                                                                                                                          |
| 2 — Social & Campaigns  | Multi-char, campaigns, party view, sharing, snapshots                       | ✅ Shipped + live (v0.15.x) — Party, campaigns, open team sheets, the in-hub party overview + encounter/initiative tracker (single-source combat state), DM invite management, shared-notes reveal lens, admin god-mode                                                                                                                                                                                    |
| 3 — Chronicle           | Markdown chronicle + version history, Treasury, SharedNotes, Sessions       | ✅ Shipped (v0.15.x) — Chronicle (markdown + version history), Treasury, SharedNotes, Sessions all live. (The AI assistant / AI session recaps once scoped here were **DROPPED** — owner 2026-07-06; see _Open decisions_.)                                                                                                                                                                                |
| 4 — Polish & Completion | PDF export, command palette, compendium, a11y, perf, onboarding             | 🔄 PDF export (faithful from-scratch recreation of the official 2024 sheet layout — the two-page sheet plus an appended **resource ledger** page listing every consumable pool (class resources + magic-item charges: name · pips-or-count · recovery cadence, paginating when long), EN/IT, copyright-clean), glossary tooltips, perf budget, Cmd+K palette shipped. Guided tour + compendium polish open |

## Shipped — the Deterministic Combat Chronicle (2026-07-31)

**The DM's encounter tracker now writes the fight for you** (owner-ratified, hard deadline for the
owner's live session). As the DM books HP / conditions in the in-hub tracker, a factual structured
feed (the "Chronicle of the fight") builds itself — the **deterministic record of what LANDED** — and,
at "End encounter", becomes ONE editable Chronicle chapter, removing the mechanical bookkeeping so the
DM writes STORY. Deterministic (no AI prose beyond templated facts, no dice), table-first, budget-safe.

- **Data seam** — a `CombatChronicleEvent` union (`src/types/combat-chronicle.ts`: `hp-damage` /
  `hp-heal` / `down` / `condition-gain` / `condition-loss`, plus the reconciliation-only `attack-miss`
  added in Phase 1 below; ids + numbers only) on an **ephemeral
  `EncounterState.events`** that rides the EXISTING debounced encounter writer — NO new write cadence,
  never a per-action write; the single persisted Chronicle write is the ONE chapter appended at close.
  Pure recorders in `features/campaigns/combat-chronicle.ts`; the presenter + markdown chapter builder
  in `lib/views/combat-chronicle-view.ts` (EN + IT).
- **UX** — the DM-only collapsible live feed + the **one-tap attacker attribution** (pre-picked to the
  current combatant, always skippable, NEVER auto-guessed), and the editable end entry (title ·
  free-text narrative · state-inferred outcome · removable lines) → `appendChronicleChapter`
  (`features/campaigns/party-chronicle.tsx`). No DM miss button: a miss has no deterministic signal for
  the DM and a per-turn button is the friction the app avoids — a miss now enters the record only when a
  PLAYER declares it (Phase 1 below); other drama stays in the DM's narrative note.
- Full detail: `docs/ARCHITECTURE.md → "The Combat Chronicle event seam"`.

## Built (held for owner sign-off) — The breakdown "why" layer (2026-08-03)

Owner request (2026-08-03), design previewed and approved on the real popover: **every value breakdown
answers "why?", on demand.** The `BreakdownTip` was a receipt — it showed WHAT sums, never WHY. The real
case: Bo (Monk 3, daggers) read "Dagger 1d6 · DEX +3", but a dagger prints 1d4 — Martial Arts had
silently replaced the die AND silently chosen DEX over STR.

- **Substitutions are visible** — a replaced die renders `1d4 → 1d6` in the value cell (printed die
  muted, quiet arrow, effective die bold).
- **A row a rule produced becomes a disclosure** on the EXISTING `.cause-toggle` recipe (dotted gold
  underline + inline chevron rotating 90°); tapping it unfolds ONE plain-language sentence beneath the
  row inside the same popover, accordion-style (one open at a time). Rows with nothing non-obvious to
  explain are untouched (rule 19).
- **Emitted at the seam that applied the rule** (rule 2): `effectiveWeaponDie` /
  `resolveWeaponAttackStat` now return the WINNING rule's provenance instead of a bare value.
- **Wave 1** — the Monk die replacement (carried weapon · Versatile grip · Unarmed Strike, which gains
  its first damage breakdown · inventory row), the ability choice (Finesse best-of, feature swaps), the
  medium-armor DEX cap, the winning Unarmored-Defense formula, and EVERY on-hit damage rider — whose
  sentence is COMPOSED from the grant's own fields, so a rider added tomorrow self-explains with zero
  per-feature prose.
- **Review pass 2 (2026-08-04)** applied 15 adjudicated ponytail-review findings: broke a
  presenter import cycle (`resolveWhy` → the leaf `srd-i18n.ts`), fixed the Monk sentence firing on a
  Dance Bard, split attack-roll ("higher modifier applies") from unarmed DAMAGE ability (taken
  unconditionally), normalized the bare `d6` face at the seam so nothing reads `1 → d6`, branched
  Unarmored Defense on its own `no-armor-no-shield` condition (the MONK's case — it was showing the
  wrong rule), added the class-free die-upgrade fallback so a substitution is never unexplained,
  count-free rider spend copy, de-duplicated the IT/EN interpolations, deleted a dead profile field
  and a compat pass-through, and reset the accordion on popover close.
- HELD for the rule-25 screenshot approval before merge. Full detail: `docs/ARCHITECTURE.md → "The WHY
layer"`; the visual recipe: `DESIGN.md → "Breakdown "why" rows"`.

## Built (held for owner sign-off) — Cockpit status badges + turn-control cleanup (2026-08-02)

Two owner-requested cockpit UX refinements, HELD for rule-25 screenshot approval before merge:

- **The status ledge — BG3-style status badges.** The Play tab's verbose FLOATING status lines
  ("Concentrating on Hypnotic Pattern" + "Stop concentrating"; "Disadvantage on attack rolls
  (Frightened)") are replaced by compact iconic BADGES integrated into the turn altar's bottom
  tier (`.turn[data-status]` grid row + `.status-ledge`, an engraved hairline fusing it to the
  plate). One badge per CAUSE (`composeStatusBadges` groups the `composeTurnLimiters` VMs;
  `causeId` is a stable condition id): concentration leads as the gold badge wearing the spell's
  name (popover: full sentence + the one-tap "Stop concentrating" + the B1 blocked note), each
  limiting condition is a badge in its own `--cond-*` hue with a per-condition lucide glyph
  (popover: the effect sentences — explain-on-demand), Exhaustion carries its level on the badge,
  and the RA-08 slot advisory reads in the warning tone. Action PROMPTS (Prone stand, regen
  apply, round-1 reminder, maintained keep/end) stay action banners — a call to action never
  hides behind a click. Recipes in `src/styles/folio.css`; register documented in DESIGN.md's
  "This Turn" section.
- **The sheet's Prev/Next-turn buttons are GONE.** They rendered only in a live encounter on the
  player's own turn (`InCombatStatus`, beneath the meter) — but the meter's gilded End Turn
  ALREADY routes the same shared `advanceEncounterTurn` transaction (and also runs the local
  end-of-turn finalization the raw "Next turn" skipped), and "Previous turn" is the DM's
  correction tool (still in the hub's `EncounterTurnControls`). `in-combat-chip.tsx` deleted;
  one control per job (golden rule 6).

## Built (held for owner sign-off) — Combat Chronicle: the player-damage flip (2026-08-02)

**The player enters the damage; it auto-applies to the monster; the DM overrides anything.** The
owner's finishing decision for the held combat-chronicle epic (2026-08-02) flips the source of truth:
instead of the player tapping only HIT/MISS and the DM lowering monster HP (the app reading that delta
AS the damage), the player now **types the damage they rolled** in the declaration panel and it
**AUTO-APPLIES to the target monster's HP** right away. The chronicle narrates the PLAYER's number.
Held in the current task worktree for the owner's rule-25 look — **not merged, not deployed.**
Deterministic and bilingual EN + IT; the public + pack twins move together and final dual-mode validation
follows the visual sign-off.

- **The panel (impeccable; generalized 2026-08-03)** — `CombatResolver.tsx` now
  hosts ONE compact universal resolution surface: independently targetable creature cards; attack/save/
  automatic outcomes; per-target or shared-area damage; healing; instance allocation; and optional
  condition override. The same component and pure plan serve encounter play and self-owned SOLO effects.
- **Deterministic effect algebra (generalized 2026-08-03)** — typed damage components now apply target
  resistance/immunity/vulnerability/flat reduction, PC and monster Temporary HP, healing/condition cures,
  and linked self-healing in one reviewed commit. Grapple/Shove use the same save/condition grammar.
  Geometry, range/LOS and forced movement stay table declarations because this app is not a VTT.
- **Generic rolled feature effects (2026-08-04)** — class/race/invocation/homebrew actions now project
  healing, condition removal and Temporary HP through the same resolver as spells, including class-table
  dice, deterministic bonuses/multipliers, shared rolls and ability-derived target caps. Stable action ids
  model same-economy variants correctly (Patient Defense stays free; its paid variant spends Focus and
  gains the Temporary-HP rider at L10),
  and v3 export/import preserves action overrides on inferred features. Pack data now wires Mantle of
  Inspiration, Improved Warding Flare, Hand of Healing/Physician's Touch and Fortifying Soul through this
  contract; movement/reaction choices that require battlefield observation remain table declarations.
- **Persistent actions (2026-08-03)** — placement-only zones no longer pretend to damage on cast;
  `recurrence`/`followUp` emits a later active row with the right action economy, no second slot and the
  original upcast level. Concentration/active-state undo restores the exact spell, toggle and cast level.
- **Target-bound standing effects (2026-08-04)** — exact PC/monster-instance effects now live in one
  append-only encounter ledger and project catalogue grants onto the recipient. Aid, Heroism, Warding
  Bond, Death Ward, Haste and marked-target effects therefore survive offline peers, navigation and
  reloads; duration/concentration revocation, max-HP deltas, universal resistance, shared damage,
  drop-to-1 consumption and Haste's restricted extra action/aftereffect resolve through typed primitives,
  never spell-name branches. The recipient's prepared copy cannot be accidentally activated or doubled.
- **Source-owned condition lifecycle (2026-08-04)** — concentrated conditions are now exact
  actor/source/target occurrences in both solo and encounter play instead of destructive writes into a
  shared condition array. Overlapping casters coexist; breaking one concentration removes only its own
  effects; cures and DM overrides clear every matching source occurrence plus manual state; party cards
  and the cockpit read the same effective projection. A PC going to 0 HP loses all concentration-owned
  effects transactionally even while offline, reconnect clears stale concentration, and Firestore
  emulator coverage proves the production permission contract accepts the structured payload.
- **Reactive hit lifecycle (2026-08-04)** — successful attack hits now remain distinct from their
  damage amount and carry melee/ranged mode into the same persistent-effect transaction. The new generic
  `damage-retaliation` grant resolves the exact attacker, stored cast-level scaling and Chronicle action
  provenance; its Temp-HP-bound occurrence expires when that pool is depleted or replaced. Armor of
  Agathys is wired as pack data through this seam, including zero-damage melee hits, with no spell-id
  branch. SOLO still shows/applies its self Temp HP but cannot mutate an enemy it does not model.
- **The write (permissions — the careful part)** — reviewed monster effects land on the encounter (a
  CAMPAIGN doc the player doesn't own) via one NARROW cross-user transaction
  `campaign-io.applyDeclaredCombatEffects` (reached through the Firebase-free `apply-damage.ts` bridge),
  writing ONLY `encounter.{combatants, events, effectOps}` plus the exact peer `combat/state` slices —
  exact-instance damage/healing/Temporary-HP/condition changes, standing-effect operations and their
  structured events. Current table membership grants only those narrow combat surfaces; parent character
  data remains owner-only. **Proven with a real two-user topology** (DM owns the campaign, a member applies
  to an offline peer) in `tests/rules/firestore-rules.test.ts`.
- **Reconcile is UNCHANGED** — the amount already came from the `hp-damage` event; only the WRITER flipped
  (player, not DM), so the whole fusion pipeline (single/multi/save/rider) is untouched.
- **DM remediability is airtight** (owner — "mistakes should always be remediable") — the DM freely
  re-adjusts any monster's HP/conditions, re-attributes a pending/uncertain line, and taps **Undo** on an
  applied monster HP or condition line: the Chronicle event is removed and the underlying monster state
  is reversed in one motion. All lines stay editable/removable at the end entry.
- **Tests** — `combat-resolver.test.tsx` + `combat-resolution.test.ts` (capability plan, review/apply,
  defenses, healing, Temporary HP and linked effects),
  `combat-chronicle.test.ts` (`undoHpEvent`), `party-chronicle.test.tsx` (the Undo affordance),
  `firestore-rules.test.ts` (the two-user damage-write grant), and the keeper e2e
  `combat-chronicle.spec.ts` drives the NEW flow (player types damage → monster HP drops → DM undoes one).
- Full detail: `docs/ARCHITECTURE.md → "The Combat Chronicle event seam"`.

## Built (held for owner sign-off) — Auto-narrated combat, Phase 3: saves, AoE + side-effects (2026-08-02)

**The Chronicle now reconciles the effects a hit/miss can't express** — saving throws, area bursts,
and applied conditions. Phase 2 fused a declared multi-INSTANCE attack; Phase 3 closes the AoE gap the
owner flagged ("don't overlook AoE") and adds rider/condition correlation. Still on `feat/combat-chronicle`,
**HELD for owner approval — not merged, not deployed.** Deterministic, never fabricated, no new Firestore
cost, bilingual EN + IT. Both gates green (`just ci` + `just ci-srd-only`); pack twin updated in the same
motion (rule 28).

- **AoE data model (the Phase-2 gap)** — a new `area` fact (`SrdSpellData.area` → `ActionSummary.area`) on
  the burst save-for-half spells (Burning Hands, Thunderwave, Shatter, Fireball, Lightning Bolt, Ice Storm,
  Cone of Cold + the pack's own burst save spells, tagged in the same motion) finally distinguishes an AoE
  save-spell from a single-target save cantrip
  (both are just save + damage). `combatResolutionSpec` reads it to open an **unbounded** multi-target
  SAVE declaration (one "Resolve", no HIT/MISS).
- **Saves reconciliation** — `reconcileChronicle` binds ALL a declared SAVE spell's targets' drops this round
  (no instance cap) into ONE `attack-save` line: each damaged target carries the DM's real number (**save-for-half
  → the DM's reduced number is the truth**; full/no damage → **positively logged as resisted**), emitted only once
  the spell has resolved (≥1 drop), so an un-booked target is never fabricated as resisted.
- **Riders + conditions** — a declaration carries the action's applied-condition RIDER ids
  (`actionRiderConditions` — a Topple mastery's Prone today, extensible); a DM-booked `condition-gain` is
  **credited to the caster** only on an exact rider match (target + round + condition id), never guessed from
  co-occurrence; >1 caster ⇒ uncertain. An un-correlated condition stays a plain logged line (condition
  logging itself was wired in Phase 0).
- Rule 13 — `chronicle-reconcile.test.ts` pins every branch (save damaged/resisted/unresolved/uncertain,
  condition credit/no-credit/round-break/multi-caster) with mutation-proof assertions; `combat-resolution`,
  `combat-chronicle-view`, `combat-resolver`, `smart-tracker` + `spell-data-integrity` extended.
- **In-app e2e regression + the rule-25 screenshots** — `tests/e2e/combat-chronicle.spec.ts` drives a
  REAL encounter through the ACTUAL surfaces (NOT a bespoke showcase): the sheet's `CombatResolver`
  banner (weapon single-target hit/miss · Magic Missile multi-select · Fireball area-save "Resolve"), then
  the DM hub's reconciled LIVE FEED accumulating across two rounds (auto-attributed hit · synthesized miss ·
  fused multi-line · area-save with mixed saves · Topple→Prone rider credited · plain Frightened · a "No one"
  skip), the editable end-of-combat entry, and the saved Chronicle chapter — so the real `reconcileChronicle`
  generates the chronicle live. Dev-bypass-only, production-tree-shaken seams back it: `makeDevChronicleCombat`
  (a scoped own-PC encounter status for the sheet banner, hero `scn-evoker-wizard` + a Quarterstaff), a
  `d20-dev-declarations` seed folded into `usePartyCombatStates` (the party's declared attacks), and an
  optimistic turn-advance + chronicle-append under bypass (so the fight steps rounds and the saved chapter
  shows without Firestore). Owner-review PNGs write to `CHRONICLE_SHOT_DIR` (light + dark); assertions run
  regardless. **Held with the rest of the phase for the owner's in-app-screenshot look.**
- Full detail: `docs/ARCHITECTURE.md → "The Combat Chronicle event seam"`; the `area` fact in `docs/MECHANICS.md`.

## Shipped — Auto-narrated combat, Phase 2: multi-target capture + fusion (2026-08-01)

**One declared AoE, one chronicle line.** Phase 1 bound a single swing to a single HP drop; Phase 2
lets an action that strikes SEVERAL foes (Magic Missile's darts, Scorching Ray's rays) capture the whole
SET of targets and fuse the several drops the DM applies into ONE summary line — "A hits the Goblin (22),
the Chief (22) and the Ogre (11)". Still deterministic and never fabricated: every per-target number is a
real DM delta; a declared target with no drop is simply omitted, never invented. Solo untouched, no new
Firestore cost.

- **Single- vs multi-select is decided from the action's OWN shape** — `combat-resolution.ts`
  (`combatResolutionSpec` / `shouldResolveCombatAction`) reads `summary.instances`: `> 1` ⇒ a multi-select picker
  capped at that count (Phase 2), else single (Phase 1 unchanged). There is no area geometry modeled, so
  an AoE save-spell (no `instances`) is by shape indistinguishable from a single-target save cantrip and
  stays single — the genuinely multi-target actions are the multi-instance ones.
- **Capture** — `CombatResolver` becomes multi-select for a multi-target action (toggle the set,
  capped, never over-pick), resolving as one "Landed"/"Miss". The declared target SET + its instance drop
  bound ride the SAME `recentActions` ring on the existing `writeCombatState` (NO new doc/subscription).
- **Fusion** — `reconcileChronicle` binds a declared multi-target HIT to the pending `hp-damage` drops on
  its targets in-window (bounded by `instances`), CONSUMING them into ONE new `attack-multi` line with
  each struck target's real amount; a target with no drop is omitted; drops that can't cleanly match (over
  the bound, or a competing declaration on a shared target) mark the line uncertain; a multi MISS ⇒ one
  line naming the set. Bilingual prose (`combat-chronicle-view.ts`, a natural EN/IT enumeration reusing
  `common.and`) reads naturally for 2, 3, or N targets; the fused line is DM-deletable at the end entry.
- Scope note — Phase 2 covers multi-target capture + fusion; saves-for-half / riders / conditions (the
  "made the save?" inference) are Phase 3.
- Full detail: `docs/ARCHITECTURE.md → "The Combat Chronicle event seam"`.

## Shipped — Auto-narrated combat, Phase 1: in-encounter target capture + single-attack reconciliation (2026-08-01)

**The players now write the fight WITH the DM.** Phase 0 had the DM attribute each hit by hand; Phase 1
lets a player, while IN a live campaign encounter, pick who they swung at and — after rolling at the
table — tap **HIT** or **MISS** on their own sheet. That declaration flows to the DM through the
existing per-PC channel and a pure correlation layer fuses it with the HP the DM applies into a
CONFIRMED (or CERTAIN-miss) chronicle line, with no extra Firestore cost and no interruption to the
fight. Solo play is untouched. Deterministic and never fabricated: the app supplies the action's known
shape, the table supplies the roll.

- **Channel** — a small capped `recentActions` ring on the per-PC `combat/state` subdoc
  (`src/types/combat-state.ts` + `pushRecentAttack`), written through the EXISTING `writeCombatState`
  on the player's HIT/MISS tap (`characterStore.declareAttack`). **NO new document, NO new subscription,
  NO per-sub-action write** — the DM/hub already streams every member's subdoc via
  `usePartyCombatStates`; the store mirrors the ring like the combat round so no HP write clobbers it.
- **Capture UI** — `features/character/center/CombatResolver.tsx`, opened by `PlayTab` when
  `useSheetCombat() != null` and a WEAPON attack is committed (SOLO renders nothing — the key rail).
  Compact, non-modal, dismissible; pick a monster, then tap HIT/MISS; nothing is written until the tap.
- **Correlation** — the PURE, derived-every-render `features/campaigns/chronicle-reconcile.ts`
  (`flattenDeclarations` + `reconcileChronicle`) fuses declarations with the DM's observed HP deltas
  keyed on (target, round): declared HIT + a matching pending delta ⇒ auto-attributed hit line (the DM's
  real amount); declared MISS ⇒ a certain synthesized `attack-miss` line; ambiguous match (>1 declarer)
  ⇒ uncertain-marked (never dropped/invented); a delta with no declaration ⇒ the Phase-0 one-tap
  fallback. The DM live feed + end entry render the reconciled view (a new `attack-miss` event kind + a
  subtle uncertain marker, EN + IT), and every line stays DM-overridable.
- Scope note — Phase 1 covers single WEAPON attacks on monster targets; save-based / AoE / cast-attack
  declarations and per-swing (Extra Attack) capture are later phases.
- Full detail: `docs/ARCHITECTURE.md → "The Combat Chronicle event seam"` (the auto-narrated capture +
  correlation bullet).

## Shipped — corner-ornament revert to the owner-approved style-A knot (2026-07-25)

**Owner-ordered revert.** The chrome reset's phase 6/9 "MARK" (`--mark-tl/tr/bl/br` — long
straight-ray corner scratches — plus `--mark-run`, the 216×40 run cartouche on the masthead's
lower rule) was rejected on sight: _"wtf is this?! these things in the corner are just
horrible!"_ Reverted to the LAST state the owner approved, commit `c66f2e1` ("conclude the
style-A corner terminal" — _"okay, adesso ci sta"_): `--frame-ornate`, the wave-volute knot +
rail-swell + weld-diamond + five-ray glint fan, mounted as four fixed-size 64px per-corner
background layers on **all three** earned hero registers (the framed masthead, the gilt cockpit
identity band, AND dialogs — `.modal::after` rejoins the mount list); the run cartouche is gone
entirely (it postdates the approved state and was never part of it). The ceremonial seat divider
(`--seat-orn`, the 260×24 winged fleur on dialog heads) is restored alongside its fading
`border-image` seat rule — the ONE centre-node exception in an otherwise nodeless-hairline
divider grammar.

**Seating verified, not assumed.** At `c66f2e1` the three ornamented registers were SQUARE
(`border-radius: 0`) so the knot could seat on a true crossing; the chrome reset's later,
independently-justified radius unification (phase 3 — "the reference's corners are rounded
~10–12px ALWAYS, including the ornamented ones") made them rounded again. Checked in real
Chromium at 1× and 4×, both themes, all three registers: the knot's rail swell has enough
clearance from the vertex to seat cleanly on the 10px arc — **rounded corners are kept**, no
override needed.

`ornament-vocabulary.guard.test.ts` re-pinned non-vacuously against the restored anatomy (the
`{e, v, k, f}` defs set, the five-ray fan, the mirror-then-tone screen-space toning) and
mutation-proved; `DESIGN.md` §5 rewritten to describe the restored vocabulary as current, with no
run-cartouche or `--mark-*` mentions left standing. Net CSS footprint: **-10,631 bytes source /
-209 bytes gzip / -10.38 KiB PWA precache** — removing the rejected mark system is net-negative,
as expected; no budget ceiling moved.

## Shipped — the SRD bestiary campaign (2026-07-24)

The **DDB-parity epic's flagship** (the first attack-order step) shipped: the FULL SRD 5.2.1
bestiary — **330 monsters, bilingual (EN + IT)**, sourced from the official EN + IT SRD 5.2.1 PDFs
(NOT wikidot, which hosts no bestiary) across **8 verified data waves** (`a–b`…`t–z`), each with its
corpus-integrity + IT-name-consistency guards. It surfaces as the **compendium Monsters section**
(browse-only `monsterSpec` — gilt CR verdict + CR-band/size/type facets + resident-locale prose
search, last on the codex ribbon) rendering the shared **statblock plaque** (`MonsterStatBlockCard`,
full 2024 reading order, both themes, axe-clean), all behind a **lazy `SrdKind` display tier**
(`ensureSrdKind` + the `srd-monsters` chunk — the bilingual corpus never joins the eager startup
closure, and the cockpit modals never drag it). Derived stats (saves · skills · passive Perception ·
XP · proficiency bonus · initiative) come from **CR-driven helpers** (`src/lib/monster.ts`), and the
corpus guard pins all 330 initiative bonuses to their print. The **2024 beast catalogue was
re-derived** to 2024 RAW through the ONE shared projection `MonsterStatBlock → BeastStatBlock`
(`scripts/beast-projection.ts`, owned forever by the completeness projection guard), correcting the
drifted live-user Polymorph forms and sweeping the **RAW Monstrosity reclassifications** down to the
final **84 Beast forms** (six 2024-non-Beast animals dropped from Polymorph offers). The pack-side
D11 twin rides the same manifest (its own entity lives in the pack docs). Granular per-wave history: `CHANGELOG.md` +
git; the rest of the flagship — the encounter picker, the 2024-DMG difficulty calculator, companions,
and the homebrew library — has SHIPPED since (see _Active epic — The DDB-parity frontier_ for the
live head).

## Shipped — the 2024 core-rules audit close-out (2026-07-24)

The flagship **2024 core-rules SYSTEM audit** (RA-01…RA-35, `docs/AUTOMATION_BACKLOG.md`) is
**fully CLOSED** — that ledger is now a dated audit record, not a work queue. RA-01…RA-14 shipped in
the earlier damage-and-dying / weapon-mastery / ammunition waves (2026-07-12…21); the final push
closed **RA-15…RA-35** across waves **W1–W7** (War-Caster concentration-save advantage, passive ±5
step, Heavy disadvantage, Ready/Prone/generic-action completeness, Exhaustion-6 death, retroactive
CON→HP, material-component + ritual notes, the four-state initiative override for Surprise, jump /
push-drag-lift surfacing, the 2024 languages creation step, travel-pace + mounted/underwater
reference tables, the scoped-Grappled + crit-rule + slot-count-override fixes). Two are **residual
by design** (reviewer-adjudicated, docs-only): **RA-31** — the self-side Cover AC toggle DECLINED
(no enforceable lifetime, DM double-count, the settled Dodge precedent; the `COVER_REFERENCE` table
is the shipped treatment); **RA-35** originally recorded only that Musician grants no caster
self-inspiration (ally-targeted under every reading). The later live-team truth audit closed its deterministic
ally-delivery residual through the generic Heroic-Inspiration effect; the original self-target verdict remains.
The
**W9 reference-disclosure follow-up** made the Combat tab's playbook + rules-reference blocks
on-demand (its own entry below). The **Hex / Hunter's Mark** marked-target rider (display-only "vs
marked/cursed target", never auto-summed) landed in the same campaign. The **D11 pack-side handoff
was executed** the moment the pack was workable — the 17-spell material-cost fill + the IT-lexicon
sweeps + the original RA-35 self-target verdict lock in `content-pack/`. Housekeeping: **`fast-uri` patched**
(the Dependabot advisory, entry below). The tracking-doc reconciliation truth-sweep (this wave)
verified the three tracking docs against the merged code; the forward frontier is now the DDB-parity
bestiary epic, the react-router advisory triage, and parked backups/observability/legal [since
named part of the **pre-GA checklist** — owner amendment 2026-07-31 in _Active epic — The
DDB-parity frontier_].

## Shipped — the attack-scope clause family (PS-J, 2026-07-25)

The Play tab's attack cards used to net EVERY `rollType: "attack"` advantage/disadvantage clause a
character carries into one blanket "Adv." / "Disadv." verdict, ignoring how far the clause actually
reaches. Seven clauses were wrong under that rule and are now fixed, ledgered as **PS-J…PS-J7** in
`docs/AUTOMATION_BACKLOG.md`: Hunter _Escape the Horde_ (an INCOMING-attack clause — Opportunity
Attacks against you — that marked the Hunter's own swings Disadvantaged from level 7, now Blur's
`incoming-attack-disadvantage` family), Paladin _Vow of Enmity_ (a permanent false Advantage from
Oath of Vengeance level 3 — now the 1-minute Channel Divinity activation it is in RAW), _Precise
Hunter_, _Studied Attacks_, _Assassinate_, _Reckless Attack_ and _Innate Sorcery_. Per-target
scoping stays the documented residual it always was: the fix is that a clause the sheet cannot
resolve now STATES its scope on the card ("Adv. vs marked target") in the same grammar the
marked-target damage riders already use, and only a clause true of every attack roll still reads as
a bare verdict. Each scoped line is netted AGAINST that verdict, so a scoped Advantage under a blanket Disadvantage
(Reckless Attack while Prone) reads as the straight roll it is instead of asserting both. Every
GRANT-authored attack clause must now declare its scope, so that half of the defect class is
unrepresentable rather than merely guarded — the `condition-effects` path builds its clauses
directly and bypasses that type, which is exactly how the S13 unproficient-armor penalty was still
glossing spell attacks (PS-J8, fixed here) and where Grappled's RAW target exclusion still lives
(RA-32, carried by the turn-limiter sentence). The sweep also closed a guard blind spot — the
IT-name prose scan never read the sub-keyed catalogue rows (grant / action / trait blurbs) the
action card and the rail actually render, which is how two "Canalizzare Divinità" action summaries
shipped beside the canonical "Incanalare Divinità". UNDEPLOYED on `main` (golden rule 22).

## Shipped — post-sweep defect wave (2026-07-24)

A fresh Chromium sweep of the shipped sheet found **eleven** defects; **eight** are fixed and
ledgered as **PS-A…PS-H** in `docs/AUTOMATION_BACKLOG.md` → _Post-sweep defects_ (each with its
root-cause seam + a fail-before regression): the turn-limiter banner teaching a constant −2 at every
Exhaustion level (PS-A), two Italian words for Exhaustion on one screen (PS-B), the RA-27
push/drag/lift number hidden in a native `title=` and unreachable on touch (PS-C), the
Rules-Reference grid stretching its short cards (PS-D), two casing conventions on one screen (PS-E),
⌘K ranking a substring buried inside another word as high as a real name (PS-F), the Advantages rail
listing one advantage twice in two registers (PS-G), and three minor sheet slips including a death
that raised no banner (PS-H). The three left are recorded as **PS-I** in the same ledger (the IT
creation-review ledger's column misalignment, the ⌘K gloss band's missing match reason, and the
spell-card `conc.` abbreviation — closed as a keep). The eleven/eight/three split is REBUILT from
the sweep's Chromium shots and the wave's commits: the sweep's written list was never committed, so
PS-I carries that provenance and a forgotten finding cannot be ruled out. UNDEPLOYED on `main`
(golden rule 22).

## Shipped — Combat-tab reference disclosure (2026-07-24)

The Combat tab's two foot blocks — the combat playbook (`CombatAlgorithm`) and the SRD rules
reference (`SituationalRules`: Cover · Mounted · Underwater · Travel Pace) — are now **on-demand**:
each renders collapsed to just its folio header and blooms its whole body in place on a header click
(`SectionHeader`'s opt-in `disclosure` mode + the shared `ReferenceSection` wrapper, reusing the
app's one `grid-template-rows: 0fr → 1fr` reveal). Per-section open/closed state persists per user
(`uiStore.playRefSections`, survives tab switches + reloads; collapsed by default, no first-run
special casing). Five ⌘K palette entries (Cover · Travel Pace · Mounted Combat · Underwater Combat ·
Combat playbook — bilingual, reusing the section/topic i18n keys) jump to the Combat tab, open the
target section, and scroll it into view via the `requestPlayRef` seam + the cockpit's
`PlayRefDeepLink` consumer. Owner-ratified via grill-me. **Informed-override note (golden rule 21):**
this makes the section HEADER the disclosure control, which the campaign hub's `SectionPanel`
deliberately avoids ("toggle NOT on the header"); that earlier ruling still governs `SectionPanel`
(it keeps an always-visible fixed panel), whereas these reference sections have no fixed panel — the
header is all that shows when collapsed, so it is the natural affordance (the distinction is now
recorded in `DESIGN.md`).

## Shipped — Dependabot security remediation (2026-07-30)

Cleared the `functions/` `postcss` alert (GHSA-r28c-9q8g-f849, high — source-map path traversal
in `sourceMappingURL` auto-loading, `<=8.5.17`): `npm update postcss` in the standalone
`functions/` package re-resolved the vitest dev-tooling transitive to `8.5.25` (patched line
`>=8.5.18`); the root pnpm tree was already on `8.5.20` and was never affected. The `functions/`
lint + build lane green. The two remaining open alerts are the SAME advisory
(GHSA-qwww-vcr4-c8h2, react-router RSC-mode CSRF, patched only in 8.x): already triaged
NON-EXPLOITABLE for this client-side Data-Mode SPA (no RSC/SSR/server-action surface — see the
2026-07-25 remediation record); they stay open until the react-router 8.x major bump on the
roadmap frontier retires them for good.

## Shipped — Dependabot security remediation (2026-07-25)

`brace-expansion` is now `5.0.8` EVERYWHERE in both trees — zero findings left (GHSA-mh99-v99m-4gvg,
high — DoS via unbounded expansion length, an out-of-memory process crash; vulnerable `<=5.0.7`,
patched only in `5.0.8`, which adds the `EXPANSION_MAX_LENGTH` output cap). It took two different
kinds of override, because the advisory spans EVERY published line:

- **The `5.0.7` copy — a straight version override.** The advisory swallowed the pin the 2026-07-21
  round had set, so the existing scoped entry was re-pointed in each tree to
  `"brace-expansion@>=3.0.0 <5.0.8": "5.0.8"` (`pnpm-workspace.yaml` + `functions/package.json`),
  moving the copy the root dev tooling shares (eslint / typescript-eslint via
  `@eslint/config-array`, and `vite-plugin-pwa` → `workbox-build` → `glob@11`, all through
  `minimatch@10.2.5`) and the same one in `functions/` (`eslint` / `typescript-eslint` →
  `minimatch@10.2.5`).
- **The `2.1.2` copies — a scoped PARENT override.** No version override can reach these: the fix
  exists only on 5.x, where the entry point exports a NAMED `expand` instead of the pre-5.x default
  function export, and `minimatch@5.1.9` (`require('brace-expansion')`) / `minimatch@9.0.9`
  (`__importDefault`) consume the default — forcing `5.0.8` there throws
  `TypeError: (0, brace_expansion_1.default) is not a function` on the first `braceExpand` (verified,
  not assumed). Upstream had already moved one level up, so the parents move instead, each scoped to
  its single consumer so the blast radius is exactly one edge: `"jake>filelist": "2.0.2"` (filelist
  1.0.6 → 2.0.2, which depends on `minimatch ^10.2.1`; `jake@10.9.4` is filelist's only consumer in
  the lock) and `"rimraf>glob": "11.1.0"` at root plus the npm-nested `"rimraf": { "glob": "11.1.0" }`
  in `functions/` (`rimraf@5.0.10` is `glob@10.5.0`'s only consumer in both locks; `glob@11.1.0` is
  the copy the root tree already carried for `workbox-build`, so root simply dedupes onto it).

That closes all four chains: root `vite-plugin-pwa → workbox-build → @trickfilm400/rollup-plugin-off-main-thread
→ ejs → jake → filelist → minimatch`, root `firebase-admin → @google-cloud/firestore → google-gax →
(gaxios → gcp-metadata → google-auth-library →) rimraf@5 → glob → minimatch`, and the same google-gax
chain in `functions/` via `@google-cloud/billing`, alongside the eslint chains. The now-dead
`"brace-expansion@<2.1.2": "2.1.2"` entry was DELETED from `pnpm-workspace.yaml` — no 2.x copy
survives anywhere, and `2.1.2` is itself inside this advisory's range, so leaving it would have
pinned a vulnerable version for the next dependent that wandered in.

**Function verified per parent, in OUR trees** (an audit number is not proof a swapped parent still
works): `require('jake')` loads and `jake.FileList` / `filelist@2.0.2` glob real files including a
brace pattern (`lib/{ejs,utils}.js` → both files), resolving `filelist → minimatch@10.2.5 →
brace-expansion@5.0.8`; `rimraf@5.0.10` + `glob@11.1.0` performs both a glob-mode selective delete
(`x/**/*.{log,tmp}` removes the logs, leaves `keep.txt`) and a recursive root delete, in each tree;
and in `functions/` the production consumers `google-gax`, `firebase-admin` and `@google-cloud/billing`
all load clean. The full gate exercises the same paths (`just ci`'s production build runs
workbox-build's globbing; the functions lint/build/test lane runs green).

**Exposure, stated honestly.** At root every chain was build-time only (eslint config globbing,
workbox file globbing, and `firebase-admin` is a root devDependency used by `scripts/`) — nothing
brace-expansion-bearing has ever reached the browser bundle. In `functions/` the 2.1.2 copy was NOT
build-time: it sat in the PRODUCTION dependency tree (`@google-cloud/billing`/`firebase-admin` →
`google-gax` → `rimraf` → `glob@10` → `minimatch@9`), i.e. it shipped inside the deployed Cloud
Function. Even there the risk was library-internal — the brace patterns expanded are authored by
`google-gax`'s own cleanup code, never user-supplied or network-fed, so there was no
attacker-controlled path into the unbounded expansion — but "build-time only" would have been the
wrong claim, and the production copy is now `5.0.8` regardless.

Lockfiles regenerated with the minimal command and the diffs proved to contain ONLY that movement:
`pnpm-lock.yaml` +15/−138 and `functions/package-lock.json` +40/−216 for the whole commit
(`git show --numstat`) — of which the version re-point above accounts for 6/6 and 4/4, and the
parent overrides for the rest. Root: the two override lines plus the orphaned `glob@10` /
`minimatch@5.1.9` / `minimatch@9.0.9` / `brace-expansion@2.1.2` subtree falling out (`jackspeak@3`,
`path-scurry@1`, `lru-cache@10`, `@isaacs/cliui@8`, `string-width@5`, `wrap-ansi@8`, the cjs shims);
`functions/`: exactly `glob` 10.5.0 → 11.1.0 with its own deps (`jackspeak` 3→4, `path-scurry` 1→2,
`lru-cache` 10→11, `@isaacs/cliui` 8→9) and the removal of the glob-scoped `minimatch@9` /
`brace-expansion@2.1.2`. Nothing else re-resolved — no rollup/terser/babel/
browserslist drift — and both were validated by a clean `rm -rf node_modules` + `pnpm install
--frozen-lockfile` / `npm ci`. Nothing bumped that was not named above: `minimatch` is a single
10.2.5 everywhere, `rimraf` stays 5.0.10, `jake` 10.9.4, `google-gax` 5.0.7, `firebase-admin` 14.0.0,
`eslint` 10.4.0 (root) / 10.4.1 (functions).

Verification: `pnpm audit` at root and `npm audit` in `functions/` report ZERO `brace-expansion`
findings, and `npm audit --omit=dev` in `functions/` reports zero vulnerabilities of any kind (the
production Cloud-Function tree is clean). `just ci` green; the `functions/` lint + build + test lane
green. Two unrelated advisories surfaced in the same sweep and stay OPEN, out of scope for this
remediation: `react-router` GHSA-qwww-vcr4-c8h2 (RSC-mode CSRF, `>=7.12.0 <8.3.0` — patched only in
8.x, a major bump; this client-side Data-Mode SPA has no RSC/server surface) and, in `functions/`,
`postcss` GHSA-r28c-9q8g-f849 (source-map path traversal, a vitest dev-tooling transitive).

## Shipped — Dependabot security remediation (2026-07-24)

Cleared the two open Dependabot alerts, both the same advisory (GHSA-v2hh-gcrm-f6hx, high — `fast-uri`
host confusion via a failed IDN canonicalization on a literal backslash authority delimiter),
transitive through `ajv` in both trees. Root (pnpm) and the standalone `functions/` package (npm)
each got a scoped `<fixver` override in their existing overrides block — `"fast-uri@<3.1.4": "3.1.4"`
— patch-only, no parent re-resolution; `ajv` itself did not move (root stays on `6.15.0`/`8.20.0`,
functions on `8.20.0`). Note: the true patched line is `3.1.4`, not the `3.1.3` first named at
triage — the GitHub advisory's `patched_versions` is `>=3.1.4` (`3.1.3` is still inside the
vulnerable range `>=3.0.0 <=3.1.3`), confirmed by both `pnpm audit` and `npm audit`'s own advisory
data, so the override targets `3.1.4`. Root exposure was dev-only (`fast-uri` reaches the tree only
via `vite-plugin-pwa` → `workbox-build` → `ajv`, a build-time dependency); the `functions/` exposure
is low — `fast-uri` is a JSON-schema `$ref`/format-validation helper inside `ajv`, reached only
through `firebase-admin`'s own schema validation, never fed attacker-controlled URIs directly. `npm
audit` in `functions/` reports zero known vulnerabilities; `pnpm audit` at root reports zero
`fast-uri` findings (4 unrelated `react-router` moderate/high advisories remain, out of scope for
this remediation — a separate, newer alert set). `just ci` green. **Update:** the 4 react-router
advisories flagged out-of-scope above (GHSA-wrjc-x8rr-h8h6, GHSA-h8fp-f39c-q6mh,
GHSA-337j-9hxr-rhxg, GHSA-chx6-hx7r-mcp5) are now cleared by the `react-router` 7.15.1→7.18.1 minor
bump — triaged non-exploitable for this client-side Data-Mode SPA (no RSC/SSR/server surface; no
attacker-controlled navigation sink), patched as hygiene.

## Shipped — Dependabot security remediation (2026-07-21)

Cleared every open Dependabot alert (22 root + the Cloud-Functions set) with the minimal, safest
change — no new dependency, no behavior change (golden rules 1, 22, 23; rule 27 clean board). Root
(pnpm) pinned `vite` to the `~8.0.16` patched line (deliberately staying on the 8.0.x line: `^8.0.16`
resolves to 8.1.x, whose tightened `import.meta.glob` types break the pack build's `content-pack`
lint) and added scoped `overrides` in `pnpm-workspace.yaml` — each keyed by the vulnerable
`<fixver` range — for `websocket-driver`, `form-data`, `protobufjs`, `undici`, `@babel/core`, `uuid`,
`js-yaml`, and `brace-expansion`. The standalone `functions/` package (npm) bumped `nodemailer` to
`^9.0.1` (the only patched line; SMTP `createTransport`/`sendMail` API unchanged) and added the same
style of scoped npm `overrides` for `form-data`, `protobufjs`, `uuid`, `brace-expansion`, and
`body-parser`. Every override is an exact same-major patched pin (only the vulnerable copy moves)
EXCEPT `uuid` (root 9.0.1→11.1.1, functions 8.3.2→11.1.1) — a necessary cross-major bump because
advisory GHSA-w5hq-g745-h8pq (uuid `<11.1.1`) has no same-major fix (11.1.1 is the only patched
release); API-safe since consumers only call `uuid.vX()` and the gate is green. `pnpm audit` and
`npm audit` both report zero known vulnerabilities; `just ci` + `just ci-srd-only` + the functions
lint/build/test lane all green.

## Shipped — the content-pack licensing partition (2026-07-17)

The data-split seam that precedes open-sourcing: `src/data` + `src/i18n/*/srd` now carry ONLY
SRD 5.2.1 (CC-BY-4.0) content (every entry `source: "SRD"`, guard-enforced by
`tests/unit/content-pack-partition.guard.test.ts` — PI-term denylist + source invariant); everything
else (825 entries: the Artificer, all non-SRD subclasses/feats/spells/species/backgrounds/magic
items, the 20 maneuvers, the team fixtures, the pack dev scenarios and pack-only test suites) lives
in the private `content-pack/`, composed back via the `@pack` build-time alias (plus its ONE
sub-entry `@pack/monsters`, which keeps the unbounded bestiary corpus off the eager-reachable
barrel) so the composed app matches the pre-split product (the pack overlay restores the 18 PHB creator names — published
publicly under their SRD 5.2.1 names — plus the full Elven Lineage / Pact of the Chain prose and
the pack's own heritage-feat category label; the engine's feat-category/scope vocabulary was renamed to the generic
`heritage` — not persisted in any live doc, verified). Both build modes gate green: `just ci`
(pack mode, coverage floors) and `just ci-srd-only` (the public snapshot's composition). Full seam
doc: `docs/ARCHITECTURE.md` → "The content-pack seam". **WI-1 shipped (2026-07-17): exact dual
attribution** — the licensing audit proved the shipped prose draws on BOTH SRD 5.2.1 and SRD 5.1
(each CC-BY-4.0, each requiring its own exact statement), so `/legal` now carries both required
statements verbatim as two stacked plaques (EN texts + WotC's official IT texts — the official
IT SRD 5.1 exists, `SRD_CC_v5.1_IT.pdf`) and `README.md` carries both EN statements; unit + e2e
locks pin all four byte-exact. **Repatriation follow-up (2026-07-17):**
the verifier's 22 KEEP-PACK holdbacks (11 subclass features + 11 magic items — all genuine SRD
5.2.1 entities held back only for residual prose lineage) were re-sourced to the SRD's own CC-BY
prose (EN verbatim, IT per the D2 cascade from the official IT SRD) and moved public, so Hunter /
Draconic Sorcery / Fiend Patron / Evoker ship complete features in SRD-only mode; the now-empty
`dataOverlay.subclassFeatureIds` escape hatch was deleted from the seam (the pack-subclass
composition — `withPackSubclasses` in `src/data/classes.ts` — remains; only the data-overlay
branch died), and Cube of Force carries
the SRD table (Tiny Hut / Private Sanctum / Resilient Sphere — mechanics identical, no overlay).
**Docs-partition + sensitive-value sweep shipped (2026-07-17):** the tracking docs are split the
same way — pack-entity coverage/backlog rows moved verbatim to `content-pack/docs/` — the remaining
docs generalized (no pack-entity names, no live-fixture identifiers, no personal values in the
would-be-public tree), the Storage rules' admin check made data-driven (matching the Firestore
rules), and the partition guard extended to scan the docs for the PI lexicon + identity values.

**Open-sourcing scaffolding shipped (2026-07-17):** the lean public workflow pair (`ci.yml` —
push/PR typecheck+lint+unit+build+budget gate, SRD-only by construction, self-skipping while the
repo is private; `deploy.yml` — dispatch-only, mirrors `just deploy` on a runner and composes the
private pack repo `salvodicara/d20-folio-content` via `CONTENT_PACK_TOKEN`; `test.yml` /
`visual.yml` / `update-snapshots.yml` deleted), the public front-door `README.md`
(SRD-only build story + exact dual attribution kept), public `package.json`
repository/homepage/bugs metadata, and the ONE-OFF snapshot builder — a
`build-public-snapshot.sh` that lives ONLY in the private tree's `scripts/` (it excludes itself
from the snapshot it cuts, so the public tree never carries it). The builder is clean-tree-only:
it copies all tracked files minus the exclusions below into a fresh-history repo — single commit
"feat: initial public release" authored under the GitHub noreply address — verifies the
exclusions are absent, then runs the partition guard + the full SRD-only gate inside the target
from a fresh install; it is `git rm`'d once the public repo is live. The exclusions (all
private-tree-only paths; this paragraph is the script's single source): the private
`content-pack/`, the local reference-data mirror (`data-scrape/`), the three
data-retrieval/ingestion scripts (`scrape_wiki.py`, `ingest_magic_items.py`,
`analyze_mechanics.py`), `previews/`, and the builder script itself.

**SHIPPED — the repo is PUBLIC (2026-07-17).** The open-sourcing epic (GH #32) is closed: the
snapshot was cut and `salvodicara/d20-folio` published with fresh history ("feat: initial public
release"); the split-repo world is live — the public repo is the canonical dev home (justfile,
hooks, worktree flow) and the private `salvodicara/d20-folio-content` repo carries
`content-pack/` + archives, composed locally via a gitignored sibling-checkout symlink
(`content-pack -> ../d20-folio-content/content-pack`, auto-linked into each worktree by `just wt-new`
when the pack sibling exists — composed-by-default — docs/CONTRIBUTING.md
→ "The two build modes"; pack tests reach public-root helpers via the root-anchored `@tests/*` /
`@scripts/*` aliases, the vitest lanes resolve with `preserveSymlinks`, and the dev server allows
the pack's real directory — docs/ARCHITECTURE.md → "The content-pack seam"). The spent snapshot
builder is gone (the public history never carried it). Residual (unchanged by the split): the
Playwright e2e suite stays pack-mode-only (`surfaces.ts` + several specs drive pack fixtures /
scenarios); the public `ci.yml` gate — typecheck + lint + unit + build + budget — is green
SRD-only.

## Active epic — The full-BG3 pivot (owner-ratified 2026-07-16)

**The owner's charter, captured on ratification (golden rule 4).** Baldur's Gate 3 — THE GAME — is
the aesthetic north star, now applied without the prior restraint: this **supersedes the
"Ember Penumbra" lit-magic grammar and the "Daylight Sibling Plates" light direction as an informed
override** (both shipped and owner-ratified earlier; the owner reopened and re-decided knowingly).
`docs/PRODUCT_CONSTITUTION.md` **amendment v1.8** lands with the parallel identity mission. The
quality bar, verbatim: _"It has to be woooooow. Users have to go: woooow man this is so professional
and curated, it's even better than DND Beyond!"_

The pivot's work packages:

- **Rules-text colour grammar — SHIPPED on this branch:** the rules-prose scannability grammar
  rebuilt full-BG3 — damage phrases wear their damage type's hue, condition names their condition
  hue, values (dice · save DCs · measured distances/durations) the lit special-ink register, and
  Advantage/Disadvantage the success/danger inks, the way BG3's tooltips read at a glance —
  colour explicitly ratified for rules prose, replacing the earlier weight-only restraint
  wholesale. Both themes DESIGNED (each theme's existing AA ink ramps), both locales first-class
  (IT inflection vocabulary included), axe serious/critical = 0. Grammar spec: `DESIGN.md` →
  "Rules-text colour grammar". **Locale-corpus closeout (2026-07-17):** the measured-unit
  vocabulary now covers every unit the SRD writes — EN `inch`/`inches`, IT `centimetr[oi]`
  (magic-item small-scale prose) — closing the last review-flagged unit gap; and the IT damage-type
  nouns are normalized corpus-wide (197 occurrences across all `it/srd` catalogues, both partitions)
  to the SRD defined-term capital ("danni da Fuoco", "danni Necrotici"). The grammar is first-letter
  case-flexible (`[Ff]uoco`, `[Dd]ann[oi]`), so the casing normalization is pure data hygiene —
  render-safe by construction, pinned by the grammar suite. IT casing convention recorded in
  `docs/ARCHITECTURE.md` → "Italian source cascade".
- **Full-BG3 identity mission (parallel):** the app-wide visual language pushed to full BG3; ships
  the constitution v1.8 amendment.
- **Light theme rebuilt** as the daylight sibling of the NEW language (not adapted from dark).
- **Art regeneration:** a precision prompt document in `~/Documents` the owner feeds to ChatGPT
  over days; assets land as they are produced.
- **Follow-up task — a full UI-test-corpus noise audit: SHIPPED (2026-07-17).** The audit ran and
  its findings merged as the `test-audit-*` changeset series: vacuous presence matchers
  strengthened, the permanently-skipped app-shell e2e replaced with a running `login-page` render
  test, the 52 spent one-mission `_*-shots` capture harnesses pruned (git history is the archive),
  and a per-theme reliquary-token count guard added. The four STANDING capture harnesses are the
  deliberate keep — `_polish-shots` (full-surface sweep), `_identity-shots` (identity/theme sweep),
  `_scenario-shots` (mechanic injection), `_perf-probe` — with their distinct roles and the
  `git rm`-before-merge convention recorded in `docs/CONTRIBUTING.md` ("The `_*` capture-harness
  convention"); `_identity-shots` and `_polish-shots` stay SEPARATE by design (theme-surface vs
  full-surface sweeps), not folded.

## Shipped epic — The chrome reset (owner-ratified 2026-07-24; phases 0–9 DONE)

**The owner's verdict, verbatim:** the accreted chrome is _"a lasagna — layers, not a design"_. The
ruling: **ONE design vision, copy BG3 as faithfully as possible, re-question everything, nothing
less than perfection, no patches on top.** A holistic audit measured what the app actually paints
(216 distinct chrome signatures, 273 framed boxes on one cockpit page, 8 radii in simultaneous use,
18 rotated-diamond ornaments, four coexisting divider grammars, and eight confirmed layer
collisions — including the double separator on the delete-character dialog the owner named) against
the reference measured in pixels. The target system, its 73-row reconciliation ledger and its
phase plan are recorded in `DESIGN.md` (§4 "The plate material", §5 "The ornament vocabulary").

**The three laws** the whole reset is derived from:

1. **A frame means _container_ or _interactive_. Nothing else is framed.** Static information
   inside a container is separated by whitespace and typography. Maximum framed nesting: 2.
2. **An ornament is the line's own LOCAL FORM** — never a second rail beside it, never drawn over
   or near one.
3. **State changes light and colour only. Geometry is frozen.**

**All nine phases have landed.** The chrome is one system: six primitives, two tiers, two radii,
one divider, one state ladder, one mark. The phases (each one worktree, one merge, green on both
build modes):

| Phase | Scope                                                                                                                                                                                                                                                                                                                                       | Status   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 0     | Reset the base — the four unpushed plate-grammar commits do not survive as landed (their diagnosis is adopted; their implementation layered a second bevel ON the elevation stack instead of replacing it, which is what produced the 10-term card shadow, the doubled cast and the doubled basin)                                          | **DONE** |
| 1     | **DELETION** — every DELETE row in the ledger, nothing added, nothing redesigned                                                                                                                                                                                                                                                            | **DONE** |
| 2     | The material primitives — PLATE (one specular dome) · EDGE (**moat → metal → groove → body**; there is no cream lip) · HAIRLINE · INK, replacing `--elev-*` on every plate. **8 tokens**, the closed set pinned by `chrome-system.guard.test.ts`                                                                                            | **DONE** |
| 3     | Radius + geometry unification — 6 radii → 2 (10px plates, 0 chips); the square-corner ruling reversed (the reference's corners are rounded ~10–12px ALWAYS, including the ornamented ones)                                                                                                                                                  | **DONE** |
| 4     | **UNFRAMING** (L1) — every read-only facet, list row and grouping rail gives its frame up; **nesting 3 → 2 on every surface**                                                                                                                                                                                                               | **DONE** |
| 5     | The state grammar (L3) — **one ladder in tokens** (`index.css` §04b), consumed by cards, tiles, rows, tabs, chips, option cells, wizard entries and every button register; every geometry-changing pointer/focus/selection state deleted (a disclosure still resizes the content it reveals)                                                | **DONE** |
| 6     | **The MARK** — the corner terminal + the run cartouche, mounted on exactly ONE surface per route (the screen's identity plate). Dimensional metal, gold in BOTH themes, mirrored geometry toned in screen space, fixed-size SVG background layers on a decor-only overlay. Its ANATOMY was re-cut in phase 9 against the corpus (see below) | **DONE** |
| 7     | Light sibling re-derived against the finished dark system + the guard suite extended to pin phases 4–6 (eleven mutation proofs) + the budget measured                                                                                                                                                                                       | **DONE** |
| 8     | **CONVERGENCE REVIEW** — the four defects the independent review found, and the guard-coverage class behind two of them (a guard that samples only where the work was done)                                                                                                                                                                 | **DONE** |
| 9     | **THE SCREENS THE RESET NEVER REACHED** — the two wizards, the campaign hub's nested cards, the dark on-art ink the light-only battery could not see, the MARK's anatomy, and the discipline behind all of it written into the golden rules                                                                                                 | **DONE** |

**Phase 9 answered the owner's standing question — "is this what a team with one vision would have
shipped from day one?" — whose independent-review answer was "No, and the tell is that you can still
name which screens they did first."** The tell was the WIZARDS. `folio.css` carried ~250 `.wiz-*`
rules and exactly **three** consumed a state token: the class/species/background plaque — the
wizard's whole reason to exist, and the first plaque a new player ever meets — hovered with its own
border-mix, its own elevation stack and DOUBLE the licensed 1px settle; the chosen plaque wore its
own silver-over-bronze selection frame while every other selectable surface in the app took the
accent metal; the hit-die chip kept a real 1px gold border on a read-only classifier the recipe
classes `.trk-die` / `.tr-die` / `.uc-tag` had all given up; and **twenty-two** wizard rules emitted
a bloom into a chrome whose §5 says it has none. The whole family is on the reset now — the plate on
both tiers, the ladder for hover/pressed/selected/disabled, eleven read-only facets and gems
unframed, the selection frame spent once (on the altar, which is not a sibling among equals), and
the 1px settle honoured. Both wizards are in the census for the first time, which is most of why
none of it was ever caught.

**THE CAMPAIGN HUB stopped framing what only groups.** Eleven of its fourteen large framed boxes
were non-interactive `.info-card`s, and they NESTED — `li.info-card` inside `.info-card.section-card`
in Sessions, Shared notes and Party — which is the cockpit-rail law applied in the opposite direction
on the two pages users move between most. The sections wear `.folio-panel` now (face, dome, grain,
cast, no metal), their entries are frameless rows on the one hairline (`.hub-rows` / `.hub-row`),
and the DM verbs are frameless cells (`.hub-cell`). Sessions' `border-bottom` divider — a hard,
wall-to-wall line the reset had already banned everywhere else — is the hairline. **Census: the hub
41 → 37 boxes (ceiling 46 → 42) and its running-encounter view 52 → 48 (57 → 53), nesting 3 → 2.**

**And the class behind all of it is a golden rule now.** Rule 13 gains a derivation clause
(`docs/GOLDEN_RULES.md`, amended rather than added — it is a facet of "the cheapest test that pins
the fact", and the count stays at 27): **a guard DERIVES its inputs from the artifact and states
what it CANNOT see.** Every real defect this project has found was hidden behind a green guard that
sampled a hand-picked case instead — contrast on 2 of 3 grounds, a dome for 1 of 3 ink tiers, an axe
fixture on the one monster whose prose fires no grammar, a census on the one tab already swept, a
geometry sweep without disclosure, an on-art battery with one leg, an "unframed" check a 45%-opaque
`color-mix(…, transparent)` passes, a probe asserting contrast where the defect was identity. The
guards added in this phase all obey it: the plate list is read out of the stylesheet, the on-art
ground out of a screenshot, the mark's anatomy out of its own path data — and each carries its blind
spots in its own header. `DESIGN.md` §14 and `docs/CONTRIBUTING.md` point at the rule.

**Three blind spots the review named, each closed and each mutation-proved.** (1) The L1 UNFRAMED
check tested "does the border value MENTION `transparent`", so `color-mix(in oklab, var(--seal) 45%,
transparent)` — a 45%-OPAQUE border — passed it; only the rendered census ever caught `.cmp-seal`.
The colour is now isolated from the shorthand and must BE the keyword. (2) Two of the four L3
disclosure exemptions were PREFIX matches, so `.wiz-entry[data-open] > .wiz-row:hover { padding: … }`
— a surface resizing under the cursor — was waved through by a carve-out about revealed content; the
carve-out is anchored to the resting selector now. (The third reviewer's ruling stands: a BORDER
change inside a disclosure body is an L1 question, not an L3 one, so that part of the exemption is
kept.) (3) The pact-slot register rendered on NO swept surface — every mock character is a full
caster — so `/characters/scn-magical-cunning-warlock` joins the manifest and brings the whole pact
vocabulary under a11y, locale and both ink batteries.

**THE MARK's anatomy was one member where the reference has three.** Measured against
`crop-lvl-panel-topleft.png`, BG3's corner is crossed BLADES with crescent-hook terminals
overshooting the vertex, a PAIR of long quarter-arcs, and RAYS of markedly different lengths — one
running nearly the width of the figure. We shipped the third member alone, as a symmetric fan of
seven near-equal rays, which at 8× reads as a whisk. And its mid-edge event
(`crop-lvl-winged-divider.png`) is a LUMINOUS V-fleur, the brightest thing on the rule; ours was two
dim leaf-slivers with a centre chevron DIMMER than its own wings and no visible weave. Both are
re-cut: the corner is the three-member unit at 56px (monoline, the variation is LENGTH not weight),
and the cartouche's weight is inverted around a V-fleur with the rail re-struck over the leaves at
four crossings so the weave actually reads. **Measured on the rendered masthead, diffed against the
same plate with the overlay hidden: the peak ink moved from the CORNER to the CARTOUCHE'S CENTRE in
both themes — dark 6.35× corner / 5.67× centre → 5.81× / 6.65×; light 9.52× / 8.22× → 9.50× /
10.93×. Coverage 14.4% dark, 15.2% light, against the 34% cap.** Two derived guards pin it: the
corner tile must carry curved members as well as rays and its ray lengths must spread ≥1.9×, and the
cartouche's centre must composite brighter than its wings.

Fixing the seating exposed a third: `--mark-drop` was derived as if an absolutely-positioned child's
`inset` resolved against the border box. It resolves against the PADDING box, so the shipped
cartouche floated **2px above** the rule it was supposed to interrupt.

**DARK ON-ART INK was a live severe defect nobody could see, because the battery had no dark leg.**
`tests/e2e/on-art-ink.spec.ts` ran LIGHT ONLY, on the premise "the art is dark, so light ink is
safe" — but the backdrops carry large BRIGHT regions. Measured against the real composited pixels,
dark's `--text-muted` read **1.64:1** on the campaign hub's section counts, its gold rubric 1.95:1,
the treasury gp-total chip 1.46:1, and the wizard's "Create Character" caption 1.52:1. The GROUND is
theme-agnostic now and only the INK flip is light's: each register list carries an unprefixed twin
beside its light flip, cross-checked by a guard so a register can never be grounded in one theme and
bare in the other. A control loose on the scene self-backs on `--on-art-plate` instead, because a
halo grounds INK and cannot ground an EDGE. **Every swept surface measures 0 failures at 4.5:1 in
both themes.** The battery's new CONTRAST leg screenshots each surface with every text transparent
and samples the composite the ink actually sits on; reverting the ground to light-only fails it at
1.59:1.

The route there is worth recording, because it is the same shape as the defects it fixes: the first
mechanism put the halo on `.on-art-scope` and let it INHERIT — one rule instead of two, and the
obvious thing to try. An auditor reads a container's `text-shadow` as an opaque BACKGROUND for
everything inside it, so that made axe resolve a `#73613c` ground behind every descendant and turned
**eight clean light surfaces into serious `color-contrast` violations**. The second attempt (the
halo on every `<span>` inside a control) painted a dark halo behind dark ink that was never in the
on-art vocabulary. The halo rides the LEAF selectors, and both dead ends are written into the
stylesheet at the site so neither is tried again.

**Bringing the ladder to a plate surfaced a live severe defect on the deployed app's landing route.**
`background-image` is a REPLACED property exactly like `box-shadow` — so `.ch-card:hover`, which set
`background-image: linear-gradient(<wash>, <wash>)`, **discarded the plate's dome and face**: the
roster tile went translucent under the pointer, with the candlelit backdrop showing straight through
the card and `--text-muted` stranded on a lit candle. `.ch-card:active` and `.ch-card[data-selected]`
carried the same rule and were converted with it. The No-Second-Grammar guard was written about
`box-shadow` and stopped one property short, and it was green throughout. The ladder now reaches a
plate through **the veil slot** (`--state-veil`, composed by the plate at rest, set by every rung),
and the two guards that pin it DERIVE the plate list from the stylesheet.

**The convergence review then found that sweep was not exhaustive, in both directions.** Two
`:active` rungs still replaced the face — `.rest-card:active` (the Short/Long-rest tile, a core play
surface, and `all: unset` so there is no background-color under it to catch the fall: pressing it
computed a bare `linear-gradient(rgba(0,0,0,.16), …)` on a transparent tile) and
`.statcard:active .statcard-face`. And in the other direction, four higher-specificity
variant/theme rules re-cut a face with the `background` SHORTHAND, which resets `background-image`
and drops the slot out of the composition — `[data-theme="light"] .statcard-face`,
`[data-theme="light"] .statcard.caster .statcard-face`, `.statcard.caster .statcard-face` and
`[data-theme="light"] .lvl-chip` — so this wave's own new hover rung was a **no-op on three of the
four statcard combinations** and on the level chip in light. All six compose the slot now
(browser-verified: the veil paints and the face survives on dark/light × plain/caster, hover and
pressed, and the pressed rest tile keeps its gradient).

**The guard missed all six, and its sibling was worse.** The plate check derived its subject list
from `var(--plate-face)` alone, and all four cascade strips author their face INLINE — so it saw
none of them. It derives from **either** signal now (the material token OR the ladder's own slot),
which reports exactly those six and nothing else. Its sibling derived a set, filtered by it, and
never asserted the set was non-empty: renaming `--state-veil` throughout `folio.css` — which makes
every plate's composition and every rung in the app inert — left the file **19/19 green**, because
the derived set and its filter emptied together. That is verbatim the failure rule 13's derivation
clause names, shipped in the same wave as the clause. Both halves carry a floor now, and every guard
this wave added or amended was audited for the same omission; the rendered census and the on-art
contrast battery each gained one, because a CEILING over a derived set reads a broken probe as the
tidiest screen in the app.

**And "all 22 glow terms are gone" was not true.** `.wiz-done-level` — the 2.4rem number on the
level-up commit screen, the largest gilt type in the app — carried
`text-shadow: 0 0 18px color-mix(in oklab, var(--accent-glow) 38%, transparent)` straight through
the sweep, because the sweep deleted glow TOKENS and this bloom was written as a literal. It is
deleted, and the check that missed it now DERIVES: no `text-shadow` layer anywhere may be a
zero-offset blur of ≥6px, with custom properties resolved so a glow cannot hide one hop away in a
token, and one selector-anchored exemption (the ✦ magic-source marker, a glyph standing in for an
icon — its `svg` twin kindles identically through `drop-shadow`). The 3px-blur `--on-art-halo`
needs no exemption, which is the point of the threshold. What the probe still cannot see is stated
in its own header: a glow routed through `filter: drop-shadow`, and `box-shadow` emission —
**fifty-three** shipped recipes light an OBJECT that way (gilt CTAs, the lit economy sockets, focus
wells, the caster statcard), which is a far larger question than FLAT TYPE and wants its own wave
and its own owner ruling.

**Budget, RE-MEASURED (the recorded figure had the wrong sign).** Commit `0d10f34` recorded
"CSS 73,768 → 74,340 B gzipped for the whole of this wave". Measured with full production builds of
the merge base and of the branch head and `gzip -9` on the emitted stylesheet: **base `8f10927`
512,073 B raw / 73,851 B gzipped → head 501,329 B raw / 73,300 B gzipped — the wave SHRANK the CSS
by 551 B gzipped (10,744 B raw)**, of which the plate-grounding counter-law spends back
+1,684 raw / +176 gzipped. Nothing was ever broken by it (no ceiling was raised and
`bundle-budget` is green throughout); the original number was simply not reproducible, and a budget
figure that cannot be re-derived is worse than none.

**AND THE HUB'S SECTIONS TOOK CREAM INK ON IVORY — the wave's own worst regression, caught by an
independent design review.** Rebuilding Sessions · Shared notes · Access · DM tools · Danger zone on
`.folio-panel.section-card` / `.hub-row` / `.hub-cell` moved them OUT of the on-art flip's
hand-written surface-exclusion list, so in LIGHT theme the session summaries, the shared-note bodies,
the note-row glyphs and `EDIT SUMMARY` computed `rgb(248,241,222)` + a four-layer dark halo **inside
an opaque ivory panel** — 43 elements, on the owner's own campaign prose. Nothing caught it:
`on-art-ink.spec.ts` only ever measured UNDER-grounding (is loose ink legible on the art) and the
panel is a surface, so it skipped every one; and `on-art-scope.guard.test.ts` regex-matched that the
string `.info-card` still appeared inside the exclusion, which it did, while no component in those
sections used the class any more. Its own docstring named "re-leaking the outline onto the DM Tools
card" as the regression it existed to prevent.

**The fix is the mechanism, not the list.** "Is this text on a surface" is a fact about the rendered
ancestor chain; no CSS selector can express it, so an exclusion list cannot be derived and rots on
contact with the next surface class. The blanket is DELETED — five rules, ~9.9 KB of raw CSS — and
the treatment is opt-in on the leaf: `.on-art` (body ink), `.on-art-title` (gilt), `.on-art-chip` /
`--on-art-plate` for an object that backs itself. Shared components (`SectionHeader`, `Section`,
`RunicEmptyState`) take an **`onArt` prop**, because the caller is the only thing that knows where it
mounted them. One region-level opt-in remains — the wizard column, loose by construction, which names
its OPEN-COLUMN registers positively.

**AND THE POSITIVE REWRITE RE-CREATED THE GHOSTING ONE LAYER UP — caught by pass-2 review.** "A
plaque's text is simply not in the list" was false. PLATES stand INSIDE the loose column — the
enthroned hero altar, the level-up ASI/boon panel, an open feat entry — and they host those very
registers, so the region rule reached them through the plate: measured in real Chromium,
`.wiz-hero .wiz-asks-head` was cream `rgb(248,241,222)` on an ivory plate at **1.04:1** and
`.wiz-asi .wiz-pick-label` / `.wiz-count` at **1.02:1 / 1.00:1**. Nothing caught it because the
hand-written CSS exclusion had moved into a hand-written PROBE exclusion: `.wiz` sat in the leak
leg's `OPT_IN`, skipping the entire wizard, and `wizard-css.guard` asserted only that `.wiz-hero`
was not in the REGISTER list — true, and the wrong axis, since the defect is `.wiz-hero` as an
ANCESTOR. The stated justification for the skip ("~60 markup opt-ins") was false as well: removing
it flags **3 cells out of 100**, all real. Fixed on all three axes — a positive counter-law in
`folio.css` (a register on a SURFACE loses the halo and gets its own declared ink back), the
`OPT_IN` narrowed to self-backing leaves (`.fchip` named instead of the whole wizard), and the
guard's axis corrected. **Both lists are now DERIVED**: a surface is any rule painting
`--plate-face` or `--panel-alpha`, and `wizard-css.guard.test.ts` re-derives that set plus the
register set from `folio.css` and fails if the counter-law misses either — so adding a plate, or a
register, cannot silently reopen this. **Measured after: altar 15.15:1 light / 6.43:1 dark, boon
panel 14.20:1 and 14.49:1 light / 6.71:1 and 6.72:1 dark; a rendered walk of BOTH wizards (creation
steps 1–10 and three level-up scenarios, resting + enthroned, both themes) reports 0 over-treated
and 0 ungrounded; `on-art-ink` 250/250 green with the wizard no longer skipped.** Four mutation
proofs: a new `--plate-face` rule, a new register in the region rule, `.wiz` back in `OPT_IN`, and a
re-introduced `.wiz-hero .wiz-asks-head { text-shadow: var(--on-art-halo) }` each turn a distinct
assertion red.

**And the vacuous guard is replaced by a rendered one, in the direction nobody was measuring:** in
both themes, text whose ancestor chain paints a surface may carry neither the on-art ground nor the
on-art ink. Mutation-proved (re-applying the treatment to `.section-card .sess-prose` turns both hub
cells red). Its sibling floor was also wrong and is fixed: the contrast leg's new non-empty assertion
floored the RESULT (`loose ink was found`), which fails 40 honest cells — plenty of surfaces are all
panel — so it floors the WALK instead (`the probe reached text at all`).

**Two second-order calls, both made deliberately.** (1) Access · DM tools · Danger zone had lost
their `InfoCard` and their prose was floating on the artwork at 1.34–1.79:1, rescued only by the
halo, beside siblings that KEPT their plates — so they take the same `framed` section material as
Sessions/Shared notes/Treasury. Five framed panels on the hub now, not three; the hub is consistent
with itself, which is what the wave set out to fix. (2) `--on-art-plate` was theme-agnostic
near-black, making the DM attach affordance the only near-black object on the cream hub between two
ivory panels. The plate, its ink and its ground are per-theme tokens now, so one recipe serves both
rooms. **Measured after: the hub's panel prose is `rgb(46,35,16)` with `text-shadow: none` in light
and its own inks with no halo in dark; the rubrics above the panels keep the gilt + foil outline;
0 leaks and 0 contrast failures on every swept surface in both themes.**

**Phase 8 closed the review, and the class the review named: our guards kept sampling the one place
the work was done.** Two of the four defects were that pattern. `.cmp-seal` — the mark eight of the
ten codex tabs lead every row with (509 rows on Features, 400 on Magic Items) — survived the
unframing with a border AND the exact two-line lip its siblings `.lvl-seal` / `.uc-seal.lvl` had
given up, because the census's compendium cell lands on the DEFAULT Spells tab, the only tab whose
seals were already unframed; `/compendium?type=feature` measured **49 framed boxes against a ceiling
of 23**. And the L3 geometry sweep covered pointer and selection states but not DISCLOSURE, so
re-inserting the phase's own flagship defect (`.uc.is-open { border-left-width: 4px }`, the 3px → 4px
spine) produced **zero** offenders.

The class fix is in the sampling, not in the two rules: the census now takes each realm's VARIETY
rather than its landing state — a `.cmp-seal` codex tab, the three cockpit tabs that carry a framed
family the Play tab does not, and the campaign hub's running-encounter sub-view — twenty cells, up
from ten. That immediately found a third framed level nobody had measured: the topbar's split combat
pill wrapped a bordered destination chip inside a bordered pill inside the framed topbar, so the seam
is painted now and the chip's cream lip is gone. The other two defects: a new `.slot-cell.pact
.sc-lvl` (0,3,0) silently out-ranked the light AA safety override two rules below it (0,2,0) and
shipped the bright lapis at **2.91:1** on the light rail — a warlock-only state no rendered check can
reach, since every mock character is a full caster, so the pair is now pinned by a cascade-resolving
unit guard that resolves the WINNER per theme and picks up any future `.slot-cell.<x> .sc-lvl` strike
automatically; and `button.vital[data-density="chip"]` ran its HP bar into its own left border in
both themes, because the unframed read-only strike's zero-left padding was never scoped away from
the interactive one.

**Two census blind spots are recorded, not closed** (in the spec's own header — they need a ruling,
not a longer route list): the 20×20 floor skips 106 framed sub-20px elements on the cockpit alone
(pips and bars, `.idp-die` at 27×19, `.move-num-in` at 24×16), and a ceiling's +5 of slack means
re-framing ONE low-cardinality class still fits — putting the metal back on `.folio-panel` adds two
boxes and passes the census. The second is why the census is a companion to the stylesheet guards
and not a replacement: the unit rail guard catches exactly that case.

Phase 8 also carries the over-engineering sweep — `--state-metal-disabled` (zero consumers; disabled
is a recipe, not a metal), `.rule-below` (zero call sites), `--mark-inset` (a one-value variable read
twice in one rule), the last-tracker-row restating the whole spine gradient to drop one hairline
layer, a no-op escape `replace` in the theme sweep, the rail's bespoke seat expect folded into the
QUIET tier table, and the action log's attribute-less wrapper `<div>`. **Budget: CSS 74,766 → 74,601
B gzipped (−165 B).** Three mutation proofs, each applied, caught and reverted: restoring
`.cmp-seal`'s border fails both the new UNFRAMED entry and the new census cell at exactly 49/23;
`.uc.is-open { border-left-width: 4px }` now fails the L3 sweep; deleting the light pact ink fails
the new slot-label contrast guard at 2.97:1.

**Phase 7 re-derived the light sibling against the finished system, and pinned all of it.** What
light now re-derives rather than inherits, each for a stated reason: the dome (wider and softer — an
ivory plate bands sooner), the groove and the cast (warm umber, never black or grey), the state
ladder's **three veils** (the same hue at different alphas matched to the same perceptual step —
hover 10% dark / 17% light, selected 16% / 28%, because the same alpha is ΔL\* 5.9 on near-black and
only ΔL\* 3.4 on ivory), and the MARK's toning (letterpress inversion; the gold itself never
changes). Three light-only leftovers that phases 4–6 had orphaned came out with it: the condition
token's hue halo and the selected segment's gold glow (nothing in this chrome emits), and the held
boon's gold ring plus its inset, which had quietly re-framed a read-only readout the base rule had
already unframed.

**The guard suite.** `chrome-system.guard.test.ts` grew three blocks — **L1** (the twenty unframed
recipes carry no visible border and no inset; the rail carries no metal and its groove lives only on
the earned band; a list row is frameless at rest and its selection is a hairline-bounded wash; the
divider utilities exist and the ghost tier is frameless), **the theme sweep** (no
`[data-theme=…]` strike may put a frame back on a recipe L1 unframed — the hole the light audit
found), and **L3** (the ladder's metals at `:root`, its veils per theme and provably NOT
byte-identical across them, every family consuming it, and a sweep that fails any state rule
declaring a geometry property). `ornament-vocabulary.guard.test.ts` was rewritten for the shipped
mark: exactly two hosts and no third consumer anywhere in the stylesheet, the tiles present in BOTH
themes, no `rect`/`line`/`polyline` in a corner tile (a ray is a triangle, never a rail), the
mirror-then-tone construction, three tonal passes, and the mechanism ban (`border-image`, a layout
border on the pseudo, any animation, any `overflow: hidden` on a host). And
`tests/e2e/chrome-census.spec.ts` is new: it walks the app's surfaces in both themes on the RENDERED
page and fails on nesting > 2 or a per-surface framed-box ceiling set at measured + 5. (Phase 8
widened it from five landing routes to ten states — see above.)

**Eleven mutation proofs**, each applied, caught, and reverted: re-framing the rail · re-framing a
read-only chip · a state rule that resizes · a family leaving the ladder · a list row re-framing at
rest · a theme strike re-framing the held boon · the mark spreading to a dialog · `border-image`
returning as the mechanism · the light veil copied from dark · (e2e) a read-only chip family
re-framing, caught by the budget · (e2e) nesting going three deep again, caught by the nesting law.

**Budget.** CSS 74,086 → 74,766 B gzipped (+680 B, +0.9%) for phases 4–7 together: phase 4's
unframing releases −777 B, and the MARK spends ~1.45 KB gz (4.6 KB of raw SVG per theme, against the
10.6 KB the deleted corner knot carried). Precache is unchanged in kind — no new binary asset ships;
the mark is inline data-URI SVG. `bundle-budget` passes with no ceiling raise.

**Phase 6 gave the wow back, once.** The MARK is two members of one vector family, both drawn as
the LINE'S OWN LOCAL FORM rather than as a second rail beside it — the corner terminal (seven
hair-thin tapering rays anchored on the corner arc's inner edge, radiating inward across a 60° arc
that stays clear of both rails, contributing no run line at all) and the run cartouche (pointed
LEAVES, not strokes — a leaf is a closed lens between two arcs, so it tapers to a true point at
both ends, which is what a stroked line can never do and what makes struck goldwork read struck;
two per side weave over and under the rail and converge on a small descending chevron at the exact
midpoint, with the rail passing through unbroken). The metal is **dimensional**: the geometry is
authored once, mirrored per corner, and toned AFTER the mirror in SCREEN space, so the bevel's
light stays top-left on all four corners. Dark is a gold-300 body on a near-black under-shadow
below-right with a gold-200 glint above-left; light is the SAME gold — bronze stays banned — struck
by letterpress logic, umber shadow wall above-left and warm-cream understroke below-right.

**Which surface earns it, and the proof.** The screen's **identity plate**: the framed realm
masthead on every route that renders one, the cockpit's identity band on the one route that
renders none. They can never co-occur (the cockpit is the only surface that mounts
`.folio-panel.gilt-frame` and it renders no `PageHeader`). The reference's ornament homes are the
active panel among siblings, the ogee head of a **hero/identity panel**, a tab plaque's inner
corners, the one primary CTA, and portrait medallions. We have no set of equal competing panels on
any route, so the first home does not apply — the second does exactly: the identity plate is the
only surface on a route that is unique, earned-tier, and never a sibling among equals. A dialog
carries none (the reference's own modals are plain plates with a title and a whisper), and neither
does the compendium leaf, which sits on a route whose masthead already spends the budget.

**Measured against the reference's own numbers** (dark, the 1184px masthead): ornament ink peaks at
**2.40×** the rule it interrupts (the reference measures 2.0–2.5×) and covers **19–24%** of the run
against the 34% cap. The cartouche mounts only at ≥1024px — the four fans already spend ~68px of
the run, so below that width the 216px figure would breach the cap and start crowding the plate's
own ink. Mechanism: fixed-size per-corner SVG background layers on a decor-only overlay pseudo
(`pointer-events: none`, no layout, no animation, no border of its own) — never `border-image`,
whose proportional tile-shrink mis-seats the centreline, and never a layout border on the pseudo,
which would force a minimum box the size of the tile. The overlay hangs 17px past the plate's foot
so the cartouche's underside can paint (a background is clipped to its own box), which is why a
mark-bearing host must never carry `overflow: hidden` — guard-pinned. Payload: 4.6 KB of raw SVG
per theme, against the 10.6 KB the deleted knot carried.

**One correction to the written spec, found while building it.** The spec's P5 said the corner fan
should start "≥24px in from the vertex", which would leave it floating in the plate detached from
the corner. The reference's own fan plainly emanates FROM the junction where the two rails meet,
and the owner's standing ruling is that nothing floats or detaches. The 24–30px figure in the
measurement is the RAIL BARB's distance along the run, not the fan's origin — so the fan is
anchored on the corner arc and the constraint that actually matters ("never re-draws the host's
rail") is met by the rays radiating inward only.

**Phase 5 gave the app one state grammar.** The five rungs live as tokens — `--state-metal-hover`
/ `-selected` / `-disabled` plus the hover and selected washes, with a per-theme
`--state-wash-pressed` (dark presses into shadow, light into warm umber) — and nine interactive
families now consume them instead of each inventing its own hover: the roster card, the ability
tile, the rest cards, every `.btn` register, the filter chips, the codex tabs, the cockpit tab
strip, the wizard option cells and the wizard entries. The wash is ONE translucent veil composited
over the plate's own face, which is what lets fifty controls share a grammar rather than fifty
gradients. **Every geometry-changing POINTER, FOCUS and SELECTION state is gone:** the open action
row's spine brightens instead of thickening 3px → 4px, the quiet edit hot-spot reveals its frame
entirely in `box-shadow` (no layout size, so no glyph moves — the technique the flowing text variant
already used), two `:focus-visible` strikes gave their `border-radius` back to the element, and the
dying HP readout stopped re-gapping its own value line. **DISCLOSURE states are the stated
exception** and still resize — not the disclosure's frame, which the sweep holds frozen, but the
content it REVEALS: the compendium search unfurling from a lens into a field, the wizard entry's
open row becoming the hero altar, the session entry's body, the action row's detail panel. A sweep
in `chrome-system.guard.test.ts` fails ANY state rule that declares a geometry property — pointer,
focus, selection AND disclosure — with two documented exemptions (a `::before`/`::after` mark
appearing inside a checked control, and the flowing edit field restating its zero footprint) plus
those four disclosure BODIES, each named with its reason.

**Phase 4 unframed the app.** A frame now means "the container the user is acting in" or
"interactive", and nothing else is framed — every read-only facet (chips, tags, verdicts, seals, die
sizes, raw scores, keywords, stat readouts, the keycap) became type in an alignment column; every
list row (the action rows, the codex index, the log, the treasury) became frameless at rest with a
wash on hover and a hairline-bounded WASH BAND when selected; the grouping rail (`.folio-panel`)
gave up its metal entirely, which is what buys back the nesting level the interactive tiles standing
on it need; and the four remaining raw-`border-t` dividers in markup collapsed onto the one hairline
behind the `.rule-above` utility. **Framed nesting is 2 on every surface**, down
from 3, and the count of framed boxes the user can actually SEE fell: compendium **114 → 18**,
cockpit **261 → 83** (42 of those 83 are the per-action commit CTAs — content, not chrome; the
chrome frames went 219 → 41), campaign hub **55 → 41**, roster **14 → 8**, settings **18 → 10**. The
budget is now checked on the rendered page at CI — `tests/e2e/chrome-census.spec.ts` walks five
routes in both themes and fails on nesting > 2 or on a per-surface ceiling. CSS: −777 B gz.

Two measurement notes, recorded because the original targets ("cockpit 273 → ≤ 60, compendium
1313 → ≤ 200") were set against a coarser probe and are not comparable as written. That probe
counted (a) borders declared `transparent` — the geometry-freezing idiom L3 depends on, which paints
nothing, and (b) elements clipped away inside collapsed accordions — 421 of the compendium's 1313
were off-screen list rows and 38 of the cockpit's were verbs inside collapsed action rows. The
census guard counts only VISIBLE edges on VISIBLE boxes, which is what the eye counts.

**Phase 3** collapsed eight simultaneous corner radii to two — a 10px plate and a square chip —
reversed the square-corner ruling on the masthead, the identity band and dialogs (the reference has
no square-cornered panel, and its ornamented corners are rounded too), and **unmounted the corner
mark**: the shipped knot re-drew ~30px of the host's own rail from a square vertex, which cannot
register on a 10px arc. It returns in Phase 6 redrawn as a fan seated inside the radius, which also
releases the 10.6 KB raw SVG payload the four corner tiles carried per theme.

**Phase 2** replaced both depth grammars on every plate with the one material: the dome ships in
BOTH themes (it was `none` in dark, so the flagship theme's plates were the only undomed ones), the
cream inner lip is gone system-wide, and `.folio-panel`'s two 30-line per-theme material blocks
collapse into one rule whose whole light delta is four colour roles in tokens. **The dark pool's
alpha is derived from the ink ladder, not chosen:** the dark plate carries three ink registers and
the faintest has to clear AA at the pool's peak, which caps the pool at **4%** (1.59× the plate's
corner luminance — the ~1.6× the spec sets for dark). It first shipped at 10% (2.78×, brighter than
the 2.4× reference) with only `--text-muted` compensated, which took `--text-faint` to 3.64:1 —
a real AA failure on help text, placeholders and slot labels; the fix re-derived the whole ladder
(`--text-muted` `#988b6e` → `#ae9f7e`, `--text-faint` `#9a8c6e` → `#a09272`, both ≥4.58:1 on every
domed ground). `verdict-ink-contrast.test.ts` now checks a GRID — every domed ground × both
small-prose registers, plus a minimum L\* separation so the floor can never be met by collapsing a
tier — instead of the single (panel, `--text-muted`) pair that let the regression through.

**Phase 1 removed ~95 painted layers and added one** (the hairline): the double separator, the
compendium leaf's double gilt frame, the third parchment-texture copy, the ornament on dialogs, all
18 rotated diamonds, the count medallion, the class-pigment crown, the engraved titling, the crest
watermark on every masthead, and every light-emission system in the chrome — the focus wash and
bloom, `--gilt-glow*`, `--illumination`, `--glint-ink`'s hover sweep, `--emboss-sheen`'s cream lip
and the commit bloom. Four divider grammars collapsed into one `--hairline`.

## Active epic — The DDB-parity frontier (owner-ratified 2026-07-17, OPENED 2026-07-23)

> The standing competitive map this epic serves — the ahead/behind frame, the deliberate non-goals,
> and the moat-vs-opening — is `docs/POSITIONING.md`. **The epic is now ACTIVE** — the bestiary
> campaign flagship SHIPPED (see _Shipped — the SRD bestiary campaign_ below) and the **encounter
> picker SHIPPED** (2026-07-25 — the DM's "Add monster" now opens a bestiary picker + DM statblock
> disclosure; see the bestiary bullet below); the next attack-order step is the 2024-DMG difficulty
> calculator.

**Owner amendment (2026-07-31) — GA is the ratified destination.** "At some point we want to
become GA and compete with DnD Beyond" (owner, verbatim intent): **general availability of the
SRD-clean public build** is where this epic ultimately lands, and **"objectively better" than
D&D Beyond is the acceptance bar** — with any content gap overcome, as usual, by the private
content pack (personal) and the homebrews (the public answer). The mandate is premium and
zero-defect — "everything has to be perfect and premium; we can't afford any bug or weird UI/UX" —
reinforcing golden rule 27. The **monetization shape was ratified** in the same session
(owner, 2026-07-31): **core free forever · self-hosting free · a cheap supporter/premium tier on
the HOSTED instance only** — and only ever on the SRD-clean build (the boundary paragraph in
`docs/POSITIONING.md` governs). The **pre-GA checklist** — parked NOW, blocking GA LATER — was
fleshed out by the owner on 2026-07-31, each item with its why:

1. **Firebase App Check + abuse-resistant quotas** — the code is public, so strangers can hit our
   backend directly; the quota must be protected before any advertising.
2. **The budget posture decision** — DECIDED 2026-08-02 (soft-launch charter R2: £15 cap,
   script-side done, `just safe-arm` applies) — replace the £1 SAFE-01 tripwire with a consciously raised cap
   BEFORE any public push. The analysis on record: the free tier sustains ~100–150 DAU at £0, but
   the 9 MB PWA precache means only ~40 fresh installs/day ride the free hosting bandwidth — a
   single successful advertising day trips the kill-switch and takes the app down; £10–20/month
   carries thousands of DAU. **SAFE-01 stays ARMED until this decision is made.**
3. **The first-load precache trim — DONE (2026-08-02).** Moved the 12 heavy scene/backdrop
   plates (`public/assets/backgrounds/*.webp`, ~1.3 MiB combined) from the Workbox precache to a
   dedicated "scene-art" `CacheFirst` runtime route (`vite.config.ts`) — still offline-capable
   after the one visit that painted a scene (the #59 F14 lesson: EXCLUDING art 404s it offline;
   RUNTIME-CACHING keeps the offline-first guarantee while ending the force-fetch of scenes a
   visitor never opens). **Measured impact: precache 9481.90 → 8185.52 KiB (composed lane,
   323 → 311 entries) — a real but MODEST ~14% cut, not the tripling the original estimate
   assumed.** The scene art turned out to be a small slice (~1.3 MiB) of a precache now
   dominated by offline-first JS/data (the bestiary corpus, `cockpit-engine`, the SRD spell/
   feat/magic-item catalogues) — genuinely-needed data, not art, and shrinking THAT is a much
   larger, separate, unscoped effort. See the soft-launch charter below for the corrected
   installs/day math.
4. **The license decision** — DONE (owner, 2026-08-02): the app code relicensed **MIT → AGPL-3.0**
   now (superseding the earlier "at/before GA" timing — owner confirmed harmless), the
   industry-standard license for open-source end-user web apps with a canonical hosted instance
   (the Mastodon / Nextcloud / Grafana / Bitwarden-server / Cal.com precedent); keeps the FOSS
   values, removes the clone-and-sell economics. Applied to `LICENSE` (full AGPL-3.0 text),
   `package.json` (`AGPL-3.0-or-later`), the README badge + license section, and the `/legal`
   app-license line. **The SRD content stays CC-BY-4.0** — the licensing partition is unchanged.
   Still open: a **DCO for outside contributors** the moment external PRs start, preserving the
   sole-author relicensing position.
5. **Legal pages** — privacy policy + GDPR basics (deletion exists as the ADMIN cascade; user
   erasure is on-request until a self-serve button ships — a GA item), a visible
   **CC-BY-4.0 SRD attribution** (a license requirement, not a courtesy), and terms.
6. **Trademark-safe branding** for anything public-facing — "5e / SRD-compatible" wording, never
   the D&D / WotC marks.
7. **Auth breadth beyond Google · the react-router advisory triage · backups · observability** —
   the original checklist items, kept (backups + observability sit in _Open decisions_; auth
   breadth is the DEFERRED bullet below; the advisory in the Dependabot remediation records).

Posture home: `docs/POSITIONING.md`.

### Soft launch — the community-beta charter (owner-ratified 2026-08-02)

A NEW phase between "friends only" and GA: the owner starts **moderately posting the live site in
communities** so real strangers use it and **feedback drives the roadmap** ("il feedback sarà
quello che farà l'app grande"). Everything stays **free**. This subsection is the checklist for
that step — it PROMOTES a subset of the pre-GA items above from "parked" to "blocking the first
post" and leaves the rest parked.

**The three owner rulings (grill of 2026-08-02):**

- **R1 — Pack exposure: ACCEPTED RISK (informed override).** The live site is the COMPOSED build:
  signed-in users can reach private-pack content (non-SRD WotC material). Publicly posting the
  site advertises that distribution, which cuts against the "personal + friends use only"
  boundary in `docs/POSITIONING.md` — surfaced to the owner, who accepted the risk for a free,
  moderate-visibility beta (nominative fan-tool posture, no monetization anywhere near the pack).
  **Documented fallback if a takedown ever arrives:** split hosting — the public URL serves the
  SRD-only build; friends move to a second, unadvertised Hosting site of the same Firebase
  project serving the composed build (same Firestore, pack `srdId`s keep resolving there).
- **R2 — Budget posture: raise the cap to £10–15/month.** [Script-side DONE 2026-08-02:
  `scripts/safe-01.sh` now carries the £15 budget + the £1/£5/£10 alert steps and renames the
  legacy £1 budget in place — the owner applies it with one `just safe-arm`.] SAFE-01's kill threshold moves from £1
  to £10–15 with intermediate alerts (~£1, ~£5) so a successful post can never blackout the app;
  the hard ceiling stays (worst month = the cost of a pizza). See the capacity model below —
  the owner asked for the realistic users-per-spend curve.
- **R3 — IT-first posting, nominative-use wording.** Italian communities first (the bilingual
  moat D&D Beyond does not have; smaller blast radius fits "moderate"). Wording rule per the
  owner: **saying the tool is "for D&D" is fine (nominative fair use)** — what is forbidden is
  implying we are OFFICIAL: no D&D/WotC marks in the name, logo, domain, or artwork, and posts
  carry an "unofficial, not affiliated" line. The English wave comes after the first IT feedback
  round is digested.

**The capacity / spend-return model (estimates, 2026 Firebase pricing — re-verify at the console
before relying on exact figures).** The cost anatomy of this app: returning users are nearly free
(the service worker serves the shell locally; Firestore offline persistence caches reads; the
debounced auto-save writes are the only steady cost), so **the binding axis is Hosting bandwidth
for FIRST-TIME installs** — **~8.0 MiB of precache per new visitor after the 2026-08-02 precache
trim** (8185.52 KiB / 311 entries, composed lane). Correction to the original 2026-08-01 estimate
below this table: the ~7.3 MiB figure had already drifted to 9481.90 KiB / 323 entries (~9.26 MiB)
by 2026-08-02 (the difficulty-calc/encounter-budget waves grew several lazy chunks without
re-measuring this number) — both the pre-trim baseline and the trim's real yield are corrected
here against the actual measured build, not the earlier estimate.

| Posture                                           | Fresh installs                                 | Sustained players                                                        |
| ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| Free tier, pre-trim (2026-08-02, before this fix) | ~39/day (9.26 MiB precache, 360 MB/day egress) | ~100–150 DAU (20k writes/day ≈ 130+ players at ~100–150 auto-saves each) |
| Free tier, post-trim (today)                      | ~45/day (7.99 MiB precache, +~15%)             | ~100–150 DAU (unchanged — the trim touches only install-time bandwidth)  |
| £10–15/month cap (post-trim)                      | +~450–500/day (~80–90 GB/month)                | ~1,000–2,000 DAU (writes ≈ £7–14/month at 2k DAU; reads rarely bind)     |

Reading of the curve: the precache trim (pre-GA item 3, DONE 2026-08-02) cost nothing and is a
real, if modest, win — 9.26 → 7.99 MiB (−14%), lifting free installs ~39 → ~45/day, NOT the
tripling the original (wrong) estimate assumed. The scene art it moved was only ~1.3 MiB of a
precache dominated by offline-first JS/data (the bestiary corpus, `cockpit-engine`, the SRD
catalogues) — genuinely-needed data that a further cut would have to attack separately, a much
bigger and unscoped effort not attempted here. £10–15/month still comfortably covers any
"moderate posting" scenario at this scale; more spend buys nothing until well past ~2k DAU, so
there is no reason to consider a higher cap in this phase.

**BLOCKING before the first post** (each maps to a pre-GA item above):

1. **Budget rethreshold** (item 2 → R2): DONE 2026-08-02 (armed live: £15 + £1/£5/£10
   steps, the legacy £1 budgets deleted/renamed; `just safe-status` = ARMED). raise the budget + SAFE-01 kill topic threshold to
   £10–15, add the £1/£5 alert steps. Console + budget-config action, owner-gated.
2. **App Check + abuse-resistant quotas** (item 1): monitor-mode DONE 2026-08-02 (Enterprise
   key provisioned + registered, tokenTtl 24h, Firestore/Storage unenforced; ENFORCE pends
   on metrics — the runbook's step 4). the owner's own recorded rationale — "before
   any advertising". The code is public; the backend must not be an open quota faucet.
   **Client scaffold SHIPPED (code-only):** `src/lib/firebase.ts` calls `initializeAppCheck` +
   `ReCaptchaV3Provider`, strictly gated on `VITE_APPCHECK_SITE_KEY` being set (unset today on
   every env — zero new network calls, exactly today's behavior) + a debug-token escape hatch
   (`VITE_APPCHECK_DEBUG`) for e2e/dev. The owner-run console rollout (site key, CI/deploy env,
   monitor-then-enforce) is still OPEN — runbook in `docs/BUG_REPORTING.md` → "App Check rollout
   runbook".
3. **Legal pages** (item 5): DONE — the bilingual privacy policy + terms shipped into the `/legal`
   colophon (42ef886), and the trademark register was re-cut per R3 (2026-08-02): the page now
   carries the **open, quotable nominative disclaimer** — "d20 Folio is an independent companion for
   Dungeons & Dragons 2024 · not affiliated with, endorsed, sponsored by, or created by Wizards of
   the Coast · D&D and its logos are trademarks of Wizards of the Coast LLC" (the marketing-usable
   line the owner can say OPENLY; no marks/logos/trade dress), and the privacy sharing clause now
   discloses the two outside-service sub-processors (bug report → GitHub issue · first sign-in →
   owner email). The CC-BY SRD attribution requirement was already satisfied there, and account
   deletion already exists in-app. **HELD for owner review** (legal copy is an AI-authored standard
   draft — a lawyer glance is advised before TRUE public GA — plus rule-25 visual approval).
4. **Pre-post safety net** (item 7, minimal cut): export DONE 2026-08-02
   (`gs://d20-folio-backups/pre-beta-2026-08-02`, europe-west1). one manual Firestore export before the first
   post, and a weekly look at Functions/Hosting error logs during the beta window. Automated
   backups + real observability stay parked for GA.
5. **Post copy per R3**: trademark-safe branding (item 6) + the nominative-use disclaimer, IT
   first.

**SHOULD (not blocking, best ROI):** the precache trim (item 3) — DONE, see the model above; and a
public-face pass on the README (the repo link will travel with the posts). The share-link funnel
(OG previews, anonymous `/view`, invite cards) is already premium and is the beta's acquisition
surface.

**Explicitly NOT blocking this phase** (stay parked for GA): auth breadth beyond Google (known
friction — some users will balk at Google-only; noted, not blocking a free beta), automated
backups, deeper observability, and anything monetization-shaped. (The AGPL-3.0 license decision,
formerly parked here as item 4, was pulled forward and DONE in this wave — see item 4 above.)

**The feedback loop (the point of the whole phase):** the in-app reporter (bug/feature →
GitHub issue via `onBugReportCreated`) is live and is the primary channel; posts mention it
explicitly. Owner triages weekly; feedback lands in this file as roadmap input. No new channel
(Discord etc.) until volume demands one.

**The owner's charter, captured on ratification (golden rule 4).** A full competitive audit vs
D&D Beyond (mid-2026 verified state: Project Sigil dead, 2D Maps free-for-all, DDB's 2026 roadmap
rebuilding toward "rules as data" — the architecture this app already has; DDB's weaknesses =
English-only, online-first snapshots, PDF-only export, paywalls) found the app AHEAD on the
player/sheet experience and structurally behind on the DM/content side. The owner ratified closing
everything except the deliberate non-goals. Standing constraints: license-clean by construction — all new
content is authored split-aware behind the #32 aggregation seam (SRD in the public repo, non-SRD in
the private content pack) — and the £1 budget. Forks resolved in the ratification grill
(2026-07-17):

- **Maps/VTT: constitution §2.9 STANDS** — no battle map, ever. The one permanent DDB gap, owned
  as "bring your own VTT".
- **Bestiary (flagship):** the FULL wikidot monster corpus [sourcing amendment 2026-07-23: wikidot
  hosts no bestiary — the SRD half was sourced from the official **EN + IT SRD 5.2.1 PDFs**, not
  wikidot; the MM-et-al pack half follows its own manifest], split-aware from day one — the ~330
  SRD 5.2.1 creatures in-repo, MM-2025-et-al statblocks pack-side, i18n along the same manifest,
  and the existing 91 `src/data/beasts/` Polymorph forms classified by that manifest (coordination
  comment posted on #32). Unlocks four surfaces: the encounter picker (replacing the type-by-hand
  AddMonsterForm), the 2024-DMG XP-budget difficulty calculator (DDB's standalone tool is stuck on
  2014 math — we can be more correct), the compendium Monsters section, and companions.
  - **SHIPPED 2026-07-24 (the campaign flagship):** the SRD half is complete — 330 monsters
    (EN+IT), the compendium Monsters section + statblock plaque, the lazy `SrdKind` display
    tier, and the 2024-re-derived beast catalogue behind the shared projection guard. Full
    account: _Shipped — the SRD bestiary campaign_ below; granular per-wave history lives in
    `CHANGELOG.md` + git (this forward-plan doc keeps only the pointer).
  - **ENCOUNTER PICKER SHIPPED 2026-07-25:** the DM's "Add monster" banner control now opens a
    `ModalShell` picker (reusing `CompendiumPicker`/`monsterSpec` via a derived add-mode spec) with
    two tabs — **Bestiary** (search the full corpus, facet by CR/size/type, read the statblock, set
    a count capped at 20) and **Custom** (the surviving `AddMonsterForm`). A bestiary add pre-fills
    the group from the statblock (localized name · AC · average HP · blank initiative) and stamps an
    additive, display-only `EncounterMonster.srdId`, which powers a **DM-only statblock disclosure**
    on the monster card (a `MonsterStatBlockCard` modal, degrading quietly on a stale id) plus
    rename-in-place. The whole bestiary surface loads in ONE lazy chunk on first open (zero eager
    delta — tripwired); a spec-driven `quantityMax` was added to the shared picker footer. The
    2024-DMG XP-budget difficulty calculator that followed it also SHIPPED (2026-07-25).
  - **✅ SEAM DEBT CLOSED (2026-07-31) — the MM wave-2 blocker is gone; pack monsters are no longer
    double-shipped into the EAGER closure.** The defect (surfaced 2026-07-30 by A/B-ing the wave-1
    pilot on one app SHA with only the pack varying): `src/data/monsters/index.ts` is lazy (the
    `srd-monsters` chunk) and its docblock forbids eager importers — but it composed `packMonsters`
    from the `@pack` BARREL (`content-pack/index.ts`), which the always-eager Grant engine also
    reaches, and Rolldown places whatever that barrel re-exports in the eager `cockpit-engine`
    chunk no matter which `manualChunks` bucket the source module claims. Same mechanism that bit
    `packQuickbuildPresets`. THE FIX: the bestiary is now the pack's ONE lazy **sub-entry** —
    `@pack/monsters` (`scripts/content-pack-mode.ts` → `packMonstersAliasTarget()`, mirrored in the
    vite/vitest alias maps and the three tsconfig `paths`; SRD-only resolves it to the same
    typed-empty stub) — and `packMonsters` is REMOVED from the barrel, so the corpus is reachable
    only from the lazy aggregate and is fetched only when the bestiary opens. Zero tombstones, and
    the "consumers read aggregates, never a `@pack` deep path" doctrine holds — the importer IS the
    merge point. Measured, same app SHA + one pinned pack worktree, only the seam varying: eager
    **777.87 → 776.50 KB gz** across the same 14 chunks (`cockpit-engine` 387.7 → 386.3), entry
    **61.81 → 61.81** (unchanged), precache **9044.06 → 9044.04 KiB / 301 entries** (flat — the
    corpus moved chunks rather than being written to disk twice), and the wave-1 pilot's statblock
    ids are now ABSENT from every eager chunk, appearing only in the lazy `srd-monsters` data
    chunk + the two lazy `monsters-*` catalogues. SRD-only lane: 627.87 KB gz
    eager / 7850.02 KiB precache (282 entries), under the same shared ceilings. Ceilings were NOT
    lowered (they are ratchets, not trackers) — the freed ~1.4 KB is recorded slack, and
    `EAGER_CEILING_KB` remains the regression guard: putting `packMonsters` back on the barrel
    returns the corpus to the eager closure, which at wave-2 size (~163 statblocks, ~20 KB gz)
    trips it loudly. Full record: `tests/unit/bundle-budget.guard.test.ts` + docs/ARCHITECTURE.md →
    "The content-pack seam". **MM wave 2 is unblocked.**
- **Companions/Extras — SHIPPED (2026-07-25):** a persistent, play-reachable
  companion surface. A "Companions" section in the resources rail (after Active
  Features) fields every companion: the Artificer constructs + the Beast Master
  **Primal Companion** with its now-live Land/Sea/Sky variant picker (closing the
  documented dead-code gap — `session.companionVariant` + `selectCompanionVariant`
  finally have a consumer), a shared `CompanionStatBlockCard` mounted by both the
  Features tab and the rail modal (golden rule 6), and the full **Find Familiar**
  flow — a lazy form picker over every CR-0 Beast + the seven Pact-of-the-Chain
  special forms (the new `familiar-forms` grant), the 2024 Celestial/Fey/Fiend type
  swap (rendered by the bestiary `MonsterStatBlockCard`, statistics verbatim), HP
  tracking, pocket-dimension dismiss/recall, and the Investment-of-the-Chain-Master
  enhancements on the sheet. The find-familiar spell text was re-sourced to 2024.
  Charter reconciliation: **Drakewarden does not exist** in the 2024 SRD corpus OR
  the pack's 2024 ranger set (beast-master · fey-wanderer · gloom-stalker ·
  hollow-warden · winter-walker) — the charter named a 2014-era subclass with no
  2024 source; no data work exists. The **Homunculus Servant** spell-companion rides
  the shipped public `SrdSpellData.companion` seam pack-side (D11). The lazy leaf
  keeps the eager bundle at zero corpus delta (tripwired).
- **STANDING PRINCIPLE — preserve every custom entry (owner-ratified 2026-08-01).** The account-level
  homebrew library is the home for ALL homebrew — **no custom entity type is one-off.** Every custom
  thing a user builds persists to their reusable `users/{uid}/library/index` by default and is
  re-addable from any surface, never re-typed. This is the override-first doctrine (golden rule 8)
  made durable: custom data is authored once, kept forever. Today's coverage = **exactly 4 kinds**
  (spell, feature, equipment/custom-item, weapon — all reusable; `src/lib/library.ts`); the open gap
  = **custom monsters**, still one-off (the confirmed rung below closes it). The principle
  **generalizes** — any FUTURE custom entity type (monsters, then species/feats/subclasses/
  backgrounds/classes) persists to the library by default, never a throwaway.
- **Homebrew — the full ladder:** (a) an account-level library promoting the per-character
  CustomSpell/Feature/Equipment/Weapon types to reusable account docs — **SHIPPED (2026-07-30)**
  on the owner-ratified **"custom IS the library"** model: ONE `users/{uid}/library/index` doc
  (capped at `FREE_TIER_LIMITS.libraryEntries` = 100, mirrored in `firestore.rules`) that fills
  itself — every Custom form commit and every sheet-side edit of a custom row UPSERTS by
  (kind, name), silently, with the Firestore flush debounced ~2 s. NO save gesture and NO manager
  page: each Add-X modal's **Custom** tab IS the surface — your kept homebrew (row = add to sheet,
  trash = the only delete, and it sticks) with the existing create form behind a "Create …" bar,
  opening straight on that form while the library is empty. The pure model
  (`src/lib/library.ts`) keeps TEMPLATES (per-kind strip of every play value, upsert-in-place,
  landing defaults re-seeded from the Custom forms); the ONE listener lives in `AppShell` and
  INJECTS the store's write seam (`combatPersistence` pattern), so the store + every card stay
  Firebase-free (`docs/ARCHITECTURE.md` → "The account-level homebrew library"); (b) campaign
  sharing of that library — the ladder's NEXT rung; (c) authoring types staged after the bestiary —
  monster editor first (the reusable custom-monster library confirmed below is that rung's first
  cut — owner-ratified 2026-08-01), then species/feats/subclasses/backgrounds as declarative Grants; (d) homebrew
  CLASSES declared the horizon flagship on the grants seam (DDB's #1 refused community ask),
  scheduled only once (c) proves the authoring UX. Homebrew is user data, never repo data — no #32
  impact.
- **CONFIRMED — reusable custom-monster library ("custom IS the library" for monsters, owner-ratified
  2026-08-01):** promoted from candidate to a CONFIRMED homebrew-ladder rung (charter rung (c),
  monster-editor-first). Today a DM's custom monster is **one-off** — `AddMonsterForm`
  (`src/features/campaigns/party-encounter.tsx`) appends an inline `EncounterMonster`
  (`src/types/campaign.ts`) straight to `campaign.encounter.combatants`, persisting nothing; the same
  monster is re-typed every encounter. The fix adds **`monster` as a 5th `LibraryEntry` kind** on the
  SHIPPED homebrew infra (`LIBRARY_KINDS` / `LibraryDraft` in `src/lib/library.ts`, `library-io.ts`,
  `stores/libraryStore.ts`, `features/account/library-mount.ts` — or a **sibling monster library** if
  the encounter-monster shape doesn't fit the per-character custom-item union). The encounter
  custom-monster flow **saves-to and re-adds-from the library exactly like custom items** — save
  strips the per-encounter state to a **template**, re-add **re-seeds** a fresh `EncounterMonster` —
  closing the one-off gap. Wiring: the Add-monster modal's **Custom** tab (`encounter-bestiary.tsx` /
  `AddMonsterForm`) grows a "your custom monsters" list (silent auto-save on create, tap-to-add,
  edit/delete), account-level and reusable across campaigns. **DDB-parity angle:** DDB has a
  monster/homebrew library. **Has a visual surface → owner screenshot approval per golden rule 25;**
  touches the encounter UI + the library store. The **monster portraits** rung below
  **rides this one** (a saved custom monster persists its portrait). Sequences **after** the in-flight
  encounter-polish + combat-chronicle epic (same `AddMonsterForm`); priority is the owner's call.
- **SHIPPED — canonical monster portraits (owner-ratified reversal + rule-25 screenshot approval
  2026-08-02):** monsters now have a **portrait slot** — real bestiary AND custom.
  **SUPERSEDING REVISION 2026-08-02 (owner):** now
  that original art can be generated at the required quality, every one of the 503 database monsters
  (330 public SRD + 173 private pack) receives a canonical professional portrait in one "Living
  Bestiary" direction. Database portraits are product content and are **not user-overridable**.
  Custom monsters remain fully user-owned and reuse the existing character-portrait system (Firebase
  Storage — `src/lib/storage.ts`, `users/{uid}/portraits/…` + `portraitCrop`/`portraitUrl` on
  `CharacterDoc` + the `PortraitEditMenu` Re-crop / Upload new / Remove). This is the **RESOLUTION of
  the internet-art problem:** the app ships only legal project-owned art; a user uploads their own
  image for a custom monster on their own responsibility. The **internet/wiki-art DECLINE stays fully
  intact**: no copyrighted/WotC artwork is shipped or scraped; D&D Beyond is information-hierarchy
  inspiration only, never a pose/composition source. Displayed in the encounter **beside the hero
  portraits** + in the **bestiary**; a saved custom monster **persists its portrait** (rides the
  reusable custom-monster-library rung above). The complete set uses original generated art rather
  than a mixed-license collage. Exact-id + 672×840 + ≤90,000-byte guards pass across 330 public +
  173 private portraits; binaries stay off first install and enter the runtime cache when viewed.
  Both composed and SRD-only gates pass. The owner approved the complete compendium + encounter
  dark/light × desktop/mobile matrix; the acceptance pass additionally caught the mobile
  multi-encounter chip's light-theme dark-on-dark ink, fixed it at the carved-control token seam,
  and added a real-browser AA guard for both the sword glyph and count.
  The same dogfood pass rebuilt the active-encounter summary as one premium encounter dossier: a
  struck command rail with a quiet round marker, one semantic difficulty badge, terse XP metadata,
  and a responsive end action; its attached Chronicle is a designed drawer edge when collapsed and
  a compact gilt-spine event timeline when expanded. Light/dark × desktop/mobile owner-review crops
  are generated by the real E2E flow.
  **Dogfood correction, closed 2026-08-03:** the light-theme tome was correctly wired through
  `--asset-parchment`, but the committed binary did not match the owner's pale `PROMPT_28.png`.
  The supplied 1672×941 source is now the exact source of `public/assets/textures/parchment.webp`
  (WebP q50 + sharp_yuv, 17.5 KiB, no creative regrading); the earlier false shipment claim is no
  longer carried forward.
- **Public share links: SHIPPED 2026-07-31; privacy-hardened 2026-08-12 — CHARACTERS ONLY.** The
  private parent keeps the publication decision (`shared`), while anonymous reads are restricted to
  an exact, sanitized, atomically maintained `public/sheet` projection at the unguessable character
  path; revoke deletes the projection in the same transaction. Parent, play state, campaign metadata
  and Storage bearer URLs are never anonymously readable. The public route is noindex and reuses the
  established read-only sheet rendering. Owner requirements folded in (2026-07-31): the
  share affordance uses the state-of-the-art sharing surface — the **Web Share API native sheet on
  mobile** (WhatsApp/Telegram/iMessage for free) with **copy-link as the universal fallback**;
  viewers need **NO account** (that is the point — friends off the app see the sheet read-only).
  **Campaigns
  deliberately have NO share model** (industry standard — DDB/Roll20 campaigns are private member
  spaces): a table shares a campaign by each player sharing their own character, which keeps
  consent per-owner and adds zero rules surface; an opt-in campaign-surface design is noted as the
  someday upgrade path ONLY if real demand appears — explicitly not built on speculation.
  **Owner amendment, 2026-07-31 (same wave):** (1) the **campaign INVITE link** gets the same
  premium share treatment — the native share sheet + copy fallback, through the ONE shared share
  affordance, never a second implementation. That is INVITE (a functional join), not anonymous
  viewing: the no-campaign-share-model decision above stands untouched. (2) **Professional link
  previews (Open Graph), two tiers** — a site-wide baseline (`og:*` + `twitter:card` in the HTML
  shell, EN only, over designed 1200×630 branded cards in `public/` — one per TYPE (character ·
  invite · generic, owner gate 2026-07-31), all kept out of the precache),
  and **per-link dynamic tags on the two shared route families** (`/view/**`, `/join/**`) from a
  lightweight Cloud Function behind Hosting rewrites that serves the SPA shell with the entity's
  tags injected — a shared character is loaded only through the validated projection (an unshared,
  stale or unknown id gets the shell's own baseline tags, never a leak), a campaign invite exposes the campaign NAME and
  nothing else, for a valid code whose joins are still open. Crawlers must get the tags with NO
  JavaScript.
  **All of it shipped in the same wave; the 2026-08-12 hardening replaced direct-parent exposure.**
  What now exists: `CharacterDoc.shared`; an exact `public/sheet` schema with atomic publication and
  generation fences; an anonymous exact-document `get` rule that can never widen into an enumeration
  or parent read; a projection-gated same-origin portrait endpoint; the public `/view/:uid/:charId` route reusing `CockpitView` through
  `loadReadonly`, with one quiet page for revoked / deleted / denied / offline and a per-route
  noindex; the sheet's ⋯ menu gaining ONE **Share** entry that opens the shared **share popover**
  (owner gate: the Docs/Notion shape — a visibility switch that IS share-and-revoke, no confirm, and
  while it is on the link with Copy and the native share sheet; the campaign card's ⋯ opens the same
  popover without the switch); `ShareButton` as the ONE button-shaped share
  affordance, adopted by the
  hub's ACCESS panel and the create-campaign success screen (whose hand-rolled URL builder and raw
  read-only link field are gone), and the campaign card's ⋯ item upgraded from copy-only to the
  native sheet; `ogShell` + the two Hosting rewrites + the three designed cards
  (`public/og-card{,-character,-campaign}.jpg`), verified by curl under a crawler UA. One rule-27 stability fix fell out of it: every ⋯ overflow item inside
  the mobile Signet was inert, because `useDismissOnOutside` collapsed the chain on a pointerdown
  inside the menu's own Radix portal. Review convergence closed three exposures in `ogShell` and one
  duplication: the shell is now fetched only from an ALLOWLISTED host (a forged `X-Forwarded-Host`
  on the function's public `*.run.app` URL could otherwise have it reflect attacker HTML with CDN
  cache headers), and the loopback arm of that allowlist is gated on `FUNCTIONS_EMULATOR` (deployed,
  `127.0.0.1` is the function's own port — a forged loopback host made it fetch ITSELF, a self-SSRF
  chain of timing-out legs and therefore billed time); a `joinsLocked` campaign now unfurls as
  nothing, so the DM's leaked-link kill switch holds against the Admin SDK too; and the generic card
  exists ONLY in `index.html` — no card means the shell is served untouched, so the copy cannot
  drift. The owner gate then asked for two more things, both landed: sharing collapsed into ONE menu
  entry + the `SharePopover` (switch · link · Copy · native Share — no confirm, no second item, and
  the invite reuses it switch-less), and the preview image is now TYPE-BASED — a character card, an invite card and the
  generic app card, three siblings in one folio identity, chosen per route family with the generic
  one still covering unshared / locked / unknown. Then the owner-ratified upgrade: the preview image
  is now **rendered per link** (2026-07-31). A second Cloud Function (`ogImage`, `/og/**`) draws a
  1200×630 PNG on the fly with `@resvg/resvg-js` + bundled folio fonts over the same card art —
  a shared character shows its portrait (from Storage), name, level, class and AC · HP; an invite
  shows the campaign name + party size — every number read straight off the roster `cache` (the
  engine is never re-run server-side), behind the SAME share/lock gate. The three static cards became
  the FALLBACK: an unshared / locked / unknown link, or any render error, redirects to them, so a
  broken render can never 500 or leak and the indistinguishability holds. The dry classification
  eyebrows ("A SHARED CHARACTER" / "AN INVITATION") were DROPPED — the character's name + stats +
  portrait carry the card (content-forward). Then the copy was reframed INVITATIONAL, not
  promotional (owner + research settled 2026-07-31): a shared link is an invitation, never an ad, so
  every price/benefit claim came off the artifact — the footers became "Have a look at this hero" /
  "Step into this adventure" (IT twins), replacing "Free to read · no account needed" / "A seat
  awaits you", and the unfurl descriptions open the door ("Have a look at {name}'s hero …", "Take a
  look inside this adventure …") while staying compatibility-phrased ("companion for D&D 2024").
  DESIGN.md §6 records the principle (invitational, never promotional). Owner-locale + the static
  English fallback + gating all unchanged. **Anonymous-viewer chrome SHIPPED in the same wave
  (2026-07-31):** a logged-out `/view` viewer gets the SAME header bar as a signed-in one (identical
  brand / height / background / border), with ONLY the auth-gated right cluster (hub tabs + "Ask the
  Folio" palette + account menu) replaced, in the same slot, by ONE sign-in button — auth is
  Google-only and sign-in IS sign-up, so a second "create" door was redundant; the button reuses the
  app's own `auth.signIn` label ("Sign in with Google" / "Accedi con Google") and routes to the real
  `/login` entry (a route, so the eager shell stays firebase-free). The button wears the standard
  brass `.btn` sized to the topbar's own control rhythm (text-sm, not the tiny 10px `.btn.sm`), so it
  reads native to the bar. The eager entry ceiling stepped 62→63 KB for the topbar branch
  (docs/ARCHITECTURE.md P3). **The "post-view signup CTA" candidate was NOT shipped as a marketing
  card** — an inline "Like this hero? Create your own…" panel after the sheet was built then DECLINED
  by the owner (2026-07-31) as off-tone for the app and redundant with the header sign-in button; the
  header button is the SOLE conversion path. DESIGN.md → "Anonymous-viewer chrome".
  Full design record: `docs/ARCHITECTURE.md` → "Public share links" + "Link previews (Open Graph)".
- **Post-view signup CTA — the share-funnel growth loop (CANDIDATE — owner idea 2026-07-31):** the
  public no-account `/view` page (a non-registered friend viewing a shared character) offers a
  tasteful post-view **conversion CTA** — a premium nudge to "create your own character" / sign up.
  Owner's verbatim intent (2026-07-31): shared link → a non-user views a cool character → prompted to
  make their own → new user. This is an **acquisition growth loop** — it converts the traffic that
  share links + advertising generate. _Capturing analysis (orchestrator, 2026-07-31):_
  - **A candidate rung tightly coupled to share links + the advertising-driven GA sequencing:** it is
    the **growth-loop close on the share funnel** — the rung that turns share-link reach (and the
    paid traffic the GA advertising push will buy) into registrations, so it lands only once there is
    traffic to convert.
  - **Dependencies:** DEPENDS on share links (shipped — the `/view` surface is its host) and
    COMPLEMENTS first-run onboarding (the bullet below) — the CTA hands the newcomer into Quick
    Start / the Guided wizard that onboarding rung already funnels newcomers through.
  - **Non-negotiables:** stays **tasteful/premium — a nudge, never a nag** (the Constitution premium
    bar + golden rule 27), and **non-registered viewing ALWAYS works** — with or without acting on
    the CTA, the read-only share never gates behind signup (honoring the share model's whole point:
    friends off the app see the sheet, no account needed).
- **Quickbuild: SHIPPED (2026-07-30) — as "creation opens complete".** There is no separate
  quickbuild screen: the chooser keeps its two cards (Quick Start · Guided, Guided untouched) and
  **Quick Start now arrives finished** on the default class's ready-made build — species and its
  lineage, background, the 2024 standard array dealt in the class's ability priority (expressed
  through the wizard's own point-buy state, since the array costs exactly the 27-point budget), the
  background's +2/+1, class skills, cantrips/prepared spells, starting gear, origin languages, the
  Human origin feat, and every follow-up pick a feat or feature asks for. Only the NAME is left to
  type. Picking another class on that page rebuilds the sheet from ITS preset: silently when nothing
  has been sculpted, behind the house confirm ("Rebuild as a {class}? Your tweaks will be replaced.")
  when it has — and the typed name survives both, always. Presets live in `src/data/quickbuild.ts`,
  the applicator in `src/lib/quickbuild.ts`, and the choice model both share in
  `src/lib/creation-choices.ts` (lifted out of the wizard, so the pickers the wizard renders and the
  answers a preset fills are ONE set — a preset can never satisfy a different set of decisions than
  the Create gate checks). **D11**: the presets are authored against the FULL game — the composed
  build hands each class the origin it is actually known by (Bard → Entertainer, Druid/Warlock →
  Hermit, Monk → Wayfarer, Paladin → Noble, Ranger → Guide, Sorcerer → Charlatan, Artificer →
  Artisan), and every cantrip/spell is the class's OWN printed recommendation from the wikidot 2024
  class pages ("… are recommended"), with each class's Primary Ability driving the score order. The
  PUBLIC set is the SRD-legal projection of that (only four SRD backgrounds exist, so several classes
  fall back on the Acolyte — correct for the SRD-only build, never seen in the composed one): the
  pack REPLACES those presets per class through the `overlayPackRecord` seam (`src/lib/pack-merge.ts`;
  additive catalogues keep `mergePackRecord`'s throw-on-collision). Guards:
  `quickbuild-presets.guard.test.ts` (every preset legal + complete + the 27-point identity, derived
  from the preset table), `quickbuild-path.test.tsx` (the real wizard driven per composed preset,
  through `handleCreate` to the written document, plus the edge-case contract: name-sacred,
  rebuild-confirm both arms, path-switch preservation, level-change grace) and the pack's
  `quickbuild-override.test.ts`. Separate named PREGENS were NOT built — the presets fill that role.
  DDB shipped "Quickbuilder" March 2026.
- **Randomize: SHIPPED (2026-07-30).** Quick Start carries a **Randomize** control (BG3-style,
  class-first): each tap KEEPS the class and its ability priority — playability is not random — and
  draws the rest of the sheet again from the composed pools: species + lineage, background + which of
  its abilities take the +2/+1, class skills, level-1 cantrips/spells, origin languages, the Human
  origin feat, and every follow-up pick. It is a chaos button by design (no partial preserve, no
  confirm — one more tap rerolls again) and never touches the typed name. `rollQuickbuildFlavor`
  (`src/lib/quickbuild-random.ts`) emits a PRESET, so a roll lands through the same applicator and is
  complete by construction; the randomness is injected (`Rng`), making the roller pure and
  seed-reproducible, with `crypto.getRandomValues` the only entropy (no `Math.random`, and no dice —
  golden rule 21 is about rolls of the GAME, and none are generated here). Pinned by a seeded property
  battery over every composed class × 8 seeds (`quickbuild-random.test.ts`) plus the render test's
  reroll case. Guided never offers it.
- **Quickbuild follow-ups (ledgered 2026-07-30, from the wave's impeccable audit — SHIP-WITH-FIXES,
  19/20; every MUST + the cheap INCLUDEs landed in the wave):**
  - The Human Versatile feat pool renders ~28 rows inline once a Human is on the sheet; collapse it
    behind a disclosure that keeps only the CHOSEN feat visible.
  - The quick page's "what's left" explainer renders static rows there (the guided rail deep-links
    each one): give the one-page surface section anchors so a row scrolls to the control that fixes
    it — it is a very long page.
  - An xl+ sticky preview rail: the preview card currently closes the single centred column, so it
    scrolls away from the controls that change it.
  - Randomize's hint copy ("draws everything else again") could read warmer.
- **Compendium completeness:** species/backgrounds/subclasses/conditions/rules-glossary sections
  (+ Monsters when the bestiary lands) — this DEFINES the open Phase-4 "compendium polish" scope.
- **First-run onboarding for D&D newcomers (owner-ratified 2026-07-31 — a NEW epic rung, added for
  the GA/advertising trajectory; SOTA shape settled):** an **interactive first-run guided tour** —
  spotlight/coach-mark steps over the REAL UI, dismissible at any point, replayable from settings —
  plus **teaching empty states** across surfaces, plus a **"New to D&D?" entry path** that funnels
  newcomers into Quick Start / the Guided wizard and the tooltip + compendium glossary.
  EXPLICITLY ruled out: **no in-app video tutorials** (they age against the shipping UI, double the
  bilingual cost, and cost bandwidth) — video, if it ever exists, is marketing-side (e.g. YouTube),
  outside the app.
- **XP:** an optional per-character XP counter with a threshold-reached → Level-up nudge;
  milestone (wizard-driven) stays the default; zero change for current users.
- **Auth breadth: DEFERRED** until the #32 public launch — Google-only stands; queue email-link +
  Apple when unknown users can arrive.
- **Deterministic combat log (CANDIDATE — owner idea 2026-07-31):** an **auto-generated,
  structured mechanical log per encounter**, appended to the campaign. Owner's verbatim intent
  (2026-07-31): during a session the DM spends too much time transcribing combat bookkeeping (HP
  math, who hit whom) when they would rather focus on narrative/dialogue summaries — so let the app
  emit the mechanical record itself. Since encounters, initiative tracking, and campaigns are already
  built and the deterministic engine already routes every combat action (damage intake, dying,
  conditions, round advancement), the app can event-source a readable log bounded by the DM's
  existing encounter start/end. _Capturing analysis (orchestrator, 2026-07-31):_
  - **On-brand + feasible WITHOUT AI:** fits "the engine is the intelligence"; needs no LLM and no
    dice (golden rule 21). Scope is the MECHANICAL log ("Lyra hits Goblin for 8, Goblin at 4 HP;
    Kael falls unconscious; encounter ended"); it explicitly does NOT generate narrative prose (that
    would need the ruled-out AI — Constitution v1.7, owner-ratified 2026-07-06). It COMPLEMENTS the
    DM's hand-written story notes by removing the bookkeeping transcription.
  - **Reframes the parked "Table feed":** same feature class, but the budget landmine (per-action
    campaign writes) is solved by the encounter boundary — keep the log in the at-table live session
    state and persist ONE compact summary document at encounter-CLOSE, not a write per action.
  - **The "who dealt the damage" attribution (settled design, owner + orchestrator 2026-07-31):** the
    app deliberately does NOT know who attacked whom — targeting is off-app (table-first, not a VTT —
    constitution §2.9, owner-affirmed), so a damage delta records "the Goblin took 8", not the
    attacker. NOT solved by inference (crediting the current-turn combatant is a GUESS — reactions /
    opportunity attacks break it — and the engine records facts, never guesses dressed as truth). IS
    solved SOTA + deterministic by an OPTIONAL one-tap attacker attribution when the DM applies
    damage, pre-selected to the current-turn combatant (usually a zero-friction confirm), skippable:
    the log reads "Lyra strikes the Goblin for 8 (Goblin at 4)" when attributed, "the Goblin takes 8
    damage" when skipped — never a fabricated attacker. This never-guess rule + the encounter-close
    single-write persistence are the two non-negotiables of the design.
  - **Value/positioning:** a DDB-parity-PLUS DM feature (DDB has nothing comparable), leveraging the
    encounter/initiative single-source already shipped.
  - **Dependency/caveat:** value scales with how much of combat is driven through the app's tracker —
    paper-side actions won't appear.
- **Table feed** (the dice-free game-log analog): **PARKED** — per-action campaign writes are the
  one feature class that genuinely threatens the £1 budget, and the encounter tracker already
  carries the at-table live state. **Reframed budget-safe by the deterministic-combat-log candidate
  above** (2026-07-31) — the encounter boundary removes the per-action-write landmine; see that
  bullet.
- **Sequencing:** interleaved as the next NEW-FEATURE epic — the RA correctness waves keep rule-27
  priority, the BG3 identity missions continue untouched, and the bestiary campaign opens first,
  coordinating with #32. Attack order: bestiary → encounter picker → difficulty calc → companions
  → homebrew library → quickbuild → share links → compendium completeness → first-run onboarding
  [the rung added 2026-07-31 — its bullet above; it precedes the homebrew ladder's upper rungs
  (c)–(d), while rung (b) keeps its queued slot below] → XP; **+ (candidate) deterministic combat
  log — bullet above, suggested near the DM-retention tail, priority the owner's call**; **+
  (candidate) post-view signup CTA — bullet above, a candidate rung near share links / first-run
  onboarding (it closes the growth loop on their traffic), priority the owner's call**. [amendment
  2026-07-23: the #32 open-sourcing split COMPLETED 2026-07-17 — before this epic opened — so the
  split-aware authoring the charter references is already the live world (public SRD repo + private
  pack); the old #32 issue was deleted with the split, so THIS charter is the surviving coordination
  record. `bestiary` is DONE (2026-07-24), `encounter picker` DONE (2026-07-25), `difficulty calc`
  DONE (2026-07-25), `companions` DONE (2026-07-25), `homebrew library` rung (a) DONE (2026-07-30)
  `quickbuild` DONE (2026-07-30) and `share links` DONE (2026-07-31); the live attack-order head is
  `compendium completeness`, with the pack-side MM corpus the standing parallel content job and
  homebrew rung (b) — campaign sharing — queued behind it.]

## Shipped epic — BG3-Grade Identity Evolution Epic

### The FULL-BG3 fidelity push (owner-ratified 2026-07-16) — IN FLIGHT

The owner ratified pushing the shipped candlelit struck-gold identity to **full BG3 menu-craft
fidelity across the whole app** (constitution v1.8 — an informed override superseding the
"Ember Penumbra" / "Daylight Sibling Plates" directions as the CEILING; their shipped work stays
the base). Light lives as the daylight sibling of the new grammar; dark stays flagship. Two
parallel missions: the compendium rules-text emphasis grammar (SHIPPED — `highlightSrdProse`,
v0.20.0 tail) and the identity push itself (this mission). State:

- **Wave 1 — the Gilded Reliquary frame grammar: SHIPPED (2026-07-16).** Worked-gold corner
  goldwork on the three earned hero frames (framed realm masthead · gilt cockpit identity band ·
  dialogs) via the per-theme `--frame-ornate` SVG + `border-image` overlay; engraved ceremonial
  titling (`--engrave-title` — dark struck-plate, light letterpress); the tapered modal-head seat
  rule; panel smoke (dark) / morning-shade (light) vignettes. All recipe-level (`DESIGN.md` §5
  "The ornament vocabulary"), asset-independent, verified {dark·light}×{EN·IT}×{desktop·mobile}.
- **Asset pipeline — batch 4 prompt doc DELIVERED to the owner (2026-07-16):**
  `~/Documents/d20-folio-bg3-asset-prompts.md` — PROMPT_12–25: six v2 scene-plate regenerations at
  full BG3 painterliness (study/login/war-table × dark/light), six NEW realm-scene plates
  (compendium Grand Library · roster Hall of Heroes · creation Ritual of Making, each a
  dark/light pair — per-realm backdrop tokens get wired when the art lands), and two engraved
  ornament alpha masks (corner bracket + header flourish, candidates to top the in-code vector
  goldwork). The owner generates over days into `~/Documents/images_d20folio`; each delivery is
  graded, WebP-compressed, and wired independently. **Nothing blocks on assets** — current art is
  the interim grade.
- **Batch-4 first delivery INTEGRATED (2026-07-17):** PROMPT_12–14 (candlelit study v2 · daylight
  study v2 · grimoire-altar login v2) judged against the prompt doc's Accept/Reject bars — all
  three ACCEPTED (calm centres verified numerically: P12 centre-half mean `#0d0602` σ4, P13 honey
  mid-tone `#bb843d` σ23, P14 left third mean `#060402` σ2 — and P13's stray corner AI-signature
  squiggle clone-stamped out before grading) and shipped as in-place replacements of
  `home-hero.webp` / `home-hero-light.webp` / `login.webp` (same tokens, no wiring change). Encoded
  WebP q75 + sharp_yuv (visually transparent at 1:1): 80 / 113 / 78 KiB vs the v1s' 26 / 42 / 106;
  the PWA precache ceiling re-baselined 7151 → 7247 KiB (the richer painterly edges ARE the bytes).

- **ASSET-INTEGRATION — COMPLETE (2026-07-24): PROMPT_12–25 ALL RESOLVED.** The Batch-4 pipeline
  closed end-to-end; nothing remains with the owner. The ledger:
  - **15–17 drop-ins (2026-07-23):** shipped as in-place swaps on the existing per-theme tokens —
    P15 → light `--asset-login` (`login-light.webp`), P16/P17 → the `--asset-campaign-backdrop`
    pair. Required retouches applied at grading: P16+P17's blue table runner recolored to warm
    bronze via the same B-channel clamp on BOTH twins (twin-matched by construction), P17's
    top-right AI-signature squiggle removed (feathered median patch).
  - **18–23 realm scenes (2026-07-23):** the three NEW realms wired via the shared
    `src/hooks/useRealmBackdrop.ts` seam (mount points `--app-bg-art` at the realm's per-theme
    token, unmount restores the study; `DESIGN.md` §13) — compendium Grand Library pair
    (`--asset-compendium-scene`, `CompendiumPage`), roster Hall of Heroes pair
    (`--asset-roster-scene`, `RosterPage`), creation+level-up Ritual of Making pair
    (`--asset-creation-scene`, mounted ONCE in the shared `WizardFrame`). Calm-centre law verified
    with real UI composited at every matrix dim; per-plate retouches (P18/P20 signature patches,
    P19 unlit-candle + centre soft-focus) applied at grading.
  - **24–25 ornament masks: REJECTED per the standing decision rule.** A/B'd against the in-code
    two-tone reliquary corners + engraved header flourish at 1x AND 4x across
    {masthead·gilt panel·modal} × {dark·light} — the generated masks did not beat the incumbent
    SVG goldwork at both scales, so the in-code vocabulary stands (no code change; the
    side-by-side evidence rode the owner preview push).
  - **In-situ optional-op ledger (every dossier-optional grade decided with real UI, none needed):**
    P15 left-third honey lift · P16 filigree soften + parchment dim · P18 lapis desaturation ·
    P19 centre contrast-compression · P20 sconce-bloom darken · P21 centre calm-down blur ·
    P22/P23 all three (calm-margin widening, blue taming, honey pull-down) — all SKIPPED; the
    composited UI holds the calm-centre discipline on every current crop. The recipes remain in
    the batch dossiers should a future layout shift the panel zones. Batch note for future
    prompts: this generator repeats top-right signature squiggles on LIGHT plates — carry the
    "no signature" emphasis in light-plate prompts.
  - **Budget:** all plates WebP q75 + sharp_yuv (visually transparent at 1:1, verified per-plate);
    `PRECACHE_CEILING_KIB` re-baselined 7276 → **8033 KiB** (measured 8027.2 + ~5 KiB deterministic
    headroom, never exact-fit) with the ratchet history updated in
    `tests/unit/bundle-budget.guard.test.ts` + `docs/ARCHITECTURE.md`.
  - **Verification (2026-07-24):** full gate green (typecheck · lint 0 warnings · 10474 unit tests ·
    build), a11y battery green (axe serious/critical = 0), the on-art ink battery green over all
    new plates, and the rule-25 before/after preview matrix (all changed surfaces × dark+light ×
    desktop, mobile where it differs) pushed proactively to the owner.
- **Wave-1 review fix — F1 SHIPPED (2026-07-16):** the corner gem was seated ~6px from the corner
  (SVG center 26,26) and sheared by `--radius-xl` (8px) on `overflow:hidden` hosts / overhung the
  curve on the cockpit band; moved the whole corner unit inboard (gem center 26→40 SVG units, arms/
  echo/finials re-anchored to the y/x-40 seat, arm start pushed 50→64 to clear the larger gem) so
  the whole gem clears the 8px radius — one consistent "seated inside the mitre" reading on all
  three registers, verified {modal·masthead·cockpit-band}×{dark·light} in real Chromium.
- **Wave 2 — F2 dimensional two-tone strike: SHIPPED (2026-07-17).** The corner goldwork is now
  worked metal, not line-art: every member carries a light/shade pair (dark = under-shadow seat +
  top-edge glint under the gold-300 body; light = the letterpress inversion — cream understroke +
  umber upper wall under bronze), and the corner gem is truly faceted (dark: lit top facet/shaded
  lower/deep core; light: intaglio). Structurally the SVGs mirror UNFILLED geometry first and tone
  after, so the bevel light stays top-left on all four corners; gems place per-corner unflipped
  (guard-pinned, `ornament-vocabulary.guard.test.ts`). Verified 1x + 4x crops ×
  {masthead·cockpit band·modal} × {dark·light} in real Chromium.
- **Wave 2 — the discreet-weight refinement: SHIPPED (2026-07-17, owner-directed).** The owner
  reviewed the shipped corners at real scale: _"isn't the corner arts a bit too invasive? … is it
  normal they oppress the text?"_ — and the honest BG3 comparison agreed (BG3 frames are
  hairline-quiet with SMALL corner accents; our unit was denser and the masthead title sat near
  the arm's reach). Resolution (supersedes F3's "declined"): the echo hairline + mid-arm diamond
  are DELETED (they were the ink nearest content, ~14px into the box), the gem shrank r20→15
  (~7px) and the arm 122→74 SVG units (~33px reach, was ~47px) with a smaller finial — the
  two-tone strike carries the wow at the small size (a small worked jewel beats a large flat
  one). Clearance verified against the owner's exact complaint crop (roster masthead dark
  desktop) + all three registers × {dark·light} × {desktop·mobile} — title/content ink and
  ornament ink never share air. Combined wave-2 budget: eager closure 755.2/756 KB gz; precache
  ceiling stepped once 7250→7252 KiB (+2, documented — the wave's raw growth atop the Batch-4
  plates' 7249.1 build, restoring the never-exact-fit headroom floor).
- **Wave 2 — the interactive layer (BG3 "touch" fidelity): SHIPPED (2026-07-17).** Audit verdict:
  the interactive layer was already deep (pressed-brass buttons, gold-halo focus + interior wash,
  kindling opt-cell/tabstrip hovers, complete card press vocabulary) — three genuine gaps closed at
  the shared-recipe seam (Constitution §7): (1) **the gilt glint** — the struck-gold tier
  (`.btn.primary`/`.btn.brass`/`.endturn`) now plays a one-shot specular sweep on hover (BG3's
  "metal catches the light"), transform-only, 900ms `--ease-standard`, one-shot by construction,
  `[data-motion="auto"]`-gated, verified frame-by-frame in real Chromium (settle's fast start
  raced it across in a blink — retuned); (2) **pick-row hover kindles** toward candle-gold (was a
  plain neutral fill — the one browse row outside the "warm to the touch" voice); (3) **light
  `.cmp-tab` hover** was imperceptible (surface-2 on ivory) — now its own warm strike. Guard:
  `interactive-kindle.guard.test.ts`; grammar row in `DESIGN.md` §9. Focus layer verified healthy
  (keyboard-walked: gold double ring + wash on the gilt CTA); axe sweep 97 passed, zero
  serious/critical.
- **The ATMOSPHERE push — owner-mandated 2026-07-23, SHIPPED 2026-07-24.** The owner's verbatim
  mission: _"In general I want to feel a lot the BG3 magical atmosphere in the app … Find a way to
  give that atmosphere. This is crucial."_ — with two named surfaces (the corner ornaments +
  separators he judged "not very nice" even after the wave-2 shrink, and the scene backdrops'
  D&D-Beyond-grade "woooow" — _"The images I provided you look amazing, let's not sacrifice
  them. For both themes."_). Three moves, each recipe-level:
  1. **The Starbound Frame** (supersedes the wave-2 minimal corner unit — the two-rejection
     escalation): the hero-frame goldwork and the dialog seat divider are redrawn from the
     owner's PROMPT_24/25 engraved plates — the style he LIKED, whose raster mounting had lost
     on physics — as hand-authored vectors at seat scale: a faceted four-point star in a
     hairline diamond frame on each corner vertex, a twin inner rail with dot-triplet
     punctuation continuing through the border-image edge slices as taper wedges, a concave
     gothic bracket inside the corner, and the p25 ceremonial star-and-leaf divider seated on
     dialog heads. Two-tone strike kept (dark raised gold / light letterpressed bronze); guard
     rewritten to the new anatomy (`ornament-vocabulary.guard.test.ts`); `DESIGN.md` §5.
  2. **Backdrop presence raised to the login's confidence** (the wow): the app-wide painter's
     0.55 dimming — the odd one out next to the login splash's native plate — is raised to
     **dark 0.9 / light 0.75** for the bundled plates (their designed calm centres earn it;
     composite floor holds ≥ 4.7:1, on-art battery 47/47 green), while custom DM uploads carve
     back to the proven 0.55 taming via `[data-app-bg-custom]`. `DESIGN.md` §13.
  3. **The backdrop crossfade** (orchestrator-delegated "do what you deem best" — judged worth
     shipping once presence rose: at 0.9 a route's hard cut reads as a viewport flash): every
     swap on the one backdrop seam (`useRealmBackdrop` + the hub's `useCampaignBackdrop`) rides
     `transitionBackdrop` (`src/lib/backdrop-transition.ts`) — the old scene's computed painter
     state ghosts at the painter's z-plane and fades 480ms `--ease-standard` while the new plate
     lands beneath; unmount+mount writes coalesce on a microtask so the ghost always shows the
     pre-navigation scene; reduced motion keeps the hard cut. Verified frame-by-frame in real
     Chromium; orchestration unit-pinned. `DESIGN.md` §9 (motion table) + §13.
- **The ORNAMENTS-V2 redo — owner-mandated 2026-07-24, SHIPPED 2026-07-24.** The owner judged
  the Starbound corners/separators "an improvement but we're not there yet" and mandated the
  proper method verbatim: _"run extensive researches on the web on what those ornaments should
  look like. Download the best images … Understand the pattern properly. Once you did, create
  the svgs based on that pattern."_ Executed literally: a 20+-item research corpus (BG3
  level-up/spellbook/character-sheet chrome at full res + ornamental-penmanship ray-fan plates,
  medieval penwork borders, strapwork cartouches, gothic tracery — scratchpad
  `bg3-reference/PATTERN-ANALYSIS.md`), a written pattern analysis, THEN original vectors: the
  **Compass-Web Frame** (crossed vertex blades + faceted rivet + floating crescent + whisper
  compass web + inner-rail taper dissolve, drawn 1:1 at a 64px seat) and the **winged-fleur
  seat divider** (outward-tapering rails, scroll hooks, luminous descending V-fleur, 260×24).
  A second same-day ruling: light-theme ornament ink goes **GOLD** (deep antique-gold
  letterpress, #94741f), superseding the engraved-bronze treatment for these elements.
  **REJECTED as shipped — the owner's fourth rejection of this surface (same day):** "less is
  more … smaller but beautiful, and above all it must ALIGN to the borders … I want THAT kind
  of ornament [the BG3 menus']". The Compass-Web was REDUCED to the **border-locked corner
  knot** under the **one-line law**: no ornament run lines (the inner-rail wedge, whisper web,
  and floating crescent are dead — nothing floats), the host's own 1px border is THE frame
  line, and the three framed hero registers went **square** (`border-radius: 0`) so the knot
  seats on a true crossing (DESIGN.md §5). The review round's defect fixes landed with it: the
  rivet mass diamond re-wrapped as a real `<path>` (it was bare text SVG dropped) and the
  seat's occlusion plate shrunk + edge-blurred so no hard rim shows. **RESOLVED — the owner
  picked STYLE A (2026-07-24, fifth round): "Do style A, but you must ALIGN. And make it more
  wow — without breaking things."** Landed as one unit: (1) the ALIGN defect ROOT-CAUSED — the
  ornament pseudo's `border: 64px solid transparent` border-image carrier forced a 128px
  minimum box, so hosts shorter than that (masthead 104.5px, cockpit band 97.7px) dropped
  `bottom` and hung their bottom corner knots 25–32px below the plate; FIXED at the geometry
  seam by replacing border-image with four fixed-size per-corner SVG background layers on an
  `inset: -13.3px` pseudo (registration 0±1px at all four corners at every host size by
  construction — DOM- and pixel-verified in real Chromium, desktop + mobile, both themes);
  (2) style A wired on all three registers, both themes (gold in light — the same-day gold
  ruling): the amplified reference-true knot — rail swells + whisker overshoot, the wave-
  volute comma-curl enlarged with a cleaner open eye, the five-ray glint fan two-tone struck,
  the crisp sickle leaf PAIR threaded on each rail, the weld diamond; (3) the seat divider
  translated into A's language: open under-curl hairpoints, open-eye S-hook returns, the
  luminous chevron-over-plumb centre (glow raised per the verdict), the floating under-dot
  dropped, surface-2 occlusion kept. Guard rewritten to pin the A anatomy + the root-cause
  mechanism (`ornament-vocabulary.guard.test.ts`); `DESIGN.md` §5 rewritten to match.
- **Open: NOTHING — the full-BG3 identity pivot (incl. the atmosphere push and the
  corner-knot pick) is COMPLETE (2026-07-24):** PROMPT_12–25 are all resolved (see the
  ASSET-INTEGRATION ledger above); every plate is integrated, verified, and budgeted. Two
  OPTIONAL future-polish items remain, neither a loose end nor a regression (rule 27 board is
  clean): sweeping the reliquary register deeper where earned (compendium tome chrome, login
  sign-in column, wizard hero altars — enhancement, not a defect), and re-shooting the README
  screenshots now that the art push has settled.

**Status: SHIPPED (dark flagship) — released in v0.18.0 (2026-07-07).** The owner-ratified evolution
of the frozen "Illuminated Folio" into its **candlelit struck-gold** form is merged to `main` and live:
the Gilded Plate type system (Cinzel · Alegreya · Source Serif 4), the BG3-grammar palette (the cream
`--text-special` tier, warm-black neutrals, the two scrim tiers, the focus wash, grounded glows),
candlelit translucent panels over the owner-generated atmospheric art, the settling motion grammar
(`--ease-settle`), the geometric ornament vocabulary, the struck-medallion economy, and champlevé
enamel accents — all applied at the token seam and swept per-surface. `docs/PRODUCT_CONSTITUTION.md`
bumped to **1.6** with the ratifying amendment; the steering canon reads as the current world.

**Shipped — all COMPLETE (granular detail in git history + the release changesets, golden rule 6):**

- **Phase 0 foundation** (T1–T5): the type system, the palette grammar, the AI-raster materials
  (batch 1), candlelit translucency (`--panel-alpha`), the settling motion re-voice, and the ornament
  vocabulary — landed globally at the token seam.
- **Phase 1 dark-theme perfection wave** (P1–P10): the impeccable craft pass over every surface —
  the full cockpit (Combat · Spells · Inventory · Features · Bio), the campaign hub, both wizards
  (creation + level-up), the roster + global shell, the compendium, and the account / admin /
  read-only / report / login screens — each walked {desktop · mobile} × {EN · IT} dark, all
  interaction states, every discovered UX-behavioral defect fixed in-branch.
- **Owner picks (2026-07-03):** the struck-medallion economy discs, the gold movement channel, and
  the Portrait-Socket combat pip — the winners became THE components, every losing alternative deleted
  whole (golden rule 10). The live encounter-interaction batch (stale-init epoch gate, optimistic End
  Turn, input-draft survival, pip labels) and the solo End-Combat + toggleable-coin re-arm shipped
  alongside. The golden-rule-18 model-tiering correction is now applied to `docs/GOLDEN_RULES.md`.
- **Solo↔encounter band precedence (owner-ratified 2026-07-03, SHIPPED).** The full cockpit
  combat-tab matrix {pure solo · gathering · live my-turn · live not-my-turn · ended} × {coins ·
  movement · End Turn · End Combat · initiative · scope} walked in real Chromium; four deviations
  fixed at the ROOT seam (`useTurnState` → the new `useSheetCombat`): **(1) character scoping** — the
  shell status is keyed on the USER's uid, so a SECOND hero of the same user (not in the fight) wrongly
  inherited the encounter chrome; now scoped to the open hero (`gc.characterId === open id`), and the
  cockpit initiative epoch (`currentEncounterEpoch`) is likewise scoped in `GlobalCombatMount`, so the
  non-encounter hero is pure solo (own round, End Combat, its own initiative) while the topbar pip stays
  the user-wide signal. **(2) gathering** had NO inert treatment — now Action/Bonus/Reaction/Movement +
  End Turn quiet + inert (init entry is the one call to action). **(3) not-my-turn reaction** dimmed with
  its siblings — now the Reaction coin carves back to LIVE (RAW off-turn reactions), the dim applied
  per-coin so a child can exceed the faded parent. **(4) encounter ended** — a `TurnEconomyProvider`
  subscription now resets to solo baseline (round 1 · economy re-armed · movement full · initiative
  cleared) the instant the open hero's scoped status drops, so an open sheet reverts cleanly with no
  stuck `waiting` state. HP/conditions/death-saves/Rest stay ungated in every mode (§2.8). Pinned by
  `turn-state.test.ts` (scoping) + `turn-band-waiting.test.tsx` (phases + baseline reset) +
  `tests/e2e/combat-band-phases.spec.ts` (the Chromium-only computed-opacity carve-out). Docs: `DESIGN.md`
  §13 (`.turn[data-phase]`). Dev seam: `makeDevGlobalCombat` now publishes the turn-phase statuses.
- **Phase-3 verification sweep (2026-07-03):** the whole-app hardening pass — a11y matrix green
  (90/90 both themes), budgets green (entry 57.1 KB gz, eager 736.1 KB gz, PWA 6765 KiB, themed
  assets ~1.6 MB), §7 cross-surface consistency holding by construction, the 6 team fixtures
  conformant, the full gate green (tsc · lint · coverage · build). (Light has since been rebuilt to
  full depth parity — see _Next — the forward plan_ item 3, SHIPPED 2026-07-09.)
- **Chrome-asset refresh (2026-07-07):** the owner-generated Fable batch-1 painterly plates are
  live — the glowing-grimoire login splash (~109 KB q85) and the war-table campaign default
  backdrop (~72 KB q85, hub + realm-card banner), both legibility-verified {dark · light} ×
  {desktop · mobile} with no scrim changes needed — and the engraved brand crest (P6) is seated
  ONCE as the home roster's frontispiece watermark (alpha-mask WebP through CSS `mask-image`,
  theme-accent ink). The login's pointer-parallax drift was REMOVED (input-coupled decorative
  motion, off the calm identity — the splash is static; the brand-intro reveal + ambient loops
  carry the life). `DESIGN.md` §13 manifest updated.

**The epic's one residual task (post-release):** re-shoot the README screenshots ONCE (never per-unit)
now the identity is finished and the owner picks are in.

### Next — the forward plan

**NEW (2026-07-11) — the 2024 core-rules SYSTEM audit shipped its ranked defect ledger** (owner's
flagship "is the app modeling ALL of D&D 2024, correctly, ideally?" sweep — system/engine phase;
the per-entry SRD content-fidelity sweep is the separate later phase). 35 findings (RA-01…RA-35)
verified against SRD 5.2.1 + the live code, ranked severity × frequency, each with its rule
citation, code seam, and fix tier: **`docs/AUTOMATION_BACKLOG.md` → "The 2024 core-rules SYSTEM
audit"**. Fixes ship in later waves (correctness = Tier-2/3 autonomous; interaction-quality = Fable
design rounds with rule-25 previews). Two tracking-doc overclaims found and reconciled in the same
commit (S5 breaksConcentration auto-drop; the exhaustion level-6 death note). **UPDATE (2026-07-24):
all 35 findings are now CLOSED** (RA-31 + RA-35 residual by design) — the ledger is a dated audit
record; the campaign summary is _Shipped — the 2024 core-rules audit close-out_.

**Wave 1 (Fable design round) SHIPPED 2026-07-12 — the damage-and-dying flow (RA-03 + RA-05 +
RA-10 + RA-11 closed together as one coherent flow):** the pure damage-intake engine
(`lib/damage-intake.ts` — the character's own resistances/immunities/vulnerabilities/flat
reductions applied to the ENTERED roll, RAW order, no stacking) + defense-aware type chips with a
live math line and multi-part staging in the ONE `HpEditPopover`; the 0-HP rules in
`characterStore.applyDamage` (knockout → Unconscious + fresh track; massive-damage instant death;
at-0 damage → failure marks, crit = two, ≥ max = death; Stable ends on damage); the death-save d20
roll entry on the state-driven DyingBanner (Dying → Stable → Dead) consuming the previously-dead
`deathSaveOutcome` incl. the Champion-Survivor threshold. Every consequence rides one undo entry
(`restoreHpSnapshot`); every automated value keeps its manual path (untyped entry, hand-tapped
pips, removable condition chips). Ledger rows flipped in `docs/AUTOMATION_BACKLOG.md`; the flow
documented in `docs/MECHANICS.md` + `DESIGN.md`.

**The session-end frontier (2026-07-07), most-actionable first:**

1. **ON-RAMP — tracking-doc reconciliation audit — DONE (2026-07-07); per-class coverage re-ground DONE
   (2026-07-09).** A 3-auditor pass verified every open / deferred / partial claim across `PROGRESS.md` +
   `docs/AUTOMATION_BACKLOG.md` + `docs/AUTOMATION_COVERAGE.md` against the ACTUAL code (golden rule 16).
   **9 drift items found (zero false-greens** — the docs were broadly truthful) and all reconciled in
   `main`. **The residual per-CLASS coverage re-ground is now done (2026-07-09):** all 12 class sections
   (+ subclasses) of the coverage matrix were walked row-by-row against the live class-data + grants +
   consumers, and **11 stale cells flipped to match code** (all shipped-but-marked-narrative/partial —
   e.g. Rogue Fast Hands / Second-Story Work / Dread Allegiance, Monk Slow Fall / Empowered Strikes,
   Druid Aquatic Affinity, Cleric Improved Blessed Strikes, Wizard Core Traits / Epic Boon), plus two
   citation refreshes and the removal of a phantom Rogue row. `PROGRESS.md` + `docs/AUTOMATION_BACKLOG.md`
   already marked these shipped — the drift was matrix-only, confirming the named-campaign reconcile
   leaves matrix drift. **Still due:** the feats / species / backgrounds / magic-items / spells sections
   (not part of this per-class pass) remain at the 2026-06-25 baseline (the coverage-banner caveat now
   scopes to them).
2. **The new-primitive tier (design-heavy).** The mechanical-automation long-tail (seams S1–S13) is
   effectively CLOSED; what remains is a set of NEW engine primitives, each a design fork unblocked by
   the owner's optimal / no-tradeoffs directive. **SHIPPED 2026-07-07:** (a) the
   `SrdActionDef.tempHpRoll` roll-entry idiom ported to the spell-cast path (**False Life** 2d4+4, with
   Fiendish Vigor's maximized-12 one-tap); (b) **Warlock invocation action rows** (Gaze of Two Minds — a
   new optional `mechanics.actions` seam on the invocation type); and (c) the **marked-target model**
   flagship (Hex +1d6 Necrotic / Hunter's Mark +1d6 Force as a while-active, DISPLAY-ONLY "vs marked/cursed
   target" weapon rider — never auto-summed, since the app models no enemy). **Heroism's recurring
   per-turn temp-HP SHIPPED 2026-07-09** (the `regen-at-turn-start` cadence gained an `asTempHp` flag →
   max-wins `gainTempHp` seam, one-tap start-of-turn banner). **Wild Magic Surge on-cast SHIPPED
   2026-07-09** (a third `onCast` effect kind `wild-magic-surge` — a display-only post-cast reminder
   toast, no roll). **The defensive-buff consumers SHIPPED 2026-07-09** — Blur (new
   `incoming-attack-disadvantage` grant), Warding Bond (+1 AC/+1 saves), Death Ward (a deterministic
   0-HP interrupt, undoable), Mirror Image (a `defense-note` three-duplicate reminder). Warding Bond and
   Death Ward were later promoted from self-side reminders/toggles to the 2026-08-04 target-bound typed
   effect runtime above; Mirror Image remains table-managed because interception requires a die roll.
   **Death Strike SHIPPED 2026-07-09** — a new
   `round1-damage-double` grant kind surfaces a round-1-gated "DC N CON save or double damage" reminder in
   the turn tracker (never auto-doubles). **The new-primitive tier is now CLOSED.**
   **Two fast-follows on the shipped marked-target model (tasks #26/#27) — BOTH SHIPPED.**
   **Task #26 SHIPPED (reconciled 2026-07-24):** the COLLAPSED mobile weapon-row chip carries its
   "vs marked target" marker — the crosshair `RiderMarkGlyph`, rendered on the collapsed chip when
   `chip.vsMarkedTarget` and labelled on the cluster aria/title (`src/components/shared/ActionRiders.tsx`).
   **Task #27 SHIPPED (2026-07-09):** the rider now extends to
   spell-attack rows (Eldritch Blast + Hex) via `resolveSpellAttackMarkedRiders`, keyed off the
   `vsMarkedTarget` flag. Source list: `docs/AUTOMATION_BACKLOG.md` → S10-DEFERRED.
3. **SHIPPED — Phase 2, the light theme rebuilt to depth parity (light-parity, 2026-07-09).** The
   light theme now reads as designed, deep, and appealing as the dark flagship — never adapted. The
   deep-parchment field (direction A: `#bca268`, bright ivory cards floating on a wide value canyon),
   the deepened carved/embossed elevation, the struck-gold glow grammar (designed light siblings for
   `--illumination` / `--gilt-glow` / `--focus-wash` / `--accent-glow` / the medallion + magic-mark
   glints — gilt EDGE emphasis + emboss/lift on cream, never a dimmed dark copy), the on-backdrop ink
   - `.on-art` halo, and the panel/tome material story all landed across the prior OWN-36 / D47 waves;
     this closing pass **graduated the two genuine remaining gaps to designed:** (a) `--text-special`
     from its self-declared placeholder (`#33260a`, a hair off body ink) to a designed gilt-espresso
     **rubrication** (`#4a3006`) — the more-luminous, gold-cast "lit emphasis" that reads as an
     illuminated title on cream, AA on every ground (surface-1 10.2:1 · surface-3 8.2:1 · bare field
     4.95:1), locked by a "lit-register" luminance guard; and (b) the **light login/footer defect** —
     the shared `.site-footer` ivory grounding band (`--bg-surface-1`) hazed the intrinsically-dark
     login splash, so the light footer now grounds with a warm near-black fade (the light twin of dark's
     grounding), seating the colophon cleanly on the candlelit backdrop everywhere and fading the login
     hero to the scene, not haze. Walked {desktop 1440 · mobile 390} × {EN · IT} light across the
     cockpit (Combat · Spells · Inventory · Features · Bio), campaign hub (on-art legibility), both
     wizards, roster, compendium, settings, and login — no flat/muddy/washed surfaces remain vs the dark
     sibling. Every edit scoped to `[data-theme="light"]` / light-only tokens; **zero dark drift**
     (dark control shots byte-identical), axe serious/critical zero both themes, the contrast guards
     green. The §10 parity contract is met; dark stays the flagship + first-run default. **Optional
     follow-up (owner-blocked, NOT required for parity):** the owner's Priority-8 bespoke light-panel
     material would further enrich the light `.folio-panel` surface, but the shared asset set already
     renders a coherent light material story. **Update (2026-07-10):** the P8 plate is graded, tiled,
     compressed, and shipped as `public/assets/textures/panel-light.webp` (DESIGN.md §13), and the
     daylight-sibling rebuild WIRED it: the light `.folio-panel` now lays the cream grain under its
     ivory gradient at the light `--panel-alpha` 0.94 — the morning-light translucency that also
     reaches `.rail` + `.page-head.framed`, so the daylight scene breathes through light chrome as
     the candle glow does through dark.
     **Review-and-polish pass (Fable, 2026-07-10, owner-directed after the Candlelit-Vellum revert):**
     walked every major surface light-vs-dark {1440 · 390}; four genuine gaps fixed — the settings row
     titles/hints smeared (a stale on-backdrop ink flip outlived the rows' move into the ivory
     info-card; deleted, guard #8), all base-rule selected/lit surface TINTS + outer BLOOMS re-routed
     `--accent-primary` → `--accent-glow` (dark byte-identical; the gray Heroic-Inspiration panel,
     fork tabs, path plaques + ~40 sibling lit states now strike gold in light; guard #9 pins the
     class), the light path-plaque/fork-tab selected states joined the gilt-selected family
     (fchip-band + `--gilt-glow-sm`), and the light Take-Long-Rest CTA swapped its near-black umber
     slab for the shared bright-gilt primary band (guard #10). Dark proven pixel-identical
     (before/after diff = only the capture-UA shortcut chip); axe 90/90 + on-art-ink 45/45 green.
     Also repaired two broken polish-harness captures (re-pick label drift; the inline-encounter
     false overlay assert — `overlay: false`).
     **Ember-Penumbra rollout (owner-ratified 2026-07-11, "I definitely go ember penumbra, I love
     it").** A light-material exploration compared three candidate lit-magic grammars; the owner picked
     **Ember Penumbra** as the default. A lit gilt control can't bloom on ivory, so it now reads as
     HEAT: a saturated struck-gilt fill over a warm burnt-umber shadow pooling BELOW it ("glow-below"),
     keyed off the shared light-only `--ember-umber` token. Folded systematically into
     folio.css/index.css with no flag or data-attr (the exploration scaffolding and its shot harness
     removed): the light `--gilt-glow` / `--gilt-glow-sm` / `--illumination` aura tokens carry the ember
     so every consumer (hero bands, portrait wells, caster tiles, seals, selected tiles) converts by
     construction, plus ~15 emblematic recipes
     (Heroic-Inspiration chip/coin, the kindled attack + primary/End-Turn/long-rest CTA family, the
     LEVEL chip, the Rest moon, dashed add-affordances, compendium seal/empty leaf, slot & tracker
     pips, the scorched crest). One dup light `.trk-pip.on` collapsed to a single source. Dark
     byte-identical (proven by the diff — every hunk is `[data-theme="light"]`-scoped or a light-block
     token), text ≥4.72:1 everywhere touched, axe 94/94 both themes, guards pin the ember tokens (the
     ember-penumbra block in `light-theme-backdrop-legibility.guard.test.ts`). DESIGN.md §10.3 updated.
4. **PARKED (owner).** Local backups + observability/monitoring (both in _Open decisions_). The
   open-source / repo-public + legal effort (**GH #32**) has since SHIPPED — repo public
   2026-07-17, split-repo world live (see "Open-sourcing scaffolding shipped" above). **Legal-page slice
   landed (2026-07-09):** the `/legal` page was rebuilt as a proper colophon document — a parchment
   document leaf (the compendium-tome material) with Attribution · Licenses · Trademarks · The App set
   in the document type ramp — and now carries the EXACT dual SRD 5.2.1 + SRD 5.1 / CC-BY-4.0
   required attributions verbatim (WI-1, completed 2026-07-17: both EN required texts + WotC's
   official IT statements as two stacked plaques; `README.md` carries both EN statements), both
   licenses linked (CC-BY-4.0 + AGPL-3.0), and the nominative-trademark / "compatible with fifth edition"
   notices. Unit + e2e locks pin all four statements byte-exact. **Still open in #32 (out of this
   slice):** the repo-publication work itself — the content partition (the WI-3 display renames +
   the WI-5 PI-denylist guard), the SRD prose re-sourcing (WI-2), and the docs-partition +
   sensitive-value sweep (WI-6) have since landed.

**Owner directives (2026-07-10)** — captured; shipped, queued, or standing (the four
formerly-IN-FLIGHT items 2–5 all SHIPPED, reconciled 2026-07-24):

1. SHIPPED (2026-07-10) — realm-switch "refresh" jump: root-caused by frame forensics under
   owner-like conditions (scrolled realms + real navigation, not the fixture-fresh probes). TWO
   causes: (a) the ScrollRestorer's per-realm scroll memory restored on PUSH — returning to a
   scrolled realm painted the top then visibly JUMPED to the remembered offset (and a switch away
   from a scrolled realm briefly painted the destination at the source's offset before snapping),
   so the masthead/crest never landed in the same place twice; (b) the masthead settle animation
   faded title/hint/actions in from invisible + a 6px rise on EVERY switch — the "refreshing" read.
   Fix: every fresh PUSH lands at the top (scroll-to-top runs pre-paint in the layout effect; POP
   keeps exact restore; `?scrollTo` hand-off unchanged) and the masthead is now deliberately STATIC
   (no mount animation — the content change is the navigation signal). Proven by overlap-diff: the
   crest strip is 0-differing-pixels across all three realms + a return visit; a 39-sample
   navigation trace shows zero off-target frames. Guards: `scroll-restoration.test.ts` (PUSH never
   restores), `page-header.test.tsx` (no `.page-head*` animation), `navigation.spec.ts`
   (realm switch lands at top and stays).
   1b. SHIPPED (2026-07-10) — app-wide navigation-feel audit + compose-once fixes (Fable, the
   follow-through on directive 1): EVERY transition class frame-recorded in real Chromium with
   layout-shift attribution (realm switches warm/cold, roster↔cockpit, cockpit tabs incl.
   deep-scrolled, campaigns↔hub↔member-sheet, compendium entry/type/filters, creation + level-up
   wizard enter/steps/exit, rest/palette/shortcuts overlays, POP/forward, deep links) × 1512/390
   (touch) × dark/light × 6× CPU throttle. Most classes measured CLEAN (0 CLS, no loader flash, no
   scroll/focus surprise). Four real defects found and fixed at the root: (a) the campaign hub
   painted before the chronicle's first snapshot, then `AutoAnimateHeight` glided the book-spread
   +226px and shoved four sections down on EVERY hub entry → the hub now mounts the chronicle
   listener itself and composes ONCE (loader holds for both initial snapshots; errors settle the
   gate); the member-card doc-loading cluster now shows the saved SNAPSHOT vitals in the live
   card's own barred chips (stale-while-revalidate, zero height change on hydration); (b) cold /
   deep-link loads pinned the footer under the tumbling d20 then shoved it off when content landed
   (CLS 0.08–0.09) → the FolioLoader wrapper now mounts immediately as the "content settling"
   marker and `.app-canvas:has(.folio-loader)` keeps the SiteFooter invisible until the page
   composes (measured after: CLS 0.0001); (c) the `?` shortcuts sheet snap-closed (conditional
   unmount skipped Radix's exit animation) → sticky-mounted after first open (close now paints a
   real fade, 10 frames vs 2); (d) light-theme campaign-card banner flashed bright ivory while the
   art decoded → art-toned base color under the image. Contract: `DESIGN.md` → "Navigation feel"
   §7; seams: `docs/ARCHITECTURE.md` → "Compose-once loading". Verdict data + before/after frame
   strips in the session evidence; guards: `campaign-hub.test.tsx` (compose-once gate),
   `folio-loader.test.tsx` (settling marker + footer rule), `app-shell-suspense.test.tsx` (sticky
   mount), `chronicle-section.test.tsx` (the section stays a pure store reader).
2. SHIPPED (reconciled 2026-07-24) — clear-site-data resilience: the "Clear site data" boot
   data-resilience root fix landed in v0.19.0 (deployed 2026-07-11) — an online cache-empty roster
   result is never authoritative (`src/lib/chunk-recovery.ts` + `tests/unit/roster-boot-resilience.test.tsx`;
   full account under _Boot data-resilience — the "Clear site data" incident_ above).
3. SHIPPED (reconciled 2026-07-24) — the live-data migrations ran with the owner key and were
   verified against production 2026-07-10: solo-round (10 docs) + attachedCampaignId (9 attachments),
   both re-run idempotent, the spent one-off scripts `git rm`'d (rule 10; see the _Deferred
   cleanliness_ + backfill notes above).
4. SHIPPED (reconciled 2026-07-24) — the mobile encounter topbar keeps the brand wordmark, pinned by
   `tests/e2e/topbar-brand-invariant.spec.ts`.
5. SHIPPED (reconciled 2026-07-24) — the Bloodied IT term was re-translated official-SRD-first to
   **"Sanguinante"** (`src/i18n/it/ui/character.json`; the old "Dimezzato" is gone), carried
   corpus-wide by the 2026-07-21 IT re-sourcing.
6. SHIPPED — Legal & Attribution set as THE COLOPHON SPREAD (Fable Tier-1, 2026-07-10, after
   three owner verdicts against a swimming prose column: "still wastes a lot of space. Do it
   properly and SOTA!"): a full-width engraved attribution plaque on the centred ceremonial
   axis, the two licenses as twin deed columns split by an upright fading thread, and
   Trademarks · The App side by side in the bottom register — the leaf's width is earned at
   desktop while every column keeps its reading measure; a phone stacks one clean column. The
   sticky "On this page" rail and its scroll-spy were DELETED (the spread fits roughly one
   viewport, so an in-page TOC had no job left). Contract pinned in
   `tests/e2e/legal-colophon.spec.ts` + the legal-page unit tests; layout doc in `DESIGN.md`.
7. SHIPPED — light theme "Daylight Sibling Plates" rebuild (Fable Tier-1, 2026-07-10; the
   owner-ratified Option A direction, after the "Candlelit Vellum" attempt was reverted on owner
   order). The three owner-generated daylight plates (P9 daylight study · P10 daylight war table ·
   P11 dawn grimoire) are graded, compressed (43/84/108 KB — all inside §13 budgets), and wired as
   the light theme's OWN scene art via per-theme asset tokens (`--asset-home-hero` / `--asset-login`
   / `--asset-campaign-backdrop`, dark in `:root`, light re-points) — each theme downloads only its
   own plates, and a theme switch swaps the hour, never the world. The light `body::after`
   colour-lift filter (a compensation for borrowing the dark art) is retired; the light login scrims
   are re-tuned to warm-umber morning washes around P11's calm left third; the realm-card banner
   flips its decode base to the morning plate's honey tone. NEW: user-uploaded campaign art is
   veiled in light (`data-app-bg-custom` → parchment glaze + gentle desaturation, DESIGN.md §13)
   so ANY upload — pure white, neon, pitch black — sits harmoniously under the light chrome
   (verified with exactly those three adversarial images); and the light `--on-art-halo` is
   re-struck from the hard 4-way outline to a micro-edge + soft engraved shadow, so loose on-art
   text reads as gilt lettering on the morning plates instead of stroked "game subtitle" text.
   Dark is byte-untouched throughout.
8. SHIPPED — compendium-lux (Fable design tier, 2026-07-10): the Compendium opens as a TWO-LEAF
   SPREAD ≥1024px (index verso · reading recto · book-fold gutter — reading never hides the list;
   below, the phone swap model is unchanged), the facet bar collapses behind ONE Filters disclosure
   at every width (active-count tally; the owner's space ask), the deferred school-hue decision is
   RESOLVED YES as the 8-school `--school-*` enamel domain palette (per-theme, AA-guarded chip math;
   the level rainbow stays on the seal — one hue vocabulary per fact), plus the frontispiece resting
   leaf, seated `aria-current` selection, index keyboard roam (search ↓ → rows → Enter/Esc), and the
   one-row scrolling ribbon. Contract: `DESIGN.md` §2 (schools) + §5 "Compendium codex".
9. SHIPPED — the Living Sheet cockpit masthead (Fable design tier, 2026-07-10; management chrome
   later moved OFF the masthead into the fob family, 2026-07-11): the masthead reads identity left,
   the vitals strip (DATA) right — and nothing else (the management chrome lives in the Binder's Fob
   / Signet). Rest and Level Up are quiet ceremony ON the sheet: **Rest** is a
   glyph-only wax-seal moon medallion trailing the HP tile (verb in title/aria — zero rendered
   locale text, so the vitals row is geometry-identical EN vs IT), and **Level Up** is pure
   availability ceremony — a gold "⌃⌃ LEVEL {n+1}" chip beside the lineage (no portrait gem),
   absent at L20. Medallion and chip are owner-only (the
   read-only glass case). Phones get the deliberate 1+4 vitals composition
   (the HP bar leads its top row with the Rest coin trailing it as a same-row sibling — one
   placement rule across breakpoints, zero bar-track overlap — over four even reference tiles). Contract: `DESIGN.md` §5 "Cockpit masthead — the Living
   Sheet".
10. QUEUED — keyboard-shortcut system: discoverable hints (⌘K-style), a shortcuts sheet, high-value
    bindings with limits.
11. QUEUED — navigation consistency: settings/legal live outside the realm nav (breadcrumb
    dead-ends); app-wide navigation audit to SOTA.
12. STANDING — owner reaffirmed the BG3-premium bar: wow-effect without clutter; unique consistent
    design vision; billing must never exceed £1/month (see Blaze note).

**Owner directives (2026-07-11):**

13. SHIPPED (2026-07-11) — the combat-CTA grammar + THE REVERSAL CONTRACT ("for once and for all",
    owner-ratified). ONE rule for every combat CTA — the CTA states usability now; the undo system
    owns ALL reversal: a spent economy token disables every card that needs it to "Used"/"Usata"
    (the reaction contract generalized; the committed occupant keeps the recessed chip + gold
    ring), live Extra-Attack swings stay struck gold (per-swing undo IS the double-attack answer),
    depleted hard-disables with its reason line, condition-blocks dim-but-stay-tappable
    (override-first). The inline "Annulla" tap-again toggle (an undo-stack duplicate) and the
    replace-oldest eviction DIED; `combatCtaState` (combat-card-helpers) is the one pure composer.
    Reversal hierarchy: the session undo stack is THE seam; the 5s undo snackbar (now under the
    ONE-SNACKBAR rule — a new act's announcement replaces the live one in place, retiring
    `replaceKey`; notices keep their own lane), the standing Undo·Redo control, and ⌘Z/⌘⇧Z are its
    only three references. The toast-only stragglers (roll-entry heals/temp-HP, turn-start regen,
    initiative top-ups, coin re-arms) now register on the stack. Contract: `DESIGN.md` → "THE
    REVERSAL CONTRACT" + "THE COMBAT-CTA GRAMMAR".

**Queued tail (not blocking the frontier above):**

- **Full encounter-mechanics perfection audit.** Every reducer/edge of the encounter surface —
  reinforcement slotting, dead-monster skip, multi-writer HP races, reveal/hidden, the death-save
  flow — audited once the identity epic merges (the top backlog item queued from live play).
  (Closed from this audit: **issue #41** — the sheet's `combatStore.initiative` now RECONCILES from
  each `combat/state` snapshot via `syncCombatFromSession`, so a remotely-edited roll re-syncs onto
  the open sheet instead of going stale until reload.)
- **Deferred P3 polish (noted, not defects):**
  - **Cockpit:** the Action Log's bounded-scroll vs
    latest-N recipe; a SHORT structured spell duration for the collapsed gloss (a data-model add, the
    constitution's collapsed-card example); the action-type-by-border-colour-only encoding; a
    play-mode CTA on the empty spellbook; play-mode weapon-mastery chips showing their property.
  - **Wizards:** the guided level field as a raw input (prefers `NumberStepper`, §15.7); the Create
    seal sharing the pager geometry (a taste fork); the level-up done ceremony celebrating level + HP
    only; the two-line eyebrow orphaning "3" on 390px IT.
  - **Roster / shell / compendium:** the legal Back as `navigate(-1)` on a fresh-tab deep link; the
    unchecked selection checkbox reading dark over portrait corners; roster cards not showing campaign
    membership (needs a membership query / denormalization decision); invocation prerequisites
    rendering EN-only (a D2 data gap, no authoritative IT). (The entry leaf's full-width meta grid
    and the hue-less school chips both CLOSED in the 2026-07-10 compendium-lux pass — the fact grid
    is capped at a reading measure; schools got their own enamel domain palette, frontier item 8.)
  - **Account / admin / read-only:** the read-only `.co-ex-pip` taps staying visible (inert); the
    report Summary placeholder clipping mid-example on 390; admin drill-down rows at the ~36px app-wide
    sm height; the Settings DATA section (export-all / import-all / delete-account — needs server
    seams); no AI / BYOK settings section (the AI assistant is DROPPED — owner 2026-07-06).
  - **App-wide:** sm-button touch targets in card heads <44px (a vocabulary-level decision); the DM
    at-a-glance "key resources" row (§2.9 — needs a listener / denormalization decision, free-tier
    posture).

## Active campaign — BG3 on-rails combat

**Direction (owner, 2026-06-22):** the **smartest possible interactive character sheet** — copying
Baldur's Gate 3's clarity about what you CAN and CANNOT do each turn — but it is a **companion sheet,
NOT a videogame**. Owlbear Rodeo owns dice, maps, and the grid, so **NO battle grid, NO dice rolling,
NO modeled enemies**. Target/range highlighting, enemy turn-order, enemy "examine", and timed reaction
prompts are **out of scope by identity** and must NOT be faked. Separately: copy BG3's **graphical
style** as far as possible **within the existing Illuminated Folio identity**.

The workstreams below are COARSE headlines — the detailed per-seam frontier lives in
`docs/AUTOMATION_BACKLOG.md`; do not duplicate it here.

> **The major wave shipped 2026-06-22 (on `main`, git `fe522b60`…`f68226dd`):** on-hit rider chips
> (S2), the A2 duration / per-turn cadence engine (S3), persistent blocked/depleted-reason cards +
> condition-consequence projection (B / S5), form-swap attack rows (S7), and the effective-max-HP /
> set-score / additive-darkvision / Epic-Boon-L19 / 2024-trait correctness batch (D). The boxes below
> are reconciled against that wave; the remaining tail is the genuine open frontier.

### A. Combat mechanics gaps (engine computes, UI renders)

- [x] **S2** — render on-hit RIDERS (Sneak Attack, Radiant/Divine/Blessed Strike, Berserker Frenzy,
      Colossus Slayer, fighting-style riders, Savage Attacker, Lifedrinker heal) from
      `summary.extraDamage`/`dieModifiers`/`onHitHeal` — shipped via `lib/views/rider-view.ts` +
      `components/shared/ActionRiders.tsx`, consumed by PlayTab + the inventory WeaponCard.
- [x] **S3 / A2** — duration / per-turn CADENCE engine: `Recovery` gains `per-turn` (Sneak Attack
      auto-resets at turn start); `while-active.duration.maxRounds` arms a `session.effectTimers`
      countdown the End-Turn seam decrements + auto-drops (Rage = 100 rounds → toast + `effect-expired`
      log + "N rounds left" chip); `advantage-on { round1 }` (Assassinate) gates on `round === 1`. All
      undoable via the single End-Turn undo; additive + back-compat.
- [x] **S5** — death-save crit threshold (Champion Survivor / Defy Death) + a standalone **Bloodied**
      flag on the HP control, both shipped (2026-06-24). The `DeathSaves` control reads
      `deathSaveCritThreshold` off the canonical aggregate and renders a "roll of N+ → regain 1 HP" chip
      only below the RAW default (source-agnostic numeric line, no name leak). `isBloodied`
      (`current > 0 && current ≤ ⌊effectiveMaxHp/2⌋`) drives a Bloodied mark on `HeaderHpControl` via the
      shared `useHpControls().bloodied`, and gates the two Bloodied boon TOGGLES (Desperate Resilience,
      Furious Storm) by their `-bloodied` activeKey suffix → `activatableToggles` hints the precondition
      when not Bloodied (override-first). The descriptive Bloodied features self-state their precondition
      in their SRD text; a dynamic per-feature-card highlight is a noted follow-up. (The other condition
      consumers — `speedZero`/`autoFailSaves`/`breaksConcentration` — shipped under workstream B.)
- [x] **S6** — play UI for the modeled catalogues is COMPLETE. Cunning Strike / alt-recovery /
      alt-cost / the pack maneuvers play in PlayTab; the final three affordances landed
      2026-06-24: **Metamagic per-cast** (an amethyst multi-select chip row in `CastLevelModal`,
      SP-debited from `sorcerer-font-of-magic` in both cast paths, undoable, applicability
      data-driven on the option id) via the shared `resolveMetamagicForCast`; the **EK War Magic
      note** (`resolveReplaceAttackWithCast` → a display-only badge on the Attack-action cluster);
      and **familiar enhancements** (`resolveFamiliarEnhancements` → the Investment of the Chain
      Master invocation-detail callout). Both former zero-caller resolvers now have a UI consumer.
- [x] **S7** — Wild Shape / Arcane Armor / Starry Form form-swap is now CLOSED: ATTACK ROWS, the
      while-active CON-save toggle, the **AC-swap**, AND the **speed-swap** all ship. The
      **AC-swap** is hardened end-to-end — the active while-active AC formulas (`agg.acFormulas`,
      already gated to the lit toggles) thread into the canonical
      `computeCharacterAC`/`computeCharacterAcBreakdown`, so a lit Moon form (13 + WIS), an active
      Mage Armor (13 + DEX), Shield/Shield-of-Faith (+5/+2), and a Barkskin floor (17) reach the
      displayed AC (MAX vs body, override-first) through the ONE helper every AC reader shares. The
      three forms the audit named, ruled per 2024 RAW: Circle of the Moon = a FORMULA (auto-computed);
      generic non-Moon Wild Shape = the beast's natural AC, a per-beast value left to override-first
      `acOverride` (never fabricated); 2024 Armorer's Arcane Armor sets NO fixed AC (keeps worn-armor
      AC) so carries no formula by design. A keystone regression pins the breakdown SOURCE
      (`computeCharacterAcBreakdown` shows the form base when lit; fail-before proven). The
      **speed-swap** is the EXACT parallel + correct-by-design (OVERRIDE-FIRST) — traced end-to-end:
      per RAW (`druid:main` "your game statistics are replaced by the Beast's stat block", incl. its
      speeds) the form's speeds apply, but a beast's per-beast walking/fly/swim/climb speed has NO
      formula, so — like the beast AC — it rides override-first (`speedOverride` walking +
      `speedOverrides[fly|swim|climb]`), never fabricated. Circle of the Moon grants NO speed (only
      AC + temp HP + max-CR, confirmed against `druid:circle-of-the-moon`). What IS auto-modeled is
      the DECLARED while-active movement MODE (Sea Stormborn Fly `equal-to-walking` while Wrath of the
      Sea is lit, Draconic wings, Beast forms) — it flows through the same `while-active` recursion
      the form AC uses → `flySpeed`/`swimSpeed`/`climbSpeed` → `deriveSensesAndSpeeds` → the LeftHud
      speed rows, retracting when the toggle is off. No new grant kind, no fabricated value — the seam
      was already complete; a keystone regression (`tests/unit/active-form-speed.test.ts`) drives the
      whole seam (the Fly row surfaces when lit + retracts when off + resolves the sentinel against
      the effective walking Speed; fail-before proven by short-circuiting the `while-active`
      recursion) plus the override-first walking + per-mode pins. The **stat-swap** is the THIRD
      exact parallel + correct-by-design (OVERRIDE-FIRST): per RAW (`druid:main` Wild Shape → Game
      Statistics) the beast's stat block replaces your STR/DEX/CON — you retain ONLY INT/WIS/CHA — and
      a beast's physical scores are per-beast with NO formula, so they ride override-first in the
      stored `abilityScores` (the same field `effectiveAbilityScores` layers item floors/bonuses on,
      no double-count), never fabricated. The SUBTLE consequence — the **concentration CON-save while
      transformed** (RAW No Spellcasting: shape-shifting doesn't break Concentration) uses the BEAST's
      CON, since CON is replaced not retained — falls out BY CONSTRUCTION: the store's `applyDamage`
      already feeds `effectiveScores.CON` into the concentration-save `savingThrowBonus` (B8), so the
      override-carried beast CON drives the save with zero special-casing. A keystone regression
      (`character-store.test.ts` "the Concentration CON save uses the BEAST's CON while Wild-Shaped")
      drives the whole store seam — the save total moves by the CON-mod delta when the override-carried
      CON changes (fail-before proven by feeding the save a constant CON). The fix-only S13→S7
      doc-comment typo in `active-form-speed.test.ts` was corrected in the same pass. The **Armorer
      Arcane Armor model-weapon rows** are now GATED ON THE CHOSEN MODEL (2026-06-25): all three 2024
      RAW models ship as `form-attack` rows inside a `choice-grant-bundle` (`armorer-armor-model`)
      nested in the donned-armor `while-active` — Dreadnaught Force Demolisher (1d10 Force, Reach),
      Guardian Thunder Pulse (1d8 Thunder + Disadvantage reminder), Infiltrator Lightning Launcher
      (1d6 Lightning 90/300 + once/turn +1d6) — INT-keyed (effective, B7), L15 die bumps via
      `damageDieByLevel`. The existing rail `GrantBundleSelector` surfaces the model picker (no new
      UI); switching the model swaps the attack row, doffing the armor clears it. The minimal seam:
      propagate the wrapping `activeKey` through the `choice-grant-bundle` evaluator (so a bundle in a
      lit form keeps its toggle), plus `oncePerTurnExtra` (→ `summary.extraDamage`) + a catalogue-keyed
      `note` (→ `summary.effect`) on `form-attack` — both REUSING existing channels. Old 2014 "Thunder
      Gauntlets" keys + the un-gated both-rows structure DELETED (rule 10). Regression added to
      `form-swap-attacks.test.ts` (engine gating + the end-to-end `resolveActions` model swap;
      fail-before proven). The **Circle-of-the-Stars Starry Form Archer ray** is now GATED ON THE
      CHOSEN CONSTELLATION (2026-06-25), the SAME doubly-gated shape: the constellation chooser
      (`choice-grant-bundle` `druid-stars-constellation` — Archer/Chalice/Dragon) was moved INSIDE the
      form's `while-active` and the Archer `form-attack` nested into the `archer` OPTION alongside its
      rail aura — so the WIS-keyed ranged Radiant attack row (1d8+WIS → 2d8 at druid L10) surfaces ONLY
      while the form is lit AND Archer is chosen, and retracts when you switch to the passive Chalice
      (heal aura) or Dragon (`roll-floor` aura) constellation. Previously the row was a sibling
      `while-active` gated on the form toggle ALONE, so the Archer ray LEAKED onto the board regardless
      of the chosen constellation. Pure data restructure REUSING the Armorer seam (no new grant
      kind/field); the i18n keys were re-pathed to the nested location (EN + IT already present:
      Archer/Arciere, Chalice/Calice, Dragon/Drago, the ray name "Forma Stellare: Arciere"). 2024 RAW
      confirmed against `dnd2024.wikidot.com/druid:circle-of-the-stars`. Dev scenario `stars-archer`
      added. Regression in `form-swap-attacks.test.ts` (engine gating: form off / no-constellation /
      Chalice / Dragon → no row; Archer → the WIS-radiant ray with the L10 die bump; switch-away
      retracts it; + end-to-end `resolveActions` render in EN + IT) — fail-before proven (5 assertions
      failed on the un-gated data). `aggregated-primitives` + `resource-rail` tests updated for the
      now-form-gated constellation benefits.
      **Polymorph / True Polymorph SELF-swap — SHIPPED (Phase 1, 2026-07-06).** The NEW primitive landed:
      a CR-indexed **Beast stat-block catalogue** (`src/data/beasts/*` — a curated starter set of ~18 iconic
      combat forms CR 1/4→8, ids+numbers only; names in the new `beasts` srd catalogue), the CR-gated per-cast
      **`BeastFormPicker`** (opened from the Polymorph spell card's "Transform" affordance; `resolvePolymorphForms`
      = form CR ≤ the caster's level), and the override-first **self-swap applicator** (`assumePolymorphForm` /
      `dropPolymorphForm` + the pure `lib/polymorph.ts`): assuming a form stamps the Beast's AC/speeds/all-six
      scores into the override fields, applies Temp HP = the Beast's HP, engages Concentration by id, and renders
      the Beast's own PRINTED attack rows on the Play board (`resolveBeastFormAttacks`, `form-attack` unchanged).
      Drop / 0-HP-Concentration-break restores the body + retracts the Temp HP from a session snapshot, undoable;
      the CON-save uses the Beast's CON by construction. Polymorphing ANOTHER creature is a read-only reference
      card (one modeled character). The spell ENTRIES were already 2024-RAW-correct (L4/L9 Transmutation,
      `concentration: true`, WIS save, "Metamorfosi"/"Metamorfosi pura"). Regression: `polymorph.test.ts`
      (catalogue integrity + CR gate + the whole self-swap seam → AC/speed/score/CON-save/attack-row + temp-HP
      retract + undo) and `spell-data-integrity.test.ts` (the spell facts). **Phase 2 — SHIPPED (2026-07-07):**
      the full CR 0-8 Beast catalogue is filled against the same `BeastStatBlock` shape — 73 more forms
      (source-verified against the CC-BY SRD 5.2.1 text + cross-checked against the 2024 XMM bestiary data),
      bringing the catalogue to 91 total forms; True Polymorph's arbitrary NON-Beast forms stay
      narrative/override-first. Full detail in `docs/AUTOMATION_BACKLOG.md` (S7, the Polymorph item) +
      `docs/AUTOMATION_COVERAGE.md` + `docs/MECHANICS.md`.
- [x] **S8** — one-tap apply of computed HP numbers (override-first; golden rule 21 — the app never rolls a die). The DETERMINISTIC legs are true one-tap, undoable: slot-LESS temp-HP cards (Dark One's Blessing, Celestial Resilience, Vitality of the Tree, Inspiring Leader) now carry the resolved amount as a structured `useEffects` entry and apply through the store `gainTempHp` max-wins seam on commit (the slot-gated Adrenaline Rush already did — this mirrors it); the start-of-turn **regen banner** (Heroic Rally 5+CON while Bloodied) gained a one-tap "Heal N" button (`applyHealing` + undo). The DICE leg is roll-entry-then-apply, never auto-rolled: Second Wind (`1d10 + level`) shows the formula + a clamped roll-entry input (`summary.healApply:{dice,bonus}` → `PlayTab.HealRollEntry`); the player enters their d10 and the app applies roll + the deterministic Fighter-level bonus. **Deferred (DICE, display-only):** the pack species' Healing Hands, Wholeness of Body, Form of Dread's Facsimile of Life — auto-apply is forbidden (golden rule 21); there are no dice-free self-heals in the data.
- [x] **S9** — magic-item charge-cast: charged wand/staff items emit a cast row through the `free-cast-spell` seam (debiting an item-charge tracker, shown + editable in the rail Resources); consumed buff potions arm a self-sustaining duration countdown reusing A2's `effectTimers`; set-score items (Headband of Intellect…) reach combat math via `combatAbilityScores`. **Multi-spell item-casters shipped** — Wand of Binding/Fear, Ring of Animal Influence, Staff of Charming cast ONE OF several spells from a shared charge pool via a new item→pool action bridge (`resolveItemPoolCastActions`) reusing the `free-cast-from-list` guided picker, with per-spell charge costs (`spellCosts`: Hold Monster 5 / Hold Person 2, Command 1 / Fear 3) debited + undone at the selected spell's exact cost.
- [x] **S9 activated-item closure (2026-08-04)** — equipped activated properties now enter the same Play action → optional item-id tracker → `while-active` state → round-timer → undo path as class features. Wired Boots of Speed, Winged Boots, Wings of Flying, Armor of Invulnerability, plus the composed-pack Mythallar Cloak (including its timed flight and once-per-turn Radiant rider). Manual rail correction atomically clears/restarts timers; Long Rest preserves true `manual` cooldowns instead of fabricating elapsed table time. Boots of Speed deliberately has no false 1/LR counter: its 10 minutes are a cumulative, incrementally usable table-time reservoir, so the action/current timer are automated and the across-scenes remainder stays explicit.
- [x] **S9 charged-cast recovery reconciliation (2026-08-04)** — the public + pack tracker-backed charged-caster census now stamps `autoRecover:false` wherever dawn recovery requires a die roll; Long Rest preserves the spent count for table input instead of filling it. Deterministic partial recovery uses `longRestRecovery:N` (Spirit Board restores exactly 1); full-recovery items keep the zero-config default (Eyes of Charming). Corpus guards compare the typed declarations with EN descriptions in tests only — runtime never parses prose.
- [x] **S10** (first wave) — data-wiring batch: the genuinely-open bare-prose items wired as PURE declarations on existing grant kinds (no new primitive for the wiring). Free-cast links: Star Map / Misty Wanderer / Mapping Magic (ability-scaled), Fey Reinforcements / Dragon Companion / Gift of the Depths (1/LR). Missing tracker spells: the three pack fey/elemental lineages (per-spell free-cast, old pool tracker removed), Illusionist Minor Illusion. While-active effects: Zealot Divine Fury rider, Reckless Attack advantage, Trance of Order roll-floors, Heroism Frightened-immunity. Action rows: Thief Fast Hands, Dhampir Vampiric Bite. The ONE near-primitive: `chargesFormula` now resolves ability mods (WIS/INT) via the shared `resolveChargesFormula`, not only `"PB"`. **Deferred at the time (need NEW primitives, tracked in `docs/AUTOMATION_BACKLOG.md` S10) — since narrowed:** Sacred Weapon to-hit, War God's Blessing 2-spell free-cast, false-life rolled temp-HP, Gaze of Two Minds invocation actions, and the Hex/Hunter's-Mark marked-target model have all SHIPPED; the genuinely-open remainder is the blur/mirror-image/warding-bond/death-ward defensive consumers. Verified byte-identical against the 6 team fixtures.
- [x] **Cadence-mechanics wiring** (the 4 fenced behind "review S3 cadence first"): **now all 4 WIRED (Death Strike shipped 2026-07-09)** (no half-models — golden rule 19). **Stunning Strike** (Monk L5) — a SELF-SIDE Ki affordance: the existing `free` action (1 `monk-focus`) now also surfaces the "CON save · DC N" line, the DC routed through the ONE `featureSaveDc` (8 + PB + WIS mod) via a generic `saveAbility`/`saveDcAbility` pair on `SrdActionDef`; the app NEVER models the enemy nor applies a Stunned condition (BG3 on-rails). **Studied Attacks** (Fighter L13) — a player-armed `while-active` toggle wrapping `advantage-on { attack }` with a `timed maxRounds:2` duration = the shipped until-next-turn cadence (no miss event exists, so the player arms it after a miss; override-first). **Dread Ambusher's Ambusher's Leap** (Gloom Stalker L3, 2026-06-25) — a `round1` `speed` grant (+10 ft on the first combat turn), the SPEED counterpart of Assassinate's `advantage-on { round1 }`: routed into the `round1SpeedBonusFt` aggregate and applied by `effectiveWalkingSpeedFt(char, resolveSrd, round)` only when `round === 1`; its Dreadful Strike rider + WIS-initiative were already wired. (The 2014 "first-turn extra attack" does NOT exist in 2024 — verified vs `ranger:gloom-stalker` — so there's no extra-attack gap.) **Death Strike SHIPPED 2026-07-09** — a NEW `round1-damage-double` grant kind (`{ saveAbility: "CON", saveDcAbility: "DEX" }`) surfaces a DISPLAY-ONLY round-1 reminder ("DC N CON save or double damage", DC via `featureSaveDc`) in `ThisTurnTracker`, gated on `round === 1`; the app never auto-doubles (no modeled enemy). Verified byte-identical against the 6 team fixtures (none is an Assassin-L17 / Gloom-Stalker / Fighter-L13 / Monk-L5 with these active). See `docs/AUTOMATION_BACKLOG.md` → "Cadence-dependent mechanics unblocked by S3".
- [x] **S11** — save-based action primitive: `SrdActionDef` gained `attack?: ActionAttack`
      (`dice`/`diceByLevel`/`damageType`|`damageTypeChoices`|`damageTypeFromBundle`) ALONGSIDE the existing
      `saveAbility`/`saveDcAbility` pair (REUSED, not duplicated). The shared `applySaveAttackSummary`
      resolver (called from BOTH the SRD-feature AND race-trait loops — single source of truth) resolves
      dice at the action's owning-class/character scaling level (via `pickByLevel`, the cantrip
      `extraDamageByLevel` rule) onto `summary.damage`/`damageType`(`/damageTypes`) + routes the DC through
      the one `featureSaveDc` formula — so the EXISTING chip + facts recipe renders "2d10 Fire · DC N DEX"
      with ZERO new view code or i18n key. **Wired:** Dragonborn Breath Weapon (G1; DEX/CON save, 1d10→4d10
      by char level, type from the chosen ancestry), Cleric Divine Spark (CON/WIS save, 1d8→4d8 by Cleric
      level, Necrotic/Radiant choice), Cleric (Light) Radiance of the Dawn (CON/WIS save, 2d10 Radiant),
      Lupin Howl (G15-DC; WIS/CON save). **The S11b exotic sub-shapes have since all shipped** (the
      `+WIS mod`/`+Cleric level` additives, Divine Spark's heal-or-damage mode, Sear Undead's ability-count
      dice, the pack species' multi-form revelation save + Healing Hands — see the S11b entry
      below). Verified byte-identical against the 6 team fixtures (none is a Dragonborn/Cleric/Lupin with
      these actions). See `docs/AUTOMATION_BACKLOG.md` → S11/S11b.
- [x] **S12 — structured spell `damageDice`/`healDice`** (SHIPPED 2026-06-24, defects C/E). Retired the
      golden-rule-5 seam violation where two display paths disagreed BY CONSTRUCTION: the cards read
      structured dice (unpopulated for ~125 spells → bare "Fire" / wrong "Utility"), the combat tab regexed
      English prose. Populated `damageDice` on all **126** dice spells (7→126) + `healDice`/`effectTag:"heal"`
      on every healer (1→11/13) + a new `healAddsCastMod` for the cure-family, generated from the OLD regex
      as the ORACLE then SRD-spot-checked (Fireball 8d6, Guiding Bolt 4d6, Spirit Guardians 3d8, Moonbeam
      2d10). DELETED `extractDamageDice` + the heal regex; the combat tab now reads the SAME structured field
      the cards read (cantrips scale via the pure `scaleCantripDice`, 5/11/17). Oracle-equality proven for
      every reached spell; both surfaces identical by construction. Override-first preserved; locked by
      `spell-data-integrity` assertions. 6 team fixtures byte-identical. Multi-instance (Magic Missile /
      Scorching Ray ×N) + Stars `diceByLevel` deferred to **S12b** (each a new structured sub-shape;
      SHIPPED 2026-06-25 — see below).
- [x] **S13 — effective walking Speed reaches the UI (SHIPPED 2026-06-24).** The combat-header Speed
      vital now shows the EFFECTIVE walking Speed (override-first via `character.speedOverride`, mirroring
      AC): `effectiveWalkingSpeedFt` folds Mobile/Fast-Movement/Unarmored-Movement/Roving + Boots of Speed
      ×2 (G12) + exhaustion + the heavy-armor STR-requirement −10 ft penalty (G11, vs effective STR). The
      unproficient-armor Disadvantage emits as `AdvantageClause`s (G13) into the combat adv/dis list. The
      PDF Speed + non-walking (fly/swim/climb) sentinels resolve against the effective walking Speed. The
      dead `armorEffects`/`effectiveWalkingSpeed`/`exhaustionSpeedReduction` twins are DELETED (rule 10).
      6 team fixtures byte-identical (the heavy-armor paladin meets plate's STR req — no spurious penalty).
- [x] **S11b — exotic Channel-Divinity save-attack shapes (SHIPPED 2026-06-25).** The Cleric shapes
      deferred from S11, GENERALIZED onto the existing fields (not parallel shapes — golden rule 3). Added
      **`ActionAttack.addMod?: AbilityCode`** + **`addLevel?: true`** (each resolved to a number and folded
      into the dice via `appendAbilityModToDice` — chip "1d8+3" / "2d10+5"; `addLevel` reads the OWNING-class
      `scalingLevel`, B2 lesson), **`mode:"heal-or-damage"`** (emits the SAME total onto both `summary.heal`
      and the save-damage chip — both render on the one card, player picks), and a shared
      **`DiceCount = "PB" | AbilityCode`** generalizing `ActionHeal.diceCount` + adding `ActionAttack.diceCount`
      (ability mod ≥1, via ONE `resolveDiceCount`). Wired: **Divine Spark** (Nd8 + WIS, heal-or-damage),
      **Radiance of the Dawn** (2d10 + Cleric level), **Sear Undead** (WIS-many d8 Radiant, own card so it
      renders). The surface-check + fail-before are pinned in `cleric-channel-divinity.test.ts` + the
      `smart-tracker.test.ts` S11 block. 6 team fixtures byte-identical (none is a Cleric). docs:
      `docs/MECHANICS.md` (Action declarations) + `docs/AUTOMATION_BACKLOG.md` → S11b.
- [x] **S12b — multi-instance spell dice + Stars `diceByLevel` + G24 spell-area recurrence (SHIPPED
      2026-06-25).** The three last S12/G24 spell-data deferrals, each REUSING/GENERALIZING an existing
      shape. (1) **Multi-instance:** `instances` + `instancesPerUpcast` on `SrdSpellData` (Magic Missile 3
      darts +1/slot above 1st; Scorching Ray 3 rays +1/slot above 2nd — PHB 2024) → both surfaces render
      `N × {dice}` via the shared `spellInstanceCount` + `spells.multiInstance` key; the per-instance
      `damageDice` stays intact so a flat rider folds per instance, THEN the UI multiplies (`summary.instances`
      carried separately). (2) **Stars `diceByLevel` (G20/W6):** added `diceByLevel` to the `aura`
      `ranged-attack`/`heal` effect + `damageDieByLevel` to the `form-attack` grant, both resolved via the
      SHARED `pickDiceByLevel` (the private smart-tracker `pickByLevel` was deleted in its favour) — the
      Stars Archer/Chalice die now scales 1d8→2d8 at Druid 10 on the rail aura formula AND the Archer attack
      row. (3) **G24 recurrence:** `recurrence: SpellRecurrence` (`on-enter-or-end-turn` / `bonus-action-move`
      / `action-retrigger`) on `SrdSpellData` → a self-side cadence note on the spell card (a detail tag) +
      the combat gloss (Moonbeam / Spirit Guardians / Flaming Sphere / Call Lightning). LIVE-FIXTURE EFFECT:
      the live Wizard fixture's Magic Missile now reads "3 × 1d4+1" (was "1d4+1") + Flaming Sphere gains a
      bonus-action-move cadence chip — a CORRECTNESS improvement; the `.json` is byte-identical. Regression +
      surface checks: `utils.test.ts`, `spell-card-verdict.test.ts`, `smart-tracker.test.ts`,
      `tracker-view.test.ts`, `form-swap-attacks.test.ts`, `spells-page.test.tsx`. docs: `docs/MECHANICS.md`
      (Spell-data structured facts) + `docs/AUTOMATION_BACKLOG.md` → S12b/G24.
- [x] **S12c — leveled-spell upcast damage scaling (SHIPPED 2026-06-26, defect C).** A leveled DAMAGE
      spell's chosen slot level was DROPPED before its damage was shown, so the combat card + cast modal
      showed the BASE dice at every slot (Fireball read "8d6" whether cast at 3rd or 9th). Extended the S12b
      precedent from instance counts to DICE counts: `damageDicePerUpcast?: string` (a plain `NdM` per-slot
      increment) on `SrdSpellData` + the pure `scaleUpcastDice(spell, castLevel)` helper (`lib/utils`) — base
      count + increment × steps-above-base, same die face, any flat tail (`"10d6+40"`'s `+40`) preserved.
      Backfilled **60 damage spells** (51 SRD + a 9-spell follow-up sweep — Wall of Ice +2d6 plus the
      bundled pack-side damage spells — found still unscaled by an adversarial enumeration of all
      110 leveled damage spells) (each increment + threshold confirmed against the 2024 wikidot
      "Using a Higher-Level Spell Slot" clause on the wiki; corrected Circle of Death's stale `8d6` → RAW
      `8d8`). The cast modal (`CastLevelModal`) now renders a per-slot `.cl-dmg` chip resolving the scaled dice
      (or `N × dice` for ray-count spells) at each slot level — threaded from BOTH cast surfaces (`SpellsTab`,
      `TurnEconomyProvider` via `getSpellById`). Ray-count spells (Scorching Ray / Magic Missile) keep scaling
      their instance COUNT via `instancesPerUpcast` (no `damageDicePerUpcast`). Override-first preserved.
      Regression: `spell-data-integrity.test.ts` (a RAW slot-total table + face-match lock + ray-count guard),
      `utils.test.ts` (the helper), `cast-level-modal-upcast.test.tsx` (the modal reflects the scaled chip);
      fail-before proven. docs: `docs/MECHANICS.md` + `docs/AUTOMATION_BACKLOG.md` (S12c) +
      `docs/AUTOMATION_COVERAGE.md` (the upcast-damage row → automated).

### B. BG3 can/cannot projection UX

- [x] Persistent disabled-state + inline reason on condition-blocked & depleted-pool cards.
- [x] Project condition consequences (`speedZero`/`autoFailSaves`/`breaksConcentration` from
      `condition-effects.ts`) — consumed by MovementSlider / ThisTurnTracker / LeftHud / `combat-action-view`.
- [x] **"What's limiting you this turn" summary near the action meter — SHIPPED** (the `.turn-limiters`
      banner on the Play meter, `composeTurnLimiters`). Emits attack-disadvantage / speed-0 / auto-fail-saves /
      exhaustion, and now **blocked action economy** (`blockedEconomy` from `condition-effects.blockedSlots` —
      "You can't take Action, Bonus, Reaction (Stunned)", 2026-07-06). `breaksConcentration` stays OUT (owned by
      the concentration banner — DRY); depleted pools / already-spent economy stay out (on the coins/cards —
      golden rule 19).
- [x] **In-combat save / check helper — REMOVED (2026-07-21, owner-ratified).** The Play-surface "Saves & Checks"
      panel (`SavesChecksPanel`) was retired: it duplicated the Stats rail's (`LeftHud`) saves + full skill list +
      passive senses byte-for-byte (same `deriveSavesAndChecks` builder, same numbers), and the owner decided the
      left rail stays the single home for saves/skills/senses on all screens. The shared, locale-free
      `deriveSavesAndChecks` builder (`lib/views/saves-checks-view.ts`) STAYS — `LeftHud` is now its sole consumer
      (golden rule 6, the one home of that math). Originally shipped 2026-07-06 (the row math was first lifted out of
      `LeftHud` into the shared builder so both surfaces could consume it); the parity test it guarded is gone with
      the duplication.
- [x] Multi-action count awareness (Action Surge / Haste) — the B6 per-turn extra-action budget.
- [x] **Reaction-awareness list — SATISFIED** by the shipped PlayTab Reactions section (the availability chip +
      reaction coin already show what reactions you have + whether the economy is spent). No duplicate surface was
      built (golden rule 19). Optional future enhancement (NOT built): a near-meter reaction-readiness chip.

### C. BG3 graphical-style adoption (phone-preview gated)

- [ ] ~~Adopt BG3's graphical style within Illuminated Folio.~~ **SUPERSEDED (owner, 2026-07-02)** by
      the **BG3-Grade Identity Evolution Epic** above — the identity itself is now open for
      evolution, not just style adoption within it. Owner review of visual work continues per
      golden rule 15 (screenshot loop) inside the epic.

### D. Correctness + exposure batch

- [x] **Effective-max-HP helper** — `effectiveMaxHp(doc)` (`lib/aggregate-character.ts`) folds `hp-flat`
      (Aid / Tough / Boon-of-Fortitude) + the standing Aid bonus, now adopted by every `hp.max` reader.
- [x] **Additive item ability-score bonuses** — set-score items (floors) AND additive item bonuses
      (Belt of Dwarvenkind +2 CON, the six +2 Ioun stones) reach ALL combat/cast/display/PDF math through
      the one `effectiveAbilityScores(base, floors, itemBonus, itemCaps)` chokepoint. The additive channel
      (`itemAbilityScoreBonus`/`itemAbilityScoreCap`) is fed ONLY by magic-item-sourced `ability-score`
      grants (filtered on `gref.kind` in the evaluator), so creation/level-up-baked feat & class ASIs can
      NEVER double-count; the bonus folds AFTER the floor and clamps to the per-item resulting-score cap.
- [x] Bardic Inspiration PB→CHA — already correct (`bard.ts`, `bardicInspirationUses: "CHA"`).
- [x] Divine Intervention 2014 → 2024.
- [x] 2024 core-trait lists (Druid armor/weapons, metamagic list+count, EK/AT school + 3rd cantrip, Monk/Rogue tools).
- [x] Additive darkvision stacking.
- [x] Epic Boon L19 framing.
- [x] Pack setting-subclass re-baseline (subclasses present + tested; rows re-verified in the matrix regen).
- [x] **S13 effective-Speed render (defect C, shipped 2026-06-24)** — the combat-header Speed vital,
      PDF, and non-walking sentinels now read the override-first EFFECTIVE walking Speed
      (`effectiveWalkingSpeedFt`: Mobile/Fast-Movement/Roving + Boots ×2 + exhaustion + heavy-armor STR
      penalty); unproficient-armor Disadvantage emits as `AdvantageClause`s. Dead `armorEffects` /
      `effectiveWalkingSpeed` / `exhaustionSpeedReduction` twins DELETED (rule 10).
- [x] **G20 — Stars Twinkling Constellations 1d8 → 2d8 at L10 (defect C, shipped 2026-06-25, S12b)** —
      the Starry-Form Archer/Chalice die was stuck at 1d8 at every level (matrix "Stars Twinkling (wrong)"
      cell). Added `diceByLevel` to the `aura` `ranged-attack`/`heal` effect + `damageDieByLevel` to the
      `form-attack` grant, resolved via the SHARED `pickDiceByLevel`; the die now scales 1d8→2d8 at Druid
      10 on both the rail aura formula and the Archer attack row. The private smart-tracker `pickByLevel`
      was DELETED in favour of the shared helper (rule 10). No team fixture is a Circle-of-Stars Druid.
- [x] **GR7 `advantage-on`/`disadvantage-on` `vs` id-slug normalization (shipped 2026-06-24)** — the
      `vs` field across `src/data/**` held ENGLISH display strings (66 literals — "Death Saving Throws",
      "Charmed", "Dexterity (Stealth) checks", …), a GR7 leak by construction (a display-shaped string
      in code). They never reached the screen — the rail renders the clause's localized SRD-catalogue
      `description` (gated by `rollType`/`mode`, never by `vs`; `hasInitiativeAdvantage` gates on
      `rollType`), so EN display + IT were ALREADY correct and no live leak existed. Normalized every `vs`
      to a stable id-slug (`death-saving-throws`, `charmed`, `stealth`, ability codes `str/int/wis/cha`,
      …; conditions reuse the existing condition ids, mirroring `condition-effects.ts`). EN display is
      byte-identical (the `description` i18n key is positional, NOT `vs`-derived, so it's untouched); IT
      stays the proper translation. New `advantage-vs-slug.guard.test.ts` locks every data `vs` to
      `^[a-z0-9-]+$` so a future English literal fails CI; the species advantage render-parity test pins
      EN-contains-"Charmed" + IT-contains-"Affascinato" + IT≠EN. 6 team fixtures byte-identical.

> **Audit backlog CLOSED (2026-06-25): B1–B8 + S11/S12/S13 + the full G/W series + BUG-6 — 21 merges**
> (`cc377f99`…`20a5492c` on `main`). The multi-week wiki-vs-implementation audit landed every confirmed
> correctness bug (B1 Rage 100-round cap, B2 owning-class tracker scaling, B3 Pact/normal slot keying,
> B4/B7/B8 the effective-scores family, B5 HP-breakdown-by-construction, B6 class-scoped spell DC), the
> Tier-3 primitives (S11/S11b save-based actions, S12/S12b structured + multi-instance + recurrence dice,
> S13 effective-Speed render), and the G/W per-feature series (G1–G25 / W2–W11; BUG-6 metamagic). The
> docs are reconciled to current `main` (this file + `docs/AUTOMATION_BACKLOG.md` + the regrounded
> `docs/AUTOMATION_COVERAGE.md` matrix). The area-spell 2014→2024 prose-corpus sweep (S12/G24 spillover)
> is now **SHIPPED/CLOSED** (`92bacd64`: 8 recurrence-clause spells fixed, 9 verified-left; see
> `docs/AUTOMATION_BACKLOG.md` "Catalogue-wide 2014→2024 area-spell prose audit — SHIPPED"). The half-caster
> multiclass rounding (`multiclass-slots.ts:91`) is now RESOLVED — VERIFIED correct per 2024 RAW
> (no change; see §D / `docs/AUTOMATION_BACKLOG.md`). (W8 cantrip-concentration flags and W9 Dueling
> one-handed scope are now FIXED, and W11 `chargesFormula` owning-class is VERIFIED — all shipped formulas
> character-wide, guard added — see §D below.)

**Confirmed shipped defects (2026-06-24/25 audit — fix + regression test, traces in `docs/AUTOMATION_BACKLOG.md`
→ "Confirmed correctness bugs"):**

- [x] **B1 (CRITICAL — a live user's Barbarian)** — Rage auto-ends at round 10 instead of 100
      (`barbarian.ts:175 maxRounds:10`). FIXED: `maxRounds:100` (10 min ×10 rounds/min) + the comment + every "Rage = 10 rounds" doc-comment across the engine; the pinned `character-store` /
      `turn-round-engine` tests now assert the 100-round cap (countdown 99→1, auto-drop on round 100).
- [x] **B2 (CRITICAL — multiclass shipped defect)** — tracker level-scaling used TOTAL level not
      owning-class level (4 seams: action card OWN tracker / action card CROSS-REFERENCED `costTracker`
      pool / `resolveTrackerTotal` / short-rest). FIXED: all four seams route through the ONE shared
      owning-class-level resolver `featureScalingLevel` (a class feature scales on its owning-class level,
      a feat/race tracker on total), threaded into a new optional
      `resolveTrackerTotal(formula, character, scalingLevel?)` param + the existing
      `resolveTrackerSpec(spec, level)`; the cross-ref seam feeds it the cross-referenced feature's id; the
      rail's inline `classEntryLevel` branch is deleted (rule 10). Table-driven regression
      (`tracker-owning-class-level.test.ts`): Druid 5/Cleric 3 → 2 Wild Shapes on BOTH action card + rail;
      Monk 5/Rogue 3 Focus → 5 AND its Flurry-of-Blows card's cross-referenced Focus pool → 5 (agrees with
      the rail, not 8); Paladin 5/Sorc 3 Lay On Hands → 25; Bard 4/Cleric 2 Bardic does NOT
      short-rest-recover; a feat tracker still bumps on total level; single-class unchanged. Verified
      byte-identical across all 6 single-class team fixtures.
- [x] **B3 (CRITICAL — multiclass shipped defect, Sorlock)** — Pact Magic + shared slots at the same
      level shared ONE usage counter (`session.spellSlots` keyed by level alone), so a Sorlock spending a
      shared L1 slot drained the Pact L1 cell and `paymentAffordable`/`buildCastOptions` summed BOTH pools'
      totals against the single counter → OVER-SPEND across pools. FIXED: one pure `slotUsageKey(slot)`
      helper (`pact-<level>` for a pact slot, `String(level)` for a normal/shared slot — so a legacy
      level-keyed doc resolves the normal pool UNCHANGED, no migration); EVERY `session.spellSlots`
      read + write routes through it — the store `useSpellSlot`/`restoreSpellSlot` (now `(level, pactMagic)`),
      `buildCastOptions`, `paymentAffordable`, the rail + Spells-page + PlayTab slot displays
      (`SlotSummaryVM` gains `pactMagic`, distinct React keys + "P" badge), Font-of-Magic conversions,
      Arcane Recovery, the spell-slot→tracker recovery, and the short rest (now restores ONLY `pact-*`,
      never wiping the normal pool). A bare level-only cast site (reaction / feature commit) resolves its
      pool via `bareSlotIsPact` (normal if one exists, else pact for a pure Warlock). Arcane Recovery's
      `!pactMagic` filter stays (RAW: pact slots aren't Wizard slots) but is no longer load-bearing for the
      collision. Regression `pact-slot-key.test.ts` (Sorc 3 / Warlock 2: spending a shared L1 leaves Pact L1
      at 2; no cross-pool over-spend; legacy `"1"` resolves the normal pool; short rest restores only pact).
      Verified byte-identical across all 6 single-class team fixtures.
- [x] **B4 + B7 (HIGH→LOW — effective-scores family)** — the INVENTORY weapon-row builder + carrying-
      capacity readout computed to-hit / damage / finesse-stat / capacity from RAW `character.abilityScores`,
      while the COMBAT path reads `effectiveAbilityScores` (post-`set-ability-score` grant — Gauntlets of
      Ogre Power → STR 19, Belt of Giant Strength) — so the same weapon showed two different to-hits and
      capacity used raw STR (B4). The SAME class of bug sat in the FORM-attack rows (Wild Shape beast bite /
      Starry Form / Armorer): `resolveActions` passed `charData.abilityScores` (raw) to `resolveFormAttacks`
      while every sibling row passed `ctx.abilityScores` (effective) (B7). FIXED at the ONE shared seam each
      (rule 6): `buildInventoryViewModel` computes `effectiveScores` once via the canonical
      `aggregateCharacterGrants` (`resolveAllGrantSources` — it sees EQUIPPED items) + `effectiveAbilityScores`,
      threads it into `buildWeaponVM` (the 3 raw reads DELETED) and `carryingCapacity`; the B7 caller switches
      its single argument `charData.abilityScores` → `ctx.abilityScores`, matching its siblings exactly.
      Regressions: `inventory-view.test.ts` (Gauntlets → inventory quarterstaff to-hit EQUALS the combat
      to-hit = +8, NOT raw +3; rises by +5; capacity 19×15=285 not 8×15=120; behaviour-preserving with no
      item) + `form-swap-attacks.test.ts` (Gauntlets Moon-druid beast bite +7 not +3). Fail-before proven
      (3→8, +0→5, 120→285, 3→7); behaviour-preserving for the 6 single-class team fixtures (none carries a
      set-ability-score item — `git status content-pack/fixtures/team/` clean).
- [x] **B8 (MODERATE — effective-scores family, cluster close)** — the adversarial follow-up to B4/B7 found
      the SAME defect in four ADDITIVE ability-keyed layers still reading RAW `abilityScores` while their
      sibling base mod uses EFFECTIVE (RAW 2024: a derived bonus scales with the CURRENT score, so a magic
      item raising the keyed ability raises the bonus). FIXED at each call site by passing the SAME effective
      map the base mod already uses (rule 6; the producing functions were already correct): **(1) the
      save-bonus ability layer** — `resolveSaveBonus` (Aura of Protection +CHA, Increased Toughness +WIS) +
      `resolveConcentrationSaveBonus` (Bladesong Focus +INT) fed RAW at all three callers (`characterStore`
      concentration toast, the hand-summed `saveBonusFlat` Aura reduce in `LeftHud` + `character-pdf-view`);
      the raw `charData.abilityScores[b.ability]` reads DELETED, the conformance harness `sheet-dump` now uses
      the full effective channels; **(2) companion AC owner-mod** — `resolveCompanion` at `FeaturesTab` (Steel
      Defender / Eldritch Cannon AC = base + owner INT) fed effective (the companion's OWN fixed scores stay
      RAW by design); **(3) short-rest heal CON preview** — `RestModal` matched the real heal engine's
      effective CON (Amulet of Health); **(4) aura effect-line dice** — `ResourceRail` `auraEffectLine` →
      `resolveAuraDice` (CHA/WIS-keyed aura dice). NO site left raw-by-design; the three excluded sites
      (`feat-prereq` base-score prereqs, the companion-OWN stat block, the transient pre-persist inventory AC)
      stay RAW correctly. Regression: a store-level fail-before (`character-store.test.ts` B8 — Bladesinger +
      Headband, concentration toast `saveBonus` delta 0→4) + per-cluster RAW-vs-EFFECTIVE pins in
      `ability-score-set.test.ts`. Verified byte-identical across all 6 team fixtures (none carries a
      save/companion-keyed boosting item — `git status content-pack/fixtures/team/` clean).
- [x] **B6 (MODERATE — FIXED 2026-06-24)** — class-scoped spell-DC/attack bump hit the wrong spells when
      two casters SHARE an ability. The per-spell DC/attack recompute gated on ability ONLY
      (`diverges = refAbility !== casterAbility`), so a Bard 6 / Sorcerer 3 (both CHA) with Innate Sorcery
      active (`scope:"sorcerer"` +1 DC) dropped the +1 on a Sorcerer-owned spell (`refAbility === casterAbility`
      → no recompute → primary-bard-scoped precomputed DC), and the mirror OVER-counted (a primary Sorcerer's
      Bard-owned spell inherited the +1). Same drop for Rod of the Pact Keeper (`scope:"warlock"`). FIXED at
      the ONE gate in BOTH per-spell seams — `lib/views/spells-view.ts` (the Spells tab + PDF + familiar reuse
      it) AND `lib/smart-tracker.ts` (the combat/action path): the recompute now fires when ability OR owning
      CLASS diverges from the primary, feeding `resolveCastingModifier(entries, owningClassId)` (already wired)
      and the owning ability's effective score (`refAbility ?? casterAbility`, null-guarded). The
      `overrideAbility` VM field KEPT its ability-only meaning (the SpellCard "ability differs" hint reads it);
      only the recompute condition widened. The compendium familiar "Your Save DC" line correctly stays on the
      primary headline (not a per-spell value). Regressions in `spells-view.test.ts` (Rod/warlock, always-on) + `smart-tracker.test.ts` (Innate Sorcery/sorcerer while-active + the mirror no-over-count + a Rod
      analog) — all fail-before/pass-after proven. 6 team fixtures byte-identical (all single-class →
      `owningClassId === classId`, no behavior change).
  - [x] **B6 follow-up — thread `session.activeFeatures` into the spells-view aggregate (FIXED 2026-06-25).**
        `buildSpellsViewModel` called `evaluateGrants(resolveAllGrantSources(character))` WITHOUT the active-feature + bundle-choice context the combat path passes, so the Spells-tab DC/attack reflected NO `while-active`
        casting bump (Innate Sorcery's `scope:"sorcerer"` +1 DC, Robe-of-the-Archmagi-while-active) — a
        cross-surface divergence vs combat (rule 6). FIXED by mirroring the combat `evaluateGrants(...)` call
        EXACTLY (`new Set(session.activeFeatures ?? [])` + `new Map(Object.entries(session.grantBundleChoices ?? {}))`;
        `session` already in scope). The Spells-tab per-card DC now EQUALS the combat-tab `summary.saveDC` for a
        while-active class-scoped bump by construction. Override-first preserved. Regression in `spells-view.test.ts`
        (pure Sorcerer 3 + Acid Splash: Innate Sorcery ACTIVE → DC 15, INACTIVE → 14, AND card DC == combat DC both
        ways) — fail-before proven (pre-fix the ACTIVE card stayed 14). 6 team fixtures byte-identical (no Sorcerer /
        while-active casting bump among them).
  - [x] **B5 — max-HP breakdown tip off by +5 (FIXED 2026-06-24).** `evaluateGrants` now accumulates an
        ATTRIBUTED `hpFlatParts` at the SAME seam `hpFlat` does (inheriting the while-active descent); the
        breakdown maps that list so `breakdownTotal === effectiveMaxHp` by construction. Shipped WITH the dead
        `session.hp.aidBonus` deletion (field + `+aid` term + all codec/sanitize/cache plumbing removed; a
        one-way read-normalization drops a legacy `aidBonus` at the input boundary so it can't double-count
        with the Aid toggle). Regression in `crit-range-hp-flat.test.ts` (fail-before proven: breakdown summed
        to `effectiveMaxHp − 5` + no Aid row). 6 team fixtures byte-identical (`git status content-pack/fixtures/team/` clean).
- [x] **S11 save-attack exposure (G1 / G14-DC / G15-DC — FIXED 2026-06-24)** — a feature/trait action's
      damage dice + type + save DC lived ONLY in i18n prose (golden-rule-5 leak). `SrdActionDef` gained
      `attack?: ActionAttack` (the damage half) EXTENDING the existing `saveAbility`/`saveDcAbility` save
      pair (REUSED); the shared `applySaveAttackSummary` resolves dice at the action's owning-class/character
      scaling level onto `summary.damage`/`damageType`(`/damageTypes`), DC through the one `featureSaveDc`,
      so the existing chip + facts recipe renders "2d10 Fire · DC N DEX" with no view/i18n change.
      Closed: Dragonborn Breath Weapon (G1), Cleric Divine Spark + (Light) Radiance of the Dawn, Lupin Howl
      (G15-DC). Sear Undead, the +mod/+level additives, and the heal-or-damage toggle deferred to S11b;
      Necrotic Shroud's multi-form DC (G14) is now CLOSED below (2026-06-25). Regression:
      `smart-tracker.test.ts` S11 block (per-feature, ≥2 levels, fail-before proven). 6 team fixtures
      byte-identical (`git status content-pack/fixtures/team/` clean).
- [x] **Pack-species Celestial Revelation payloads (G14 / G18 / S11b — FIXED 2026-06-25)** — the signature
      combat payloads were missing (only the L3 tracker + bonus action + Wings fly-speed were modeled).
      **G14:** the 3 Revelation forms are now a `choice-grant-bundle` (its species-keyed bundle,
      re-selectable each Long Rest); each form contributes its once-per-turn flat **+PB** extra-damage rider
      — `damage-rider` GENERALIZED with `amount:"PB"` (no `dice`) + `appliesTo:"attack-or-spell"` (Radiant
      for Heavenly Wings / Inner Radiance, Necrotic for Necrotic Shroud, per RAW), a self-side reminder not
      folded into a weapon row. Heavenly Wings keeps `fly-speed:equal-to-walking`. **G18:** Healing Hands'
      PB×d4 heal — `ActionHeal` gained `diceCount:"PB"` + `dieFace`, multiplied to a concrete "3d4" at
      emission (resolved in BOTH the SRD-feature AND race-trait action loops — the race loop previously
      dropped `action.heal`); roll-entry/display only (golden rule 21). **S11b:** Necrotic Shroud's CHA save
      (DC 8 + CHA + PB → Frightened) is a `free` sub-action gated by the new
      `SrdActionDef.requiresBundleOption` — it surfaces ONLY when Necrotic Shroud is the active form (the
      other two forces force no save). Regression: `species-condition-advantages.test.ts` (G14 forms) +
      `s10-data-wiring.table.test.ts` Family F (G18 heal + S11b save), fail-before proven for each. docs:
      MECHANICS.md (rider `amount:"PB"`/`appliesTo:"attack-or-spell"` + ActionHeal `diceCount` +
      `requiresBundleOption`). 6 team fixtures byte-identical (`git status content-pack/fixtures/team/` clean).
- [x] **G25 — damage riders ride the Unarmed-Strike row (Zealot Divine Fury — FIXED 2026-06-25).** The
      rider-resolution block lived inline in the carried-weapon loop only; the `unarmed-strike-die` row built
      its summary with NO rider attachment, so a "weapon OR an Unarmed Strike" rider (RAW Divine Fury) never
      reached the Monk/Bard Unarmed Strike. FIXED by factoring it into ONE pure helper
      `resolveAttackDamageRiders(damageRiders, target, character, scores)` fed by BOTH the carried-weapon loop
      AND the unarmed-strike-die row — so an applicable rider rides Unarmed Strike BY CONSTRUCTION (rule 6).
      Scope-respecting: `"melee-weapon"` (weapon OR Unarmed Strike) rides both; `"weapon"` rides weapons only
      (an Unarmed Strike is not a weapon); `"attack-or-spell"` rides neither. Data fix: Divine Fury's
      `appliesTo` `"weapon"` → `"melee-weapon"` (RAW barbarian:path-of-the-zealot — "a weapon OR an Unarmed
      Strike"). Regression `zealot-divine-fury-unarmed.test.ts` (Barbarian-Zealot/Monk raging → the rider on
      the carried Spear AND Unarmed Strike; rage-off → neither; the pure-helper scope matrix), fail-before
      proven for both the engine attachment and the data scope. 6 team fixtures byte-identical.
- [x] **inventory-monk-DEX — the inventory weapon stat ignored the Monk Martial-Arts swap (B4-family — FIXED
      2026-06-25).** The inventory weapon-row called `resolveWeaponStat` (finesse STR-vs-DEX only) but NOT the
      2024 Monk MONK-MELEE stat swap (`weaponScope:"monk-melee"` → DEX for Monk weapons) the COMBAT path
      applies — so a Monk's inventory weapon showed a STR to-hit while combat showed DEX (rule-6 divergence;
      the inventory comment FALSELY claimed it "can never disagree with the Play card"). FIXED by unifying the
      attack-stat math at ONE authority `resolveWeaponAttackStat({weaponType, properties, scores,
weaponAttackAbilities, isMonkMelee})` (`compute.ts`, REPLACING `resolveWeaponStat`) — finesse (by
      MODIFIER, ties→DEX, closing a second latent score-vs-modifier divergence) + the monk-melee swap — fed by
      the combat carried-weapon loop, manifested weapons, AND the inventory row, identical by construction; the
      false comment corrected. Regression `monk-weapon-dex.test.ts` (the live Monk fixture's inventory Spear to-hit EQUALS
      combat = +5 DEX, damage mod +3) + migrated/extended `compute.test.ts` (monk-melee on/off, finesse
      modifier-tie); fail-before proven (inventory Spear +1 STR → +5 DEX). The LIVE Monk fixture's Spear: inventory
      to-hit **+1** (STR −1 + PB 2) → **+5** (DEX +3 + PB 2), now AGREEING with combat (already +5) — a
      correctness fix; the Dagger (finesse, already DEX) unchanged. `.json` byte-identical; the conformance
      dump reads the combat path (already +5) so NO dump update.
- [x] **Three per-feature mechanic additions (G19 / G21 / G23 — FIXED 2026-06-25).** Each fills a declared
      action a feature was missing, reusing the existing action shape and adding the LEAST: **G21 Sentinel** —
      a `reaction` action row (the Guardian Opportunity Attack) mirroring the sibling reaction-feats
      (PAM / Shield Master / Protection); a named card (`sentinel.mechanics.actions.0` en+it = Guardian) +
      a tight new `FEATURE_TRIGGER_PATTERN` ("target other than you") renders the bilingual trigger; Halt's
      Speed-0 stays prose. **G23 Fighter Tactical Mind** — a new `SrdActionDef.checkBonus:{dice,refundOnFail}`
      field on a `free` action on `fighter-tactical-mind` (L2 gate), `costTracker:"fighter-second-wind"`;
      resolves onto `summary.checkBonus` → the PlayTab gloss/accordion "+1d10 to a failed check (refunded if
      it still fails)" (en+it); Tactical Shift stays narrative. **G19 Paladin Lay On Hands** — a new
      `SrdActionDef.cureConditions` field (id-keyed, `fromLevel`-gated): base 5-HP cure-**Poisoned** + L14
      Restoring Touch's six extra conditions (5 HP each), resolved onto `summary.cureOptions` and localized
      via `conditionLabel` + `combat.cureConditions` (en+it). The later variable-pool execution milestone
      routes those choices through `CombatResolutionSpec`, combining healing + cures into one exact debit. All
      three pinned in `s10-data-wiring.table.test.ts` Family G (cheapest engine-fact pin, golden rule 13),
      fail-before proven for each. The LIVE Paladin fixture (Oath of Vengeance L3): Lay on Hands now
      exposes `[{poisoned, 5 HP}]` (Restoring Touch correctly gated out at L3). 6 team fixtures byte-identical;
      the conformance dump is round-trip-stable (reads `cureOptions`, no golden file) — NO dump update.
- [x] **S12 spell-dice prose-regex deletion (G2 / G3 / G5 / W2 / W7 — FIXED 2026-06-24)** — spell damage/heal
      dice lived in TWO disagreeing places: structured `damageDice`/`healDice` (the cards) vs an English-prose
      regex (`extractDamageDice` + the heal regex, the combat tab) — a golden-rules-5/7 leak. Populated the
      structured fields on all 126 dice spells + every healer (generated from the regex's own output as the
      ORACLE, SRD-spot-checked), DELETED both regexes, and routed the combat tab to the SAME field; cantrips
      scale via the pure `scaleCantripDice`. One source, identical output by construction. Regressions:
      `spell-damage-bonus-consumer.test.ts` oracle-equality block (Fireball 8d6, Fire Bolt 1d10→3d10→4d10,
      Guiding Bolt 4d6, Cure Wounds 2d8(+mod), flat Heal 70 — fail-before proven by breaking the structured
      read), `spell-card-verdict.test.ts` (the card side), `utils.test.ts` `scaleCantripDice`, +
      `spell-data-integrity` locks (every damage-facet spell has dice; every heal verdict has an amount).
      6 team fixtures byte-identical (`git status content-pack/fixtures/team/` clean).
- [x] **G8 / G9 / G10 combat-feat + Monk-die batch (FIXED 2026-06-24)** — three independent combat mechanics,
      each its own clean grant extension. **G8 (GWM Heavy Weapon Mastery):** the 2024 **+PB damage on a Heavy
      weapon** (NOT the old −5/+10) — `weapon-damage-bonus` gained `scope:"heavy"` + an `amount:"PB"` sentinel
      (`resolveWeaponDamageBonuses` resolves "PB"→PB, honoring `proficiencyBonusOverride`), attached to
      `great-weapon-master`; folds into the Heavy weapon's damage formula on BOTH the combat row + inventory
      card, override-first. **G9 (Heavy Armor Master):** new `flat-damage-reduction` grant kind (a FLAT
      subtraction vs `damage-resistance`'s HALVING) — `{damageTypes, amount:number|"PB", condition?:"wearing-heavy-armor"}`,
      surfaced as a SELF-SIDE informational defenses LINE in the right rail (`deriveFlatDamageReductions`
      resolves "PB" + gates on Heavy armor being worn; the engine subtracts nothing from a modeled foe — golden
      rule 21); REUSABLE (not HAM-hardcoded). **G10 (Monk Martial-Arts die):** the MA die REPLACES a Monk
      weapon's printed die when larger (Shortsword 1d6→1d8 at L5; a 1d4 Monk weapon→1d6 even at L1) — a
      `dieUpgrade` field on the existing `weapon-attack-ability` grant + a shared pure `effectiveWeaponDie`
      (`max(weaponDie, martialArtsDie)`, resolved at the Monk's OWN level, mirroring `effectiveUnarmedStrike`)
      consumed in BOTH weapon resolvers. EN+IT for the new "Riduzione del Danno" / `flatDamageReduction` tokens
      (i18n cascade, IT SRD 5.2.1). Docs: 2 new grant kinds in `docs/MECHANICS.md`; G8/G9/G10 ticked in
      `docs/AUTOMATION_BACKLOG.md`. Regressions (fail-before proven): G8 in `barbarian-rage.test.ts` (Greatsword
      +PB, Handaxe not), G9 in `sheet-view.test.ts` (line ONLY in Heavy armor + PB resolved) + a feat-data pin
      in `feats-prose-sweep.table.test.ts`, G10 in `monk-weapon-dex.test.ts` (Dagger 1d4→1d6, Shortsword
      1d6@L4→1d8@L5, non-Monk weapon unchanged). **The live Monk fixture: its carried Dagger now correctly
      displays 1d6 (MA die beats 1d4 at Monk L3) — a RAW-correct change; the `.json` stays byte-identical and the
      gitignored conformance dump regenerates to 1d6.** All 6 team fixtures byte-identical; none carries GWM or
      Heavy Armor Master, so G8/G9 leave them unchanged.
- [x] **W8 — cantrip `concentration` flags VERIFIED vs the 2024 SRD: ZERO mismatches — FIXED 2026-06-25.**
      Enumerated all 34 level-0 spells (`src/data/spells/cantrips.ts`) and checked each stored `concentration`
      flag against its 2024 wikidot Duration ("starts with 'Concentration'?"). Data was already correct: exactly
      5 cantrips are concentration (blade-ward, dancing-lights, friends, **guidance, resistance** — the latter
      two are NOT 2024 reactions as suspected, they have "Concentration, up to 1 minute" duration); the other 29
      (Fire Bolt / Sacred Flame / Eldritch Blast / Toll the Dead / Mind Sliver / …) are correctly `false`. No
      flag changed, no fixture/dump impact (6 team fixtures byte-identical). Locked by a NEW exhaustive
      `spell-data-integrity` guard pinning the full 34-cantrip table + an exhaustiveness check, so a future
      cantrip can't ship an unverified flag (fail-before proven).
- [x] **Wrong-impl data fixes — Dueling rider on two-handed (W9) FIXED 2026-06-25.** RAW (`feat:dueling`):
      "a Melee weapon in one hand and no other weapons → +2 damage." The +2 rider was scoped `"melee-weapon"`
      so it rode any melee weapon (incl. a Two-Handed Greatsword + a Versatile weapon's two-handed stance). New
      `damage-rider` scope `"one-handed-melee"` gates it to a melee weapon that is NOT Ranged and NOT a
      Two-Handed-PROPERTY weapon (a Versatile weapon's one-handed grip qualifies) and never an Unarmed Strike;
      the "no other weapons"/Shield clause stays informational (engine can't see the live wielded set —
      override-first). Scope-matrix tests pin qualifying vs non-qualifying; 6 team fixtures byte-identical. The
      half-caster multiclass rounding is now VERIFIED correct per 2024 RAW (EN wikidot/PHB "round up" + IT SRD
      5.2.1 "arrotondati per eccesso"); `Math.ceil(level/2)` is right, no change — 2024 reversed the 2014
      round-down. Pinned by `tests/unit/multiclass-slots.test.ts`.
- [x] **W11 — `chargesFormula` owning-class resolution VERIFIED vs the 2024 SRD: all shipped formulas are
      character-wide — VERIFIED 2026-06-25 (Outcome A, no data/behaviour change).** `resolveChargesFormula`
      passes no `scalingLevel`, so a `"level"` term in a free-cast `chargesFormula` would resolve on the TOTAL
      character level (the B2 lesson). Enumerated EVERY shipped formula (5 sites, 3 distinct values) and
      confirmed each scales on a character-WIDE value — never a class-specific level, and none even uses a
      `"level"` token: `greater-mark-of-healing` Cure Wounds = `"PB"`, `forest-gnome` Speak with Animals =
      `"PB"`, `druid-stars-star-map` Guiding Bolt = `"WIS"`, `ranger-fey-wanderer-misty-wanderer` Misty Step =
      `"WIS"`, `artificer-cartographer-mapping-magic` Faerie Fire = `"INT"` (RAW-confirmed via
      `dnd2024.wikidot.com` — "Proficiency Bonus" / "Wisdom modifier" / "Intelligence modifier" per Long Rest).
      The data + total-level resolution are CORRECT; the latent code note holds and stays. Added a GUARD
      (`tracker-owning-class-level.test.ts` → "W11 …") pinning the set (PB×2/WIS×2/INT×1) + an exhaustiveness
      check that NO shipped `chargesFormula` references a `"level"` token — so a future MULTICLASS class-level
      charge formula can't silently ship resolving on total level (it would trip the guard, forcing the B2 fix).
      6 team fixtures byte-identical.
- [x] **D-cleanup cluster (rule-10 dead-code + B3 spillovers) — FIXED 2026-06-24.** Five independent
      cleanups in one commit: **(W10)** removed hardcoded subclass feature ids from the BASE `levels[]` tables
      of bard (Lore), druid (Circle of the Land) AND paladin (Oath of Devotion — caught by the new guard), with
      `base-levels-no-subclass.guard.test.ts` locking the seam for all 13 classes (inert — the apply path
      re-filters by chosen subclass; no behavior change). **(initiativeBonus)** deleted the dead
      `initiativeBonus(dexScore)` FUNCTION (no non-test caller; would bypass effective-scores) AND the legacy
      `CharacterData.initiativeBonus` FIELD (no writer; superseded by `initiativeBonusOverride`), keeping the
      two sanctioned bounded ONE-WAY read-normalizations (sanitize + cache-rehydrate, both on untyped records,
      never re-emitting). **(dev-scenarios)** routed the seeded `sessionSlots` key through `slotUsageKey`.
      **(ResourceRail)** keyed the combat pending-spend PREVIEW by `slotUsageKey` so a Sorlock's same-level
      normal+pact rows no longer both light a pending dot. **(chargesFormula)** a latent code comment + W11
      backlog line that it should resolve on the OWNING-class level if a multiclass magic-item charge formula
      ever references class level (no shipped item triggers it). All 6 team fixtures byte-identical.
- [x] **G7/W4 — Background ASI constrained to the 3 eligible abilities (FIXED 2026-06-24).** The
      creation +2/+1 (or +1/+1/+1) was placeable in ANY of the six abilities; each 2024 background lists
      exactly THREE (Acolyte = INT/WIS/CHA, Soldier = STR/DEX/CON…) → an invalid state was reachable
      (golden-rule-20 violation). Added `abilityOptions: readonly AbilityCode[]` to `SrdBackgroundData`
      and populated all 61 rows from the "Ability Scores:" line on `dnd2024.wikidot.com/background:<id>`
      (16 SRD rows cross-checked against the official 2024 PHB). `BgAsiPicker` disables every tile ∉ the
      selected background's `abilityOptions` (one-line predicate, reusing the existing tile disabled
      state); switching the background clears `bgAsiChoices` so a stale ineligible pick can't linger.
      Regressions: data-integrity (every background has exactly 3 distinct valid `AbilityCode`s + the 16
      SRD vs official PHB, in `background-feat-options.test.ts`) + a render pin (`bg-asi-picker-eligibility.test.tsx`:
      ineligible tiles disabled, eligible enabled) — fail-before proven. The picker is mounted ONLY at
      `/characters/new` and always starts empty: an EXISTING character is never re-run through it (its
      stored ASI is baked into `abilityScores` + kept as an inert codec round-trip record), so the new
      constraint touches NEW picks only. **Two LIVE party sheets predate the constraint and store an
      off-list increase — they load/view/save with it intact, untouched: the live Wizard fixture (Sage → eligible
      CON/INT/WIS, stores INT+DEX) and the live Paladin fixture (Wayfarer → eligible DEX/WIS/CHA, stores
      STR+CHA).** A grandfather-aware guard in `team-fixtures-legal.test.ts` pins every fixture's stored
      ASI ⊆ its background's eligible abilities, with those two off-list picks named in an explicit
      allow-list so the exception can't silently grow. 6 team fixtures byte-identical
      (`git status content-pack/fixtures/team/` clean).
- [x] **BUG-6 + G6/W3 — Metamagic correctness (FIXED 2026-06-24).** Two cast-modal fixes off the same
      predicate. **BUG-6 (one option per cast):** the modal SP-debited Quickened + Distant + Subtle all at
      once; RAW (`dnd2024.wikidot.com/sorcerer:metamagic`) allows ONE primary plus the two options whose text
      grants the explicit exception — **Empowered + Seeking** ("you can use … even if you've already used a
      different Metamagic option"). Added `stacksWithPrimary?: boolean` (TRUE on those two only) to
      `SrdMetamagicOption`; the pure shared reducer `toggleMetamagicSelection` (`lib/cast-options.ts`) makes a
      primary swap in as the SOLE primary (drops any other primary, keeps the stackers), Empowered/Seeking add
      on top; SP = sum of selected. **G6/W3 (cantrips):** dropped the blanket `if (spell.level === 0) return []`
      in `resolveMetamagicForCast`; the per-option `appliesWhen` now decides for cantrips too, gated by new
      structured facts `requiresDamage` (Empowered/Transmuted), `requiresAttack` (Seeking), `excludesCantrip`
      (Extended/Twinned). So Fire Bolt offers Empowered/Quickened/Distant/Seeking/Transmuted, Sacred Flame
      offers Heightened/Careful. The slotless cantrip cast (`SpellsTab.castCantrip` via a new `kind:"cantrip"`
      option + a footer Cast button in `CastLevelModal`) debits the Metamagic SP, spends NO slot, and undoes
      symmetrically. EN+IT: `metamagic.onePrimaryRule` / `metamagic.swapsPrimary` / `combat.cantripCastToast`.
      Regressions (fail-before proven): `cast-options.test.ts` (stacker flagging, per-option cantrip
      applicability, the `toggleMetamagicSelection` swap + SP-sum), `spell-cast-sources.test.ts` (Fire Bolt /
      Sacred Flame cantrip options), `spells-page.test.tsx` (cantrip + Quickened debits SP, no slot, undoes).
      6 team fixtures byte-identical — none is a Sorcerer (`git status content-pack/fixtures/team/` clean).

- [x] **Live-team resource lifecycle + rest-state reconciliation (2026-08-04)** — the six composed
      fixtures now form an executable resource contract: every paid action must resolve its tracker;
      Focus, Bardic Inspiration, Musician, Lucky, Lay on Hands, Channel Divinity, Portent, Rage and the
      Healer's Kit are pinned through spend/recovery/manual/recorded-roll lifecycles. The audit found and
      fixed a real state split: rests recovered Rage uses but could leave Rage (or another temporary
      state) active. Rest completion now expires declared lifetimes generically, clears their timer /
      boundary / cast-level provenance, preserves unknown homebrew toggles, and runs Long-Rest
      Concentration through the canonical teardown so self-Polymorph cannot survive sleep.
- [x] **Rolled feature-effect closure (2026-08-04)** — the last two recorded dice-entry omissions now
      use the existing resolver rather than descriptive prose: Open Hand Wholeness of Body applies the
      reviewed Martial Arts die + WIS heal to self, and Undead Form of Dread applies reviewed 1d10 plus
      Warlock level Temporary HP, clears Frightened and arms its exact one-minute/ten-round lifetime
      with early Incapacitated expiry.
      Targeting, resource spend, max-wins Temp HP, log and undo remain the shared transaction.

## Deferred / owner-gated

- **DM toolkit** (constitution §2.9 — optional, complements Owlbear/the in-person table, no battle
  map). **SHIPPED:** the **unified Party section** (`src/features/campaigns/Party.tsx` +
  `party-encounter.tsx`) — ONE in-hub surface, NO overlay/portal (the former full-screen
  `EncounterOverlay` + `PartyDashboard` were deleted, their rendering lifted inline). At rest it is the
  party **overview**: for the DM, each attached member is a LIVE card (AC · HP · passive Perception ·
  saves · senses · speed · conditions, computed from each member's real character doc via the
  `dmReaders` ACL + `getFullCharacter` + `party-stats.ts` over `compute`/`sheet-view`; single source of
  truth, no denormalized copies; progressive disclosure — at-a-glance → expand for saves/passives/senses
  → "Open sheet" reuses `MemberSheetView`); for a player, the denormalized snapshot roster (rules deny
  reading another member's live doc). With a running encounter the SAME section becomes the **inline
  initiative tracker** ("Run encounter" promotes the party: `campaign.encounter` additive state + pure
  reducers `src/features/campaigns/encounter.ts`, DM-typed initiative — NO dice, per-token monster HP,
  HP/conditions clamped, round + turn pointer; persisted DM-only via `firestore.rules`
  `encounterUnchanged()`). The DM gets the full editable tracker; a **player gets the SAME read-only
  live view** (order · AC · current/max HP · conditions · whose turn) — a shared-table feature.
  DM-role transfer also already shipped. **Advanced invite management
  shipped** — the DM can **remove a member** (`removeMember`: `arrayRemove` + `deleteField`, authorized
  by the unconstrained `isDm()` rule) and **lock joins** (an additive DM-only `joinsLocked` flag; a
  locked campaign refuses every self-join via `isSelfJoin`, the no-migration way to kill a leaked invite
  — true code _rotation_ stays out of scope since the invite code IS the campaign doc id). The **invite
  UX was simplified to one industry-standard link-based flow** (owner 2026-06-27): the redundant
  bare-code display was dropped in favour of a single "Invite link" (one shared `CopyButton` primitive
  across DmTools / create-success / the card menu), and the join dialog now accepts a pasted link _or_
  code (`inviteCodeFromInput`) — UI-only, the code/doc-id/`joinCampaign`/rules untouched so live links
  keep working. The **content-sharing lens shipped** (soft reveal, owner 2026-06-27): an additive
  optional `dmOnly?` flag on `SharedNote` lets a DM hold a note hidden from players (a render-level
  filter `isDm || !n.dmOnly` drops it from their list) and reveal it on demand via an Eye/EyeOff toggle
  with a "Hidden from players" badge — the soft, no-rules-change model (trusted-table convenience, not
  adversarial secrecy). **Admin god-mode shipped too** (v0.15.0 — inspect any user's characters,
  bug inbox, cascading `deleteUser`). **DROPPED:** AI session recaps (they belonged to the AI
  assistant, dropped 2026-07-06 — see _Open decisions_). (The shared-character view is already
  covered by the dashboard's "Open sheet".)
- **Guided tour / onboarding (#102)** — first-run walkthrough on top of the shipped glossary tooltips.

## Operating model

A single **orchestrator** delegates each track to scoped agents in **worktrees** — no PRs; each
track converges through `ponytail-review` and merges itself to `main` (the repo standard,
`docs/WORKTREES.md`). The full gate stays green; every schema / derived-value change is **validated
against the 6 team fixtures** (`content-pack/fixtures/team/*.json`). **Every visual change ships curated
screenshots to the owner's phone** (golden rule 15); **behaviour changes are WARNED before deploy**
(live users); **deploys are owner-fired only** (golden rule 22).

## R1–R8 — all shipped

The target-architecture campaign is closed; the design is now present reality, documented in
`docs/ARCHITECTURE.md` (see its "Architecture invariants" section), the history in git.

- **R1 — i18n completeness locks (chrome).** ✅ SHIPPED — throwing missing-key handler, no-`defaultValue` lint rule, en/it parity + no-empty test, locale-sweep render assertion.
- **R2 — `lib/views/` presenter seam + engine de-localization + toasts-as-data.** ✅ SHIPPED — engine-core takes no locale; only `lib/views/*` localizes.
- **R3 — SRD string externalization (`ui/` + `srd/`) + `localizeSrd` + lazy-per-locale load.** ✅ SHIPPED — ~5.5k BiText pairs lifted to `src/i18n/<lang>/{ui,srd}`; `src/data` is ids + mechanics only.
- **R4 — multiclass `classes[]` data model + one-time migration (schema 3).** ✅ SHIPPED — id-first `classes[]` is the sole source of truth; no legacy projection fields; v2→v3 migrated live + the converter deleted.
- **R5 — test fast/slow lanes + table-driven consolidation.** ✅ SHIPPED — Vitest `fast`/`slow` projects; 73 family files collapsed into `describe.each` suites, coverage identical.
- **R6 — heavy-component + `resolveActions` decomposition.** ✅ SHIPPED — the four heavy tabs + the `smart-tracker` monolith are thin orchestrators fed by `lib/views/*`.
- **R7 — dead-code elegance.** ✅ SHIPPED — dead shadcn marker removed; no parallel-component duplication.
- **R8 — doc-debt reconciliation.** ✅ SHIPPED — `docs/ARCHITECTURE.md` corrected to present reality (custom Radix UI, Vite 8, multiclass); the canonical-doc contract enforced.
