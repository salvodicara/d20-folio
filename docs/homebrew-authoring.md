# Base homebrew authoring vocabulary

P05 extends the P04 `LibraryDefinition.payload.data` in the new V2 app. This document owns
the representation; execution remains future P14 work. PRODUCT owns the binding requirement
“Homebrew automation and editable combat”: these declarations must feed the shared combat
automation, and in-use state/effects must remain explicitly editable with causal correction.
The current finite vocabulary is extensible; conformance alone is not execution acceptance. The module imports no legacy engine.
`model.ts` exports discriminated weapon, equipment, spell and feature data, common ordered
effects, and field descriptors consumed by both editor and reader. Templates contain no
quantity, remaining charges, prepared, equipped or attuned state.

An explicit initialization action creates authoringVersion 1, edition `2024`, author-supplied
source/sourceVersion/mechanicId and family fields. It does not claim the source is official
RAW. Existing empty P04 payloads stay unconfigured; unknown keys, declarations and authoring
versions survive unchanged and produce unsupported diagnostics. Description and tableNote
are prose only. Conformance is representation/dependency validation, never engine support.

The finite formula language accepts nonnegative constants through 100000, or 1–100 dice with
2–1000 sides followed by an optional +/- constant through 100000. It calculates mathematical
bounds only. No random draw, eval, scripts, prose parsing, nested programs or effect execution
exists. Damage/healing (including versatile weapon damage) and recovery reject negative minima;
a zero minimum remains representable. Effects have an explicit ordered
kind, formula, damage/condition type, target, resolution gate, duration, stacking declaration
and source identity. There is a maximum of 32 effects. Stacking and frequency describe intent;
they do not implement event mechanics, Counterspell or temporary-HP replacement.

Weapon representation includes simple/martial and melee/ranged distinctions, mastery,
properties, reach and ordered normal/long range, versatile dependencies and modifiers.
Equipment separates armor/Dex policy and shields, and validates bounded charge recovery.
Spells declare components, activation/reaction, target area, duration/concentration, resolution
and scaling dependency. Features declare acquisition and prerequisite level/ability,
frequency, activation and recoverable resources. Cross-field incompatibilities have stable
path/code/severity diagnostics. Invalid definitions remain drafts and must not be reused.
Unsupported definitions can be preserved but must be visibly identified as unsupported.

Portable schema 1 records `format: d20-folio-homebrew`, draft/stable kind, definition and full
stable LibraryVersion (or null for draft). Stable export refuses a definition different from
its version snapshot. Decode accepts this envelope or a plain P04 definition and does not
mutate storage. Success and failure both return the exact input text; the import controller
must persist that text for original recovery after reopening. Unknown payload JSON roundtrips;
malformed outer envelopes are recovery-only. A portable provenance claim is untrusted import
metadata, not authorization to another owner's library or proof of an issued receipt.

Verification: `tests/unit/homebrew-authoring.test.ts` covers ordinary, boundary and composition
cases for each family, formula limits, unchanged unknown data, effects order, draft/stable
snapshots and malformed provenance. Integration, runtime visual approval and P14 execution
acceptance are separate gates owned by the parent P05 program.

Unknown authoring versions still validate the universal nonempty name and template-state
exclusion. Unsupported version metadata cannot turn a malformed draft into a reusable template.

All physical distances in this vocabulary use **meters**: weapon reach and normal/long range,
and spell range distance and area size. Fractional distances are supported (the standard
weapon reach initializes to 1.5 m); the form, reader and portable JSON share the same units.
Levels, durations, ability scores, resource counts and other discrete fields remain integers.
Existing stored distances are never rescaled or migrated implicitly.

Character-instance add/update intents and commits both reject invalid conformance at the
repository boundary, including structurally valid but unconfigured P04 snapshots. Unknown
unsupported authoring remains preservable. Existing copies may still edit their personal
state even when the old definition is invalid; this does not execute or replace its mechanics.

## P06 monster and campaign-rule declarations

`AUTHORING_FAMILIES` and `AuthoringFamily` extend initialization/conformance to monsters and
campaign rules. `BASE_FAMILIES` and `BaseFamily` deliberately retain the four P05 character
instance families. `authoringFields` exposes shared scalar fields. `advancedCollections` returns
bounded collection descriptors (`key`, `kind`, `max`, `fields`, optional nested `collections`);
`advancedRowFields` and `blankAdvancedRow` expose the same vocabulary to editors/readers. Blank
rows require explicit stable identities/names. Initialization never replaces an existing payload.

Monsters declare AC, maximum HP/formula, fractional CR, initiative, six scores/save bonuses,
movement and senses in meters, languages, defenses and skill bonuses. Both families declare up to
32 resources and 32 programs. Programs declare action/trait/bonus/reaction/legendary/lair semantics,
attack/save parameters, ranges/area, finite event triggers, frequency, resource costs and up to
32 ordered P05 effects. Multiattack references at most 16 ordered programs, with positive counts;
nested/self-referencing multiattack is invalid. Resources declare capacity and recovery, including
an explicit turn-start d6 recharge threshold; templates carry no remaining resource state.
Campaign rules declare domain, explicit narrative/typed application, replacement identity,
agreement and priority, typed fact policies and required/conflicting mechanic dependencies.
Dependencies on other mechanic IDs are resolved by the active campaign reader, not by isolated
definition conformance. They do not authorize or silently execute replacement.

Validation reports exact nested paths for duplicate IDs, dangling program/resource references,
cost/capacity and recharge mismatch, negative formula minima, missing save/area requirements,
and unknown keys/options. All unknown JSON remains untouched through the existing portable codec,
including the exact imported original text. Invalid data remains draft; unsupported data is
preserved and diagnosed without claiming execution. `tests/unit/homebrew-advanced.test.ts`
covers ordinary, boundary and composed attacks/resources/save effects/rules and portable recovery.

This is authoring/conformance, not P14 combat execution. Custom and official mechanics must use
the same future engine for costs, effects, reactions, consequences and receipts. During combat,
authoritative in-use facts remain editable with causal correction/undo and provenance. Changing
a template version never silently changes an in-use copy; preparation state is separate. Future
play acceptance must demonstrate actual custom automation and edits/undo in ordinary, boundary
and composition cases rather than substituting manual handling for modeled mechanics.
