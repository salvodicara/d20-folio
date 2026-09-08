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

Unknown program, step and effect kinds retain their payload and receive unsupported diagnostics
without requiring fields or applying semantics belonging to a known kind. Program identity,
name/source and supplied instance-state exclusions remain checked. Known multiattack declarations
sum each referenced program's resource cost multiplied by its step count, plus any container cost,
separately for each resource. Totals exceeding template capacity are invalid at the multiattack
steps path. This is a static feasibility check, not resource consumption or recovery execution.

### P06 editor and recovery surfaces

The monster and campaign-rule forms consume the authoring descriptors, including ordered nested
program steps/effects, resource declarations, policies and dependencies. Unknown fields remain
visible in the common reader and every printable view, including collections unknown to the family.
Resource IDs use 1–128 ASCII letters, digits, underscores or hyphens because the same IDs address
prepared state. Invalid identities are diagnosed and never silently omitted during materialization.

The Bestiary reads current immutable monster versions from the same Library; it owns no catalogue
or persistence. Preparing a version and enabling a campaign rule create explicit authorized campaign
copies as described in `homebrew-preparation.md`. Changing a template never updates these copies.

Duplicate creates a fresh locally retained destination with the entire definition. Removing a saved
creation first archives its portable original in the account's existing import recovery list, verifies
storage readback, then atomically deletes only the head with its exact loaded base and immutable P03
receipt. Existing versions, granted copies, prepared copies and offers remain; revoke an offer
explicitly to stop future delivery. Recovering an archived original imports to a new destination.
A storage failure prevents deletion. Neither action deletes another account's data.

Declaration, prepared-copy, operation and recovery archive IDs use UUIDs. The repository randomness guard explicitly inventories these identity-only call sites; authoring never generates dice results.

Asynchronous acknowledgment cleanup rechecks the session ticket and the exact stored envelope, so an earlier operation cannot erase a later pending or invalidated operation.

Multiline notes, material descriptions, agreements and trigger explanations use textarea descriptors. Readers preserve line breaks and use full-width prose; named A4 print pages carry 12 mm margins on every continuation page.

Future authoring versions retain the creation name in the shared reader and printed output,
alongside the exact preserved payload; unsupported structure never removes its identifying title.

## P08a Library publication boundary

Class/subclass drafts remain preservable, but publication validates their known declarations at
both intent and commit boundaries. Invalid definitions cannot become newly published stable
versions through this repository; unknown declarations remain exact and explicitly unsupported.
The complete class Library receipt (including repeated loaded base and next definition) is limited
to600000 UTF-8 bytes/4096nodes before cloning or sending. The shared plain-JSON budget walker is
also used by the unchanged180000-byte origin-build wrapper; that aggregate limit is not a class
template limit. Definition depth20/200000UTF16 remains unchanged. Oversized operations fail with
the original draft/base intact; no truncation, automatic replay or new persistence path is added.

Offer intents check the final envelope after its immutable operation ID is populated, so a
boundary-sized offer cannot pass intent creation and then fail solely because that ID was added.

## P08b shared class composers

`OriginFields` accepts an optional `scope` (`starting`, `multiclass`, or `{levelId}`) for
class acquisition declarations. Without it, the existing root authoring route is used.
Each scoped change preserves the full root payload and unrelated acquisitions. Dependency
lookup always uses the real root flat included table, with one root-only version picker;
scoping never creates a second closure. Missing, malformed or ambiguous level scopes are
preserved without replacement controls. Choices and options retain stable identity keys;
choice parents are selected from earlier rows. Explicit move-earlier repairs ordering while
retaining references and unsupported values, which remain subject to shared conformance.

`AdvancedFields` accepts `guided` for the class editor. Resource and composed-program
bindings select named declarations while storing their stable IDs. Unresolved imported
references remain visible until explicitly changed. New program provenance defaults to
the creation name (or `homebrew` when unnamed); generated row identities are read-only
inside source-identity disclosure. The descriptor-driven renderer remains shared with
other families, and all edits preserve unknown sibling fields. This is template authoring,
not resource spending, character advancement or combat execution.

Library draft autosave now verifies exact local index/record readback before a send or retry and
again after attaching the full envelope. Throwing or silently dropped storage writes block sending
and retain the editable draft. A recovered unknown envelope is never retired by storage failure;
its original receipt identity must reconcile before new writes. Successful retention clears the
storage warning. The shared controller remains the only autosave authority for every family.
