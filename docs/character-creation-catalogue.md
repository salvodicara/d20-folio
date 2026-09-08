# Guided creation catalogue and composition

`src/lib/character-creation` consumes typed catalogue data, not legacy evaluators or
character stores. `catalogue-source` inventories the composed catalogue without a sample
limit; `catalogue-policy` pins release and adapter identity. `catalogue` authenticates the
exact frozen normalized definition and original `sourceData`. Original mechanics are
preserved, not claimed as executed. Missing leaf fields stay absent rather than receiving
fabricated spell or equipment defaults. Equipment bundle prices and weights become unit
values; conditional weapon properties remain in the original rather than becoming false.

`root-adapter`, `grant-adapter` and `equipment-adapter` declare level-one acquisitions in
the same class/origin vocabulary used by Library sources. Fixed tool and language grants
use canonical registry IDs. Armor prerequisites use the same `*-armor`/`shields` tokens
as class training. Declared prepared counts use the generic count or the typed
`classSpecific.preparedSpells` column. Acquisition spellbook, preparation, cantrips,
free casts, casting ability and Spellcasting eligibility remain separate facts. Ability
choices belong to their source/active branch; later-level and conditional combat mechanics
remain preserved for the future engine. Preview is not proof of combat automation.

`catalogue-pools` resolves the complete eligible pool against facts available at that
acquisition phase: expertise follows proficiency, spellbook preparation follows acquisition,
and a starting tool can require proficiency from its exact granting source. No translated
label drives eligibility. A background can explicitly declare `originFeatCategories` for
its authored fixed feat or choice; omission retains the Library default of Origin feats.
The supported feat categories include Origin, General, Fighting Style, Epic Boon, Heritage,
Planar Pact and Dark Gift. This preserves the source category rather than mislabelling it.

`model` owns one retained answer record per source identity and active role references.
Switching source preserves earlier answers; inactive/obsolete answers have no contribution.
`compose` calls the shared class/origin composer once, then derives initial abilities,
maximum HP, gold and personal copies. Base scores remain distinct from background increases.
Only active acquisition paths supply selected copies. Each path owns its exact frozen
closure; retained snapshots cannot shadow it. Included gear and spells use bundled copies
with the frozen root in the loadout. Ambiguous or missing spell definitions block creation;
no custom spell is silently omitted. Exact selected spell sources are matched by selected
path, not merely by a reusable mechanic ID.

`creationCandidate` requires a complete valid review. `validateCreationCandidate` rebuilds
that review independently from the proposed aggregates and parent-owned creation metadata,
then compares the complete materialized output. The repository applies its own codecs,
authority/source checks and budgets as described in character-creation-persistence.md.
Actual UI, optimized Firebase demo, full rules/CI and final integration remain separate gates.
