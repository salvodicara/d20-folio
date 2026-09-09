# Character schema

The **stored shapes** of d20 Folio v2 — what a document contains, who owns its shape, and which
`firestore.rules` block enforces it. Read this before changing anything that is written, read,
imported or migrated. Every claim names the file that makes it true; where the code and a document
disagree, the code is recorded here and the disagreement is stated.

This document does **not** own how the system is built ([`ARCHITECTURE.md`](ARCHITECTURE.md)),
what the reducer executes ([`MECHANICS.md`](MECHANICS.md)), or why a structural choice was made
([`adr/`](adr/)). The v1 schema document is history at
[`archive/v1/CHARACTER_SCHEMA.md`](archive/v1/CHARACTER_SCHEMA.md); nothing in it is an
instruction.

## 1. The document map

| Document path                                                   | Owner module (shape)                              | `firestore.rules` block                            |
| --------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| `folioAccounts/{uid}`                                           | `src/lib/identity/model.ts` (`parseAccount`)      | `match /folioAccounts/{uid}`                       |
| `folioAccounts/{uid}/characters/{id}`                           | `src/lib/identity/model.ts` (`parseCharacter`)    | `match /folioAccounts/{uid}/characters/{id}`       |
| `…/characters/{id}/origins/build`                               | `src/lib/homebrew/origin-build.ts`                | `…/characters/{characterId}/origins/{buildId}`     |
| `…/characters/{id}/classes/build`                               | `src/lib/homebrew/class-build.ts`                 | `…/characters/{characterId}/classes/{buildId}`     |
| `…/characters/{id}/loadout/initial`                             | `src/lib/homebrew/instances.ts`                   | `…/characters/{characterId}/loadout/{loadoutId}`   |
| `…/characters/{id}/homebrew/{instanceId}`                       | `src/lib/homebrew/instances.ts`                   | `…/characters/{characterId}/homebrew/{instanceId}` |
| `…/characters/{id}/history/{revision}`                          | `firestore.rules` only (four keys)                | `…/characters/{id}/history/{entry}`                |
| `…/characters/{id}/private/{notes\|import}`                     | `src/lib/shared/model.ts` (`notePath`)            | `…/characters/{id}/private/{document}`             |
| `…/characters/{id}/reconciliation/import`                       | `src/lib/character-creation/import-repository.ts` | `…/characters/{id}/reconciliation/{document}`      |
| `folioAccounts/{uid}/operations/{opId}`                         | `src/lib/shared/model.ts` (`receiptPath`)         | `match /folioAccounts/{uid}/operations/{id}`       |
| `folioAccounts/{uid}/library/{id}` (+ `/versions/{version}`)    | `src/lib/library/model.ts` (`libraryPath`)        | `…/library/{id}`, `…/versions/{version}`           |
| `folioLibraryOffers/{id}`, `…/offers/{id}`, `…/receipts/{id}`   | `src/lib/library/model.ts`                        | the three matching blocks                          |
| `folioCampaigns/{id}` (+ `/roster/{row}`, `/dmNotes/main`)      | `src/lib/identity/model.ts` (`parseCampaign`)     | `match /folioCampaigns/{id}`                       |
| `folioInvites/{id}`                                             | `firestore.rules` only (three keys)               | `match /folioInvites/{id}`                         |
| `campaigns/{id}/encounters/live`                                | `src/lib/combat/codec.ts`                         | `match /campaigns/{campId}/encounters/{eid}`       |
| `users/{uid}` and `users/{uid}/characters/{charId}` (+ subdocs) | `src/lib/character-codec.ts`                      | the `users/**` blocks (§5)                         |

Path helpers are functions, never string literals at the call site: `characterPath`, `rosterId`
(`src/lib/identity/model.ts`), `notePath`, `receiptPath` (`src/lib/shared/model.ts`),
`instancePath`, `initialLoadoutPath` (`src/lib/homebrew/instances.ts`), `libraryPath`, `offerPath`
(`src/lib/library/model.ts`), `personalEncounterRef`, `liveTableRef` (`src/lib/combat-io.ts`,
`src/features/play/table/table-store.ts`). `identityId` constrains every segment to
`^[A-Za-z0-9_-]{1,128}$` and throws `invalid-id` otherwise.

