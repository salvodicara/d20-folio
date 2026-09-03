/**
 * The v3 portable-character codec — the SINGLE supported import/export format.
 *
 * A stored / exported character is `{ schema: 3, build, state, meta? }`:
 *   - `build`  — the character DEFINITION: explicit choices + genuine customs +
 *     manual overrides, **id-based** (race/class/subclass/background/alignment are
 *     stable ids, never display strings). Everything a 2024 grant determines
 *     (saves, hit die, spell slots, the spellcasting block, class/subclass/origin
 *     features, granted languages/tools, derived speed) is DROPPED and re-derived.
 *   - `state`  — the exported play-moment (only NON-default vitals / currency /
 *     spent resources / conditions / log) to rebuild the session exactly.
 *   - `meta`   — OPTIONAL `{ portrait }` (embedded data URL); omitted when absent.
 *
 * The codec REUSES the minimal-model engine (`character-minimal`) as its core:
 * `serializeCharacter` = `minimizeCharacter` → reshape the flat minimal record
 * into `build` + id-ify; `parseCharacter` = reverse the reshape + de-id →
 * `rehydrateCharacter` (which re-derives every dropped field). The in-memory
 * `CharacterData` / `SessionState` are UNCHANGED — this is purely the *serialized*
 * shape; the codec maps between them.
 *
 * Versioned + single-format: every doc carries `schema`. **v3 is the ONLY supported
 * format** — a document without a `schema`, a `schema < 3`, or a `schema > 3` is
 * rejected (a pre-v3 file fails with the sentinel `SCHEMA_2_REJECTED_REASON`, which
 * the import UI maps to the friendly `import.oldFormat` copy). There is NO
 * upgrade-on-read; the v2→v3 migration is complete (every live doc is schema-3).
 * Missing optional fields still default, and the writer always emits schema 3.
 *
 * TOTALITY (design §5.5): every COLLECTION is total — the reader never skips an
 * element and never trims an unknown key.
 *  - Unknown keys are PRESERVED verbatim in an `unknown` bucket on the character
 *    (unknown `build` keys), the session (unknown `state` keys) and every entry —
 *    spells, weapons, equipment, features AND `build.classes[]` — and are written
 *    back spread LAST, so a canonical document's bytes are unchanged and a future
 *    document round-trips byte-identically.
 *  - A structurally malformed element QUARANTINES the whole document with a typed
 *    {@link CodecFailure} (`{ code, path }`) instead of being skipped, so a shorter
 *    array or map can never be written back over a live user's data. The failure
 *    reaches `parseStoredCharacter` → the subscription quarantine → diagnostics.
 *  - Totality is STRUCTURAL. The remaining value-level seams are ENUMERATED in
 *    `docs/CHARACTER_SCHEMA.md` → "The codec (implementation contract)": the
 *    `normalizeLogEntry` semantic degrade (dies with the log seam in P5), the three
 *    documented one-way read-normalizations (`unit`, the two on `build.overrides`)
 *    plus the tolerant `instanceId` read, top-level envelope keys outside
 *    `{ schema, build, state, meta }` (not part of the format contract), and the
 *    compact `state` map's absence-defaulting scalar readers.
 *
 * Round-trip invariant: `serialize(parse(x)) === x` (byte-identical) for any v3 x.
 *
 * Pure + Firebase-free (composes only pure helpers) so persistence and CI can both
 * use it.
 */

import type {
  CharacterDoc,
  CharacterData,
  ClassEntry,
  SessionState,
  SrdSpellRef,
  CustomSpell,
  SrdWeaponRef,
  CustomWeapon,
  SrdEquipmentRef,
  CustomEquipment,
  SrdFeatureRef,
  CustomFeature,
  CharacterTag,
  CharacterLore,
  PortraitCrop,
  InitiativeAdvantageOverride,
} from "@/types/character";
import type { SpellSchool, Recovery, AbilityCode, TrackerUnit } from "@/data/types";
import { TRACKER_UNITS } from "@/data/types";
import { DAMAGE_TYPES, type DamageType } from "@/types/damage";
import {
  minimizeCharacter,
  rehydrateCharacter,
  type MinimalCharacter,
} from "./character-minimal";
import { sanitizeSession } from "./sanitize-session";
import { normalizeLogEntryConcentration } from "./concentration";
import {
  conformStoredFeatures,
  remapSessionTrackerIds,
  conformRaceTraitSessionIds,
} from "@/lib/conform-stored-features";
import { effectiveAC } from "@/lib/aggregate-character";
import { normalizePortraitCrop } from "@/lib/portrait-crop";
import {
  raceIdByName,
  asRaceId,
  backgroundIdByName,
  backgroundNameById,
} from "@/data/srd-names";
import { alignmentIdByLabel, asAlignmentId } from "@/lib/lore-utils";
import { nonEmptyString, assertNonEmptyString } from "@/lib/non-empty-string";
import { enToProficiencyToken } from "@/data/proficiency-vocab";
import { isItemInstanceId, parseItemResources } from "@/lib/item-resources";
import {
  sessionToState,
  stateToSession,
  type CompactSessionState,
} from "@/lib/session-state-codec";
import {
  CodecFailureError,
  fail,
  leftover,
  type CodecFailure,
} from "@/lib/codec-failure";

// ─── Primitive validators ───────────────────────────────────────────────────

export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

// ─── Totality: typed quarantine + unknown-key preservation ──────────────────
// `CodecFailure` / `CodecFailureError` / `fail` / `leftover` live in the shared
// `codec-failure.ts` so BOTH halves of the envelope raise the same error identity
// (a failure thrown inside `stateToSession` is caught by the one decoder catch).

/**
 * Read an OPTIONAL field: absent is fine (the caller checks), but a field that IS
 * present with the wrong type quarantines the document at its own path — never a
 * silent skip that would drop the player's value on the next write.
 */
function opt<T>(value: unknown, guard: (v: unknown) => v is T, path: string): T {
  if (!guard(value)) fail("malformed-entry", path);
  return value;
}

const isString = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isNumber = (v: unknown): v is number => typeof v === "number";
const isNullableNumber = (v: unknown): v is number | null =>
  v === null || typeof v === "number";
const isNullableString = (v: unknown): v is string | null =>
  v === null || typeof v === "string";

/** An array whose every element is a record, failing at the offending INDEX. */
function recordArray(value: unknown, path: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) fail("malformed-entry", path);
  return value.map((item, index) => {
    if (!isRecord(item)) fail("malformed-entry", `${path}[${index}]`);
    return item;
  });
}

/** A list of plain strings, failing at the offending INDEX (never a filtered copy). */
function stringList(raw: unknown, path: string): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) fail("invalid-build", path);
  return raw.map((item, index) => {
    if (typeof item !== "string") fail("malformed-entry", `${path}[${index}]`);
    return item;
  });
}

/** Re-flatten a parsed entry for serialization: known fields first, `unknown` LAST. */
function flattenEntry(entry: unknown): unknown {
  if (!isRecord(entry)) return entry;
  const { unknown, ...rest } = entry;
  return isRecord(unknown) ? { ...rest, ...unknown } : { ...rest };
}

/** Internal invariant: the caller has already proven the member is an array. */
function flattenEntries(list: unknown): unknown[] {
  if (!Array.isArray(list)) {
    throw new TypeError("flattenEntries expects an array of parsed entries");
  }
  return list.map(flattenEntry);
}

const SPELL_SCHOOLS: SpellSchool[] = [
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
];
export function isSpellSchool(val: unknown): val is SpellSchool {
  return typeof val === "string" && (SPELL_SCHOOLS as string[]).includes(val);
}

export function isDamageType(val: unknown): val is DamageType {
  return typeof val === "string" && (DAMAGE_TYPES as readonly string[]).includes(val);
}

const RECOVERIES: Recovery[] = [
  "long-rest",
  "short-rest",
  "short-or-long-rest",
  "dawn",
  "per-turn",
  "manual",
];
export function isRecovery(val: unknown): val is Recovery {
  return typeof val === "string" && (RECOVERIES as string[]).includes(val);
}

/**
 * Validate a stored `unit` is a known tracker-unit TOKEN (golden rule 7) —
 * the bounded read-normalization at the untrusted-input boundary (rule 10). A
 * legacy/foreign value that is not a token is DROPPED, never written back, so a
 * raw display string can never re-enter the codec. Reuses the ONE `TRACKER_UNITS`
 * source (golden rule 6).
 */
export function isTrackerUnit(val: unknown): val is TrackerUnit {
  return typeof val === "string" && (TRACKER_UNITS as readonly string[]).includes(val);
}

