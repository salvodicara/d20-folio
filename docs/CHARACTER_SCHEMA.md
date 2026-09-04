# The Locked Character Document Schema (v3)

> Owner-locked 2026-06-08; bumped to **v3** for the R4 multiclass model (2026-06-09).
> The **single source of truth** for what a stored / exported character document contains.
> Designed to be **minimal** (only choices, customs, overrides), **id-based** (never display
> strings), and **forward-compatible forever**. The in-memory `CharacterData` / `SessionState`
> (`src/types/character.ts`) are unchanged in spirit — this is the _serialized_ shape; the codec
> maps between them.
>
> **R4 (v3):** a character is a multiclass-ready ARRAY of class entries —
> `build.classes: ClassEntry[]` (single-class = a one-entry array). The old single-class
> `build.class` / `subclass` / `level` fields **and** the root `build.picks` map are GONE; ids live
> on each entry.
> The app codec is **schema-3 ONLY**: a pre-v3 file is REJECTED with a friendly message (no
> upgrade-on-read in app code — owner directive 2026-06-09). The v2→v3 migration of live data is
> COMPLETE (every stored doc is schema-3 with `classes[]`), so there is no read-time legacy shim —
> the graceful pre-v3 import rejection is the only transitional seam (see "The codec" below).

## Principles (non-negotiable)

1. **Store only what can't be computed** — explicit player CHOICES, genuine CUSTOMS (homebrew),
   and manual OVERRIDES. Everything a 2024 grant determines (saves, hit die, spell slots, the
   spellcasting block, class/subclass/origin features, granted languages/tools, derived speed) is
   DROPPED and re-derived on read.
2. **IDs are the only source of truth** — `race`/`class`/`subclass`/`background`/`alignment` are
   stable ids, never localized display strings.
3. **`build` vs `state`** — `build` is the character definition; `state` is the play-moment to
   rebuild exactly (vitals, currency, spent resources, conditions, log). Nothing redundant.
4. **Versioned + SINGLE format, no legacy branches in app code** — every doc carries `schema`.
   **v3 is the ONLY supported format.** `parseCharacter` accepts `schema: 3`; a schema `< 3` file is
   REJECTED with the stable sentinel `"schema-2-unsupported"` (the import UI shows "old format — ask
   your campaign owner for a regenerated file", EN+IT). There is NO upgrade-on-read (owner directive
   2026-06-09: a superseded format is removed COMPLETELY, never a permanent read shim). The v2→v3
   migration of live data is COMPLETE (every stored doc is schema-3), so the only transitional seam
   is the graceful pre-v3 import REJECTION at the untrusted-input boundary — a pasted old export
   never crashes, it is told to ask for a regenerated file. The reader **preserves** unknown fields
   verbatim (`unknown` buckets on the character, the session and every entry) and writes them back;
   a structurally malformed element **quarantines** the document with a typed code plus path
   (`parseCharacterEnvelope` → `ok: false`), never a silent drop. **Missing optional fields** still
   default, and the writer always emits the latest `schema` — so v3 evolves additively. When optimal
   modeling instead demands a NON-additive format change, the live data is MIGRATED forward
   autonomously under rule 22's snapshot-verify net, then the old shape is deleted entirely
   (rule 10) — backward compatibility is never a goal.

## Envelope

```jsonc
{
  "schema": 3, // integer; the app codec accepts ONLY schema 3 (older → rejected)
  "build": {
    /* … */
  }, // choices + customs + overrides (id-based, minimal)
  "state": {
    /* … */
  }, // the exported play-moment (only non-default values)
  "meta": {
    "portrait": "<dataURL>",
    "portraitCrop": { "x": 0, "y": 0, "width": 100, "height": 100 },
  }, // OPTIONAL: the portrait image (base64 data URL — embedded for portability) + its framing crop (percentages 0–100, the `PortraitCrop` shape). Omitted entirely when there is no portrait.
}
```

No `_meta.exportedAt` (it changes every export and broke byte-identity), no root `name`/`summary`
(derived), no `status` (defaults `active`).

### The Firestore document == the same envelope + metadata (ONE codec)

The **stored Firestore character document is the SAME `{ schema, build, state }` envelope as the
export** (no portrait `meta` — Firestore keeps the portrait as a Storage URL), plus Firestore-only
metadata. One codec (`serializeCharacterEnvelope`/`parseCharacterEnvelope` in `character-codec.ts`, the
shared core of `serializeCharacter`/`parseCharacter`) serializes/parses both, so the persisted and
exported forms can never drift. One P1 difference: in Firestore the parent `state` is ALWAYS `{}` —
the whole mutable play session lives in `combat/state.playState` (design §5.3), and the self-contained
portable export still carries it inline:

