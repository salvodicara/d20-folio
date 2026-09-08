# Origin authoring and current-build composition

P07 extends the shared authoring dispatcher to species, feat and background (nine authoring
families; the four base families retain their boundary). Family constants live in the base
authoring model so loading the pure build boundary first does not depend on initialization
order across origin conformance modules. Library definitions and immutable
versions are the sole template authority. This supports Astra full-lab 0.9.3 + shell r2 and
D&D 2024 origin declarations. It does not execute combat, advancement or an old engine bridge.
Same-engine custom automation, authoritative combat editing and causal undo remain later
acceptance obligations, never claims of this authoring model.

`origins.ts` owns typed prerequisites, benefits, options, parent-choice links and flat dependency
inclusion. Prerequisite arrays mean all; explicit all/any nodes group requirements. Shared
resources/programs/effects retain their existing conformance and declaration-only status.
Unknown fields, kinds and versions remain intact and produce path/code diagnostics. No prose is
interpreted as mechanics. Guided fields use domain ability/skill/movement/sense tokens.

`includeOriginDependency` copies a selected immutable definition and its complete flat table,
relocating child tables. Keys are JSON source-owner/entry/version tuples, independent of display
names. Equal existing nodes are reused with structural map comparison. Conflicting tuples,
malformed provenance, cycles, more than 32 total definitions and depth greater than eight fail
without rewriting the input. The original P04 JSON depth-20 and 200,000-code-unit limits also
apply. Inclusion permits unrelated incomplete draft fields; recording and use inspect full
conformance. The enclosing root version is the exact snapshot subsequently shared and verified;
relocated children are semantic copies, not byte-identical original version objects. Runtime
composition has no source-library reads.

`origin-build.ts` exports `OriginBuild`, `OriginSelection`, `parseOriginBuild`,
`composeOriginBuild`, `validateOriginSelection` and `projectOriginCharacter`. An aggregate has
schema 1, character reference, revision, a map of at most 32 selections, and last-operation ID.
Each selection contains its stable ID, unique nonnegative acquisition ordinal, immutable root
`LibraryVersion`, answers and scoped reason/actor exceptions. Parsing returns a frozen clone;
malformed input throws `incompatible-origin-build` so its caller can retain the complete original
for recovery. Aggregate serialization is bounded at 180,000 UTF-8 bytes and 4,096 JSON nodes.
The persistence boundary separately bounds the complete repeated operation at 600,000 bytes.

Answers address `root/<choiceId>` or nested paths formed by `originNodePath(parent, dependencyKey)`.
Path segments are URI encoded. Built-in background answers are `root/background-abilities`
(`strength:2`, `wisdom:1`, or three different `ability:1` entries) and
`root/background-equipment` (`gold` or `bundle`). Declared abilities must be three distinct values;
normal improvements stop at 20. A background selection requires its named tool and pinned origin
feat. Composition returns selected gold/reference entitlements; it never transfers inventory.

Composition evaluates roots in explicit ordinal order, then children in authored reference order.
Repeated references within one root share one bundled grant; intentional repeatable acquisitions
use distinct root selections. Nonrepeatability follows declared mechanic identity or canonical
source provenance across accepted copies. A declared mechanic uses its edition and source
namespace; generic `homebrew` additionally uses the canonical author owner. The fallback `custom`
identity uses canonical owner/entry provenance. Both authoring `sourceVersion` and immutable
`LibraryVersion.version` identify revisions of the same feat, not separate repeatable acquisitions.
An unchanged source namespace/local mechanic ID remains the same feat across those revisions. Explicit spellcasting benefits declare their casting
ability and supported `ability` policy; a spell reference alone never certifies spellcasting.
A candidate sees prior accepted roots and its parent's already-resolved benefits; it never sees
its own benefits or later roots when checking acquisition. Missing or ambiguous imported proof
is unresolved. Unknown/malformed declarations cannot be excused. Explicit known rule failures can
be waived only by the matching path/code with a reason and author. Inactive and obsolete answers
remain stored, emit visible advisory diagnostics and contribute nothing. Explicit confirmation may retain this
inactive history; reactivating it requires normal validation. `originDiagnosticBlocks` excludes
only inactive/obsolete history advice, and `validateOriginSelection` returns blocking diagnostics.
Malformed and unsupported active declarations always block.