## 2. The character parent

`FolioCharacter` (`src/lib/identity/model.ts`) is a **closed** eleven-key object; `parseCharacter`
throws `invalid-character` on any other key and returns a deep-frozen `structuredClone`:

```
schema: 1 · ownerUid · id · name (non-blank) · speciesId · classId
level: 1..20 · revision: >= 0 · currentAssignment: Assignment | null
sheet: { build: object, state: object } · portraitPath: string | null
```

- `Assignment` is exactly `{ campaignId, assignmentId, version >= 1 }` — three keys, no more.
- `portraitPath`, when set, must start with `characterPath(ref) + "/portraits/"`; the rules block
  repeats the same regex, so a client that skipped the parser still cannot point a portrait
  outside its own character.
- `sheet.build` and `sheet.state` are opaque maps to the identity layer. The rules block forbids
  free-text and log keys inside them: `build` may not carry `notes`, `lore`, `unknown`, `player`
  or `quote`; `state` may not carry `notes`, `unknown` or `log`. Private text lives in
  `private/notes`, which is not anonymously readable and never rides the parent.
- `revision` is a monotonic generation. The only allowed update diff is
  `['revision','currentAssignment']` with `revision == old + 1`, matched by a `history/{revision}`
  entry whose `operationId` names a landed `assignment` receipt. Assignment authority is
  explicitly owner-only — **an administrator client cannot reassign a character.**

**Assignment is reciprocal.** The parent's claim and the roster row
`folioCampaigns/{id}/roster/{ownerUid}~{characterId}` must agree exactly
(`{ownerUid, characterId, assignmentId, version}`), the campaign must be unarchived and contain
the owner, and the old claim must no longer be live. Both directions are enforced in the rules
(`reciprocal`, `reciprocalRow`, `oldClaimLive`), so a character cannot be in two campaigns and a
roster row cannot outlive its claim.

## 3. The creation aggregates and their receipts

Guided creation writes **five documents in one transaction** (`commit()` in
`src/lib/character-creation/repository.ts`; the transaction is described in
[`ARCHITECTURE.md`](ARCHITECTURE.md) §7 and in
[`character-creation-persistence.md`](character-creation-persistence.md)). This section owns their
shapes.

**`origins/build` — `OriginBuild`** (`src/lib/homebrew/origin-build.ts`):
`{ schema: 1, character: CharacterRef, revision, selections: Record<string, OriginSelection>, lastOperation: { uid, opId } }`.
An `OriginSelection` is `{ id, ordinal, snapshot: DefinitionSnapshot, resolvedChoices?, answers: Record<string, string[]>, exceptions: OriginException[] }`.
An `OriginException` (`path`, `code`, `reason`, `authorUid`) records an author's deliberate
deviation **as data**, never as prose to be re-read.

**`classes/build` — `ClassBuild`** (`src/lib/homebrew/class-build.ts`): the same envelope with
`acquisitions: Record<string, InitialClassAcquisition>`, an `OriginSelection` plus
`classLevel: 1`.

**`loadout/initial` — `InitialLoadout`** (`src/lib/homebrew/instances.ts`):
`{ schema: 1, character, revision, sources: Record<string, DefinitionSnapshot>, instances: Record<string, HomebrewInstance>, lastOperation }`.

**`operations/{opId}` — the receipt.** Every write path in v2 is an `Envelope`
(`src/lib/shared/model.ts`): `{ opId, uid, scope, baseRevision, authority }`, where `authority` is
`{ characterRevision, assignment, campaignRevision }`. A committed operation lands exactly
`{ operation, revision }` at `receiptPath(op)`; a retry re-reads the receipt and returns it
unchanged, so **every commit is idempotent by construction**. `reconcile()` reads the receipt from
the server (`getDocFromServer`) and returns `null` when the operation never landed — the only
supported way to learn the fate of an interrupted write.

