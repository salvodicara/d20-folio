# Class and subclass definitions

P08a adds `class` and `subclass` to the common authoring vocabulary. The eleven families use
P04 `LibraryDefinition`/`LibraryVersion`, the portable codec and the existing operation protocol.
`BaseFamily` remains weapon/equipment/spell/feature. There is no new character store or advancement interpreter, migration, dice execution or combat engine.

`classes.ts` owns `ClassData`, `SubclassData`, `ClassLevel`, `ClassAcquisition`, casting declarations,
initializers and typed decoding. `decodeClassDefinition(unknown)` returns a discriminated known
class/subclass result only when complete conformance succeeds. Otherwise it returns `incompatible`,
`invalid` or `unsupported`, diagnostics and the untouched original. Outer portable parsing retains
exact input text. Conformance never repairs or strips unknown declarations.

A class declares hit die (6/8/10/12), primary abilities, two distinct starting saving throws and an
ordered subclass level schedule. `starting` and `multiclass` each contain shared prerequisites,
benefits and choices; grants for the first class therefore remain distinct from later acquisition.
Root benefits/choices apply to either acquisition. Saving throws belong to starting acquisition.
`levelBasis: "class"` explicitly binds progression and its level prerequisites to the owning class,
not total character level. Shared predicates/benefits/choices and included dependency validation
remain in `origins.ts`; resource/program/effect declarations remain in the existing validators.

Progression has 1–20 strictly increasing rows, with unique stable IDs, authored names, prerequisites,
benefits, choices, `programIds`, `resourceCapacities` and explicit casting counts. A class starts at
level 1. `blankClassLevel(level)` supplies a neutral numeric name; a future guided editor supplies
an authored/localized name without making the domain layer depend on i18n. Choices may depend on
preceding choices in the same acquisition/row scope. Cross-level resolution belongs to the future
composer. Empty rows are permitted; they do not execute mechanics.

`resources` declare template ceilings and existing recovery policies. Each row's resource capacity
is an absolute replacement bounded by that ceiling; omitted bindings carry forward, never refill
or add. A resource first becomes available at its initial row binding. `programIds` grant a declared
program once; duplicate grants are invalid. Static conformance verifies availability and cost at
every row, including the shared multiattack cost sum. Multiattack child programs must already be
available (including another grant in the same row). Resource capacity reductions that make an
available program unaffordable are invalid authoring declarations. No stored remaining resource or
character state is changed by these checks.

Casting declares `mode` (none/full/half/third/pact/custom), ability and explicit multiclass
`contributes`/`divisor`/`rounding`. None and Pact Magic do not contribute ordinary multiclass slots.
Rows contain absolute cantrip/prepared/known counts, ordinary slots indexed from spell level 1
(up to nine entries), and distinct pact slot count/level. Missing progression levels retain the
preceding declaration; every present row supplies its full casting counts, including explicit zero.
Counts are bounded 0–100; pact level 0–9 is zero exactly when pact slots are zero. Pact and ordinary
slots cannot share one policy. These are authored tables, not computed character spell slots or a
claim of official RAW; custom authors remain responsible for their declared progression.

A subclass has `parentClass: {dependency, mechanicId}`. `includeOriginDependency` pins the complete
parent and transitive closure into the same flat table used by P07. The class never points back to
subclasses. Parent family and mechanic identity must match; the first subclass row matches the
first parent subclass level. Benefits/choices/program/resource grants belong to scheduled subclass
levels; casting-only rows may occur between them.

Subclass `castingRelationship` is explicit: `inherit` keeps the parent unchanged; `augment` adds
cantrip/prepared/known counts while keeping the parent's slot/contribution policy; `replace`
supplies a replacement casting policy for that owning class. Inherit/augment use local `mode:none`
and no multiclass contribution or slots, preventing double counting. A noncaster parent with a
third-caster subclass uses replace. P08a checks the declarations; the future composer applies this
relationship once.

`conformClassPair(subclassDefinition, selectedClassVersion)` checks the exact pinned parent version,
content, provenance and transitive closure. An unchanged received parent may match its canonical
source/version from grant provenance; a changed copy, another owner with the same name or another
source version cannot. P04 persistence remains responsible for authentic stable version/grant
provenance; this pure check does not confer permission or acceptance.

Limits remain explicit: flat root plus at most31 included definitions, dependency depth8; shared
collections32, progression20. The outer definition codec retains depth20 and200000 UTF16 units.
Cardinality maxima do not promise every combined maximum fits the byte budget. Origin-build's
180000 UTF8/4096-node bound remains scoped to that separate aggregate; complete persistent
operations retain their transport budgets. Oversized originals remain recoverable.

Verification is in `tests/unit/homebrew-classes.test.ts` plus existing authoring, advanced, origin,
instance and preparation regressions. It includes ordinary typed pairs,1/3/5 declarations, starting/
multiclass choices, inherited/replaced casting, resource/program composition, invalid schedules,
unknown/future/original recovery,20 rows and31 included definitions, and exact parent versions.
These proofs do not establish future combat automation, in-use editing or causal undo. Those
remain required for custom and official content through the same engine in later program blocks.

