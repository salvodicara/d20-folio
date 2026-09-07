# P05 — Base homebrew authoring

## Binding intent and scope

Astra owns this new V2 application: approved Astra full-lab 0.9.3 plus shell r2 are the
binding experience, with complete transferable BG3 organization/feedback and useful Beyond/
Roll20 capabilities. D&D 2024 governs rules. Existing code is evidence, never an obligation
of compatibility. No legacy combat bridge, second runtime, engine execution, P06–08 families,
P10/P11 wizard, P24 transfers, deployment, production data or implicit cost.
The owner has authorized autonomous design and implementation within this explicit scope;
minor technical decisions do not reopen product approval. Actual runtime screenshot approval
and explicit V2 integration remain separate gates. P04 approval is not P05 approval.

## Chosen architecture

Extend the P04 definition payload and existing draft controller, repository and immutable
versions. Do not add a custom-content store or a write queue. Define a small, explicitly
versioned authoring vocabulary in src/lib/homebrew/model.ts; keep conformance pure and
separate from future execution. A field schema shared by family forms and readable output
provides localized labels without deriving mechanics from prose. Dedicated family types
and cross-field validation carry semantics; common controls only render them.

Alternatives rejected: importing the legacy combat authoring runtime would establish an
unapproved bridge; separate four-family repositories would duplicate P03/P04 authority.
A universal scripting language exceeds P05 and cannot honestly establish conformance.

## Vocabulary and conformance

Payload data carries authoringVersion=1, edition=2024, source and sourceVersion, plus the
family fields. Empty P04 payloads are unconfigured, preserved until explicit initialization;
nonempty unrecognized payloads remain recoverable and never silently overwritten.
Unknown keys/versions and unsupported constructs survive import, autosave, versions and
export exactly at the JSON-value level; original file bytes are retained for exact recovery.
Conformance reports path, stable diagnostic code and severity (invalid/unsupported).
Authoring conformance means representation and dependencies validated, never engine support.
Unsupported content may remain stored/shared as explicitly unsupported, but never appears
mechanically executable. Malformed/incomplete typed data stays a draft and cannot be reused.

- Weapon: simple/martial, melee/ranged, damage formula/type, versatile formula, reach,
  normal/long range, weight/cost, mastery and typed properties, attack/damage bonus.
- Equipment: category, weight/cost, rarity, attunement, armor base/Dex policy/cap/shield bonus,
  consumable flag, maximum charges and typed full/partial recovery boundary/formula.
- Spell: level/school, action/bonus/reaction/time activation, reaction condition, range kind/
  distance, duration/clock/concentration, ritual, V/S/M/material/cost/consumption, attack or
  saving throw and ability/DC policy, ordered damage/healing/temporary-HP/condition effects,
  upcast formula and declared dependency; no slot expenditure or effects execute here.
- Feature: acquisition level, passive/action/bonus/reaction activation and condition, ability,
  maximum uses/recovery, frequency boundary, prerequisites and ordered typed effects.
- Common effects: finite ordered records identifying kind, formula, damage/condition type,
  target and resolution gate. Distinguish raw descriptions and unsupported declarations;
  no eval, recursion, prose parsing or wall-clock mechanics.

Sources: official 2024 Basic Rules equipment and spells pages (read 2026-09-07), SRD5.2.1
licensing partition, and full-lab RULES-EXCEPTION-CATALOG. Source/version is author-supplied
provenance, not a certification that a custom design is official RAW. Public fixtures are
synthetic; non-SRD prose/private pack data never enters public source or evidence.

## E families named before implementation

| Family                                   | Owner files                       | Ordinary                      | Boundary                                                          | Composition / explicit limits                                                     |
| ---------------------------------------- | --------------------------------- | ----------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Weapon: E03/E10/E11/E19                  | homebrew/model.ts, conformance.ts | melee damage and mastery      | long range below normal rejected; versatile dependency            | weapon damage plus typed rider; no attack resolution                              |
| Equipment: E05/E11/E18/E19               | same                              | armor defense or charged item | partial recovery above capacity, incompatible armor/Dex settings  | charges plus healing effect; remaining charges stay instance-owned                |
| Spell: E06/E08/E11/E12/E13/E14/E17/E19   | same                              | save-gated damage, V/S/M      | consumed material requires material; concentration needs duration | area/concentration plus ordered effects/scaling; no Counterspell/tempHP execution |
| Feature: E04/E05/E07/E08/E10/E18/E19/E21 | same                              | limited-use active effect     | passive resource cost, missing trigger/invalid prerequisite       | frequency plus resource recovery and condition; event execution remains P14       |