Creation additionally proves, inside the transaction: the four target paths are absent
(`stale-base`), the account is not blocked (`users/{uid}.status`), and every cited
`LibraryVersion` is byte-equal to what is stored (`incompatible-source`). The candidate is capped
at **600,000 bytes / 16,384 nodes** by `assertJsonBudget` (`src/lib/shared/json-budget.ts`),
which also refuses cycles, non-plain prototypes and the keys `__proto__`, `prototype`,
`constructor`, `attachments`. Sibling budgets: instance operations 600,000/4,096
(`instance-repository.ts`), a single instance 180,000/4,096, a `ClassBuild` 180,000, an embedded
`sourceData` 200,000.

## 4. Library entries, versions and character-owned instances

`LibraryDefinition` (`src/lib/library/model.ts`) is one schema for all eleven `LIBRARY_FAMILIES`:
`{ schema: 1, family, name, description, tags, payload: { schema: 1, data } }`.

- **Template** — `LibraryEntry` at `folioAccounts/{uid}/library/{id}`: the mutable `draft`, plus
  `stableVersion`, `provenance | null`, `revision`, `lastOperation`.
- **Version** — `LibraryVersion` at `…/library/{id}/versions/{version}`, immutable:
  `{ schema: 1, ownerUid, entryId, version, definition, provenance, operationId }`.
- **Offer / grant** — `LibraryOffer` (schema 2, definition carried by value) at
  `folioLibraryOffers/{id}`; a `GrantReceipt` (schema 2) at
  `folioAccounts/{uid}/receipts/{grantId}` makes acceptance single-shot.
- **Character-owned copy** — `HomebrewInstance` at `…/characters/{id}/homebrew/{instanceId}`:
  `{ schema: 1, id, character, revision, snapshot, state, lastOperation }` where `state` is the
  closed five-key `InstanceState` `{ quantity, remainingCharges, prepared, equipped, attuned }`.
  The instance carries the **whole immutable snapshot**, so a later edit of the template never
  reaches a character sheet, and charges/preparation are never written back into the template
  ([`homebrew-instances.md`](homebrew-instances.md)).

A `snapshot` is a `DefinitionSnapshot` (`src/lib/homebrew/sources.ts`): either an owned
`LibraryVersion` or a `CatalogueSnapshot` (`kind: "catalogue"`, `schema`, `catalogue`, `release`,
`adapterVersion`, `entryId`, `definition`) — a catalogue snapshot has no owner, no publish
operation and no grant. Initial loadout items may additionally carry a `BundledSnapshot`
(`kind: "bundled"`, `sourceKey`, `dependencyPath`, `definition`) that resolves against the
loadout's own `sources` map. `sourceIdentity` collapses the two into one comparable key, and
creation refuses two different bytes for the same identity (`incompatible-source`).

## 5. The legacy `users/**` world, still live

Two Firestore worlds coexist on `v2` (`firestore.rules`; see
[`ARCHITECTURE.md`](ARCHITECTURE.md) §5). The legacy tree is **not** dormant data — it is read and
written by running code:

| Legacy document                              | Who still uses it on v2                                                                                      | Fate                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `users/{uid}`                                | `role` / `status` read by both rules files and the client admin gate; creation reads `status` before writing | stays until the identity trees are unified |
| `users/{uid}/characters/{charId}`            | the v3 codec's parent (`src/lib/character-codec.ts`), the v1 shell                                           | superseded by `folioAccounts/**`           |
| `…/characters/{charId}/combat/state`         | `personalEncounterRef` (`src/lib/combat-io.ts`) + `src/lib/combat-state-writeback.ts`                        | **deleted, not migrated, at P11b**         |
| `…/characters/{charId}/snapshots/{snapId}`   | `src/lib/character-snapshot-reconciler.ts`                                                                   | superseded with the parent                 |
| `…/characters/{charId}/public/sheet`         | the share projection (§8)                                                                                    | legacy surface, see §8                     |
| `campaigns/{campId}` and `…/encounters/live` | the live table — the **current** shared-play seam, not legacy                                                | moves with the identity unification        |

