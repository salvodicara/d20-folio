# P07 — Origins and feats

## Binding mandate

Implement only species, feat and background authoring and their actual character-build selection.
V2 is a completely new application. Astra 0.9.3 plus the 7 September shell/Account r2 is the
binding experience; existing managers, engines and navigation impose no compatibility duty.
Transfer BG3 organization, contextual choices and feedback, and useful Beyond/Roll20 capabilities,
under D&D 2024. The mock is not the functional ceiling. No legacy bridge, second combat runtime,
P08 classes, complete P10 wizard, P11 growth or P14 execution. Production stays separate; no
production writes, deployment, new costs, external sends, main integration or PR workflow.
Owner has authorized technical design and implementation; do not repeat micro-approval requests.
Actual P07 images and explicit block integration remain owner gates after autonomous completion.

PRODUCT owns same-engine homebrew automation and authoritative editable combat. Custom actions,
targets, costs, resources, effects, reactions and consequences must feed the same engine and
receipts as official content. The finite vocabulary is extensible, not the product ceiling.
Modeled mechanics require deterministic automation; a manual alternative is not a substitute.
During combat relevant values, resources, conditions, active effects and results must be editable
on the same authoritative facts, with coherent consequences, provenance and causal correction/undo.
DM arbitration and ACL remain. An in-use copy/effect and library template/version are distinct;
no silent propagation between them or other copies. Preserve and identify genuinely unsupported
mechanics; explicit manual consequences use the same costs/facts/receipts, never prose execution.
P07 proves authoring and build composition, not combat. Future engine/play acceptance must prove
custom automated costs/effects, editing during use and causal undo in ordinary/boundary/composition.

Clarity is application-wide. Familiar controls and domain terms must explain location, target
character/copy, possible actions, consequences and return/correction. Labels, grouping, examples,
units and state feedback are explicit. Progressive disclosure preserves depth and freedom.
Never require internal IDs or model knowledge to complete ordinary authoring. Preserve drafts;
errors, unsupported, pending and conflicts explain the next available step. P06 broad interim
acceptance is not approval of P07 pixels or proof of detailed whole-app usability inspection.

## Architecture and authority

LibraryDefinition/LibraryVersion remain the only template, draft and stable-version authority.
Extend AuthoringFamily to nine families; BaseFamily remains the four P05 families. Shared effects,
programs, resources, formulas, source/sourceVersion/mechanicId and conformance primitives remain
common. No prose interpreter or family-specific write queue. New pure origin vocabulary and build
composition modules have no dependency on legacy mechanics or combat stores.

The character's new origin build is one aggregate at
`folioAccounts/{uid}/characters/{id}/origins/build`. It owns selected species, background, feats,
choices, explicit exceptions and immutable LibraryVersion snapshots, including referenced child
feats/features/spells. Imported sheet grammar remains sealed migration input, never a second
mutable origin store. The current origin build presenter displays these actual selected facts;
it must identify which imported-origin facts are superseded and must never add their bonuses again.
No update writes back to legacy data. Existing P05 inventory-like copies keep their path and state.

An OriginBuild has schema 1, character ref, revision, selections, lastOperation. Selection identity
is stable; each selection pins its snapshot, answers, optional parent selection/choice cause,
and explicit prerequisite exceptions with reason/author. One aggregate enables exact CAS across
species/background/feat dependencies rather than independently racing child records. Keep a finite
bound of 32 selected definitions and 32 choices per definition; reject oversize/cycles explicitly.
Dependent child snapshots are chosen from actual owned stable versions; a received library copy
is owner-owned after P04 acceptance. No foreign source access or fabricated consent, even admin.

Reuse/replace/update/remove/reconcile choices are explicit build intents via P03 Envelope,
OperationController, useLibraryOperation, session generation and immutable operation receipt.
Compare the exact loaded aggregate and character revision/assignment at commit. Write aggregate
and receipt atomically, require each introduced/replaced snapshot to equal an existing owned
immutable LibraryVersion. State/answer edits retain snapshots exactly. Chosen version updates
preserve compatible answers and retain obsolete answers for explicit reconciliation; no silent
clamp, default choice or propagation. Unknown receipts reconcile the exact saved envelope only.
Persist/readback envelope before send; no automatic reconnect replay. Fence auth/scope and A→B→A,
including late acknowledgments and library selection callbacks. Conflict never replaces dirty base.
Malformed originals are archived and read back before replacement, with exact downloadable recovery.

Rules enforce identity, shape, bounded size, source ownership, exact base and atomic receipt/target
binding, not D&D legality. Owner writes; current P02 authorized sheet readers may inspect snapshots
without private-library access. Blocked accounts deny. No peer write, admin consent or wildcard.

## Authoring and build semantics

All three families have typed prerequisites, ordered shared programs/resources and origin benefits.
Prerequisites describe level, ability score, proficiency, acquired feat and spellcasting; explicit
all/any grouping handles conjunction/disjunction. Evaluate against the real selected build context,
never a typed freeform claim. Unknown predicates remain unsupported rather than evaluating true.
A voluntary exception stores the unmet requirement, explanation and actor; it does not alter ACL,
pretend a mechanic is supported or create a generalized DM approval queue.

Benefits describe ability improvements, size, movement, senses, skills/tools/languages, resistances,
and references to stable feats/features/spells. Origin choices have stable IDs, readable names,
required counts, named options and explicit parent-choice/option dependencies. The guided authoring
surface selects prior named choices/options and library entries rather than asking users to type IDs.
Validate unique identities, counts, references, dependency cycles, allowed ability/skill/type tokens,
negative/invalid values, and incompatible known branches. Preserve unknown fields/kinds/versions.
The common reader, offers, exports and print display all declarations and preserved unknowns.