E01/E02/E09/E15/E16/E20/E22 constructs outside these representations remain explicit
unsupported declarations, not inferred handlers. P14a retains Counterspell and tempHP
regression fixes; P14a/b/c retain full ordinary/boundary/composition execution receipts/undo.

## Character reuse and authority

A character-owned subcollection `folioAccounts/{uid}/characters/{id}/homebrew/{instanceId}`
materializes an explicit owned stable LibraryVersion together with its immutable provenance.
It is the sole authority for these new instances; imported legacy sheet grammar is unchanged.
The snapshot serves authorized DM inspection without reading another owner's private library.
The instance carries id, character ref, revision, stable version snapshot and separate state
(quantity, remainingCharges, prepared, equipped, attuned). Templates never contain those states.
Adding/updating consumes P03 Envelope/OperationController and immutable operation receipts.
Commit compares character revision/current assignment and exact old instance revision,
verifies the selected immutable version, and writes only the addressed owner instance.
Updates require explicit comparison, retain state exactly, and report capacity mismatch
without clamping/refilling. Sender/admin cannot create recipient consent or peer writes.
DM/member read uses current character/roster ACL; their writes are denied. Auth/scope tickets
fence late callbacks and A→B→A. No automatic retry on reconnect or silent refresh update.
P04 offer→recipient acceptance→library materialization remains the only sharing path.

## Experience and portable documents

Retain shelf/selection and shell r2, narrow shelf plus spacious two-column family fields,
single-column phone, labelled inputs and canonical Checkbox, grouped family details, inline validation.
Use the existing loaded-draft autosave state; show local/offline/pending/unknown/conflict and
preserve edits. Reuse chooses a character and stable version, compares existing copies, then
explicitly materializes. Sheet shows the same typed reader, source/version and instance state.
Import accepts a portable version envelope or plain P04 definition, validates without mutation,
shows preview, then explicitly creates a new local draft in the same controller. Incompatible
input and original text remain downloadable after reopening; no silent lossy conversion.
Export distinguishes draft from recorded version and preserves typed data/source/provenance.
Print uses the shared readable presenter, paper CSS and source/version; inspect actual PDF
output for each family including long text. All UI strings EN/IT through i18n.

## Verification and gates

TDD for codec/conformance, draft roundtrip, state-preserving updates and adversarial ACL/IO.
For each family: UI create/edit/autosave/reload/version, sheet reuse, explicit version update,
import/export roundtrip and inspected print. Real optimized build, Google login through demo
Auth provider, independent sender/recipient/DM, real Firestore/rules. For each family exercise
addressed offer→explicit acceptance→single materialization with provenance/receipt; revoke
before/after, duplicate/retry, concurrency, response lost after real commit, offline and scope
invalidation. Audit final stored definitions, instances, versions, grants and exact receipts.
Retain failed attempts and reproducible scripts, fixture IDs, commands and source/build hashes.
EN/IT dark at 1440×900,1280×800,390×844; compare actual editor images against specific mock.
Run just ci, full demo rules on a separate owned cluster, six private copy migration fixtures;
ci-srd-only if public/private seam changes. Independent code/spec and actual visual review.
Record emulator/index/provider/AppCheck/IAM/hosting/HTTPS/installed-PWA gaps honestly.
PROGRAM_STATUS alone owns frontier/gates/SHA; external HANDOFF owns replay evidence.
Only after owner screenshots and explicit integration: fresh fetch/rebase, gates, hooked
HEAD:v2, remote SHA proof, remove only owned clean worktrees. No main push/PR/deploy/P06.
