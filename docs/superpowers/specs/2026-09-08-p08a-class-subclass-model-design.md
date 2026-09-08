# P08a — Class and subclass authoring model

## Mandate and boundaries

Build only the typed class/subclass model, conformance, codec and real immutable Library versions.
P08b owns guided class authoring, P08c subclass/multiclass editors, P10 character creation, P11
advancement and P14 engine execution. Do not build those flows or a parallel growth engine here.
V2 is a new application; Astra 0.9.3 plus shell/Account r2 is binding, not the legacy application.
Acquire transferable BG3 behavior/organization/feedback and useful Beyond/Roll20 capabilities;
D&D 2024 governs rules. The mock does not cap functional depth. No legacy bridge or second runtime.
Production remains separate; no main integration, PR, deployment, real-data write/migration or cost.
The owner's 8 September delegation authorizes autonomous technical decisions, review, gates and
integration to v2; always deliver actual screenshots and one complete successor after closure.
Do not request repeated exhaustive visual consent or claim personal owner pixel inspection.

Custom is first-class input to the SAME engine as official content: actions, targets, costs,
resources, effects, reactions, consequences and receipts. The finite vocabulary is extensible,
not a product ceiling. Modeled mechanics require deterministic automation; manual alternatives
are not a substitute. Combat values, resources, conditions, active effects and results must be
editable on their authoritative facts, preserving consequences, provenance and causal undo.
In-use copies/effects differ from library templates/versions; never silently propagate changes.
Preserve genuinely unsupported mechanics and identify them; explicit manual consequences use the
same facts/costs/receipts without prose execution or ACL bypass. Future engine/play blocks must
prove custom automation, in-use editing and causal undo in ordinary/boundary/composition cases.
P08a authoring, serialization and previews do not prove those future exits.

Clarity applies throughout: familiar patterns, domain names, explicit labels/groups/units/help,
visible context/copy, consequences and return/correction. Preserve drafts; unknown/pending/conflict
states explain available next steps. Progressive disclosure preserves capability and freedom.
Internal identities are generated/selected by future guided editors, never unexplained user input.

## Authority and design choice

Extend AuthoringFamily from nine to eleven; BaseFamily remains exactly four. classes.ts owns
ClassData/SubclassData and level declarations. model.ts dispatches initialization/field metadata;
conformance.ts composes validation. origins.ts retains the single prerequisite/benefit/choice and
flat dependency validator, extended to inspect class progression declarations. advanced.ts retains
program/resource/effect ownership. portable.ts and library/model.ts remain the only outer codecs.
Library repository/P03 envelopes remain the only persistent write authority. No parallel queue,
reconnect replay, growth store, class-character mutation or new Firebase path.

Rejected: free-form progression interpreted as mechanics (ambiguous and prohibited), and a separate
class dependency resolver/repository (duplicates authority and recovery). Reuse the shared closure.

Each class declares hit die, primary abilities, two distinct saving throws, subclass acquisition
schedule and multiclass prerequisites. Common benefits/choices describe skills/proficiencies;
spellcasting declares ability, mode (none/full/half/third/pact/custom), explicit multiclass
contribution and rounding. Explicit per-level spell counts/slots and resource capacities represent
progression without computing a character. Pact resources remain separate from ordinary slots.
Each ordered level row has a stable ID, readable name, level 1–20, shared prerequisites/benefits/
choices, and program/resource references. Level rows are unique and strictly increasing, with
class level 1 required; multiple features at one level are ordered declarations in that row.
Subclasses pin a class dependency in the root flat closure and name its mechanic identity; validate
family, identity, start level and class acquisition schedule. Subclass rows may include later spell
progression levels between subclass feature levels. Custom schedules are explicit authored data,
not an assertion of official RAW; the standard initializer uses level 3. Optional pair conformance
compares a selected class version against the pinned parent, never names or a floating latest head.

Starting-class and multiclass-entry grants are separate declarative scopes, each reusing the
shared prerequisites/benefits/choices. Class saving throws describe starting-class proficiency;
multiclass entry does not implicitly grant them. Class levels, not total character level, govern
these rows. Subclass casting explicitly inherits/augments/replaces the pinned parent policy;
inherit/augment cannot silently add a second multiclass slot contribution. A casting subclass of
a noncaster supplies its own declared contribution exactly once; this is static authoring meaning.

