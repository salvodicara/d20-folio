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
