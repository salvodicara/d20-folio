# P10 — Guided character creation and recoverable onboarding

## Mandate and scope

Implement P10 only: first character, guided choices, voluntary exceptions, import comparison and
recoverable copies. P07–09 supply authoring, origin composition, scoped persistence and navigation.
P11a owns later growth/sheet expansion; P11b owns personal play migration. Neither is executed here.

V2 is a new application, built against approved Astra full-lab0.9.3 plus shell/Account r2.
Existing engines, stores, routes and screenshots impose no compatibility duty. No legacy combat
bridge or second runtime. One authority per fact, explicit dependencies and verifiable transitions.
Preserve all transferable BG3 character-choice organization/feedback and useful Beyond/Roll20
capabilities, using D&D2024 rules rather than automatically importing BG3 variants. The mock's
sample options and simulated mechanics are not a functional ceiling or backend implementation.

PRODUCT's permanent8 September delegation authorizes reviewed, green approved-mock V2 integration
without repeated exhaustive visual verdicts. Independently verify and always deliver actual images;
the owner's detailed usability review comes with the completed application. Do not claim personal
owner inspection. No deployment, real-data migration, production switch, new costs or external sends.

Custom/homebrew remains first-class input to the same extensible mechanics as official content:
actions, targets, costs, resources, effects, reactions, consequences and receipts. During later
combat, relevant values, resources, conditions, active effects and results must be editable on the
same authoritative facts, with provenance and causal correction/undo. In-use copy/effect changes
never silently change templates or other copies. Unsupported mechanics remain preserved and explicit;
manual consequences use the same facts/costs/receipts and never substitute for modeled deterministic
automation. Later engine/play blocks must prove actual custom use, automatic costs/effects,
mid-use changes and causal undo in ordinary, boundary and composition scenarios. P10 previews and
serialization are not that proof. Carry this full obligation in reviews and the complete successor.

Clarity is transversal: familiar domain terms, explicit labels, coherent groups, relevant examples,
units, state and consequences. A player can identify their location, current draft/copy, available
action, effect of a choice, and return/correction. Progressive disclosure preserves all capability;
it never hides errors or sacrifices depth. Internal schema/IDs are not ordinary input prerequisites.

## Experience and alternatives

The approved builder provides a page in Character, a stable step list, a current-step form and a
live summary. Keep the existing P09 shell/navigation. Use Identity, Origins, Class and choices,
Abilities, Equipment and magic, Review. The additional named step supplies explicitly required
functional depth while keeping the approved composition and visual language. On phone the summary
follows the current step; all controls and full names remain reachable without horizontal page drift.

Rejected alternatives: mounting the old wizard would restore legacy stores; creating the parent
then saving roots separately would expose partial characters; requiring users to author/publish
ordinary official content would make basic onboarding dependent on Library administration.

At first run show Create character and Import a character in the existing Characters empty state.
An account with characters receives the same actions. Never auto-select an existing character or
join a campaign. Invite context can be retained as navigation provenance; assignment remains a
separate explicit authorized action after creation.

- Identity: name, optional alignment/narrative identity, editable suggested starting choices.
- Origins: all composed species/background options and owned stable custom versions, named features,
  background ability distribution, granted origin feat and inline dependent choices; standard languages.
- Class: all composed classes and owned stable versions, starting acquisitions and required level-one
  features, skills, tools, expertise, masteries, spells and other modeled choices. Read then choose;
  fact-only options commit directly. No subclass fabricated before its class calendar requires it.
- Abilities: standard array,27-point buy and table-entered values; base, background increase and final
  score visibly separated. Explicit attributed exception can override an ordinary rule, not malformed
  input, unsupported semantics or permissions. No unlogged new dice generator.
- Equipment/magic: class/background package or gold choices, each nested selection and quantities;
  spell lists/counts/ability and prepared versus known/book entries distinguished. Browsing spends
  nothing. Initial entitlements materialize once at confirmation with source/state separation.
- Review: complete selected sources/versions, benefits, remaining decisions, previous versus proposed
  facts after a change, exceptions, equipment/gold and magic. Explicit Create and open sheet is the
  only creation commit. Return/back preserves the same draft; restart is explicit and recoverable.

Changing a cause preserves previous answers, marks obsolete/inactive answers with the named cause,
and excludes them from current contributions. Returning to an earlier step never clears valid input.
A stale-source or concurrent conflict requires review; an unknown commit reconciles its exact receipt.

