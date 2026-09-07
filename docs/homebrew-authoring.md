# Base homebrew authoring vocabulary

P05 extends the P04 `LibraryDefinition.payload.data` in the new V2 app. This document owns
the representation; execution remains future P14 work. The module imports no legacy engine.
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
exists. Damage/healing and recovery reject negative minima. Effects have an explicit ordered
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