const ABILITY_CODES: AbilityCode[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
function isAbilityCode(val: unknown): val is AbilityCode {
  return typeof val === "string" && (ABILITY_CODES as string[]).includes(val);
}

export function isTagArray(val: unknown): val is CharacterTag[] {
  return (
    Array.isArray(val) &&
    val.every(
      (t) => isRecord(t) && typeof t.label === "string" && typeof t.color === "string"
    )
  );
}

/** Magic-item charges shape shared by SrdEquipmentRef and CustomEquipment. */
type EquipmentCharges = {
  current: number;
  max: number;
  recovery?: Recovery;
  recoveryFormula?: string;
};

function parseEquipmentCharges(val: unknown, path: string): EquipmentCharges {
  if (!isRecord(val)) fail("malformed-entry", path);
  if (typeof val.current !== "number") fail("malformed-entry", `${path}.current`);
  if (typeof val.max !== "number") fail("malformed-entry", `${path}.max`);
  const charges: EquipmentCharges = { current: val.current, max: val.max };
  if (val.recovery !== undefined)
    charges.recovery = opt(val.recovery, isRecovery, `${path}.recovery`);
  if (val.recoveryFormula !== undefined)
    charges.recoveryFormula = opt(
      val.recoveryFormula,
      isString,
      `${path}.recoveryFormula`
    );
  return charges;
}

/** Custom-armor AC shape for CustomEquipment.ac. */
type CustomArmorAc = { base: number; dexBonus: boolean; maxDex?: number };

function parseCustomArmorAc(val: unknown, path: string): CustomArmorAc {
  if (!isRecord(val)) fail("malformed-entry", path);
  if (typeof val.base !== "number") fail("malformed-entry", `${path}.base`);
  if (typeof val.dexBonus !== "boolean") fail("malformed-entry", `${path}.dexBonus`);
  const ac: CustomArmorAc = { base: val.base, dexBonus: val.dexBonus };
  if (val.maxDex !== undefined) ac.maxDex = opt(val.maxDex, isNumber, `${path}.maxDex`);
  return ac;
}

const ARMOR_CATEGORIES = ["light", "medium", "heavy", "shield"] as const;
type ArmorCategory = (typeof ARMOR_CATEGORIES)[number];
function isArmorCategory(val: unknown): val is ArmorCategory {
  return typeof val === "string" && (ARMOR_CATEGORIES as readonly string[]).includes(val);
}

// ─── SRD ref constructors ────────────────────────────────────────────────────
// Validate the required field(s), then read every optional field individually so
// the returned object is fully typed with no casts and LOSSLESS: an optional field
// present with the WRONG type quarantines the document at `<entryPath>.<field>`
// (never a silent skip), and any key outside the module-level key list is kept in
// the entry's `unknown` bucket and re-emitted last.

function parseFreeCastSource(
  val: unknown,
  path: string
): NonNullable<SrdSpellRef["freeCastSource"]> {
  if (!isRecord(val)) fail("malformed-entry", path);
  if (typeof val.sourceId !== "string") fail("malformed-entry", `${path}.sourceId`);
  if (val.rest !== "short" && val.rest !== "long")
    fail("malformed-entry", `${path}.rest`);
  if (typeof val.usesPerRest !== "number") fail("malformed-entry", `${path}.usesPerRest`);
  return { sourceId: val.sourceId, rest: val.rest, usesPerRest: val.usesPerRest };
}

const SRD_SPELL_KEYS = [
  "srdId",
  "prepared",
  "alwaysPrepared",
  "notes",
  "tags",
  "overrides",
  "spellAbilityOverride",
  "wizardSpellMastery",
  "wizardSignatureSpell",
  "speciesSpellAbility",
  "freeCastSource",
] as const;

function parseSrdSpellRef(obj: Record<string, unknown>, path: string): SrdSpellRef {
  if (typeof obj.srdId !== "string") fail("malformed-entry", path);
  const ref: SrdSpellRef = { srdId: obj.srdId };
  if (obj.prepared !== undefined)
    ref.prepared = opt(obj.prepared, isBool, `${path}.prepared`);
  if (obj.alwaysPrepared !== undefined)
    ref.alwaysPrepared = opt(obj.alwaysPrepared, isBool, `${path}.alwaysPrepared`);
  if (obj.notes !== undefined) ref.notes = opt(obj.notes, isString, `${path}.notes`);
  if (obj.tags !== undefined) ref.tags = opt(obj.tags, isTagArray, `${path}.tags`);
  // The per-source `overrides` dialect is opaque to this codec (P2/P3 replace it):
  // it must be a record, but its members are carried verbatim.
  if (obj.overrides !== undefined)
    ref.overrides = opt(obj.overrides, isRecord, `${path}.overrides`);
  if (obj.spellAbilityOverride !== undefined)
    ref.spellAbilityOverride = opt(
      obj.spellAbilityOverride,
      isAbilityCode,
      `${path}.spellAbilityOverride`
    );
  if (obj.wizardSpellMastery !== undefined)
    ref.wizardSpellMastery = opt(
      obj.wizardSpellMastery,
      isBool,
      `${path}.wizardSpellMastery`
    );
  if (obj.wizardSignatureSpell !== undefined)
    ref.wizardSignatureSpell = opt(
      obj.wizardSignatureSpell,
      isBool,
      `${path}.wizardSignatureSpell`
    );
  if (obj.speciesSpellAbility !== undefined)
    ref.speciesSpellAbility = opt(
      obj.speciesSpellAbility,
      isBool,
      `${path}.speciesSpellAbility`
    );
  if (obj.freeCastSource !== undefined)
    ref.freeCastSource = parseFreeCastSource(
      obj.freeCastSource,
      `${path}.freeCastSource`
    );
  const unknown = leftover(obj, SRD_SPELL_KEYS);
  if (unknown) ref.unknown = unknown;
  return ref;
}

const SRD_WEAPON_KEYS = [
  "srdId",
  "quantity",
  "notes",
  "tags",
  "attackBonusOverride",
  "damageOverride",
  "enchantItemId",
  "overrides",
] as const;

function parseSrdWeaponRef(obj: Record<string, unknown>, path: string): SrdWeaponRef {
  if (typeof obj.srdId !== "string") fail("malformed-entry", path);
  const ref: SrdWeaponRef = {
    srdId: obj.srdId,
    quantity:
      obj.quantity === undefined ? 1 : opt(obj.quantity, isNumber, `${path}.quantity`),
  };
  if (obj.notes !== undefined) ref.notes = opt(obj.notes, isString, `${path}.notes`);
  if (obj.tags !== undefined) ref.tags = opt(obj.tags, isTagArray, `${path}.tags`);
  if (obj.attackBonusOverride !== undefined)
    ref.attackBonusOverride = opt(
      obj.attackBonusOverride,
      isNullableNumber,
      `${path}.attackBonusOverride`
    );
  if (obj.damageOverride !== undefined)
    ref.damageOverride = opt(
      obj.damageOverride,
      isNullableString,
      `${path}.damageOverride`
    );
  if (obj.enchantItemId !== undefined)
    ref.enchantItemId = opt(obj.enchantItemId, isString, `${path}.enchantItemId`);
  if (obj.overrides !== undefined)
    ref.overrides = opt(obj.overrides, isRecord, `${path}.overrides`);
  const unknown = leftover(obj, SRD_WEAPON_KEYS);
  if (unknown) ref.unknown = unknown;
  return ref;
}

const SRD_EQUIPMENT_KEYS = [
  "srdId",
  "instanceId",
  "notes",
  "equipped",
  "tracked",
  "quantity",
  "recovery",
  "isConsumable",
  "isPotion",
  "potionFormula",
  "isPool",
  "unit",
  "acBonus",
  "attuned",
  "charges",
  "overrides",
] as const;

function parseSrdEquipmentRef(
  obj: Record<string, unknown>,
  path: string
): SrdEquipmentRef {
  if (typeof obj.srdId !== "string") fail("malformed-entry", path);
  const ref: SrdEquipmentRef = { srdId: obj.srdId };
  // `instanceId` keeps its TOLERANT read for now: identity is Task 4's subject
  // (it mints and requires ids across the four custom types) and tightening the
  // guard here first would quarantine a doc that migration is about to repair.
  if (isItemInstanceId(obj.instanceId)) ref.instanceId = obj.instanceId;
  if (obj.notes !== undefined) ref.notes = opt(obj.notes, isString, `${path}.notes`);
  if (obj.equipped !== undefined)
    ref.equipped = opt(obj.equipped, isBool, `${path}.equipped`);
  if (obj.tracked !== undefined)
    ref.tracked = opt(obj.tracked, isBool, `${path}.tracked`);
  if (obj.quantity !== undefined)
    ref.quantity = opt(obj.quantity, isNumber, `${path}.quantity`);
  if (obj.recovery !== undefined)
    ref.recovery = opt(obj.recovery, isRecovery, `${path}.recovery`);
  if (obj.isConsumable !== undefined)
    ref.isConsumable = opt(obj.isConsumable, isBool, `${path}.isConsumable`);
  if (obj.isPotion !== undefined)
    ref.isPotion = opt(obj.isPotion, isBool, `${path}.isPotion`);
  if (obj.potionFormula !== undefined)
    ref.potionFormula = opt(obj.potionFormula, isString, `${path}.potionFormula`);
  if (obj.isPool !== undefined) ref.isPool = opt(obj.isPool, isBool, `${path}.isPool`);
  // Documented one-way read-normalization (golden rule 10): a legacy/foreign `unit`
  // that is not a TRACKER_UNITS token is dropped, never written back.
  if (isTrackerUnit(obj.unit)) ref.unit = obj.unit;
  if (obj.acBonus !== undefined)
    ref.acBonus = opt(obj.acBonus, isNumber, `${path}.acBonus`);
  if (obj.attuned !== undefined)
    ref.attuned = opt(obj.attuned, isBool, `${path}.attuned`);
  if (obj.charges !== undefined)
    ref.charges = parseEquipmentCharges(obj.charges, `${path}.charges`);
  if (obj.overrides !== undefined)
    ref.overrides = opt(obj.overrides, isRecord, `${path}.overrides`);
  const unknown = leftover(obj, SRD_EQUIPMENT_KEYS);
  if (unknown) ref.unknown = unknown;
  return ref;
}

const SRD_FEATURE_KEYS = [
  "srdId",
  "notes",
  "tags",
  "trackerOverrides",
  "actionOverrides",
  "contentOverrides",
  "overrides",
] as const;

function parseSrdFeatureRef(obj: Record<string, unknown>, path: string): SrdFeatureRef {
  if (typeof obj.srdId !== "string") fail("malformed-entry", path);
  const ref: SrdFeatureRef = { srdId: obj.srdId };
  if (obj.notes !== undefined) ref.notes = opt(obj.notes, isString, `${path}.notes`);
  if (obj.tags !== undefined) ref.tags = opt(obj.tags, isTagArray, `${path}.tags`);
  // The three override dialects stay OPAQUE (a record / arrays of records); P2/P3
  // replace them with the authored mechanics format, which will own their shape.
  if (obj.trackerOverrides !== undefined)
    ref.trackerOverrides = opt(
      obj.trackerOverrides,
      isRecord,
      `${path}.trackerOverrides`
    );
  if (obj.actionOverrides !== undefined)
    ref.actionOverrides = recordArray(obj.actionOverrides, `${path}.actionOverrides`);
  if (obj.contentOverrides !== undefined)
    ref.contentOverrides = recordArray(obj.contentOverrides, `${path}.contentOverrides`);
  if (obj.overrides !== undefined)
    ref.overrides = opt(obj.overrides, isRecord, `${path}.overrides`);
  const unknown = leftover(obj, SRD_FEATURE_KEYS);
  if (unknown) ref.unknown = unknown;
  return ref;
}

// ─── Custom item constructors ─────────────────────────────────────────────────

const CUSTOM_SPELL_KEYS = [
  "custom",
  "name",
  "level",
  "school",
  "castingTime",
  "range",
  "components",
  "duration",
  "concentration",
  "description",
  "higherLevels",
  "prepared",
  "notes",
  "tags",
  "spellAbilityOverride",
  "instanceId",
] as const;

function parseCustomSpell(obj: Record<string, unknown>, path: string): CustomSpell {
  if (obj.custom !== true) fail("malformed-entry", path);
  if (typeof obj.name !== "string") fail("malformed-entry", path);
  if (typeof obj.level !== "number") fail("malformed-entry", path);
  if (!isSpellSchool(obj.school)) fail("malformed-entry", path);
  if (typeof obj.castingTime !== "string") fail("malformed-entry", path);
  if (typeof obj.range !== "string") fail("malformed-entry", path);
  if (!isRecord(obj.components)) fail("malformed-entry", path);
  const c = obj.components;
  if (typeof c.v !== "boolean" || typeof c.s !== "boolean" || typeof c.m !== "boolean")
    fail("malformed-entry", path);
  if (typeof obj.duration !== "string") fail("malformed-entry", path);
  if (typeof obj.concentration !== "boolean") fail("malformed-entry", path);
  if (typeof obj.description !== "string") fail("malformed-entry", path);
  // `instanceId` is REQUIRED on `CustomSpell`, so a variable typed as the full
  // interface could not be built incrementally (every field would have to be
  // present in the initial literal). Built as the interface minus that one field
  // instead, then the final `return` appends `instanceId` — and, after it, the
  // `unknown` bucket — as an object-literal spread, so BOTH the compile-time
  // requirement and the "instanceId serializes last" contract hold.
  const spell: Omit<CustomSpell, "instanceId"> = {
    custom: true,
    name: obj.name,
    level: obj.level,
    school: obj.school,
    castingTime: obj.castingTime,
    range: obj.range,
    components: {
      v: c.v,
      s: c.s,
      m: c.m,
      ...(c.material !== undefined
        ? { material: opt(c.material, isString, `${path}.components.material`) }
        : {}),
    },
    duration: obj.duration,
    concentration: obj.concentration,
    description: obj.description,
  };
  if (obj.higherLevels !== undefined)
    spell.higherLevels = opt(obj.higherLevels, isString, `${path}.higherLevels`);
  if (obj.prepared !== undefined)
    spell.prepared = opt(obj.prepared, isBool, `${path}.prepared`);
  if (obj.notes !== undefined) spell.notes = opt(obj.notes, isString, `${path}.notes`);
  if (obj.tags !== undefined) spell.tags = opt(obj.tags, isTagArray, `${path}.tags`);
  if (obj.spellAbilityOverride !== undefined)
    spell.spellAbilityOverride = opt(
      obj.spellAbilityOverride,
      isAbilityCode,
      `${path}.spellAbilityOverride`
    );
  if (!isItemInstanceId(obj.instanceId)) fail("malformed-entry", `${path}.instanceId`);
  const unknown = leftover(obj, CUSTOM_SPELL_KEYS);
  return { ...spell, instanceId: obj.instanceId, ...(unknown ? { unknown } : {}) };
}

const CUSTOM_WEAPON_KEYS = [
  "custom",
  "name",
  "quantity",
  "damageDie",
  "damageType",
  "attackStat",
  "properties",
  "emoji",
  "attackBonusOverride",
  "damageOverride",
  "description",
  "notes",
  "tags",
  "instanceId",
] as const;

function parseCustomWeapon(obj: Record<string, unknown>, path: string): CustomWeapon {
  if (obj.custom !== true) fail("malformed-entry", path);
  if (typeof obj.name !== "string") fail("malformed-entry", path);
  if (typeof obj.damageDie !== "string") fail("malformed-entry", path);
  if (!isDamageType(obj.damageType)) fail("malformed-entry", path);
  if (obj.attackStat !== "STR" && obj.attackStat !== "DEX") fail("malformed-entry", path);
  if (typeof obj.properties !== "string") fail("malformed-entry", path);
  // See parseCustomSpell's comment — `instanceId` is required, so the built-up
  // variable omits it; the final `return` appends it (then `unknown`) last.
  const weapon: Omit<CustomWeapon, "instanceId"> = {
    custom: true,
    name: obj.name,
    quantity:
      obj.quantity === undefined ? 1 : opt(obj.quantity, isNumber, `${path}.quantity`),
    damageDie: obj.damageDie,
    damageType: obj.damageType,
    attackStat: obj.attackStat,
    properties: obj.properties,
  };
  if (obj.emoji !== undefined) weapon.emoji = opt(obj.emoji, isString, `${path}.emoji`);
  if (obj.attackBonusOverride !== undefined)
    weapon.attackBonusOverride = opt(
      obj.attackBonusOverride,
      isNullableNumber,
      `${path}.attackBonusOverride`
    );
  if (obj.damageOverride !== undefined)
    weapon.damageOverride = opt(
      obj.damageOverride,
      isNullableString,
      `${path}.damageOverride`
    );
  if (obj.description !== undefined)
    weapon.description = opt(obj.description, isString, `${path}.description`);
  if (obj.notes !== undefined) weapon.notes = opt(obj.notes, isString, `${path}.notes`);
  if (obj.tags !== undefined) weapon.tags = opt(obj.tags, isTagArray, `${path}.tags`);
  if (!isItemInstanceId(obj.instanceId)) fail("malformed-entry", `${path}.instanceId`);
  const unknown = leftover(obj, CUSTOM_WEAPON_KEYS);
  return { ...weapon, instanceId: obj.instanceId, ...(unknown ? { unknown } : {}) };
}

const CUSTOM_EQUIPMENT_KEYS = [
  "custom",
  "name",
  "description",
  "emoji",
  "notes",
  "equipped",
  "ac",
  "armorCategory",
  "acBonus",
  "tracked",
  "quantity",
  "recovery",
  "isConsumable",
  "isPotion",
  "potionFormula",
  "isPool",
  "unit",
  "attuned",
  "charges",
  "instanceId",
] as const;

function parseCustomEquipment(
  obj: Record<string, unknown>,
  path: string
): CustomEquipment {
  if (obj.custom !== true) fail("malformed-entry", path);
  if (typeof obj.name !== "string") fail("malformed-entry", path);
  // See parseCustomSpell's comment — `instanceId` is required, so the built-up
  // variable omits it; the final `return` appends it (then `unknown`) last.
  const equip: Omit<CustomEquipment, "instanceId"> = { custom: true, name: obj.name };
  if (obj.description !== undefined)
    equip.description = opt(obj.description, isString, `${path}.description`);
  if (obj.emoji !== undefined) equip.emoji = opt(obj.emoji, isString, `${path}.emoji`);
  if (obj.notes !== undefined) equip.notes = opt(obj.notes, isString, `${path}.notes`);
  if (obj.equipped !== undefined)
    equip.equipped = opt(obj.equipped, isBool, `${path}.equipped`);
  if (obj.ac !== undefined) equip.ac = parseCustomArmorAc(obj.ac, `${path}.ac`);
  if (obj.armorCategory !== undefined)
    equip.armorCategory = opt(
      obj.armorCategory,
      isArmorCategory,
      `${path}.armorCategory`
    );
  if (obj.acBonus !== undefined)
    equip.acBonus = opt(obj.acBonus, isNumber, `${path}.acBonus`);
  if (obj.tracked !== undefined)
    equip.tracked = opt(obj.tracked, isBool, `${path}.tracked`);
  if (obj.quantity !== undefined)
    equip.quantity = opt(obj.quantity, isNumber, `${path}.quantity`);
  if (obj.recovery !== undefined)
    equip.recovery = opt(obj.recovery, isRecovery, `${path}.recovery`);
  if (obj.isConsumable !== undefined)
    equip.isConsumable = opt(obj.isConsumable, isBool, `${path}.isConsumable`);
  if (obj.isPotion !== undefined)
    equip.isPotion = opt(obj.isPotion, isBool, `${path}.isPotion`);
  if (obj.potionFormula !== undefined)
    equip.potionFormula = opt(obj.potionFormula, isString, `${path}.potionFormula`);
  if (obj.isPool !== undefined) equip.isPool = opt(obj.isPool, isBool, `${path}.isPool`);
  // Same documented one-way `unit` read-normalization as the SRD equipment ref.
  if (isTrackerUnit(obj.unit)) equip.unit = obj.unit;
  if (obj.attuned !== undefined)
    equip.attuned = opt(obj.attuned, isBool, `${path}.attuned`);
  if (obj.charges !== undefined)
    equip.charges = parseEquipmentCharges(obj.charges, `${path}.charges`);
  if (!isItemInstanceId(obj.instanceId)) fail("malformed-entry", `${path}.instanceId`);
  const unknown = leftover(obj, CUSTOM_EQUIPMENT_KEYS);
  return { ...equip, instanceId: obj.instanceId, ...(unknown ? { unknown } : {}) };
}

const CUSTOM_FEATURE_KEYS = [
  "custom",
  "title",
  "emoji",
  "source",
  "tags",
  "contentBlocks",
  "trackers",
  "actions",
  "subtitle",
  "instanceId",
] as const;

function parseCustomFeature(obj: Record<string, unknown>, path: string): CustomFeature {
  if (obj.custom !== true) fail("malformed-entry", path);
  if (typeof obj.title !== "string") fail("malformed-entry", path);
  if (typeof obj.emoji !== "string") fail("malformed-entry", path);
  if (typeof obj.source !== "string") fail("malformed-entry", path);
  if (!isItemInstanceId(obj.instanceId)) fail("malformed-entry", `${path}.instanceId`);
  const unknown = leftover(obj, CUSTOM_FEATURE_KEYS);
  return {
    custom: true,
    title: obj.title,
    emoji: obj.emoji,
    source: obj.source,
    tags: obj.tags === undefined ? [] : opt(obj.tags, isTagArray, `${path}.tags`),
    // The authored block/tracker/action dialects stay opaque (records), but the
    // ARRAY shape is enforced element-by-element so a malformed block quarantines.
    contentBlocks:
      obj.contentBlocks === undefined
        ? []
        : (recordArray(
            obj.contentBlocks,
            `${path}.contentBlocks`
          ) as unknown as CustomFeature["contentBlocks"]),
    ...(obj.trackers !== undefined
      ? {
          trackers: recordArray(
            obj.trackers,
            `${path}.trackers`
          ) as unknown as CustomFeature["trackers"],
        }
      : {}),
    ...(obj.actions !== undefined
      ? {
          actions: recordArray(
            obj.actions,
            `${path}.actions`
          ) as unknown as CustomFeature["actions"],
        }
      : {}),
    ...(obj.subtitle !== undefined
      ? { subtitle: opt(obj.subtitle, isString, `${path}.subtitle`) }
      : {}),
    instanceId: obj.instanceId,
    ...(unknown ? { unknown } : {}),
  };
}

// ─── Result types ──────────────────────────────────────────────────────────

export interface ImportResult {
  success: true;
  doc: Omit<CharacterDoc, "id" | "createdAt" | "updatedAt">;
  portraitBase64?: string | null;
  portraitCrop?: PortraitCrop | null;
}

export interface ImportError {
  success: false;
  error: string;
  /** Present when the rejection came from the codec itself (typed code + path). */
  failure?: CodecFailure;
}

// ─── Validation ───────────────────────────────────────────────────────────

const VALID_STATUSES: CharacterDoc["status"][] = [
  "active",
  "retired",
  "dead",
  "archived",
];

export function parseStatus(value: unknown): CharacterDoc["status"] {
  if (
    typeof value === "string" &&
    VALID_STATUSES.includes(value as CharacterDoc["status"])
  ) {
    return value as CharacterDoc["status"];
  }
  return "active";
}

/**
 * Validate the MUST-HAVE character fields — the ones it makes no sense for a
 * playable character to lack (owner directive 2026-06-15: make an invalid character
 * UNREPRESENTABLE; reject it at the boundary rather than tolerate it downstream).
 * Returns a human error message or `null` (valid). The set:
 *  - `name` — non-empty after trim (a `"   "` whitespace name is rejected, not just
 *    `""`), via the {@link nonEmptyString} smart constructor — the SAME gate the
 *    branded `CharacterData.name` type enforces at construction;
 *  - `race` — a non-empty species id (a persisted character always has a species);
 *  - `classes[]` — ≥ 1 entry, each a `classId` + a level in [1,20]; total in [1,20];
 *  - `abilityScores` — all six (STR/DEX/CON/INT/WIS/CHA) present and finite;
 *  - `hp.max` — a finite number ≥ 1 (a character always has at least 1 HP).
 * Truly-optional fields (subclassId before L3, portrait, quote, …) are NOT checked.
 */
export function validateCharacterData(data: unknown): string | null {
  if (!data || typeof data !== "object") return "Missing character data.";
  const d = data as Record<string, unknown>;
  if (nonEmptyString(d.name) === null) return "Character must have a name.";
  if (nonEmptyString(d.race) === null) return "Character must have a species.";
  // R4 — `classes[]` is the source of truth (single-class = one entry). Every entry
  // needs a classId + a level in [1,20], and the total level must be in [1,20].
  if (!Array.isArray(d.classes) || d.classes.length === 0) {
    return "Character must have a class.";
  }
  let total = 0;
  for (const e of d.classes) {
    if (!isRecord(e) || typeof e.classId !== "string" || e.classId === "") {
      return "Character must have a class.";
    }
    if (typeof e.level !== "number" || e.level < 1 || e.level > 20) {
      return "Character level must be between 1 and 20.";
    }
    total += e.level;
  }
  if (total < 1 || total > 20) {
    return "Character level must be between 1 and 20.";
  }
  if (!isRecord(d.abilityScores)) {
    return "Character must have ability scores.";
  }
  for (const code of ABILITY_CODES) {
    const v = d.abilityScores[code];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return "Character must have all six ability scores.";
    }
  }
  const hp = isRecord(d.hp) ? d.hp : undefined;
  if (!hp || typeof hp.max !== "number" || !Number.isFinite(hp.max) || hp.max < 1) {
    return "Character must have at least 1 hit point.";
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// The v3 schema
// ════════════════════════════════════════════════════════════════════════════

/** Integer schema version; the reader migrates anything `<=` its own version. */
export const SCHEMA_VERSION = 3;

/** The 11 lore fields, in their canonical order. */
const LORE_KEYS: ReadonlyArray<keyof CharacterLore> = [
  "traits",
  "ideals",
  "bonds",
  "flaws",
  "backstory",
  "age",
  "height",
  "weight",
  "eyes",
  "hair",
  "skin",
];

// ── tiny shape helpers ───────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v !== "";
}
function isNonEmptyArray(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0;
}
function isNonEmptyRecord(v: unknown): v is Record<string, unknown> {
  return isRecord(v) && Object.keys(v).length > 0;
}
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
// ── build reshape (minimal flat record ⇄ id-based `build`) ────────────────────

/**
 * Keys carried VERBATIM from the minimal record into `build` (no rename). These
 * only ever appear in the minimal record when they DEVIATE from the engine default
 * (the minimizer drops the default), so passing them through when present is exact.
 * (The always-kept collections — skills/spells/weapons/equipment — are NOT here:
 * they are emitted explicitly and omitted when empty.)
 */
const BUILD_PASSTHROUGH: readonly string[] = [
  "speed",
  "hitDieType",
  "savingThrows",
  "abilityBudget",
  "spellcasting",
  "spellSlots",
  "speciesSpellAbility",
  "levelUpChecklist",
  // Tool-CHOICE picks (slot id → chosen tool ids) — the id-based home for a
  // "choose a tool" decision. Carried verbatim; the minimizer drops it when empty
  // (it's in OPTIONAL_EMPTY_KEYS) so a choice-less doc stays clean. The tool
  // PROFICIENCY + the `fromToolChoice` pack item both derive from these ids.
  "toolChoices",
  // MANUAL language / tool picks as STABLE IDS (+ verbatim custom labels) — the
  // leak-proof home for hand-added proficiencies (golden rule 7). Id arrays, NEVER
  // a localized display string; the presenter localizes by id. The minimizer drops
  // an empty array (OPTIONAL_EMPTY_KEYS) so a clean doc carries none.
  "languageIds",
  "customLanguages",
  "toolProficiencyIds",
  "customToolProficiencies",
];

/** Scalar/map override fields → their `build.overrides` key. */
const OVERRIDE_MAP: ReadonlyArray<[string, string]> = [
  ["acOverride", "ac"],
  ["speedOverride", "speed"],
  ["proficiencyBonusOverride", "proficiencyBonus"],
  ["initiativeBonusOverride", "initiativeBonus"],
  ["initiativeAdvantageOverride", "initiativeAdvantage"],
  ["passivePerceptionOverride", "passivePerception"],
  ["passiveInsightOverride", "passiveInsight"],
  ["passiveInvestigationOverride", "passiveInvestigation"],
  ["hitDiceTotalOverride", "hitDiceTotal"],
  ["savingThrowBonusOverrides", "saves"],
  ["skillBonusOverrides", "skillBonuses"],
  ["senseRangeOverrides", "senseRanges"],
  ["speedOverrides", "speeds"],
  ["damageResistanceOverrides", "damageResistances"],
  ["damageImmunityOverrides", "damageImmunities"],
  ["damageVulnerabilityOverrides", "damageVulnerabilities"],
  ["conditionImmunityOverrides", "conditionImmunities"],
  ["armorProficiencyOverrides", "armorProficiencies"],
  ["weaponProficiencyOverrides", "weaponProficiencies"],
];

/**
 * GR10 read-normalization for the proficiency override maps: conform each key from
 * its legacy English label ("Light armor") to its stable {@link ProficiencyToken}
 * (`light-armor`) so an override stored before the token migration still applies.
 * Keys that don't resolve to a known proficiency (corrupt / removed kind) are
 * dropped — a key that can no longer match anything carries no override. Returns a
 * `Record<string, boolean>` (the codec stores it; the brand is the type-level
 * contract). When two legacy forms collapse to the SAME token (e.g. both "Light"
 * and "Light armor" present), the LAST `true` wins, then any `false` (a removal)
 * overrides — `false` is the safer outcome for a contradictory pair.
 */
function conformProficiencyOverrideKeys(raw: unknown): Record<string, boolean> {
  if (!isRecord(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "boolean") continue;
    const token = enToProficiencyToken(key);
    if (!token) continue;
    // A `false` (force-remove) for a token wins over a `true` for the same token.
    if (out[token] === false) continue;
    out[token] = value;
  }
  return out;
}

/**
 * GR10 — one-way decode-boundary read-normalization for the RA-25 initiative
 * override. A LIVE doc written before the four-state leg keyed it as a BOOLEAN
 * (`true` = force Advantage, `false` = suppress); map those to the string legs
 * (`true` → `"advantage"`, `false` → `"off"`) so an old export keeps its setting.
 * A valid string passes through; anything else drops to auto (undefined). Never
 * written back as a boolean.
 */
function normalizeInitiativeAdvantageOverride(
  v: unknown
): InitiativeAdvantageOverride | undefined {
  if (v === true) return "advantage";
  if (v === false) return "off";
  if (v === "advantage" || v === "disadvantage" || v === "off") return v;
  return undefined;
}

/** R4 — the per-class pick keys carried on a `ClassEntry` (string[] each). */
const CLASS_ENTRY_PICK_KEYS = [
  "weaponMasteries",
  "metamagicChoices",
  "invocationChoices",
  "maneuverChoices",
  "fightingStyles",
] as const;

/** The closed world of one `build.classes[]` entry (what `minimizeClasses` emits). */
const KNOWN_CLASS_ENTRY_KEYS: readonly string[] = [
  "classId",
  "subclassId",
  "level",
  ...CLASS_ENTRY_PICK_KEYS,
];

/**
 * Parse `build.classes` into the in-memory `ClassEntry[]` — TOTAL, like every other
 * entry collection: a non-record element or an element without a usable `classId` is
 * a `malformed-entry` at `build.classes[i]`, a wrong-typed `level` / `subclassId` /
 * pick array fails at its own field path, and every key outside
 * {@link KNOWN_CLASS_ENTRY_KEYS} is preserved in the entry's `unknown` bucket. An
 * absent `classes` yields `[]`, which `rehydrateCharacter`→`getClasses` backfills to a
 * non-empty default (and which `validateCharacterData` then rejects with the human
 * "Character must have a class."). (The codec only ever sees v3 envelopes — schema 2
 * is rejected upstream — so there are no legacy single-class fields to synthesize.)
 *
 * `level` is carried VERBATIM: range/integer normalization belongs to the ONE owner,
 * `getClasses`→`normalizeEntry` (clamp to [1,20]), so it is not duplicated here.
 * An EMPTY `subclassId` / pick array is treated as absent — the documented default the
 * minimizer also writes (`minimizeClasses` omits both), so the round-trip is exact.
 */
function parseClasses(raw: unknown): ClassEntry[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) fail("invalid-build", "build.classes");
  return raw.map((item, index) => {
    const path = `build.classes[${index}]`;
    if (!isRecord(item)) fail("malformed-entry", path);
    if (typeof item.classId !== "string" || item.classId === "") {
      fail("malformed-entry", path);
    }
    const entry: ClassEntry = {
      classId: item.classId,
      level: opt(item.level, isNumber, `${path}.level`),
    };
    if (item.subclassId !== undefined) {
      const subclassId = opt(item.subclassId, isString, `${path}.subclassId`);
      if (subclassId !== "") entry.subclassId = subclassId;
    }
    for (const key of CLASS_ENTRY_PICK_KEYS) {
      if (item[key] === undefined) continue;
      const picks = stringList(item[key], `${path}.${key}`);
      if (picks.length > 0) entry[key] = picks;
    }
    const unknown = leftover(item, KNOWN_CLASS_ENTRY_KEYS);
    if (unknown) entry.unknown = unknown;
    return entry;
  });
}