## Domain owners and interfaces

`src/lib/character-creation/` owns the creation draft, normalized acquisition choices, catalogue
adapters, pure preview/validation, and frozen atomic creation intent. This is build composition,
not an Encounter reducer, old CharacterData store or a replacement for P03 operation state.

`src/lib/homebrew/origin-build.ts` remains the only selected-origin authority. Extend its source
snapshot contract explicitly for catalogue versus owner-library origin sources; never mint fake
LibraryVersion/grant metadata. Existing LibraryVersion records and existing single-root mutation
semantics remain readable. Shared helpers resolve source identity/provenance and definition.
Only catalogue definitions actually selected and their included dependencies are frozen. Custom
source versions are read through authorized repositories and compared exactly at commit.

Class acquisition uses ClassData, its root/starting/level scopes and stable identities. Initial
class saves apply once, multiclass-only acquisition does not. Class-level thresholds, sparse rows,
absolute resource/casting declarations and carry-forward remain explicit. Extend the class owner
for modeled starting equipment and catalogue pools rather than inserting unsupported arbitrary data.
Attributed class facts must survive origin projection; imported ambiguous baseline handling is
separate and never silently treats imported values as newly derived facts.

Official catalogue adaptation reads composed SRD/private-pack typed data. It translates known build
choices into the same normalized choice/fact vocabulary consumed by custom data. It does not parse
prose or invoke the old runtime evaluator. Preserve source typed mechanics needed by the future
engine, with explicit diagnostic coverage for genuinely unsupported constructs. Do not truncate a
class spell list or origin feat list to fit the32-inline-option/closure budget. A catalogue pool is
an explicit typed query; only selected definitions enter frozen closure. The full selectable pool
is resolved at preview, with stable IDs and localized names supplied by presenters.

`src/lib/identity/model.ts` continues to own FolioCharacter identity/revision/assignment and private
versus authorized sheet boundaries. New creation data is attributable and versioned. The initial
mutable state is written once to its existing personal sheet/state authority; no new parallel HP,
currency or equipment balance. P11b's later migration must consume this same ownership contract.

`src/lib/character-creation/repository.ts` owns creation commit/reconciliation. It consumes a frozen
validated draft and SessionController ticket; produces a creation envelope with one opId and one
characterId and an exact receipt. Parent, origin aggregate, class acquisition/selected content,
initial state and receipt are committed atomically. No cross-owner write or fabricated source grant.
Rules enforce shape, size, owner/blocked precedence and exact target/receipt/source boundaries,
not a duplicate D&D engine. Account profile and campaign membership are not changed by creation.

`src/lib/character-creation/draft.ts` owns the single account-scoped retained draft record and pending
envelope. Reuse OperationController for lifecycle. Verify storage write and readback before send.
Restored envelopes can reconcile; restoration cannot mint a fresh commit ticket. No automatic replay.
Auth/scope/revocation invalidation includes A→B→A, and late callbacks cannot reopen routes or erase a
new draft. P09 history contains safe route/step references and view state, never draft/ACL/consent.

`src/features/character-creation/` owns wizard/pickers/review and EN/IT presentation through existing
identity controls/tokens. `IdentityApp`, `IdentityWorkspace`, navigation and registry wire one route.
The shared origin/class readers remain read-before-choice views; Library authoring returns to the
requesting field with the creation draft retained and no silent selection.

## Concrete persistence and trust decisions

The write set for guided creation is bounded to five documents, regardless of the number of items:

| Document                              | Sole facts owned                                                                                                                                                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `folioAccounts/{uid}/characters/{id}` | Existing FolioCharacter identity; `sheet.build.abilities` base scores, alignment and creation format marker; `sheet.state.hp.current/temp` and `sheet.state.currency` initial personal balances. No copied equipment/spell arrays or class-derived skill/slot facts. |
| Character `origins/build`             | Existing OriginBuild roots, answers and exceptions; additive `resolvedChoices` per selection maps an answer path to selected DefinitionSnapshots. Root snapshots remain immutable.                                                                                   |
| Character `classes/build`             | Schema1 character ref, revision, one initial class acquisition with stable id/ordinal, level1, DefinitionSnapshot, scope/path answers, exceptions and answer-bound resolvedChoices; lastOperation. P11a extends progression through this owner.                      |
| Character `loadout/initial`           | Schema1 character ref, revision and map of initial HomebrewInstance-shaped items/spells with explicit DefinitionSnapshot and separate InstanceState; lastOperation. No duplicate in the parent or individual homebrew collection.                                    |
| Account `operations/{opId}`           | Exact creation operation plus revision0, binding parent/origins/classes/loadout snapshots and IDs.                                                                                                                                                                   |