Typed decoding checks native token and binding types without string coercion. Unknown casting
mode/rounding tokens remain unsupported originals; semantic relationships are checked only when
the relevant policies are known. Augment cannot introduce nonzero spell counts on a known
noncasting parent: that requires a replacement policy with its own ability. Unmodeled class or
subclass fields, including `equipment`, remain explicitly unsupported rather than bypassing
validation through another family's field allowance.

## P08b guided class authoring

ClassFields is the progression authoring adapter over existing ClassData. It edits identity,
first-class/multiclass/common acquisitions and stable level rows, using scoped OriginFields and
the same root pinned closure. Adding a level mints an identity once; changing its number/name and
explicit ordering preserve it and nested choice IDs. It never computes or applies character growth.
Casting changes preserve row counts for explicit review; capacity bindings replace absolute maxima
without refilling. Guided AdvancedFields names resource/action references while stable identities
remain available read-only. Known-field edits preserve unknown data; malformed sections are shown
and are not initialized over existing content. Common conformance names affected level declarations.

Existing LibraryDraftController supplies all autosave/base/envelope/recovery behavior. Reuse recorded
class reads the last immutable version into an independent local Library draft; Duplicate uses the
current draft. Neither routes class templates through the four-family character-item repository.
Class selection/advancement is P10/P11; the subclass editor remains P08c. Shared reader/print unchanged.

Custom same-engine automation and editable combat remain mandatory future runtime exits: actions,
targets, costs, resources, effects, reactions, consequences and receipts; in-use authoritative edits
with provenance/causal undo, separate from template versions with no silent propagation. Modeled
deterministic mechanics cannot be relegated to manual handling. This editor's save/preview is not
evidence of those future execution exits.

## P08c guided subclass authoring

SubclassFields binds a named recorded class version using the shared included-dependency picker,
includeOriginDependency and conformClassPair. LibraryEditor exposes all recorded versions of owned
class sources for this picker; equal names/versions are disambiguated by source owner/entry. The
parent's exact definition and complete closure travel in the subclass version. Newer parent versions
never update existing subclasses or granted copies implicitly. Selecting a parent preserves existing
row/choice identities, unknown fields and casting declarations; incompatible calendars require
explicit review. Malformed parent/dependency containers remain recoverable without replacement.

ClassFields supplies the same progression, scoped acquisition, named program/resource bindings
and casting policy controls for both class families. Class-only hit die/saves/starting/multiclass
acquisitions remain on the class. Subclass relationship is explicit, with explanations of inherit,
augment and replace, scheduled feature levels and casting-only intermediate rows. Reuse recorded
subclass creates an independent Library draft from the stable version, distinct from Duplicate of
the current draft. No character growth, store, combat executor or source propagation is introduced.

The shared Library controller still owns loaded base, revision, envelope and receipt reconciliation.
Unknown/future/incompatible originals remain intact and unsupported; no editor change interprets
prose or claims deterministic combat execution. P10/P11 own character application, and later play
blocks must still prove same-engine custom automation, authoritative in-use edits and causal undo.

## Starting acquisition source vocabulary

Classes share [explicit sources and pools](homebrew-sources.md) with origins. ClassData
optionally declares `startingEquipment: {gold, items: [{dependency, quantity}]}` using
its exact flat included weapon/equipment closure. Existing acquisitions and inline
choices retain their shape. Shared benefits model expertise, training, mastery, spells,
quantity entitlements and gold; spell policies distinguish known/prepared/spellbook and
free-cast ability/rest uses. This is build composition, not automatic inventory spending.
`conformClassPair` and `composeSubclassCasting` accept either an authentic Library parent
or an explicit pinned catalogue parent. Parent source, revision/release/adapter, included
definition and flat child closure must agree exactly; custom parent behavior is unchanged.

## P10 initial class acquisition owner

`ClassBuild` lives at character `classes/build`, separately from `origins/build`. Its schema1
record contains character, revision, acquisitions and lastOperation. P10 accepts exactly one
acquisition with ordinal0 and classLevel1; its immutable snapshot must be a class. The shared
acquisition parser retains stable answer paths, selected snapshots and attributed exceptions without
converting the class to an origin or inventing source metadata. Class progression/multiclass changes
remain outside P10. This parser is a persistence boundary, not proof that choices are complete.

Initial composition now uses the shared `composeAcquisitionBuilds` evaluator described in
[origin build composition](homebrew-origin-build.md#shared-class-and-origin-acquisition).
Class-owned core facts and foundation choices precede origin acquisition; choices explicitly marked
dependent follow it. The class level, rather than an imported character level, governs the initial
class frames and their prerequisites. This is acquisition and initial-state input, not progression
or combat execution.