```jsonc
{
  "schema": 3,
  "build": {
    /* … */
  },
  "state": {}, // ALWAYS {} in Firestore: the play session is
  //   `combat/state.playState`. The portable EXPORT still
  //   carries the compact session here. A stored parent that
  //   still holds one quarantines as `parent-state-not-empty`
  //   (`firestore.rules` denies the write too).
  "attachedCampaignId": "<campId>", // The ONE-campaign claim (written atomically by the
  //   attach transaction) — ALSO the cross-user access root:
  //   firestore.rules derives every peer/DM grant LIVE from it
  //   + the campaign roster. NOT in the export/codec; absent =
  //   unattached (owner/admin-only access).
  "lease": { "campaignId": "<campId>", "encounterId": "<encId>", "epoch": 0 }, // v2 §5.2:
  //   which campaign ENCOUNTER (if any) currently owns this PC's
  //   live combat facts — distinct from `attachedCampaignId` (the
  //   standing one-campaign claim). Owner-written only: set by the
  //   owner's client on `table:join`, cleared on `table:leave`/
  //   `table:sync` (`src/lib/combat-lease.ts`). NOT in the
  //   export/codec; absent = not leased, the personal aggregate is
  //   authoritative for this PC's combat facts.
  "cache": {
    // SRD-FREE roster/party projection (a derived snapshot the
    "name": "…",
    "ac": 16,
    "hpMax": 24, //   roster list reads WITHOUT rehydrating — keeps the SRD
    "speed": "30",
    "raceId": "elf", //   corpus off the eager bundle). Stamped on every full save
    "classes": [
      /* ClassEntry[] */
    ], //   via buildCharacterCache (effective AC + hp.max + …).
  },
  "portraitUrl": null,
  "portraitCrop": null,
  "shareId": null,
  "revision": 0, // REQUIRED non-negative integer — the parent's compare-and-set
  //   generation. Born 0; every build/state/cache write carries
  //   exactly revision + 1 and a metadata-only write leaves it
  //   alone (firestore.rules `revisionAdvancesWithBuild`). NOT in
  //   the export/codec: it is a per-document write fence, not a
  //   character fact. See ARCHITECTURE → "Per-domain reconciliation".
  "status": "active",
  "createdAt": "<ts>",
  "updatedAt": "<ts>",
}
```

The roster list reads ONLY `cache` (SRD-free); the cockpit + the DM read-only viewer parse `{ build,
state }` through the codec (lazy SRD). See `docs/ARCHITECTURE.md` → "Unified persistence codec" for the
read/write seams. The persistence layer reads ONLY the unified shape — there is no transitional
read-shim (the migration converted every live main doc + snapshot; golden rule 10).

## `build` — the character definition

| Key                       | Type                                            | Notes                                                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                    | string                                          | the character's name (a choice)                                                                                                                                                                           |
| `player`                  | string?                                         | player name; omit when empty                                                                                                                                                                              |
| `race`                    | id                                              | e.g. `"human"` (not `"Human"`)                                                                                                                                                                            |
| `classes`                 | `ClassEntry[]`                                  | **R4** — one entry per class (single-class = length 1); see below                                                                                                                                         |
| `background`              | id                                              | e.g. `"wayfarer"`                                                                                                                                                                                         |
| `alignment`               | id?                                             | e.g. `"true-neutral"`; omit when unset                                                                                                                                                                    |
| `abilities`               | `{STR,DEX,CON,INT,WIS,CHA}`                     | the chosen base scores                                                                                                                                                                                    |
| `asi`                     | `{ background?: {AB:n} }`                       | the 2024 background ability increases                                                                                                                                                                     |
| `originFeats`             | `{ background?: id, species?: id }`             | only the CHOSEN ones (a fixed-background feat is inferred)                                                                                                                                                |
| `skills`                  | `{ id: "proficient"\|"expertise" }`             | chosen proficiencies; JoaT half-profs are NEVER stored                                                                                                                                                    |
| `toolChoices`             | `{ "<src>::tool-slot-N": id[] }`?               | tool-CHOICE picks as STABLE TOOL IDS (see below); omit when none                                                                                                                                          |
| `languageIds`             | `id[]`?                                         | MANUAL language picks as STABLE SRD ids (see below); omit empty                                                                                                                                           |
| `customLanguages`         | `string[]`?                                     | homebrew languages, VERBATIM label; omit empty                                                                                                                                                            |
| `toolProficiencyIds`      | `id[]`?                                         | MANUAL tool picks as STABLE tool ids (see below); omit empty                                                                                                                                              |
| `customToolProficiencies` | `string[]`?                                     | homebrew tool profs, VERBATIM label; omit empty                                                                                                                                                           |
| `spells`                  | `[ id \| custom ]`                              | only player-chosen / non-inferred spells; custom entries carry a required stable `instanceId`                                                                                                             |
| `weapons`                 | `[ {id, qty, …} \| custom ]`                    | owned weapons (Talon is the one custom); custom entries carry a required stable `instanceId`                                                                                                              |
| `equipment`               | `[ {id, instanceId?, …} \| custom ]`            | owned gear / armor / magic items; every independently mutable physical magic-item copy carries a stable opaque `instanceId` (optional on an SRD ref); custom entries carry a REQUIRED stable `instanceId` |
| `features`                | `[ { srdId, notes?, actionOverrides?, … } ]`?   | chosen SRD refs and inferred-feature overrides; a bare inferred ref is omitted, but user data is preserved and merged on rehydrate                                                                        |
| `customs`                 | `{ features?: [...], conditions?: [...] }`      | genuine homebrew only; custom actions may carry stable ids, dynamic targeting, healing, Temporary HP and condition removal; `customs.features` entries carry a required stable `instanceId`               |
| `overrides`               | `{ ac?, speed?, proficiencyBonus?, saves?, … }` | manual deltas; only when set (`speed` = the effective-walking-Speed override; NO `languages`/`tools` strings)                                                                                             |
| `lore`                    | `{ traits?, ideals?, … }`                       | flavor; only non-empty fields                                                                                                                                                                             |
| `quote`                   | string?                                         | omit when empty                                                                                                                                                                                           |