The personal `combat/state` document still holds a legacy `CombatState`, not an `Encounter`:
`combat-state-writeback.ts` projects the folded entity's HP, temporary HP, conditions and death
saves over it and preserves every other field verbatim. Its own header names its fate. Six keys
from deleted writers may still be present and are shed fail-safe on the next full overwrite —
`SHED_COMBAT_STATE_KEYS` in `src/lib/combat-state-codec.ts`: `initiativeEpoch`, `actionRevision`,
`actionHead`, `actionLifecycles`, `effectLifecycles`, `effectOps`. The codec-loss audit classifies
their disappearance as `conformed`, never as loss.

The shared encounter document `campaigns/{id}/encounters/live` is owned by
`src/lib/combat/codec.ts` and described in [`ARCHITECTURE.md`](ARCHITECTURE.md) §4 and §9 (append
via `arrayUnion`, `logOnlyGrew()` prefix proof, the 1,000-entry cap). It is not repeated here.

## 6. The codec (implementation contract)

`src/lib/character-codec.ts` is the **v3 portable-character codec** — the single supported
import/export format, and the reader for the legacy parent. A stored or exported character is
`{ schema: 3, build, state, meta? }`:

- `build` — the definition: explicit choices, genuine customs and manual overrides, **id-based**
  (species/class/subclass/background/alignment are stable ids, never display strings). Everything a
  2024 grant determines is dropped and re-derived on read.
- `state` — the play moment: only non-default vitals, currency, spent resources, conditions, log.
- `meta` — optional `{ portrait }`.

**Closed world, no upgrade-on-read.** A document without `schema`, with `schema < 3` or
`schema > 3` is rejected; the pre-v3 sentinel `SCHEMA_2_REJECTED_REASON` maps to the friendly
import copy. The writer always emits schema 3.

**Totality is structural.** Every collection is total: the reader never skips an element and never
trims an unknown key.

1. **Unknown-key preservation.** Unknown `build` keys, unknown `state` keys and unknown keys on
   every entry — spells, weapons, equipment, features and `build.classes[]` — are preserved
   verbatim in an `unknown` bucket and written back spread **last**, so a canonical document's
   bytes are unchanged and a future document round-trips byte-identically.
   Invariant: `serialize(parse(x)) === x` for any v3 `x`.
2. **Quarantine, never skip.** A structurally malformed element quarantines the whole document
   with a typed `CodecFailure` `{ code, path }` (`src/lib/codec-failure.ts`), which reaches
   `parseStoredCharacter` → the subscription quarantine → diagnostics. A shorter array or map can
   never be written back over a live user's data.
3. **`instanceId` is identity.** Every custom entry (`CustomSpell`, custom weapon, equipment,
   feature — `src/types/character.ts`) carries a stable `instanceId`, serialized last; nothing is
   ever keyed by display name (golden rule 7). A malformed `instanceId` on a custom entry fails the
   document; the _reference_ read stays deliberately tolerant (see seam list below).

**The remaining non-total seams.** Totality is structural, so a small, enumerated set of
value-level one-way read normalizations remains. They are code, not prose:
`CODEC_READ_SEAMS` at the end of `src/lib/character-codec.ts` lists each as `{ seam, pattern }` —
`retired-state-round`, `retired-override-labels`, `initiative-advantage-legacy-boolean`,
`proficiency-override-key-conform`, `tracker-id-conform`, `concentration-ref-conform`,
`log-entry-normalize`, `unit-non-token` — plus the tolerant `instanceId` read, top-level envelope
keys outside `{ schema, build, state, meta }`, and the compact `state` map's absence-defaulting
scalar readers. The audit classifies a round-trip change on one of these paths as `conformed`;
any other change is a **loss**. Adding a seam is a documented decision that needs a negative test,
never a way to silence a finding.

The combat codec `src/lib/combat/codec.ts` follows the same discipline for the encounter document
(mirror `mechanic.ts` field for field; unknown step kind, trigger or action kind quarantines;
top-level unknown keys preserved under `Encounter.unknown`, stored-value-wins on compaction).

## 7. Validation set and the migration protocol