Included gear/spells from custom roots use an explicit bundled-source form, not a fabricated
LibraryVersion. `loadout/initial.sources` freezes each originating DefinitionSnapshot once, keyed by
its complete source identity; each included instance snapshot identifies that source key and exact
dependency path and retains the included definition. The map and instance definitions are immutable
under state edits. Initial creation checks equality to the authenticated parent closure. Reads resolve
against this self-contained frozen map, never the character's current origin/class source. Later
origin removal/version update therefore cannot mutate, orphan or revoke an acquired item. Selected
pool children use their own explicit catalogue/Library snapshot instead. Existing individual P05
instances remain unchanged; a future transfer can package the frozen source map with the copy rather
than requiring access to a foreign child library. Test received custom background plus private included
gear/spell after original offer revocation, inspection/state edit with no child access, then origin
replacement preserving exact item snapshot/state.

The initial loadout is a transaction-sized grouping, not a separate item domain. Generalize the P05
instance snapshot type and repository read/state-update boundary to compose initial grouped instances
and existing individually addressed `/homebrew/{id}` instances. They share one item model, reader and
mutation API; an instance has exactly one address. Starting instance IDs use a reserved disjoint
namespace, validated against individually addressed additions. Initial state edits CAS the whole
loadout revision and same P03 receipt while preserving unrelated instances. Existing individual
copies and their source-update semantics stay intact. This bounds creation proof to five documents
without limiting the player to a handful of starting spells/items or duplicating authoritative state.
No migration of existing P05 copies or legacy state occurs.

Private narrative is not put in the creation receipt or authorized source definitions. Initial
identity asks name/alignment only; personal notes retain their existing separate post-creation editor.
The immutable creation receipt is historical evidence, not a second current state. Mutable class,
origin or loadout changes never replay initial currency/HP or respend gear entitlements.

`resolvedChoices` belongs alongside answers, not inside the selected LibraryVersion definition.
Each record binds origin/class acquisition, exact choice path, selected IDs and snapshots to the
pinned typed pool query. Unselected candidates are not stored. A changed parent leaves inactive
answer/snapshot records retained but noncontributing. Conformance and preview reject forged pool
matches and snapshot substitutions; original source equality remains enforceable independently.

Rules verify actor/blocked status, exact document/receipt coupling, bounds, initial absence and
source authority. Library root sources remain exact against owned immutable versions. Catalogue
semantics are strictly verified in repository intent/commit and on authorized reads against the
pinned local adapter output. A raw SDK catalogue claim can pass structural rules; it must fail the
client reader as incompatible/recoverable and must never acquire an official badge. No trusted
server catalogue manifest or new backend is introduced. Tests explicitly distinguish repository
semantic rejection from raw-write access/shape denial and exercise peer inspection of a forged
catalogue claim. Hash/discriminator alone is not authenticity.

A five-document receipt validator compares each after-document, with at most three root Library
source reads (species/background/class); included dependencies are within those exact versions,
not independent permission grants. Common user/parent/receipt reads are cached. Before adding more
source roots, prove actual access-call budget or bundle a legitimately delivered source closure;
never silently skip a source check. Selected standalone custom feats/spells may require additional
source reads: the measured commit plan rejects an over-budget atomic payload before sending and
preserves the draft, explaining the chosen sources that cause it. Test realistic maximum starting
compositions and reconcile limits only from actual evidence, not an arbitrary product catalogue cap.

## Import and recovery

Keep the existing exact-original archive and SHA-derived idempotent copy import. File schema and
rules edition are separate fields in analysis. Missing edition is unknown and requires explicit
user classification, not inference from schema3.2014 input shows origin, subclass, spells and
dependent-choice reconciliation;2024 input still checks unknown/custom/override preservation.