### `ClassEntry` (R4 — the multiclass breakdown)

`build.classes` is an array of class entries — the SOLE source of truth for which classes /
subclasses / levels a character has. Single-class = a one-entry array; multiclass = one entry per
class. The class-scoped open picks live ON the owning entry (not a root `picks` map).

| Key                 | Type    | Notes                                                        |
| ------------------- | ------- | ------------------------------------------------------------ |
| `classId`           | id      | REQUIRED, e.g. `"wizard"`. No display string is stored.      |
| `subclassId`        | id?     | e.g. `"college-of-lore"`; omit before the subclass level.    |
| `level`             | int     | levels IN THIS class (≥ 1).                                  |
| `weaponMasteries`   | `id[]`? | Weapon Mastery picks chosen for THIS class; omit when empty. |
| `metamagicChoices`  | `id[]`? | Sorcerer metamagic; omit when empty.                         |
| `invocationChoices` | `id[]`? | Warlock invocations; omit when empty.                        |
| `maneuverChoices`   | `id[]`? | Subclass maneuvers (pack content); omit when empty.          |
| `fightingStyles`    | `id[]`? | Fighting Style picks; omit when empty.                       |

The character's **total level** is `sum(classes[].level)` — DERIVED via `totalLevel()`
(`src/lib/classes.ts`), never stored. PB, hit-dice total, and ASI/feat gates flow from the total;
spell slots from the 2024 Multiclass Spellcaster table (`lib/multiclass-slots.ts`); features /
riders / scaling resolve per entry at THAT entry's class level. Display names DERIVE from the ids
(`localizeClassName` / `localizeSubclassName`), never stored.

**Dropped from `build` (re-derived on read):** `savingThrows`, `hitDieType`, `spellSlots`,
`spellcasting`, derived `speed`, granted `languages`/`toolProficiencies`, the class/subclass/origin
entries of `features[]`, `armorNote`, `sidebar` (UI layout), `combatAlgorithm` when empty,
`ac`/`hp.max` (derived snapshots; a denormalized `ac`/`hp.max` still rides the Firestore doc for the
SRD-free roster, but they are NOT part of this portable schema). The `spellcasting` block itself
carries the caster's manual OVERRIDES (`saveDCOverride`, `attackBonusOverride`, `preparedMaxOverride`,
and RA-33 `slotMaxOverrides` — durable per-slot-level max counts keyed by `slotUsageKey`); when any of
those deviates from the inferred block it is KEPT, and a `slotMaxOverrides` entry likewise keeps the
otherwise-derived `spellSlots` array (its counts differ from `deriveSpellSlots`).

### `build.toolChoices` — tool-CHOICE picks (the id-based home)