/** Strip empty-string lore fields (only flavor that was actually written ships). */
function loreToBuild(lore: unknown): Record<string, string> | undefined {
  if (!isRecord(lore)) return undefined;
  const out: Record<string, string> = {};
  for (const key of LORE_KEYS) {
    const v = lore[key];
    if (typeof v === "string" && v !== "") out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Refill the full 11-field lore object the in-memory shape expects. */
function loreFromBuild(lore: unknown): CharacterLore {
  const src = isRecord(lore) ? lore : {};
  const out = {} as CharacterLore;
  for (const key of LORE_KEYS) {
    const v = src[key];
    out[key] = typeof v === "string" ? v : "";
  }
  return out;
}

/**
 * The CLOSED WORLD of `build` keys — exactly the keys {@link minToBuild} can emit.
 * Anything else on a stored `build` is a key this app version does not know: it is
 * preserved verbatim in `CharacterData.unknown` and written back LAST.
 */
export const KNOWN_BUILD_KEYS: readonly string[] = [
  "name",
  "player",
  "quote",
  "race",
  "classes",
  "background",
  "alignment",
  "abilities",
  ...BUILD_PASSTHROUGH,
  "skills",
  "spells",
  "weapons",
  "equipment",
  "combatAlgorithm",
  "asi",
  "originFeats",
  "overrides",
  "features",
  "customs",
  "lore",
];

/** Reshape a minimal flat character record into the id-based `build`. */
function minToBuild(min: Record<string, unknown>): Record<string, unknown> {
  const build: Record<string, unknown> = {};
  build.name = asString(min.name);
  if (isNonEmptyString(min.playerName)) build.player = min.playerName;
  if (isNonEmptyString(min.quote)) build.quote = min.quote;
  // `min.race` is already a stable RaceId — serialize it verbatim (no name→id).
  build.race = asString(min.race);
  // R4 — schema 3: the multiclass breakdown is `build.classes` (id-first; single-
  // class = a one-entry array). There are no legacy single-class `class`/`subclass`/
  // `level` keys (a pre-v3 file is rejected upstream — see `parseCharacter`).
  build.classes = Array.isArray(min.classes) ? min.classes : [];
  build.background = backgroundIdByName(asString(min.background));
  // `min.alignment` is already a stable AlignmentId — serialize it verbatim
  // (no label→id); omit an empty alignment so it re-appears as "" on read.
  const alignId = asString(min.alignment);
  if (alignId) build.alignment = alignId;
  build.abilities = min.abilityScores ?? {};

  for (const key of BUILD_PASSTHROUGH) {
    if (min[key] !== undefined) build[key] = min[key];
  }
  // The always-kept collections — emit only when they carry data (an empty
  // skills/spells/weapons/equipment is the default and re-appears on read).
  if (isNonEmptyRecord(min.skills)) build.skills = min.skills;
  // Each entry is re-flattened: its known fields keep their order and the
  // preserved `unknown` bucket is spread back LAST (byte-identity for a canonical
  // document; verbatim survival for a future one).
  if (isNonEmptyArray(min.spells)) build.spells = flattenEntries(min.spells);
  if (isNonEmptyArray(min.weapons)) build.weapons = flattenEntries(min.weapons);
  if (isNonEmptyArray(min.equipment)) build.equipment = flattenEntries(min.equipment);
  // Combat algorithm is a decision-tree the player can customise — keep only a
  // non-empty one (the empty default re-appears on read).
  if (isNonEmptyArray(min.combatAlgorithm)) build.combatAlgorithm = min.combatAlgorithm;

  // The 2024 background ability increases.
  if (isNonEmptyRecord(min.backgroundAsi)) build.asi = { background: min.backgroundAsi };

  // The two CHOSEN origin feats (a fixed-background feat is inferred, so absent).
  const originFeats: Record<string, unknown> = {};
  if (isNonEmptyString(min.bgFeat)) originFeats.background = min.bgFeat;
  if (isNonEmptyString(min.humanOriginFeat)) originFeats.species = min.humanOriginFeat;
  if (Object.keys(originFeats).length > 0) build.originFeats = originFeats;

  // R4 — open class/subclass picks (weapon masteries / metamagic / invocations /
  // maneuvers) now ride ON each `build.classes[]` entry (schema 3), NOT a root
  // `build.picks` map. `minimizeClasses` folds the legacy root-level picks onto the
  // owning entry, so there is nothing to emit here.

  // Manual scalar/map overrides. (Manual languages/tools are now id arrays carried
  // via BUILD_PASSTHROUGH above — never a `build.overrides.languages` label string.)
  const overrides: Record<string, unknown> = {};
  for (const [minKey, oKey] of OVERRIDE_MAP) {
    const v = min[minKey];
    if (v !== undefined && v !== null) overrides[oKey] = v;
  }
  if (Object.keys(overrides).length > 0) build.overrides = overrides;

  // Features: SRD chosen-feat refs → `build.features`; custom (homebrew) features
  // + custom conditions → `build.customs`.
  const featuresRaw = Array.isArray(min.features) ? min.features : [];
  const srdFeatures = featuresRaw.filter((f) => !(isRecord(f) && f.custom === true));
  const customFeatures = featuresRaw.filter((f) => isRecord(f) && f.custom === true);
  if (srdFeatures.length > 0) build.features = flattenEntries(srdFeatures);
  const customs: Record<string, unknown> = {};
  if (customFeatures.length > 0) customs.features = flattenEntries(customFeatures);
  if (isNonEmptyArray(min.customConditions)) customs.conditions = min.customConditions;
  if (Object.keys(customs).length > 0) build.customs = customs;

  const lore = loreToBuild(min.lore);
  if (lore) build.lore = lore;

  // Unknown `build` keys the reader preserved: written back LAST, so a canonical
  // document (which has none) keeps its exact byte layout.
  if (isRecord(min.unknown)) Object.assign(build, min.unknown);

  return build;
}

/** Reverse {@link minToBuild}: an id-based `build` → the minimal flat record. */
function buildToMin(build: Record<string, unknown>): MinimalCharacter {
  const min: Record<string, unknown> = {};
  min.name = asString(build.name);
  min.playerName = isNonEmptyString(build.player) ? build.player : "";
  min.quote = isNonEmptyString(build.quote) ? build.quote : "";
  // Boundary read-normalization (golden rule 10): the stored value is a race id; an
  // ancient doc may hold a display NAME — `raceIdByName` passes an id through and maps
  // any legacy EN/IT name to its id, then we brand it. The in-memory race is an id.
  min.race = asRaceId(raceIdByName(asString(build.race)));
  // R4 — `build.classes` is the multiclass source of truth. `rehydrateCharacter`
  // re-derives the dropped class/subclass DISPLAY names from the entry ids +
  // the root-level pick fields from it, so the minimal record carries only `classes`.
  min.classes = parseClasses(build.classes);
  min.background =
    backgroundNameById(asString(build.background)) || asString(build.background);
  // Boundary read-normalization (golden rule 10): the stored value is an alignment
  // id; an ancient doc may hold a display LABEL — `alignmentIdByLabel` passes an id
  // through and maps any legacy EN label to its id, then we brand it. The in-memory
  // alignment is an id (or "" when absent/unknown).
  min.alignment = asAlignmentId(alignmentIdByLabel(asString(build.alignment)));
  min.abilityScores = isRecord(build.abilities) ? build.abilities : {};

  for (const key of BUILD_PASSTHROUGH) {
    if (build[key] !== undefined) min[key] = build[key];
  }
  // Dropped-from-schema fields default to today's in-memory shape.
  min.armorNote = "";
  min.sidebar = [];
  min.combatAlgorithm = Array.isArray(build.combatAlgorithm) ? build.combatAlgorithm : [];

  if (isRecord(build.asi) && isNonEmptyRecord(build.asi.background)) {
    min.backgroundAsi = build.asi.background;
  }

  if (isRecord(build.originFeats)) {
    if (isNonEmptyString(build.originFeats.background))
      min.bgFeat = build.originFeats.background;
    if (isNonEmptyString(build.originFeats.species))
      min.humanOriginFeat = build.originFeats.species;
  }

  // R4 — class-scoped picks live ON each `min.classes` entry (parsed above); there is
  // no root `build.picks` map and no legacy projection. Nothing to pull here.

  if (isRecord(build.overrides)) {
    const o = build.overrides;
    for (const [minKey, oKey] of OVERRIDE_MAP) {
      if (o[oKey] === undefined || o[oKey] === null) continue;
      // GR10 — the two proficiency override maps are keyed by a stable
      // {@link ProficiencyToken}, but a LIVE doc written before the migration keyed
      // them by the English label ("Light armor"). Conform every legacy key to its
      // token ON READ so the override still applies; this is one-way (never written
      // back as English). A value already a token (post-migration re-read) maps to
      // itself; an unrecognised key is dropped (it can no longer match anything).
      if (oKey === "armorProficiencies" || oKey === "weaponProficiencies") {
        min[minKey] = conformProficiencyOverrideKeys(o[oKey]);
      } else if (oKey === "initiativeAdvantage") {
        // GR10 — normalize a legacy boolean override to the RA-25 string leg.
        const normalized = normalizeInitiativeAdvantageOverride(o[oKey]);
        if (normalized !== undefined) min[minKey] = normalized;
      } else {
        min[minKey] = o[oKey];
      }
    }
  }
  // Manual language / tool picks: id arrays carried via BUILD_PASSTHROUGH; default
  // to empty when absent (a minimal doc drops the empty array). `rehydrateCharacter`
  // also fills these, but seed them here so `buildToMin` produces a complete record.
  min.languageIds = Array.isArray(build.languageIds) ? build.languageIds : [];
  min.customLanguages = Array.isArray(build.customLanguages) ? build.customLanguages : [];
  min.toolProficiencyIds = Array.isArray(build.toolProficiencyIds)
    ? build.toolProficiencyIds
    : [];
  min.customToolProficiencies = Array.isArray(build.customToolProficiencies)
    ? build.customToolProficiencies
    : [];

  // Features: SRD refs (validated) before custom features (validated). Both
  // collections are TOTAL — a malformed feature quarantines the document.
  if (build.customs !== undefined && !isRecord(build.customs)) {
    fail("invalid-build", "build.customs");
  }
  const customs = isRecord(build.customs) ? build.customs : {};
  const features: Array<SrdFeatureRef | CustomFeature> = [
    ...parseEntries(build.features, "build.features", parseFeatureEntry),
    ...parseEntries(customs.features, "build.customs.features", parseCustomFeature),
  ];
  if (features.length > 0) min.features = features;
  min.customConditions = stringList(customs.conditions, "build.customs.conditions");

  // Items: validate/reconstruct via the reused parsers.
  min.skills = isRecord(build.skills) ? build.skills : {};
  min.spells = parseEntries(build.spells, "build.spells", parseSpellEntry);
  min.weapons = parseEntries(build.weapons, "build.weapons", parseWeaponEntry);
  min.equipment = parseEntries(build.equipment, "build.equipment", parseEquipmentEntry);

  min.lore = loreFromBuild(build.lore);

  // Everything this app version does not know about `build`, preserved verbatim.
  const unknownBuild = leftover(build, KNOWN_BUILD_KEYS);
  if (unknownBuild) min.unknown = unknownBuild;

  return min as MinimalCharacter;
}

/**
 * The TOTAL collection reader: an absent collection is the empty default, a
 * non-array is an `invalid-build` failure at its own path, and every element is
 * parsed — a malformed one quarantines the document at `<path>[<index>]` instead
 * of being skipped (which would write a SHORTER array back over the user's data).
 */
function parseEntries<T>(
  raw: unknown,
  path: string,
  parseOne: (obj: Record<string, unknown>, path: string) => T
): T[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) fail("invalid-build", path);
  return raw.map((item, index) => {
    if (!isRecord(item)) fail("malformed-entry", `${path}[${index}]`);
    return parseOne(item, `${path}[${index}]`);
  });
}

function parseSpellEntry(
  obj: Record<string, unknown>,
  path: string
): SrdSpellRef | CustomSpell {
  if (obj.custom === true) return parseCustomSpell(obj, path);
  if (typeof obj.srdId === "string") return parseSrdSpellRef(obj, path);
  return fail("malformed-entry", path);
}

function parseWeaponEntry(
  obj: Record<string, unknown>,
  path: string
): SrdWeaponRef | CustomWeapon {
  if (obj.custom === true) return parseCustomWeapon(obj, path);
  if (typeof obj.srdId === "string") return parseSrdWeaponRef(obj, path);
  return fail("malformed-entry", path);
}

function parseEquipmentEntry(
  obj: Record<string, unknown>,
  path: string
): SrdEquipmentRef | CustomEquipment {
  if (obj.custom === true) return parseCustomEquipment(obj, path);
  if (typeof obj.srdId === "string") return parseSrdEquipmentRef(obj, path);
  return fail("malformed-entry", path);
}

function parseFeatureEntry(
  obj: Record<string, unknown>,
  path: string
): SrdFeatureRef | CustomFeature {
  if (obj.custom === true) return parseCustomFeature(obj, path);
  if (typeof obj.srdId === "string") return parseSrdFeatureRef(obj, path);
  return fail("malformed-entry", path);
}

// ── public codec ─────────────────────────────────────────────────────────────

/** The codec envelope (the persisted/exported character core): `{ schema, build,
 *  state }`. The SAME object is written to Firestore (spread + roster `cache` +
 *  metadata) AND stringified for the portable export (+ a `meta.portrait`) — ONE
 *  codec for both (owner directive 2026-06-14: persistence + export share parse/
 *  serialize). */
export interface CharacterEnvelope {
  schema: number;
  build: Record<string, unknown>;
  state: CompactSessionState;
}

/**
 * The codec CORE (Firestore-facing): serialize a `CharacterDoc` to the bare
 * `{ schema, build, state }` envelope OBJECT. Runs the character through
 * `minimizeCharacter` (drop every derivable field), reshapes into the id-based
 * `build`, and splits the session into the non-default `state`. No portrait/meta —
 * the Firestore doc keeps the portrait as a Storage URL on the metadata, not
 * embedded. `serializeCharacter` (the portable export) wraps this + the portrait.
 */
export function serializeCharacterEnvelope(doc: CharacterDoc): CharacterEnvelope {
  const min = minimizeCharacter(doc.character) as unknown as Record<string, unknown>;
  return {
    schema: SCHEMA_VERSION,
    build: minToBuild(min),
    state: sessionToState(doc.session),
  };
}

/**
 * Serialize a `CharacterDoc` to the v3 portable JSON. Wraps the shared
 * {@link serializeCharacterEnvelope} core and embeds the portrait (image data URL
 * + its framing CROP) under `meta` only when one is provided. The crop rides
 * ALONGSIDE the image so a re-imported portrait keeps the player's framing, not the
 * default. Pretty-printed (2-space). Byte-identical `state` to the Firestore write
 * (same core), so the persisted + exported forms can never drift.
 */
export function serializeCharacter(
  doc: CharacterDoc,
  portraitBase64?: string | null
): string {
  const envelope: Record<string, unknown> = { ...serializeCharacterEnvelope(doc) };
  if (portraitBase64) {
    const meta: Record<string, unknown> = { portrait: portraitBase64 };
    if (doc.portraitCrop) meta.portraitCrop = doc.portraitCrop;
    envelope.meta = meta;
  }
  return JSON.stringify(envelope, null, 2);
}

/**
 * Stamp a freshly-parsed character with its real `effectiveAC`. `rehydrate` leaves
 * `ac = 0` (the cockpit recomputes it live), but the SRD-free roster reads the
 * persisted `ac` snapshot — so without this an imported character shows "AC 0"
 * until first opened. Honors `acOverride` via `effectiveAC`.
 */
function stampImportedAc(result: ImportResult): ImportResult {
  try {
    const ac = effectiveAC(result.doc.character, result.doc.session);
    if (Number.isFinite(ac) && ac > 0) {
      return {
        ...result,
        doc: { ...result.doc, character: { ...result.doc.character, ac } },
      };
    }
  } catch {
    // Keep the rehydrated `ac` if computation fails for any reason.
  }
  return result;
}

/**
 * R4 — the app codec is schema-3 ONLY. A pre-v3 (schema < 3) file is REJECTED with
 * this stable, typed reason; the import UI shows a friendly "old format — ask your
 * campaign owner for the regenerated file" message (EN + IT). There is NO
 * upgrade-on-read in app code (owner directive 2026-06-09 — no legacy compatibility
 * in app code). This graceful rejection is the only transitional seam at the
 * untrusted-input boundary (golden rule 10): a pasted old export never crashes, it
 * is told to ask for a regenerated file. The v2→v3 migration of live data is done.
 */
export const SCHEMA_2_REJECTED_REASON = "schema-2-unsupported" as const;

/**
 * Result of {@link parseCharacterEnvelope} — the parsed engine core, or a TYPED
 * quarantine. `error` stays the existing human/sentinel string (`${code}:${path}`
 * for a structural failure, the validation message for `validation`) so existing
 * consumers are unchanged; `failure` carries the machine-readable reason.
 */
export type ParsedEnvelope =
  | { ok: true; character: CharacterData; session: SessionState }
  | { ok: false; error: string; failure: CodecFailure };

/**
 * The codec CORE (Firestore-facing): parse an ALREADY-PARSED `build` + `state`
 * (plain JS objects, no JSON/schema gate — the caller has those) into the in-memory
 * `CharacterData` + `SessionState`. De-ids the build, rehydrates every dropped
 * field, validates, and conforms the session (the race-trait pip remap +
 * sanitize). Shared by `parseCharacter` (the portable import) AND the Firestore
 * single-character load — ONE parse path, so the persisted + exported forms can
 * never drift. May pull the SRD class tables (via `rehydrateCharacter`); callers
 * that must stay SRD-free (the roster list) use the `cache` instead, never this.
 */
export function parseCharacterEnvelope(
  build: Record<string, unknown>,
  state: Record<string, unknown>
): ParsedEnvelope {
  try {
    return decodeEnvelope(build, state);
  } catch (error) {
    // The ONE place a codec quarantine becomes a value: every structural failure
    // raised by the entry parsers surfaces here as `{ ok: false, failure }`, so
    // the caller never sees a throw and never sees a silently repaired document.
    if (error instanceof CodecFailureError) {
      return { ok: false, error: error.message, failure: error.failure };
    }
    throw error;
  }
}

function decodeEnvelope(
  build: Record<string, unknown>,
  state: Record<string, unknown>
): ParsedEnvelope {
  if (!parseItemResources(state.itemResources).ok) {
    return {
      ok: false,
      error: "invalid-item-resources",
      failure: { code: "invalid-item-resources", path: "state.itemResources" },
    };
  }
  const min = buildToMin(build);
  const character = rehydrateCharacter(min);
  const validation = validateCharacterData(character);
  if (validation) {
    return {
      ok: false,
      error: validation,
      failure: { code: "validation", path: "build", detail: validation },
    };
  }
  // Validation just PROVED the name is non-empty; brand it so the returned
  // `CharacterData.name` is a real `NonEmptyString` (not merely a plain string that
  // happens to be non-empty). This is the ONE seam shared by the portable import AND
  // the Firestore single-load, so both paths produce a branded name.
  character.name = assertNonEmptyString(character.name, "character name");

  // `rehydrateCharacter` DROPPED any stored race-trait `features[]` ref that
  // duplicated the auto-granted trait (the legacy bake). Migrate the persisted pip
  // STATE from the dropped id (`orc-adrenaline-rush`) onto the surviving race
  // session id (`race:orc:adrenaline-rush`) so a user's spent uses are not silently
  // restored. Same pure fold the rehydrate used → the remap is consistent.
  const featureRemap = conformStoredFeatures({
    race: min.race,
    classes: min.classes,
    features: Array.isArray(min.features) ? min.features : [],
  }).trackerIdRemap;
  const remappedSession = remapSessionTrackerIds(
    sanitizeSession(stateToSession(state)),
    featureRemap
  );
  // SRD-aware boundary read-normalization (golden rules 7 + 10): the race-trait
  // session id was reshaped from `race:<raceId>:<EN name>` to `race:<raceId>:<trait.id>`
  // (the engine no longer embeds an English display name in a stored key). A doc written
  // before that change carries the legacy EN-name form in `state.trackers` keys,
  // `pinnedActions`/`unpinnedActions`, AND `spells[].freeCastSource.sourceId` — conform
  // ALL FOUR here (the codec is SRD-aware), so a live user's spent-uses / pinned / free-
  // cast state survives the reshape (no migration; bounded, one-way, idempotent).
  const { character: conformedCharacter, session } = conformRaceTraitSessionIds(
    character,
    remappedSession
  );
  // SRD-aware boundary read-normalization (golden rule 10): a pre-id doc froze a
  // concentration log row's `event.spell` as a localized spell NAME. `sanitizeSession`'s
  // SRD-free `normalizeLogEntry` conforms `actionName`/`riderName` but CANNOT touch
  // `event.spell` (no spell index), so conform it here — the codec is SRD-aware — through
  // the ONE shared helper the IDB-restore path also uses, so the Firestore single-load +
  // JSON-import + IndexedDB paths are symmetric (golden rule 6) and a legacy bare name
  // can never reach the strict `concentrationLabel` resolver.
  return {
    ok: true,
    character: conformedCharacter,
    session: {
      ...session,
      logEntries: session.logEntries.map(normalizeLogEntryConcentration),
    },
  };
}

/**
 * Stamp a freshly-parsed character with its real `effectiveAC` IN PLACE on a
 * CharacterData (the Firestore single-load equivalent of {@link stampImportedAc}).
 * `rehydrate` leaves `ac = 0`; the cockpit recomputes live, but stamping the parsed
 * value keeps the first paint correct. Honors `acOverride` via `effectiveAC`.
 */
export function stampEffectiveAc(
  character: CharacterData,
  session: SessionState
): CharacterData {
  try {
    const ac = effectiveAC(character, session);
    if (Number.isFinite(ac) && ac > 0 && character.ac !== ac) {
      return { ...character, ac };
    }
  } catch {
    // Keep the rehydrated `ac` if computation fails for any reason.
  }
  return character;
}

/**
 * Parse a v3 portable JSON into a `CharacterDoc`. Reverses the `build`/`state`
 * reshape, de-ids race/background/alignment back to the display strings the in-memory
 * shape expects, rehydrates every dropped field, sanitizes the session, and stamps
 * the real AC. A document without a numeric `schema`, a schema < 3, or a schema >
 * SCHEMA_VERSION is rejected.
 */
export function parseCharacter(jsonString: string): ImportResult | ImportError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { success: false, error: "Invalid JSON: could not parse file." };
  }
  if (!isRecord(parsed)) {
    return { success: false, error: "Invalid format: expected a JSON object." };
  }
  if (typeof parsed.schema !== "number") {
    return {
      success: false,
      error: "Unrecognized format: file is not a d20-folio character export (no schema).",
    };
  }
  if (parsed.schema < SCHEMA_VERSION) {
    // Old (pre-v3) format. App code never upgrades it (no legacy branches) — it is
    // rejected gracefully so the import UI can tell the user to ask for a fresh file.
    return { success: false, error: SCHEMA_2_REJECTED_REASON };
  }
  if (parsed.schema > SCHEMA_VERSION) {
    return {
      success: false,
      error: `Unsupported version: file is schema ${parsed.schema}, but this app supports up to schema ${SCHEMA_VERSION}. Please update d20-folio.`,
    };
  }

  const build = isRecord(parsed.build) ? parsed.build : {};
  const state = isRecord(parsed.state) ? parsed.state : {};
  const meta = isRecord(parsed.meta) ? parsed.meta : {};

  const parsedCore = parseCharacterEnvelope(build, state);
  if (!parsedCore.ok) {
    return { success: false, error: parsedCore.error, failure: parsedCore.failure };
  }
  const { character, session: conformedSession } = parsedCore;

  // Portrait: the image (data URL) + its framing CROP both ride under `meta`. The
  // crop is surfaced on BOTH the doc and the top-level result — the import flow
  // (`use-character-import`) re-uploads `portraitBase64` to Storage and attaches
  // `result.portraitCrop`, so the imported portrait keeps the player's framing.
  const portraitCrop = normalizePortraitCrop(meta.portraitCrop);
  const result: ImportResult = {
    success: true,
    doc: {
      character,
      session: conformedSession,
      status: parseStatus(parsed.status),
      portraitUrl: null,
      portraitCrop,
      shared: false,
      // An imported document is a NEW character: `createCharacter` writes generation 0.
      revision: 0,
    },
    portraitBase64: typeof meta.portrait === "string" ? meta.portrait : null,
    portraitCrop,
  };
  return stampImportedAc(result);
}