Persist classification and reconciliation at character `reconciliation/import`: schema1, sourceHash,
sourceSchema3, declaredEdition (`2014`/`2024`/`unknown`), reviewed categories, unresolved categories,
revision and lastOperation. It contains only authorized mechanical status, no private original or
narrative. First analyzed import writes this with parent/archive/notes and an exact import receipt.
Repeated identical bytes keep the same SHA-derived destination and existing review; conflicting
classification requires an explicit comparison and separate CAS review operation, never silent
replacement. Old P02 copies without this record render unclassified until analyzed. Review changes
do not rewrite original bytes or claim converted mechanics. Reload reads this same record.

A copy may retain unresolved mechanics explicitly; it is never labeled fully converted/play-ready
merely because its envelope parsed. Preserve custom/overrides and all original bytes, show what is
currently projected and what requires review, and provide exact-original download. Analysis changes
nothing; confirmation freezes the analyzed input. File-selection, route and auth generations fence
late reads. Six original fixtures must roundtrip, dry-run, apply twice, verify and recover exactly;
no real source is written or migrated.

## Budgets, errors and evidence

Maintain existing definition depth20/200000 UTF16, flat closure32/depth8, origin180000 UTF8/4096 nodes
and full operation600000 UTF8 accounting unless a separately justified measured change reconciles
all owners. Count repeated snapshots, final IDs and UTF8 bytes; fail before send with a usable draft.
New multi-document atomic rules must document <=10 access calls per write/<=20 combined and prove
boundary compositions in the actual emulator. Catalogues stay lazy and licensing-partitioned.

Catalogue coverage includes every selectable composed class/species/background and its reachable
starting feat chains, covering fixed and chosen facts, size, armor/weapons, expertise, class orders,
languages/tools and free-cast ability. Adapter diagnostic coverage is named per entry; no passing
class count conceals unavailable species or backgrounds.

Ordinary: fresh account completes official martial and caster characters, custom origins/class via
the same flow, all three ability methods, dependent feat/skill/tool/spell/equipment choices, confirm.
Boundary: duplicate/invalid scores,27-point boundary, empty/unavailable pools, unknown source/version,
large closure/UTF8, invalid class source, missing selections, scope/account switch and denied writes.
Composition: species/background/class overlap, background ability applied once, parent choice change,
spell/feat cascades, custom selected snapshot plus official options, gear/gold once, pinned versions.
Recovery: offline draft→online explicit confirmation; frozen duplicate submit; stale CAS/conflict
review; actual successful commit with held acknowledgement→unknown→reload→same receipt/one send;
storage failure→zero sends; auth/revocation/A→B→A→zero invalidated sends/no late takeover.

Run current optimized build with real Google app login/provider Auth Emulator and independently
authenticated synthetic users on explicit demo Firebase. Assert UI and final documents/receipts,
retain failed runs, correct causes and rerun involved paths. No DEV shortcut, replacement backend or
fabricated success. P09 evidence is not a P10 pass. Independent code/spec/UI review and actual dark
EN/IT screenshots1440×900,1280×800,390×844 cover every changed surface plus comparison/cascade/error.
Inspect actual images; paper only if print changes. Fresh final just ci, SRD-only, full rules and
six-fixture recovery required. Track hashes/applicability without inventing reruns.

Comprehension review asks whether the user can identify location, selected source, next action,
consequence, error recovery and return without technical coaching. Automated walkthroughs are not
human usability measurements. Production provider/index/transaction limits, AppCheck/IAM, hosting
HTTPS, physical devices and installed PWA remain explicit separately authorized staging/release gaps.

Only PROGRAM_STATUS owns current frontier/gates/SHA. On complete P10: fresh fetch/rebase origin/v2,
reviewed green gates, hooked explicit HEAD:v2, verify remote SHA and remove owned clean worktrees.
Send actual images and exactly one COMPLETE successor prompt containing every inherited owner
contract and the recursive rule: incomplete results continue this same block; select the next row
only after all exits/dependencies pass; never execute it in the same task. No PR/main/deploy.

Catalogue snapshots may retain bounded optional `sourceData` for the exact selected typed source.
The adapter verifier binds it together with the normalized definition. This preserves combat
mechanics that P10 does not execute without injecting unknown fields into strict acquisition data.
It grants no facts by itself and is not a second engine, an automation result, or permission to
interpret prose. The future common engine must explicitly normalize and verify those mechanics.