A class / background / feat **"choose a tool"** decision (Monk "Artisan's Tools **or** Musical
Instrument", Bard "3 Musical Instruments", Entertainer / Soldier / … "an X of your choice") is a
`choice-tool-proficiency` grant. The player's pick is stored as **stable tool IDS** in
`build.toolChoices` — a map keyed by the namespaced choice **slot** id `"<sourceId>::tool-slot-N"`
(the SAME id `collectChoiceSlots` mints — `class:<id>` / the bare `<bgId>` / a feat id, + `tool-slot-N`),
each value the chosen catalogue ids (`["smiths-tools"]`, `["lute","viol","flute"]`). It mirrors how the
per-class picks (`weaponMasteries` / `metamagicChoices` / …) persist as ids, but is **cross-source** so
it lives at the `build` root (the slot id already namespaces the source). Omitted when empty.

This is the **single source** (golden rule 6) for a choice pick: the tool **PROFICIENCY** (via the
synthetic `tool-choices` grant source in `resolveAllGrantSources` → `displayToolProficiencies`,
localized by id — IT "Strumenti da Fabbro") **and** the `fromToolChoice` pack **ITEM** (via
`ToolChoiceContext.pickedIds`) both DERIVE from these ids — **never a baked locale string** (golden
rule 7). A CHOICE pick never lands in the manual `toolProficiencyIds`; that array is **only** the
player's hand-added tools.

### `build.languageIds` / `toolProficiencyIds` (+ `custom*`) — manual proficiencies as IDS (#114)

The player's **MANUAL** language / tool-proficiency additions are STABLE IDS, never a localized
display string (golden rule 7). The owner saw the bug they fix: a free-text `overrides.languages`
string stored "gnomico" / "Strumenti da Artigiano" — a localized literal that rendered **identically
in every locale**. Now:

- `languageIds` / `toolProficiencyIds` carry **catalogue ids** (`"gnomish"`, `"smiths-tools"`). The
  presenter (`displayLanguages` / `displayToolProficiencies`, `lib/views/sheet-view.ts`) **unions**
  these with the aggregate's GRANTED set (resolved EN-name → id, the stable FACT anchor), dedups **by
  id**, and localizes EACH id via `localizeSrd("language"\|"equipment", id, "name", locale)`. So a held
  tongue/tool reads its canonical name in the active locale on EVERY surface — the rail, the Bio tab,
  the PDF — by construction. **Adding a new app language is JUST a new `languages.json`** — zero code.
- `customLanguages` / `customToolProficiencies` are the **ONE** place a user-authored label lives
  (homebrew, single-locale by definition — like a custom spell/item name). A token resolving to no id
  lands here, appended verbatim.
- **UMBRELLAS never finish:** a generic tool umbrella (`artisans-tools` / `gaming-set` /
  `musical-instrument`) is a "choose one kind of X" CHOICE, NOT a proficiency — the presenter excludes
  it from the display string and surfaces it as a pending choice (`effectiveToolTokens` tags it
  `umbrellaId`). It can never be stored as a finished `toolProficiencyId`.

The bilingual names live in `src/i18n/{en,it}/srd/languages.json` (a new `"language"` SrdKind) and
`…/equipment.json` (tools, #107), keyed by id. **Leak-proof by design**, guarded three ways:
`character-data-ids.guard` (every value in the 6 fixtures + a synthetic doc is a known id, never a
localized label), `i18n-proficiency-divergence` (a resolvable token renders EN ≠ IT — a same-in-both
render = an unresolved literal), and the `i18n-parity` SRD-catalogue table (now covering `languages`).
**Absence-safe:** a not-yet-migrated doc with no `languageIds` renders an EMPTY manual list (natural
absence handling in `rehydrateCharacter`, NOT a read-shim). The one-off live migration that converted
the deployed docs (`overrides.languages`/`.tools` string → ids; off-spelling salvage gnomico→gnomish,
infracomune→undercommon; umbrella-drop) **has run + been deleted** once verified idempotent (rule 10 —
a spent migration is removed COMPLETELY; git history preserves `scripts/migrate-language-ids.ts`).

## `state` — the exported play-moment (only non-default)

| Key                       | Type                                | Notes                                                                                                                                                  |
| ------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hp`                      | `{ current, temp? }`                | `max` is derived; omit `temp` when 0                                                                                                                   |
| `currency`                | `{ gp?, sp?, … }`                   | only non-zero coins                                                                                                                                    |
| `conditions`              | `[ … ]`                             | active conditions; omit when none                                                                                                                      |
| `concentrationConditions` | `[ conditionId, … ]`                | conditions owned by the current solo concentration; omit when none                                                                                     |
| `exhaustion`              | int?                                | omit when 0                                                                                                                                            |
| `usedSlots`               | `{ "1": n, … }`                     | spell slots SPENT; omit empties                                                                                                                        |
| `trackers`                | `{ id: spent\|{used?,rolls} }`      | resource uses; ordinary counters stay numeric, while recorded physical results use the additive object; omit zero/empty                                |
| `itemResources`           | `{ instanceId: ItemResourceState }` | exact per-copy magic-item counters, disposition, revision and causal transition fingerprint; omit when no copy has diverged from its catalogue default |
| `concentration`           | string?                             | the concentrated spell; omit when none                                                                                                                 |
| `inspiration`             | bool?                               | omit when false                                                                                                                                        |
| `log`                     | `[ {event, ts, id} ]`               | the session log — a structured `CombatEvent` (ids/tokens, localized at render), never raw text                                                         |

Every mutable magic-item copy must have exactly one stable `build.equipment[].instanceId`, and its
`itemResources` entry must agree with that copy's `itemId`; duplicate owners, orphaned state, malformed
revisions and malformed transition fingerprints are rejected by the portable codec. The one-off `migrate-item-resources` (on `main`; superseded on `v2` by the stage-3 item-resource
model of the new engine) applies this invariant to both current Firestore documents and every
saved snapshot under a deterministic-id, backup, compare-and-swap and post-verification safety net. It has
not yet run against production, so the runtime still accepts legacy migration inputs without treating them
as a second typed owner; once the owner-gated apply/check closes, those inputs and the spent script are
deleted rather than retained as a read shim.

The REQUIRED `instanceId` on a custom spell, weapon, equipment entry and `customs.features` entry has its
own one-off, `migrate-custom-identity` (applied to production on 2026-09-03 from `main`; not carried on
`v2`): it stamps a deterministic id on every custom
entry of a character parent, its anonymous share projection at `public/sheet` (under the PARENT's scope and
in the same atomic batch, because `firestore.rules` requires `sheet.build` to stay byte-identical to
`character.build`), a saved snapshot (scoped by its own snapshot id, so a snapshot never reuses a parent
identity) and a library index entry, whose `id` and `item.instanceId` it aligns to one identity.
Both one-offs run the same protocol from `scripts/lib/migration-kit.ts` — read-only by default, `--check`
proves the corpus migrated, `--fixtures <dir>` plans over portable exports with no Firebase, and
`--apply --backup <dir>` is the only write mode. Reports carry counts, hashes and issue codes only.

Play-state also carries several **additive-only optional** keys, each absent on a doc that never
uses it (so the envelope stays byte-identical): `activeFeatures`, `effectTimers`, `effectBoundaries`
(`{ activeKey: { round, phase: "turn-start"|"turn-end" } }` for exact self-effect expiry), `grantBundleChoices`,
`concentrationConditions` (conditions owned by the current solo concentration),
`companionHp` (summoned-companion current HP, keyed by granting source id), `companionVariant`
(Beast Master's chosen `variantId`, keyed by feature id), `familiar`
(`{ monsterId, creatureType: celestial|fey|fiend, dismissed? }` — the Find Familiar summon; its
current HP rides `companionHp["find-familiar"]`), `manifestedWeaponOverrides`, `pactWeaponConfig`,
`pactWeaponRiderTypes`, `polymorphForm`, `bardicInspirationDie`, `sessionDefenses`, `hiddenDc`, and
`world` (the character's persisted mechanics world, `CharacterMaterialState` — carried through the
codec as an OPAQUE verbatim member, never shape-validated there; `characterWorldState` re-proves it
fail-closed at read, the architecture's one re-proving seam for engine state). A
malformed `familiar` (non-string `monsterId`, `creatureType` outside the closed set) is dropped at
the parse boundary (the `polymorphForm` precedent); a stale/unknown `monsterId` is KEPT and degrades
quietly at render (the encounter stale-`srdId` precedent).

Everything absent ⇒ its fresh/default value on import. So a brand-new character's `state` is `{}`.

> **`hp` / `conditions` (+ `initiative` / `deathSucc` / `deathFail`) — the combat trio.** These remain
> valid keys of the PORTABLE export format above (a self-contained JSON export of a wounded hero carries
> them inline — it has no subdoc), but the FIRESTORE PARENT doc OMITS them at the serialization boundary
> (`toStoredPayload` → `omitCombatTrio`) because they live in the per-character `combat/state` subdoc as
> their SOLE persisted home (golden rule 10), so a stored parent doc — and the 6 team fixtures — carry NO
> trio key in `state`. See `docs/ARCHITECTURE.md`.
>
> **`round` — DROPPED from the portable format entirely.** The SOLO combat round was consolidated into the
> `combat/state` subdoc's `round` field (its sole persisted home, joining the trio), and `session.round` was
> DELETED (golden rules 6 + 10). UNLIKE the trio, `round` is NOT a portable-format key: the codec no longer
> emits it and DROPS a legacy `state.round` ONE-WAY at the import boundary (read-and-dropped, never written
> back). Rationale: the round is ephemeral turn-tracking state the turn engine owns; a portable export/import
> is a "fresh copy" (all ephemeral combat state already resets on import — the subdoc is never seeded from an
> import), so preserving the round in the format would be cosmetic only. A solo player's live round is carried
> across a reload by its subdoc, not the export.

## The codec (implementation contract)

- `serializeCharacter(doc) -> v3` (in `src/lib/character-codec.ts`): runs `minimizeCharacter` (drop
  every derivable field), reshapes the flat minimal record into the id-based `build`, splits the
  session into the non-default `state`, and embeds the portrait under `meta` only when one is passed.
  - The portrait base64 comes from `buildCharacterExport` (`character-io.ts`) → `portraitToDataUrl`
    (`storage.ts`), which reads the bytes through the **Firebase Storage SDK** (`getBlob`) — never an
    HTTP fetch of the download URL. (The display `<img>` is no-cors, so the Workbox runtime cache
    holds an OPAQUE, unreadable entry under the display URL; the SDK read is a token-less request
    that cannot share a cache key with it, so the old silently-faceless-export failure is
    structurally impossible.) If the read genuinely fails (offline / object deleted / signed out)
    the export still ships and the drop is REPORTED (`portraitDropped` → the
    `roster.exportPortraitDropped` toast) — never silent.
- `parseCharacter(json) -> CharacterDoc` : **schema-3 ONLY**. `schema === 3` → reverse the reshape +
  de-id race/background/alignment back to display strings, then `rehydrateCharacter` (re-derive every
  dropped field) + `sanitizeSession` + stamp the real AC. A document with NO numeric `schema`, a
  `schema < 3`, or a `schema > SCHEMA_VERSION` is **rejected** with an `ImportError`. A pre-v3 file
  fails with the stable sentinel `SCHEMA_2_REJECTED_REASON === "schema-2-unsupported"`, which the
  import UI maps to the friendly `import.oldFormat` copy (EN + IT) — the only transitional seam at
  the untrusted-input boundary (a pasted old export never crashes). There is NO upgrade-on-read.
  Missing optional fields are defaulted; unknown fields are PRESERVED (below).
- **Totality (design §5.5).** The codec never SKIPS an element and never trims an unknown key.
  - **Closed worlds.** `KNOWN_BUILD_KEYS` (`character-codec.ts`) and `KNOWN_STATE_KEYS`
    (`session-state-codec.ts`) are exactly the keys the writer can emit for `build` / `state`; each
    entry parser has the same list for its own fields, and `KNOWN_CLASS_ENTRY_KEYS` covers a
    `build.classes[]` entry. Every key OUTSIDE its list is kept verbatim in an `unknown` bucket —
    `CharacterData.unknown`, `SessionState.unknown`, `ClassEntry.unknown`, and `unknown` on each
    spell / weapon / equipment / feature entry (SRD ref and custom alike) — and is written back
    **last**, so a canonical document's bytes are unchanged and a document written by a NEWER app
    version round-trips through an older client untouched. The buckets are never read by the app.
    `RETIRED_STATE_KEYS` (currently `round`) names the keys the format deliberately dropped:
    read-and-discarded one-way, never resurrected as an unknown future key.
  - **Typed quarantine.** A structurally malformed element fails the WHOLE document rather than
    being skipped (skipping would write a shorter array or map back over a live user's data).
    `parseCharacterEnvelope` returns `{ ok: false, error, failure }`, where `failure` is the
    `CodecFailure` from the shared, pure `src/lib/codec-failure.ts` — the ONE error identity both
    envelope halves raise, so a failure thrown inside `stateToSession` reaches the same catch. Its
    `code` is one of `malformed-entry` (an element or one of its fields has the wrong shape),
    `invalid-build` (a member that must be a collection is not an array), `invalid-item-resources`,
    or `validation`; its `path` addresses the offence — for example `build.equipment[3].charges`,
    `build.customs.features[0].contentBlocks[2]`, `build.classes[1].level`, `state.log[4]`,
    `state.pactWeaponConfig.pact-blade`. `error` is the `code:path` pair for a structural failure
    and the human message for `validation`. A required field breaks the ELEMENT itself (say
    `build.spells[2]`); an OPTIONAL field present with the wrong type breaks at its own path (say
    `build.spells[2].notes`). `parseCharacter` forwards `failure` on its `ImportError`;
    `parseStoredCharacter` throws a `TypeError` prefixed `Invalid character document:` carrying the
    same `code:path`, which the subscription's quarantine reports to diagnostics; and
    `parsePersistedPlayStateV1` maps a failure to its existing `invalid-play-state` leg.
  - **Behaviour change:** a collection member that is present but not an array now QUARANTINES
    instead of defaulting to empty — `"spells": null`, `"classes": {}` or `"log": 0` yield
    `invalid-build` at that path. Absent (`undefined`) still means "the empty default".
  - **The remaining non-total seams, enumerated.** Totality is STRUCTURAL. What is left is:
    1. `normalizeLogEntry` (inside `sanitizeSession`) still degrades a structurally valid but
       unrenderable log row — the documented one-way normalization that dies with the log seam in
       P5. `state.log` itself is now total: a non-record row quarantines.
    2. The documented one-way read-normalizations, enumerated as path patterns in
       `CODEC_READ_SEAMS` (`character-codec.ts`): a non-token `unit` is dropped; `build.overrides`
       conforms legacy proficiency keys and the boolean initiative-advantage leg; the retired
       `build.overrides.languages` / `.tools` label strings are read and discarded (manual picks are
       the `languageIds` / `toolProficiencyIds` arrays; only frozen snapshots still carry the
       strings); tracker keys conform to ids (`remapSessionTrackerIds`,
       `conformRaceTraitSessionIds`); a legacy concentration ref conforms. The codec-loss audit
       (`scripts/audit-codec-loss.ts`) reports a change on one of these paths as `conformed` and
       any other change as loss. `SrdEquipmentRef.instanceId` keeps its tolerant read until the
       identity pass owns it.
    3. Top-level portable-envelope keys outside `{ schema, build, state, meta }` are not part of the
       format contract: they are tolerated on import (never a crash) but not preserved.
    4. The compact `state` map is "non-default values only" BY DESIGN, so its scalar readers still
       absence-default rather than quarantine (`numOr` for numbers, `stringArray` for id lists, the
       shape parsers for `familiar` / `polymorphForm` / `sessionDefenses` / `companionHp` /
       `effectTimers` / `effectBoundaries`, which yield `undefined` for a member they cannot read).
       Only the COLLECTIONS named above are total.
- **Round-trip invariant:** `serialize(parse(x)) === x` for any canonical v3 `x` (byte-identical),
  and `parse(serialize(x)) ≡ x` for a document carrying unknown keys at every level. Pinned by
  `tests/unit/character-codec.test.ts`, `tests/unit/character-codec-totality.test.ts` (seeded
  property test) + the 6 team fixtures (their on-disk form IS the canonical v3 —
  `tests/unit/team-fixtures-new-export.test.ts` asserts `serialize(parse(file)) === file` and that a
  pasted pre-v3 envelope is REJECTED with the friendly sentinel, never a crash).

## Migration appendix — the v2→v3 migration (DONE)

The v2→v3 schema migration (single-class fields → `classes[]`, schema 2 → 3) is **COMPLETE**: every
live Firestore doc + the 6 team fixtures are schema-3 with `classes[]`. The one-off conversion script
and its schema-2 test fixtures were removed once the live migration ran (owner directive 2026-06-14,
task #24 part 2: a superseded format is removed COMPLETELY — no dead migration code lingers). The app
codec has never carried an upgrade-on-read branch; the only remaining trace of the old format is the
graceful pre-v3 import REJECTION above (the untrusted-input boundary), pinned by the team-fixtures
test (a pasted schema-2 envelope → the friendly sentinel).

### Companion one-off: `scripts/migrate-team-equipment.ts` (#103 step 5) — REMOVED (stale, never applied)

This standalone one-off was meant to backfill the 6 team characters with their by-the-book starting
kit. It was **removed unrun**: it was written against the old `{ character, session }` doc shape and so
matched **0** docs once persistence moved to the `{ build, state }` codec shape — a permanent no-op (a
2026-06 read-only prod audit confirmed it matched none of the 6). The canonical team kit lives in the
fixtures (`content-pack/fixtures/team/*.json`), pinned by `team-equipment-migration.test.ts` (a render
regression over the fixtures, kept). One live copy genuinely had `build.equipment`
unpopulated and was repaired by a targeted field-level one-off (git history preserves it); the other
divergences (an acquired weapon, a swapped loadout) are legitimate in-play state and
were left untouched.

### Persistence unification — the one-off `migrate-unified-codec` (ran + deleted)

The standalone one-off behind the **persistence unification** has run on production + been verified
idempotent, and is now **DELETED** (rule 10 — a spent migration is removed COMPLETELY; git history
preserves `scripts/migrate-unified-codec.ts` + its `scripts/alias-loader.mjs` `@/` resolve hook). For
every `users/*/characters/*` doc it: (1) **converted** any not-yet-migrated flat-shape doc
(`{ character, session }`) to the unified `{ schema, build, state, cache }` via
`serializeCharacterEnvelope` + `buildCharacterCache`, deleting the flat keys (+ any dead `campaignId`);
(2) **backfilled** `dmReaders` = the union of the `dmUid` of every campaign the character is attached to
(`campaigns` where `memberDetails[uid].characterId == charId`) — what authorizes the DM "View Sheet" read
in `firestore.rules`; (3) **converted flat SNAPSHOTS** under `…/snapshots/{snapId}` to the same envelope
(preserving `reason` + `createdAt`), including the legacy-v2 single-class salvage; and (4) **proved
render-equivalence** (derived sheet identical) before writing, skipping any divergent row.

The durable result: `firestore.ts` carries NO transitional read-shim — it reads ONLY the unified shape;
the export + Firestore share ONE codec; and the DM reads the owner's real doc (the old denormalized
full-sheet copy is gone — and the `dmReaders` ACL this migration once backfilled was itself later
SUPERSEDED by the live-derived `attachedCampaignId` grant; see `docs/ARCHITECTURE.md` → Security). All
of this is now permanent app behavior, not migration code.

### Combat trio left `state` — the one-off `migrate-combat-state` (ran + deleted)

The combat-mutable trio (HP `{ current, temp }` · `conditions` · `initiative` · `deathSucc`/`deathFail`)
**no longer lives on the parent doc's `state`** — it moved to the per-character `combat/state` subdoc
(`CombatState`; see `docs/ARCHITECTURE.md`), its SOLE persisted home. The codec is unchanged at the seam:
`sessionToState` still omits each of those fields when it equals its serialization-default and
`stateToSession` still defaults an absent one — so the PORTABLE export round-trip is unaffected (a wounded
export carries the trio inline; the fixtures, carrying no trio, stay byte-identical). The FIRESTORE PARENT
write additionally omits the trio at the serialization boundary (`toStoredPayload` → `omitCombatTrio`), so a
stored parent doc — and the 6 team fixtures — carry NO trio key in `state` at all.

That combat subdoc also carries the optional `pendingConcentrationSaves` FIFO. Each JSON-plain row is
`{ id, spell, damage, difficultyClass }`; absence is the backward-safe empty queue and the read boundary
drops malformed, duplicate-id or stale damage/DC rows. Hydration also drops rows that do not match the
currently held Concentration spell or a living character above 0 HP, closing out-of-order parent/subdoc
writes without leaving an unresolvable prompt. It is ephemeral live-combat state like the solo round, so
it is deliberately not part of the portable character envelope: importing a copy starts with no unresolved
table prompts, while an ordinary reload restores them from the subdoc.

The one-off `scripts/migrate-combat-state.ts` ran autonomously under the snapshot-verify net
(dry-run/`--check` by default): it backfilled the subdoc from each un-migrated parent and
`deleteField`ed the five legacy keys. It has **run on production + been verified 100%**, and is now
**DELETED** together with its test AND the load-boundary read-fallback
(`CharacterDoc.legacyCombatFallback`, `legacyCombatFromRawState`, `legacyTrioPresent`) — golden
rules 10 + 22
(a migration is finished only when the data is migrated, coverage verified, and the shim + old
fields removed; git history preserves the script). The durable result: the subdoc is the sole home, the
parent carries no trio, and every reader falls to the full-HP default only when the subdoc is genuinely
absent.

### Legacy parent cutover — the one-off `migrate-character-parents` (P1, applied to production 2026-09-03 from `main`; the script is not on `v2`)

P1 cutover (`main`'s `migrate-character-parents`): every live parent is v1 (`state: {}`, the play
session lives in `combat/state.playState`), every character has a `combat/state` child, every parent
carries `revision`. The client and `firestore.rules` are now v1-ONLY: nothing reads `playStateVersion`,
so the stored field is DEAD from P1 on and the P3 `combat/state` v2 migration deletes it. The script
still stamps it while it runs, so a not-yet-upgraded client keeps working during the rollout.

The script must therefore run on production BEFORE the P1 client deploys: an unmigrated parent (no
`revision`, or a session still in `state`) quarantines on read rather than loading, and a character
with no `combat/state` child fails closed (`missing-combat-state`).

The script is read-only by default and follows the ADR-0009 protocol shared with
`migrate-custom-identity` (`--check` proves the corpus migrated; `--apply --backup <dir>` is
the only write mode). What it guarantees:

- **The plan is what the client would have written.** A legacy family is hydrated through the exact app
  path — `parseCharacterEnvelope` (tracker-id remap, race-trait id conformance, log concentration
  normalization), then `effectiveMaxHp` over the hydrated character+session, then
  the pre-cutover trio merge (`mergeCombatTrio`; the script-only legacy readers were deleted with
  the script on `v2`) — and the projected
  `combat/state` is finally re-parsed with the strict v1
  `parseCombatState` the app reads it back with (`non-canonical-child` when it would not). Nothing is
  written that the app could not then load.
- **The created child starts at the app's effective maximum HP**, so an hp-flat grant active in the
  stored session (Aid, a Tough-style bonus) counts exactly as it does on the sheet. There is no
  dependency on the possibly-stale `cache.hpMax`.
- **It never touches `build` or `updatedAt`**, so the anonymous share projection (`public/sheet`, which
  requires `sheet.build == character.build` and `sourceUpdatedAt == character.updatedAt`) needs no
  write. A legacy SHARED parent that has no sheet yet simply stays without one — the owner's client
  creates it on the next autosave.
- **It refuses to run uncomposed.** The hydration is SRD-aware, so the script proves the private
  content pack actually composed before it plans anything; a pack-only concentration reference could
  otherwise be rewritten to `custom:<id>`. Behind that assertion a per-family guard refuses
  (`unresolved-concentration`) any stored concentration reference that does not survive
  canonicalization unchanged, so no plan can depend on which catalogue happened to load.
- **It is deterministic.** A stored log row with no id would otherwise be given a random UUID by
  `normalizeLogEntry`; the planner stamps such rows with an id derived from the family path and the
  row's ordinal (reported as `logIdsStamped`) before the codec sees them.
- **`--check` proves LOADABILITY, not just the marker.** A green `--check` means every legacy family
  is cut over AND every already-marked parent is one the deployed client can actually open: its
  `state` is empty (`marked-parent-state-not-empty` otherwise — the exact refusal
  `parseStoredCharacter` throws) and its `build` hydrates through `parseCharacterEnvelope`
  (`invalid-envelope` otherwise). Both are proof-only calls; nothing derived from them is written.
  Run it again immediately before the deploy: a player editing between the apply and the deploy can
  reintroduce a document neither proof had seen.

## Verification (Definition of Done)

1. `serialize(parse(json)) === json` for every v3 fixture (idempotent, byte-identical), and zero
   loss over a production export (`scripts/audit-codec-loss.ts`; stage 0, 2026-09-03: 53
   documents, zero loss, zero quarantine).
2. A pre-v3 (schema-2) file is REJECTED with the friendly sentinel, never a crash (the only
   transitional seam at the untrusted-input boundary).
3. `state` faithfully restores vitals/currency/spent-resources/log. The combat trio (HP/conditions/
   initiative/death saves) lives in the `combat/state` subdoc, not the parent `state` — hydrated at load,
   defaulting to full HP only when the subdoc is genuinely absent (a fresh/undamaged character).
4. Screenshot parity (EN+IT) for the 6 team sheets + the multiclass mock. Full gate green.