Level resource capacities are absolute replacements bounded by the declared resource ceiling;
omitted capacities carry forward, not reset or add. A resource becomes available at its first
level binding. Program IDs grant availability once; reject duplicate grants and activation before
required resources exist or have enough declared capacity, including composed costs. Later growth
will consume this declaration; P08a validates the declaration without changing a character.

The class is independent of subclasses; subclasses point to the parent, avoiding an unavoidable
parent/child publication cycle. All shared benefit/prerequisite references remain closed. Resource
and program declarations use the same P06 validators; level bindings require existing stable IDs.
Choices may conditionally depend on other choices in the same declaration scope; parent choices
must precede children. Cross-level acquisition is a future composer responsibility, not prose logic.

Known invalid, unknown/unsupported and incompatible outer data are distinct. No validation mutates
input. A typed decode succeeds only on completely known valid content; every other outcome keeps
its original, and the portable codec retains exact source text. Old nine-family versions/copies
keep their schemas and behavior. Publication rejects known-invalid class/subclass declarations at
intent and commit boundaries while drafts and unsupported recovery remain preservable.

## Bounds and acceptance

Shared closure: root plus at most31 definitions, depth8; no nested dependency tables. Existing
JSON depth20/200000 UTF16 remains the template limit. The180000 UTF8/4096-node bound
remains specific to origin-build aggregates; it is not imposed on class templates. Complete class
library operation receipts are bounded at600000 UTF8/4096nodes, counting repeated snapshots. Class progression max20 rows; shared choices/options/benefits/programs/resources
retain32 bounds. Slots max9 levels; counts/capacities explicitly bounded. Cardinality does not
promise every maximum combination fits byte budgets. Test actual maximum legal compact data and
multibyte oversize rejection, preserving originals.

Primary families E18 (class/subclass progression and derivation contracts) and E19 (custom same
primitives/source/version). E05 covers resource declarations; E01–04/E06–09/E17 enter through shared
program/effect declarations. Relevant E10/E11/E21 policies remain authoring-only. Every case is
ordinary, boundary or composition, not a count-only claim.

Ordinary: both families at1/3/5, known typed decode, save/publish/read immutable versions and exact
portable roundtrip. Boundary: unordered/duplicate/out-of-range levels, missing first row, invalid
parent/wrong class/version, duplicate IDs, absent/cyclic dependencies/choice parents, unsupported
kind/field/future version, malformed outer recovery, maximum legal and oversize byte budgets.
Composition: conditional choices, shared pinned feature/spell dependencies, resources/program costs,
spellcasting and multiclass declarations; old nine-family and six-copy recovery regressions.

Use current optimized build, actual Google login through Auth Emulator, independent authenticated
SDK clients and server audit against explicit synthetic demo Firebase only. Existing Library
consultation/import/version/recovery surfaces are the UI scope. Do not invent a class editor to
fill a screenshot portfolio. If reader changes, display named progression and parent with exact
preserved unknowns, bilingual EN/IT, dark1440/1280/390; inspect every produced print page.
Keep commands, scripts, hashes and failed/green logs. SDK checks are not Google login, emulator
checks are not production equivalence (provider/AppCheck/IAM/index/transaction/hosting/PWA/device).
Independent spec/correctness and UI review, fresh just ci, applicable SRD/rules/six-fixture gates,
explicit hooked HEAD:v2, remote SHA proof and owned clean cleanup precede final successor.
PROGRAM_STATUS alone owns frontier/lease/gate/integration SHA; external HANDOFF owns evidence.

## Primary reference research

D&D Beyond 2024 Creating a Character (https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character)
distinguishes class-level spell preparation, combined spell-slot progression and Pact Magic.
Wizards homebrew subclass guidance
(https://dndbeyond-support.wizards.com/hc/en-us/articles/7747240870036-Making-Homebrew-Subclasses-Publishable)
uses parent-specific 2024 subclass feature schedules. These justify explicit parent/level/casting
fields; no copyrighted class tables are copied and no BG3 rules variant is imported.