Species: size options, walk/fly/swim/climb/burrow speeds and senses in meters, trait choices,
languages/proficiencies/resistances, shared resource/program declarations. No background ability
increase silently assigned by species. Explicit custom benefits remain possible with provenance.

Feat: origin/general/fighting-style/epic-boon category, acquisition prerequisites, repeatability,
ability improvement and other benefits, choices and shared programs/resources. Eligibility is
explained before selection; unmet options remain inspectable through the explicit exception route.

Background: three distinct ability options; choose +2/+1 on different abilities or +1/+1/+1,
maximum 20 in the normal rule path. Two skill proficiencies, tool, pinned origin feat and equipment
alternative (typed equipment reference bundle or gold amount). Background-to-feat choices cascade
into the actual build. Equipment selection declares the build's starting entitlement; it does not
perform P24 quantity transfers, create a second balance or spend currency in the editor.

Changing a parent retains answers as a draft, marks inactive/obsolete decisions and removes their
contributions from preview until reconciled. Confirm only a complete valid selection or specifically
recorded voluntary exceptions. Pure build composition returns attributable facts and diagnostics,
not encounter effects or P11 growth. Existing shared programs/resources retain their execution status.

## Named E families before code

| E family | Owner                                  | Ordinary                          | Boundary                                                     | Composition / limits                                                |
| -------- | -------------------------------------- | --------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| E18      | origins/build model and presenter      | size/speed/skills/ability choices | parent changes preserve draft, exclude obsolete benefits     | background → feat → choice; no P11 progression                      |
| E19      | authoring/conformance/portable         | each family pins source/version   | unknown kind/version retained                                | three families compose, selected source update leaves others pinned |
| E05      | shared resource/program declarations   | bounded uses/recovery             | zero/unlimited and invalid resource refs                     | trait costs from declared resource; no spending/recovery execution  |
| E10/E11  | typed benefits/programs                | modifier/resistance               | unknown selector/type explicit                               | attributed simultaneous sources; no roll/damage resolution          |
| E17      | source references/program declarations | granted spell source              | invalid or unsupported payment policy                        | background → feat → spell/resource; no cast                         |
| E21      | prerequisites/choice dependencies      | actual level/ability eligibility  | unknown predicate never true, intentional exception recorded | upstream changes reevaluate downstream eligibility                  |

Other shared primitive declarations are preserved; E20 causal combat correction and E22 vitals
execution remain future P14 work. No universal homebrew or combat acceptance claim from a schema.

## Experience and evidence

Specific references: full-lab/evidence/state-editor-{species,feat,background}.png, library-tools.js,
character-management.js, and shell-review-20260907 r2 images/scripts. Left creation shelf and right
spacious grouped editor; one column on phone. Read detail before choosing, child controls beneath
cause, consequence summary before confirmation. Return preserves character, requesting field,
filter/scroll/selection and draft; Escape/cancel applies nothing and restores focus. EN/IT dark,
1440×900,1280×800,390×844. No animation/shortcut switch; OS/browser and typing guards remain.

New proofs for every family: create/edit/autosave/reload, distinct stable version, actual build
insertion/readback, offer→explicit recipient acceptance→one materialization, revoke-before blocks,
revoke-after preserves, chosen update leaves other copies pinned. Typed cascade/prerequisite and
exception roundtrips, unknown retention and exact incompatible original recovery. Inspect every
page of saved PDFs including long/unknown content, not print-preview screenshots alone.

Use current optimized build, actual app Google login through Auth Emulator, independent synthetic
clients and explicit demo Firebase. Exercise concurrent bases, retry/duplicate, offline/reconnect,
real committed response loss/unknown reload, revocation, A→B→A and storage failures. Audit actual
stored versions, grants, build snapshots/answers and receipts. Keep failed and green scripts/logs,
fixtures, commands, hashes, source/build/image/paper manifests and independent reviews externally.
just ci, full demo rules, six private fixture copies with exact recovery; ci-srd-only for catalog/
adapter seam. No weakened tests, hidden skips or --no-verify. Emulator differences (indexes,
transaction limits, provider/App Check/IAM, HTTPS/hosting and installed PWA/devices) remain explicit
separate staging/release gaps, never excuses for incomplete current behavior.

PROGRAM_STATUS alone owns frontier/writer/gates/integration SHA; HANDOFF owns evidence and service
receipts. Owner-only Conventional commits, each with changeset and fact-owner reconciliation.
Only after P07 owner image/integration approval: fresh fetch/rebase, pertinent green gates, hooked
explicit HEAD:v2, remote SHA verification and removal of only clean owned worktrees. No main/PR/deploy.
Finish only after current exits and gates are satisfied; then deliver one complete recursive prompt
carrying this rule, sources, ownership, BG3/Astra/new-app/depth, same-engine custom automation/editable
combat and clarity/familiar-pattern contracts. Missing/failed exits continue P07, never skip in DAG.
Do not deliver a successor prompt during interim approval and do not execute P08 in this task.

Rules evidence consulted 8 September 2026: D&D Beyond Basic Rules 2024 Creating a Character and
Character Origins; Larian Community Update 8 Character Creation is behavior reference only, not
D&D2024 authority. Public test content is synthetic and SRD-compatible; private pack remains read-only.
