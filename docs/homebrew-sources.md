# Definition sources and catalogue choices

`src/lib/homebrew/sources.ts` owns `DefinitionSnapshot`. Existing `LibraryVersion`
records retain their exact schema and bytes. Catalogue snapshots use an explicit
`kind: "catalogue"`, `schema: 1`, `catalogue`, `release`, `adapterVersion`, `entryId`
and `definition`. They have no Library owner, publish operation or grant. Optional
`sourceData` retains exact raw typed mechanics for recovery and future normalization;
it does not grant facts, execute effects or establish combat support.

`sourceIdentity` is the complete immutable tuple. Catalogue canonical acquisition
identity is catalogue plus entry ID, independent of authored source/mechanic labels
and revision. Library provenance retains the original delivered author identity.
`DefinitionDependency` likewise distinguishes unchanged Library dependency tuples
from explicit catalogue snapshots. Included closures remain flat (32 nodes, depth8);
only the included definition omits its own dependencies map. `includeOriginDependency`
preserves its children in the parent's closure and rejects collisions.

`parseDefinitionSnapshot` without a verifier is structural decoding, never catalogue
authentication. Authorized origin/item repositories default to rejecting catalogue
claims. The caller injects `CatalogueVerifier(snapshot, included?)` from the pinned
adapter: full root/selected snapshots, including sourceData, must match its exact
output. `included: true` compares a flat included definition with its dependencies
map omitted; the authenticated parent supplies the closure. Catalogue children inside
an owned Library root are verified as well. No authored discriminator, hash, name or
source label can confer a verified catalogue badge. This module never imports the
creation adapter or a legacy evaluator.

`choice-pools.ts` owns typed `CataloguePool` descriptors: spell list union, level
range, ritual/school/ID filters; feat category/class scope/IDs; skill/tool/language
pools with proficiency/tool-category filters; equipment category/IDs; mastery
category/property/ID/proficiency filters. Unknown fields are preserved and diagnosed;
unknown query kinds cannot compose. `OriginChoice.pool` is optional; pooled choices
keep `options: []`, while existing inline choices retain their unchanged format.

`resolveCatalogueChoice(pool, selectedIds, selectedSnapshots, context)` resolves the
full selectable pool without a32-option truncation. Only selected content snapshots
are frozen beside answers as `resolvedChoices[path]`; the root snapshot is unchanged.
Content queries require snapshots; fact-only proficiency/mastery queries do not.
Exact selected IDs, query/source tuples and adapter-produced snapshots must agree.
Nested selected-child answer paths use the pool option ID, not the source-local
entry ID, so different Library authors and catalogue entries retain independent answers.
Changing a parent retains inactive/obsolete answers and snapshots but excludes them
from current facts. Selecting a source without required resolver/verifier is invalid.
A resolver is an injected trusted typed catalogue query, not untrusted wire data.

`ChoiceResolutionContext.inheritedFacts` supplies attributed, already validated facts
from another build owner for prerequisite context and projection. Exact duplicate
source/path/acquisition facts apply once; conflicting, conditional, unsupported and
candidate-self facts cannot establish prerequisites. These facts are reprojected after
ambiguous imported skills/casting are superseded, never copied into the stored parent.
The originating class composer remains responsible for eligibility and attribution.
Spell access (known, prepared, spellbook or free casting) does not establish a
Spellcasting feature prerequisite; only explicit spellcasting capability does.

Existing definition/origin/operation budgets still apply before sending: definition
200000 UTF16/depth20, origin180000 UTF8/4096 nodes, full operation600000 UTF8.
`sourceData` also validates plain JSON within200000 UTF8/4096 nodes. Catalogue scale
belongs in lazy query resolution; selected closure and repeated operation snapshots
still count toward persistence limits. Client semantic verification is distinct from
Firestore structural/ACL verification; neither these codecs nor preview tests prove
future custom combat execution, in-use correction, costs or causal undo.

## Authenticated acquisition inspection

`conformAcquisitionSnapshot(snapshot, verifyCatalogue?, includedNode?)` defaults to rejecting
catalogue claims. After exact adapter authentication, catalogue spell, equipment, weapon and
feature definitions can omit unavailable combat fields. Required common data is authoringVersion1,
edition2024, source, sourceVersion and mechanicId; spells additionally require level and school,
equipment category, weapons category and mode, and features acquisitionLevel. Present fields use
the shared authoring descriptors and applicable cross-field constraints; unsupported declarations
still diagnose. No absent-field inventory or invented range, duration, charges or activation is
stored. Ordinary Library definitions retain full authoring conformance. Instance decoding retains
these authenticated partial snapshots, including exact sourceData; this does not certify execution.

Pools additionally support invocation features with maximumClassLevel and optional IDs. Equipment
queries can declare toolCategories, proficientOnly and optional proficiencySource (the pinned
source entry ID constraining eligible proficiency facts); spell queries can declare
`acquiredPolicy: "spellbook"`. The trusted resolver receives current attributed facts on every
choice resolution via `resolvePool(pool, facts)`, so preparation can filter an earlier spellbook
selection. These are filter declarations; selected entitlements remain separate from eligibility.