The projection supplies attributable facts, choices, equipment entitlements, derived abilities,
current species/background identity, imported baseline/superseded/unresolved details, and a cloned
`projectedCharacter`. Its `abilities` are derived (null for missing base scores, with unavailable projection); `projectedCharacter.sheet.build.abilities`
remains chosen base scores as required by the character schema. Consumers use the projection's
current names and facts rather than resolving a custom entry ID as a catalog ID. Replacing a
background suppresses imported `asi.background` and selected old origin feat fields; removing the
replacement restores that baseline. A standalone feat preserves unrelated baseline origins, including faster imported walking speed
when merging a movement grant. A species replacement instead starts from its new movement facts.
Unqualified imported skills cannot prove an origin-sensitive acquisition after replacement;
manual tool/language IDs remain explicit supplied facts. Corrupt aggregates produce
`available: false`, never silently certified baseline data. The input character and recovery sheet
are unchanged, and no migration or write-back occurs.

Focused behavioral tests live in `tests/unit/homebrew-origins.test.ts`; P05/P06 authoring,
preparation, instance and portable-codec tests cover the reused boundaries. Firebase ownership,
atomic receipts, operation recovery and UI acceptance remain their own P07 evidence lanes.

Guided acquired-feat prerequisites use `{ kind: "feat", mechanicId, dependency }`,
where `dependency` identifies a pinned feat in the same flat bundle. Including that definition
provides its stable identity and readable name; it does not grant it. Acquisition checks prior
accepted feats with the shared `originFeatIdentity` policy used for repeatability, including
canonical provenance on received copies. An unrelated default `custom` feat cannot prove this
requirement. A missing/wrong-family dependency or mismatched companion mechanic ID blocks the
declaration. Existing explicit named mechanic-only selectors remain supported; the unqualified
legacy selector `custom` is preserved as unsupported and must be replaced by a pinned reference.

## Catalogue source and acquisition extension

[Definition sources](homebrew-sources.md) owns the explicit CatalogueSnapshot union,
flat catalogue dependencies, query pools and injected semantic verification. No fake
owner/publish/grant metadata is generated for official content. Existing Library
closure and inline-choice formats remain unchanged. OriginBenefit additionally models
expertise (skill/tool), armor/weapon training, weapon mastery, attributed spell selections
(known/prepared/spellbook/free-cast with ability and optional rest/uses), equipment
quantities and gold. Unknown policies remain intact with blocking diagnostics. Expertise
requires an existing proficiency proof; a declaration cannot grant its own qualification.
These build facts do not execute encounter mechanics or spend equipment entitlements.

## Shared acquisition declarations

A choice may declare `phase: "foundation" | "dependent"` (default foundation). Its optional
`selectedGrant` emits an entitlement using the selected canonical option ID: spell with an ability
and an array of known/prepared/spellbook or free-cast (uses/rest) entitlements; expertise with skill
or tool category; equipment with quantity; or mastery. Spell, equipment and invocation pools retain
exact selected snapshots. Selected invocation definitions use the existing feature family and may
carry optional prerequisites, benefits, choices and dependencies. This does not invent feat identity.

Spell ability is an ability token, explicit `"none"`, or `{choice: string}`. A
`{kind: "casting-ability", id, ability}` benefit binds that choice ID within the current acquired
node; multiple traits normalized into one root may share it. Independent roots and included nodes
remain separate. Pending spells resolve after their local choice; missing/conflicting answers are
unresolved. Selecting an ability or acquiring a spell never proves a Spellcasting prerequisite.

Backgrounds may replace fixed tool, originFeat and equipment/equipmentGold fields with
`toolChoice`, `originFeatChoice` and `equipmentChoice`, respectively, each naming an existing choice
of the corresponding role. Fixed and selected modes are mutually exclusive. Inline equipment
packages grant existing dependency quantities and gold; selected equipment emits an exact source
entitlement. Background ASI still applies one three-point allocation. Species may replace fixed
size with `sizeChoice`, naming a single-pick inline choice with one size benefit per option.

Additional attributed creation facts are hp-per-level (amount), movement-bonus (mode/meters),
movement-equals-walk (non-walk mode/multiplier), and armor-class (base, ability array, condition
always/no-armor/no-armor-no-shield, optional shieldBonus). Armor class is a candidate formula,
not a flat bonus. These declarations neither execute conditional/active combat effects nor parse
legacy Grant data. Creation consumers explicitly derive initial state from these facts.