// `sanitizeSession` re-exported so existing `from "@/lib/character-codec"` callers
// (and the character-io re-export) get it from one place; `CodecFailure` likewise,
// so a consumer that reads `ImportError.failure` needs only the codec import.
export { sanitizeSession };
export type { CodecFailure } from "./codec-failure";

// ─── The enumerated read seams (docs/CHARACTER_SCHEMA.md → "The remaining non-total seams") ──

/**
 * Every DOCUMENTED one-way read normalization of this codec, as the path it touches.
 * Totality is structural; these are the value-level seams the reader keeps: a retired
 * key is read and discarded, a legacy shape is conformed to its canonical form. The
 * codec-loss audit (`scripts/lib/codec-loss-audit.ts`) classifies a round-trip change
 * on one of these paths as `conformed`; any other change is a loss. Adding a seam here
 * is a documented decision, never a way to silence a finding: every entry is anchored to
 * the exact path(s) the named function rewrites, and a new entry needs a negative test
 * (a non-documented drop under the same prefix must still be a loss).
 */
export const CODEC_READ_SEAMS: ReadonlyArray<{ seam: string; pattern: RegExp }> = [
  // `RETIRED_STATE_KEYS` (session-state-codec.ts): the solo round moved to `combat/state`.
  { seam: "retired-state-round", pattern: /^state\.round$/ },
  // Manual language / tool picks are id arrays on the build (`languageIds`,
  // `toolProficiencyIds`); the pre-migration label strings under `build.overrides`
  // match nothing any more and are read-and-discarded. Only frozen snapshots carry them.
  { seam: "retired-override-labels", pattern: /^build\.overrides\.(languages|tools)$/ },
  // GR10: the boolean initiative-advantage leg conforms to the RA-25 string leg.
  {
    seam: "initiative-advantage-legacy-boolean",
    pattern: /^build\.overrides\.initiativeAdvantage$/,
  },
  // GR10: English proficiency-override labels conform to their token; unmatched ones drop.
  {
    seam: "proficiency-override-key-conform",
    pattern: /^build\.overrides\.(armorProficiencies|weaponProficiencies)(\.|$)/,
  },
  // `remapSessionTrackerIds` + `conformRaceTraitSessionIds`: a tracker KEY conforms to
  // its id (the whole entry moves); a drop inside an entry is not a seam.
  { seam: "tracker-id-conform", pattern: /^state\.trackers\.[^.]+$/ },
  // `normalizeConcentrationRef` / `normalizeLogEntryConcentration`: legacy refs conform.
  { seam: "concentration-ref-conform", pattern: /^state\.concentration(\.|$)/ },
  // `normalizeLogEntry` (sanitizeSession): a legacy `{ msg | text, t, type, slot }` row
  // becomes a `legacy` event, a pre-LocText `actionName` / `riderName` becomes a custom
  // LocText, a missing id / ts is filled. A dropped ROW or any other row field is a loss.
  {
    seam: "log-entry-normalize",
    pattern:
      /^state\.log\[\d+\]\.(t|text|msg|type|slot|ts|id|event\.(kind|text|legacyType|slot|actionName|riderName|(action|rider)(\.custom)?))$/,
  },
  // A non-token equipment `unit` is dropped (`parseEquipmentEntry`, SRD ref and custom).
  { seam: "unit-non-token", pattern: /^build\.equipment\[\d+\]\.unit$/ },
];