**The validation set is the six team fixtures** — one each for the barbarian, bard, monk, paladin,
rogue and wizard roles. They live in the private content pack (`content-pack/fixtures/team`,
composed through the gitignored symlink) because the stored names are personal data; the public
tree derives the expected strings at runtime and skips when the pack is absent
(`tests/e2e/team-fixture.ts`). They are **verification fixtures, never production data** (domain
rule D7); `MOCK_CHARACTER` remains the only production mock. Any schema, derived-value or
stored-string change validates against all six.

**The migration protocol (ADR-0009)** — [`adr/0009-migrate-before-deploy.md`](adr/0009-migrate-before-deploy.md):
a deploy that reads a new persisted shape is preceded, in the same release, by a migration run
under **snapshot → dry-run → idempotent apply → verify**, with rollback = restore. Compatibility
readers are allowed only between the migration and that deploy, then deleted (golden rule 10).
The shared half of the protocol is `scripts/lib/migration-kit.ts`: read-only by default, `--check`
proves the corpus migrated, and the only write mode is
`--apply --backup /absolute/fresh/private/directory` — complete preflight, recoverable backup, at
most 500 update-time-guarded writes in one atomic batch, then re-read, hash and idempotency
verification. Every printed line carries counts, hashes and issue codes: never a payload, never a
raw path, never a uid (paths leave the process only as `pathHash`).

**The dry-run for codec change is `scripts/audit-codec-loss.ts`** — the stage-0 audit that proves
the closed-world codecs lose nothing over the six fixtures and over a production export. Modes:
`--fixtures` (byte identity on portable exports), `--backup` (a tagged migration-kit directory),
`--export` (read production with a service account into a fresh private directory, then audit).
It classifies each document as `parent`, `snapshot`, `combat-state` or `library`
(`scripts/lib/codec-loss-audit.ts`) and returns `byte-identical`, `equal`, `conformed`, `loss` or
`quarantine`; it exits non-zero on any loss or quarantine, and refuses to run when the content
pack is not composed (a pack-only id would otherwise read as unknown and report as loss).

On `v2` no migration script exists and none runs: the P1 migrations belong to `main`, which
deletes its own copies after the run (ADR-0009 amendment, 2026-09-03). Deploy, migration and
cutover are P29/P30 in [`program/PROGRAM.md`](program/PROGRAM.md).

## 8. Public share links — legacy shape

The stored shape still exists in the tree and in the deployed rules, but it belongs to the v1
shell, which is **not the mounted shell on v2** ([`ARCHITECTURE.md`](ARCHITECTURE.md) §8):

- `CharacterDoc.shared: boolean` (`src/types/character.ts`) is the publication decision —
  Firestore metadata, deliberately **not** part of the portable v3 codec, so an export or import
  can never publish a copy. Absence means `false`.
- While `shared` is true the owner publishes a sanitized projection at
  `users/{uid}/characters/{charId}/public/sheet`, addressed by `/view/{uid}/{charId}`. The
  projection is a closed key set — `publicSchema`, `schema`, `build`, `cache`, `status`,
  `hasPortrait`, `portraitCrop`, `sourceUpdatedAt` (`src/lib/public-character-projection.ts`,
  `PUBLIC_CHARACTER_SCHEMA = 1`) — and the rules require it to be **exactly** the projection of the
  current parent (`isExactPublicCharacterSheet`). The private parent is never anonymously
  readable, and revoking or deleting the parent is the only condition under which the projection
  may be deleted.

Nothing on the v2 shell publishes or reads it today; the v2 sharing surface is a product decision
that has not been taken (`program/PROGRAM.md`). Treat this section as the shape to honour if it is
carried forward, not as a v2 feature.

## 9. Rules of thumb

1. **Parse on read, closed key sets.** A new stored field is added to the parser, the rules block
   and this document in the same change, or it will be rejected as an unknown key.
2. **The path is a function.** Never build a document path by string concatenation at a call site.
3. **No display strings as identity** (golden rule 7): ids and `instanceId`, never names.
4. **Never trim on read.** Preserve the unknown, or quarantine — never silently shorten.
5. **Every write is an operation with a receipt**, so a retry after a lost connection is safe.
6. **A shape change is a migration** (ADR-0009) and validates against the six fixtures before it
   is anywhere near a deploy.
