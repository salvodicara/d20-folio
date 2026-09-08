# Source acquisition metadata

`src/data/types.ts` owns optional acquisition metadata for catalogue consumers.
Older declarations remain valid; absence means unavailable policy, never permission
to infer class behavior from an ID, display name, prose or a legacy evaluator.

`SrdClassTable.spellcasting.policy` declares slot mode, multiclass contribution and
spell acquisition. Existing level rows remain authoritative for slot and prepared
counts. Prepared-list casters choose from their class list; selected-spell casters
retain an explicit replacement cadence/count; spellbook casters first acquire the
book's declared initial spells and then prepare the table count from that book.
Wizard starts with six first-level book spells. Paladin and Ranger replace one
prepared spell per Long Rest; their half-caster contribution rounds up. These source
policies follow the [official 2024 class rules](https://www.dndbeyond.com/sources/dnd/br-2024/character-classes).

`weaponMastery` binds a selection to a `classSpecific` count column and explicit
proficiency/property eligibility. Property filters use the existing closed weapon
property kinds. `invocationChoices` likewise binds its count to a class table column;
`SrdEldritchInvocation.prerequisites` declares minimum class level, required invocation
IDs and any damage/attack cantrip predicate. The retained prerequisite string is
legacy presentation, never the authority for a new catalogue adapter.

`SourceSpellcastingAbility` is fixed, a source-local named choice, or explicitly not
required. Choice identity is the acquired root plus the declared choice ID: repeated
IDs within one source intentionally share an answer (for example the two Tiefling
spell traits), while different acquisitions stay independent. Never bind an unrelated
feat to a global species casting ability. A trait's optional `minLevel` gates the
entire trait; absent means level one. Per-spell availability remains separately typed.
Spell access does not by itself prove possession of the Spellcasting feature.
`cantripReplacement` retains a named granted cantrip as the authored default and
declares its allowed list/rest boundary. It applies only when that trait actually
grants the named spell, so inactive lineage options confer no replacement rights.

`BackgroundEquipmentItem.choice` adds nested explicit option/item trees or a typed
item/tool pool. Exactly one of `options` and `pool` is allowed. An explicit choice
supersedes its containing legacy leaf for new acquisition and requires an answer;
`srdId` or `fromToolChoice` remains solely as the older consumer's fallback. A tool
proficiency choice and the number of physical tool items are separate facts.

`src/data/languages.ts` owns the canonical language roster and `SRD_ORIGIN_LANGUAGES`:
Common plus two distinct choices from the other standard languages. The existing
language consumer re-exports that roster and derives its creation slot from this
policy. This baseline is independent of any species/background benefits.

`src/data/background-equipment.ts` owns only composed equipment declarations.
`src/lib/background-equipment.ts` owns legacy item materialization and tool-choice
helpers; data does not re-export that runtime. Background skill enrichment imports
the pure canonical skill mapping directly. New catalogue consumers can read source
metadata without importing inventory materialization or the legacy evaluator.

All new source fields are optional for paired-repository compatibility. Private
source declarations add structural fields without requiring new public exports or
new Grant discriminators. New consumers must diagnose missing metadata in older
packs. These declarations preserve source semantics; they are not a second runtime,
combat engine, permission grant or proof that deferred mechanics execute.
