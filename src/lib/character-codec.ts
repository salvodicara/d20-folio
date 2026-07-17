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
 * The reader still tolerates unknown future fields (ignored) and missing optional
 * fields (defaulted), and the writer always emits schema 3.
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
  LogEntry,
  PortraitCrop,
} from "@/types/character";
import type {
  SpellSchool,
  DamageType,
  Recovery,
  AbilityCode,
  TrackerUnit,
} from "@/data/types";
import { TRACKER_UNITS } from "@/data/types";
import {
  minimizeCharacter,
  rehydrateCharacter,
  type MinimalCharacter,
} from "./character-minimal";
import { sanitizeSession } from "./sanitize-session";
import {
  normalizeStoredConcentration,
  normalizeLogEntryConcentration,
} from "./concentration";
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

// ─── Primitive validators ───────────────────────────────────────────────────

export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
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

const DAMAGE_TYPES: DamageType[] = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
];
export function isDamageType(val: unknown): val is DamageType {
  return typeof val === "string" && (DAMAGE_TYPES as string[]).includes(val);
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

function parseEquipmentCharges(val: unknown): EquipmentCharges | undefined {
  if (!isRecord(val)) return undefined;
  if (typeof val.current !== "number" || typeof val.max !== "number") return undefined;
  const charges: EquipmentCharges = { current: val.current, max: val.max };
  if (isRecovery(val.recovery)) charges.recovery = val.recovery;
  if (typeof val.recoveryFormula === "string")
    charges.recoveryFormula = val.recoveryFormula;
  return charges;
}

/** Custom-armor AC shape for CustomEquipment.ac. */
type CustomArmorAc = { base: number; dexBonus: boolean; maxDex?: number };

function parseCustomArmorAc(val: unknown): CustomArmorAc | undefined {
  if (!isRecord(val)) return undefined;
  if (typeof val.base !== "number" || typeof val.dexBonus !== "boolean") return undefined;
  const ac: CustomArmorAc = { base: val.base, dexBonus: val.dexBonus };
  if (typeof val.maxDex === "number") ac.maxDex = val.maxDex;
  return ac;
}

const ARMOR_CATEGORIES = ["light", "medium", "heavy", "shield"] as const;
type ArmorCategory = (typeof ARMOR_CATEGORIES)[number];
function isArmorCategory(val: unknown): val is ArmorCategory {
  return typeof val === "string" && (ARMOR_CATEGORIES as readonly string[]).includes(val);
}

// ─── SRD ref constructors ────────────────────────────────────────────────────
// Validate the required field(s), then pick optional fields individually so the
// returned object is fully typed with no casts and LOSSLESS (every optional field
// the in-memory type carries survives a parse — the round-trip invariant).

function parseFreeCastSource(val: unknown): SrdSpellRef["freeCastSource"] | undefined {
  if (!isRecord(val)) return undefined;
  if (typeof val.sourceId !== "string") return undefined;
  if (val.rest !== "short" && val.rest !== "long") return undefined;
  if (typeof val.usesPerRest !== "number") return undefined;
  return { sourceId: val.sourceId, rest: val.rest, usesPerRest: val.usesPerRest };
}

function parseSrdSpellRef(obj: Record<string, unknown>): SrdSpellRef | null {
  if (typeof obj.srdId !== "string") return null;
  const ref: SrdSpellRef = { srdId: obj.srdId };
  if (typeof obj.prepared === "boolean") ref.prepared = obj.prepared;
  if (typeof obj.alwaysPrepared === "boolean") ref.alwaysPrepared = obj.alwaysPrepared;
  if (typeof obj.notes === "string") ref.notes = obj.notes;
  if (isTagArray(obj.tags)) ref.tags = obj.tags;
  if (isRecord(obj.overrides)) ref.overrides = obj.overrides;
  if (isAbilityCode(obj.spellAbilityOverride))
    ref.spellAbilityOverride = obj.spellAbilityOverride;
  if (typeof obj.wizardSpellMastery === "boolean")
    ref.wizardSpellMastery = obj.wizardSpellMastery;
  if (typeof obj.wizardSignatureSpell === "boolean")
    ref.wizardSignatureSpell = obj.wizardSignatureSpell;
  if (typeof obj.speciesSpellAbility === "boolean")
    ref.speciesSpellAbility = obj.speciesSpellAbility;
  const freeCast = parseFreeCastSource(obj.freeCastSource);
  if (freeCast) ref.freeCastSource = freeCast;
  return ref;
}

function parseSrdWeaponRef(obj: Record<string, unknown>): SrdWeaponRef | null {
  if (typeof obj.srdId !== "string") return null;
  const ref: SrdWeaponRef = {
    srdId: obj.srdId,
    quantity: typeof obj.quantity === "number" ? obj.quantity : 1,
  };
  if (typeof obj.notes === "string") ref.notes = obj.notes;
  if (isTagArray(obj.tags)) ref.tags = obj.tags;
  if (obj.attackBonusOverride === null || typeof obj.attackBonusOverride === "number")
    ref.attackBonusOverride = obj.attackBonusOverride;
  if (obj.damageOverride === null || typeof obj.damageOverride === "string")
    ref.damageOverride = obj.damageOverride;
  if (isRecord(obj.overrides)) ref.overrides = obj.overrides;
  return ref;
}

function parseSrdEquipmentRef(obj: Record<string, unknown>): SrdEquipmentRef | null {
  if (typeof obj.srdId !== "string") return null;
  const ref: SrdEquipmentRef = { srdId: obj.srdId };
  if (typeof obj.notes === "string") ref.notes = obj.notes;
  if (typeof obj.equipped === "boolean") ref.equipped = obj.equipped;
  if (typeof obj.tracked === "boolean") ref.tracked = obj.tracked;
  if (typeof obj.quantity === "number") ref.quantity = obj.quantity;
  if (isRecovery(obj.recovery)) ref.recovery = obj.recovery;
  if (typeof obj.isConsumable === "boolean") ref.isConsumable = obj.isConsumable;
  if (typeof obj.isPotion === "boolean") ref.isPotion = obj.isPotion;
  if (typeof obj.potionFormula === "string") ref.potionFormula = obj.potionFormula;
  if (typeof obj.isPool === "boolean") ref.isPool = obj.isPool;
  if (isTrackerUnit(obj.unit)) ref.unit = obj.unit;
  if (typeof obj.acBonus === "number") ref.acBonus = obj.acBonus;
  if (typeof obj.attuned === "boolean") ref.attuned = obj.attuned;
  const charges = parseEquipmentCharges(obj.charges);
  if (charges) ref.charges = charges;
  if (isRecord(obj.overrides)) ref.overrides = obj.overrides;
  return ref;
}

function parseSrdFeatureRef(obj: Record<string, unknown>): SrdFeatureRef | null {
  if (typeof obj.srdId !== "string") return null;
  const ref: SrdFeatureRef = { srdId: obj.srdId };
  if (typeof obj.notes === "string") ref.notes = obj.notes;
  if (isTagArray(obj.tags)) ref.tags = obj.tags;
  if (isRecord(obj.overrides)) ref.overrides = obj.overrides;
  return ref;
}

// ─── Custom item constructors ─────────────────────────────────────────────────

function parseCustomSpell(obj: Record<string, unknown>): CustomSpell | null {
  if (obj.custom !== true) return null;
  if (typeof obj.name !== "string") return null;
  if (typeof obj.level !== "number") return null;
  if (!isSpellSchool(obj.school)) return null;
  if (typeof obj.castingTime !== "string") return null;
  if (typeof obj.range !== "string") return null;
  if (!isRecord(obj.components)) return null;
  const c = obj.components;
  if (typeof c.v !== "boolean" || typeof c.s !== "boolean" || typeof c.m !== "boolean")
    return null;
  if (typeof obj.duration !== "string") return null;
  if (typeof obj.concentration !== "boolean") return null;
  if (typeof obj.description !== "string") return null;
  const spell: CustomSpell = {
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
      ...(typeof c.material === "string" ? { material: c.material } : {}),
    },
    duration: obj.duration,
    concentration: obj.concentration,
    description: obj.description,
  };
  if (typeof obj.higherLevels === "string") spell.higherLevels = obj.higherLevels;
  if (typeof obj.prepared === "boolean") spell.prepared = obj.prepared;
  if (typeof obj.notes === "string") spell.notes = obj.notes;
  if (isTagArray(obj.tags)) spell.tags = obj.tags;
  if (isAbilityCode(obj.spellAbilityOverride))
    spell.spellAbilityOverride = obj.spellAbilityOverride;
  return spell;
}

function parseCustomWeapon(obj: Record<string, unknown>): CustomWeapon | null {
  if (obj.custom !== true) return null;
  if (typeof obj.name !== "string") return null;
  if (typeof obj.damageDie !== "string") return null;
  if (!isDamageType(obj.damageType)) return null;
  if (obj.attackStat !== "STR" && obj.attackStat !== "DEX") return null;
  if (typeof obj.properties !== "string") return null;
  const weapon: CustomWeapon = {
    custom: true,
    name: obj.name,
    quantity: typeof obj.quantity === "number" ? obj.quantity : 1,
    damageDie: obj.damageDie,
    damageType: obj.damageType,
    attackStat: obj.attackStat,
    properties: obj.properties,
  };
  if (typeof obj.emoji === "string") weapon.emoji = obj.emoji;
  if (obj.attackBonusOverride === null || typeof obj.attackBonusOverride === "number")
    weapon.attackBonusOverride = obj.attackBonusOverride;
  if (obj.damageOverride === null || typeof obj.damageOverride === "string")
    weapon.damageOverride = obj.damageOverride;
  if (typeof obj.description === "string") weapon.description = obj.description;
  if (typeof obj.notes === "string") weapon.notes = obj.notes;
  if (isTagArray(obj.tags)) weapon.tags = obj.tags;
  return weapon;
}

function parseCustomEquipment(obj: Record<string, unknown>): CustomEquipment | null {
  if (obj.custom !== true) return null;
  if (typeof obj.name !== "string") return null;
  const equip: CustomEquipment = { custom: true, name: obj.name };
  if (typeof obj.description === "string") equip.description = obj.description;
  if (typeof obj.emoji === "string") equip.emoji = obj.emoji;
  if (typeof obj.notes === "string") equip.notes = obj.notes;
  if (typeof obj.equipped === "boolean") equip.equipped = obj.equipped;
  const ac = parseCustomArmorAc(obj.ac);
  if (ac) equip.ac = ac;
  if (isArmorCategory(obj.armorCategory)) equip.armorCategory = obj.armorCategory;
  if (typeof obj.acBonus === "number") equip.acBonus = obj.acBonus;
  if (typeof obj.tracked === "boolean") equip.tracked = obj.tracked;
  if (typeof obj.quantity === "number") equip.quantity = obj.quantity;
  if (isRecovery(obj.recovery)) equip.recovery = obj.recovery;
  if (typeof obj.isConsumable === "boolean") equip.isConsumable = obj.isConsumable;
  if (typeof obj.isPotion === "boolean") equip.isPotion = obj.isPotion;
  if (typeof obj.potionFormula === "string") equip.potionFormula = obj.potionFormula;
  if (typeof obj.isPool === "boolean") equip.isPool = obj.isPool;
  if (isTrackerUnit(obj.unit)) equip.unit = obj.unit;
  if (typeof obj.attuned === "boolean") equip.attuned = obj.attuned;
  const charges = parseEquipmentCharges(obj.charges);
  if (charges) equip.charges = charges;
  return equip;
}

function parseCustomFeature(obj: Record<string, unknown>): CustomFeature | null {
  if (obj.custom !== true) return null;
  if (typeof obj.title !== "string") return null;
  if (typeof obj.emoji !== "string") return null;
  if (typeof obj.source !== "string") return null;
  return {
    custom: true,
    title: obj.title,
    emoji: obj.emoji,
    source: obj.source,
    tags: isTagArray(obj.tags) ? obj.tags : [],
    contentBlocks: Array.isArray(obj.contentBlocks)
      ? (obj.contentBlocks as CustomFeature["contentBlocks"])
      : [],
    ...(Array.isArray(obj.trackers)
      ? { trackers: obj.trackers as CustomFeature["trackers"] }
      : {}),
    ...(Array.isArray(obj.actions)
      ? { actions: obj.actions as CustomFeature["actions"] }
      : {}),
    ...(typeof obj.subtitle === "string" ? { subtitle: obj.subtitle } : {}),
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
function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
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

/** R4 — the per-class pick keys carried on a `ClassEntry` (string[] each). */
const CLASS_ENTRY_PICK_KEYS = [
  "weaponMasteries",
  "metamagicChoices",
  "invocationChoices",
  "maneuverChoices",
  "fightingStyles",
] as const;

/**
 * Parse `build.classes` into the in-memory `ClassEntry[]`. Validates ids/levels and
 * keeps only well-formed entries; an empty/garbage array yields `[]`, which
 * `rehydrateCharacter`→`getClasses` then backfills to a non-empty default. (The codec
 * only ever sees v3 envelopes — schema 2 is rejected upstream — so there are no legacy
 * single-class fields here to synthesize from.)
 */
function parseClasses(raw: unknown): ClassEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ClassEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if (typeof item.classId !== "string" || item.classId === "") continue;
    const entry: ClassEntry = {
      classId: item.classId,
      level:
        typeof item.level === "number" && item.level >= 1 ? Math.floor(item.level) : 1,
    };
    if (typeof item.subclassId === "string" && item.subclassId !== "") {
      entry.subclassId = item.subclassId;
    }
    for (const key of CLASS_ENTRY_PICK_KEYS) {
      const v = item[key];
      if (Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string")) {
        entry[key] = v;
      }
    }
    out.push(entry);
  }
  return out;
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
  if (isNonEmptyArray(min.spells)) build.spells = min.spells;
  if (isNonEmptyArray(min.weapons)) build.weapons = min.weapons;
  if (isNonEmptyArray(min.equipment)) build.equipment = min.equipment;
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
  if (srdFeatures.length > 0) build.features = srdFeatures;
  const customs: Record<string, unknown> = {};
  if (customFeatures.length > 0) customs.features = customFeatures;
  if (isNonEmptyArray(min.customConditions)) customs.conditions = min.customConditions;
  if (Object.keys(customs).length > 0) build.customs = customs;

  const lore = loreToBuild(min.lore);
  if (lore) build.lore = lore;

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

  // Features: combine SRD refs (validated) before custom features (validated).
  const features: Array<SrdFeatureRef | CustomFeature> = [];
  if (Array.isArray(build.features)) {
    for (const f of build.features) {
      if (isRecord(f)) {
        const ref = parseSrdFeatureRef(f);
        if (ref) features.push(ref);
      }
    }
  }
  const customs = isRecord(build.customs) ? build.customs : {};
  if (Array.isArray(customs.features)) {
    for (const f of customs.features) {
      if (isRecord(f)) {
        const cf = parseCustomFeature(f);
        if (cf) features.push(cf);
      }
    }
  }
  if (features.length > 0) min.features = features;
  min.customConditions = Array.isArray(customs.conditions)
    ? customs.conditions.filter((c): c is string => typeof c === "string")
    : [];

  // Items: validate/reconstruct via the reused parsers.
  min.skills = isRecord(build.skills) ? build.skills : {};
  min.spells = parseSpells(build.spells);
  min.weapons = parseWeapons(build.weapons);
  min.equipment = parseEquipment(build.equipment);

  min.lore = loreFromBuild(build.lore);

  return min as MinimalCharacter;
}

function parseSpells(raw: unknown): Array<SrdSpellRef | CustomSpell> {
  if (!Array.isArray(raw)) return [];
  const out: Array<SrdSpellRef | CustomSpell> = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const custom = parseCustomSpell(item);
    if (custom) {
      out.push(custom);
      continue;
    }
    const srd = parseSrdSpellRef(item);
    if (srd) out.push(srd);
  }
  return out;
}

function parseWeapons(raw: unknown): Array<SrdWeaponRef | CustomWeapon> {
  if (!Array.isArray(raw)) return [];
  const out: Array<SrdWeaponRef | CustomWeapon> = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const custom = parseCustomWeapon(item);
    if (custom) {
      out.push(custom);
      continue;
    }
    const srd = parseSrdWeaponRef(item);
    if (srd) out.push(srd);
  }
  return out;
}

function parseEquipment(raw: unknown): Array<SrdEquipmentRef | CustomEquipment> {
  if (!Array.isArray(raw)) return [];
  const out: Array<SrdEquipmentRef | CustomEquipment> = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const custom = parseCustomEquipment(item);
    if (custom) {
      out.push(custom);
      continue;
    }
    const srd = parseSrdEquipmentRef(item);
    if (srd) out.push(srd);
  }
  return out;
}

// ── state reshape (session ⇄ minimal `state`) ────────────────────────────────

/** Flatten `{ id: { used } }` to `{ id: used }`, keeping only spent (>0) entries. */
function flattenUsed(map: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(map)) return out;
  for (const [k, v] of Object.entries(map)) {
    const used = isRecord(v) && typeof v.used === "number" ? v.used : 0;
    if (used > 0) out[k] = used;
  }
  return out;
}

/** Expand `{ id: used }` back to `{ id: { used } }`. */
function expandUsed(map: unknown): Record<string, { used: number }> {
  const out: Record<string, { used: number }> = {};
  if (!isRecord(map)) return out;
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "number") out[k] = { used: v };
  }
  return out;
}

const COIN_KEYS = ["pp", "gp", "ep", "sp", "cp"] as const;

function logToState(e: LogEntry): Record<string, unknown> {
  // Events-as-data: the entry stores a STRUCTURED `event` (ids + numbers), not a
  // localized line — so the exported/synced log is locale-independent and the
  // presenter localizes at render. `event` is JSON-serializable (a discriminated
  // union of primitives), so it round-trips verbatim.
  return { event: e.event, ts: e.ts, id: e.id };
}

/** Reshape a sanitized session into the minimal, non-default-only `state`. */
function sessionToState(s: SessionState): Record<string, unknown> {
  const state: Record<string, unknown> = {};

  const hp: Record<string, number> = {};
  if (s.hp.current !== 0) hp.current = s.hp.current;
  if (s.hp.temp !== 0) hp.temp = s.hp.temp;
  if (Object.keys(hp).length > 0) state.hp = hp;

  if (s.hitDice.used !== 0) state.usedHitDice = s.hitDice.used;

  const trackers = flattenUsed(s.trackers);
  if (Object.keys(trackers).length > 0) state.trackers = trackers;

  const usedSlots = flattenUsed(s.spellSlots);
  if (Object.keys(usedSlots).length > 0) state.usedSlots = usedSlots;

  const currency: Record<string, number> = {};
  for (const coin of COIN_KEYS) {
    if (s.currency[coin] !== 0) currency[coin] = s.currency[coin];
  }
  if (Object.keys(currency).length > 0) state.currency = currency;

  if (s.concentration !== "") state.concentration = s.concentration;
  if (s.initiative !== "") state.initiative = s.initiative;
  if (s.conditions.length > 0) state.conditions = s.conditions;
  if (s.deathSucc !== 0) state.deathSucc = s.deathSucc;
  if (s.deathFail !== 0) state.deathFail = s.deathFail;
  if (s.inspiration) state.inspiration = true;
  if (s.exhaustion !== 0) state.exhaustion = s.exhaustion;
  if (s.pinnedActions.length > 0) state.pinnedActions = s.pinnedActions;
  if (s.unpinnedActions && s.unpinnedActions.length > 0)
    state.unpinnedActions = s.unpinnedActions;
  if (s.notes !== "") state.notes = s.notes;
  if (s.logEntries.length > 0) state.log = s.logEntries.map(logToState);

  if (isNonEmptyArray(s.activeFeatures)) state.activeFeatures = s.activeFeatures;
  if (isNonEmptyRecord(s.effectTimers)) state.effectTimers = s.effectTimers;
  if (isNonEmptyRecord(s.grantBundleChoices))
    state.grantBundleChoices = s.grantBundleChoices;
  if (isNonEmptyRecord(s.companionHp)) state.companionHp = s.companionHp;
  if (isNonEmptyRecord(s.manifestedWeaponOverrides))
    state.manifestedWeaponOverrides = s.manifestedWeaponOverrides;
  if (isNonEmptyRecord(s.pactWeaponConfig)) state.pactWeaponConfig = s.pactWeaponConfig;
  if (isNonEmptyRecord(s.pactWeaponRiderTypes))
    state.pactWeaponRiderTypes = s.pactWeaponRiderTypes;
  // S7 — the active Polymorph form (absent for every non-polymorph doc, so the
  // envelope stays byte-identical; ADDITIVE-only).
  if (s.polymorphForm) state.polymorphForm = s.polymorphForm;
  if (isNonEmptyString(s.bardicInspirationDie))
    state.bardicInspirationDie = s.bardicInspirationDie;

  return state;
}

/** Reverse {@link sessionToState}: a `state` → a Partial the sanitizer completes. */
function stateToSession(state: Record<string, unknown>): Partial<SessionState> {
  const s: Partial<SessionState> = {};
  const hp = isRecord(state.hp) ? state.hp : {};
  // One-way read-normalization (golden rule 10): a not-yet-migrated doc may carry a
  // legacy `hp.aidBonus` — SUPERSEDED by the Aid `while-active` hp-flat grant. Silently
  // DROP it (don't read it into state, don't write it back); the Aid toggle now adds the
  // HP, so carrying it would DOUBLE-COUNT (aidBonus:5 + the toggle = +10).
  s.hp = {
    current: numOr(hp.current, 0),
    temp: numOr(hp.temp, 0),
  };
  s.hitDice = { used: numOr(state.usedHitDice, 0) };
  s.trackers = expandUsed(state.trackers);
  s.spellSlots = expandUsed(state.usedSlots);
  const currency = isRecord(state.currency) ? state.currency : {};
  s.currency = {
    pp: numOr(currency.pp, 0),
    gp: numOr(currency.gp, 0),
    ep: numOr(currency.ep, 0),
    sp: numOr(currency.sp, 0),
    cp: numOr(currency.cp, 0),
  };
  // One-way boundary normalization (golden rule 10): the SOLO round moved from
  // `session.round` (parent doc) to the `combat/state` subdoc. A legacy export / stored
  // doc may still carry `state.round`; it is READ-AND-DROPPED here (never written back —
  // the writer no longer emits it, the migration copies it into the subdoc). Nothing on
  // the in-memory session carries the round anymore; the turn engine (`combatStore`) owns it.
  // Boundary read-normalization (golden rule 10): a legacy bare NAME (or any non-id,
  // non-`custom:` value) is conformed so it can never reach the strict resolver.
  s.concentration = normalizeStoredConcentration(state.concentration);
  s.initiative = asString(state.initiative);
  s.conditions = Array.isArray(state.conditions)
    ? state.conditions.filter((c): c is string => typeof c === "string")
    : [];
  s.deathSucc = numOr(state.deathSucc, 0);
  s.deathFail = numOr(state.deathFail, 0);
  s.inspiration = state.inspiration === true;
  s.exhaustion = numOr(state.exhaustion, 0);
  s.pinnedActions = Array.isArray(state.pinnedActions)
    ? state.pinnedActions.filter((a): a is string => typeof a === "string")
    : [];
  if (Array.isArray(state.unpinnedActions)) {
    s.unpinnedActions = state.unpinnedActions.filter(
      (a): a is string => typeof a === "string"
    );
  }
  s.notes = asString(state.notes);
  // `log` carries current-shape entries; the sanitizer normalizes + validates them.
  if (Array.isArray(state.log)) {
    s.logEntries = state.log.filter(isRecord) as unknown as LogEntry[];
  }
  if (isRecord(state.grantBundleChoices)) {
    s.grantBundleChoices = state.grantBundleChoices as Record<string, string>;
  }
  if (Array.isArray(state.activeFeatures)) {
    s.activeFeatures = state.activeFeatures.filter(
      (a): a is string => typeof a === "string"
    );
  }
  if (isRecord(state.effectTimers)) {
    const timers: Record<string, { roundsLeft: number }> = {};
    for (const [key, val] of Object.entries(state.effectTimers)) {
      if (isRecord(val) && typeof val.roundsLeft === "number") {
        timers[key] = { roundsLeft: val.roundsLeft };
      }
    }
    if (Object.keys(timers).length > 0) s.effectTimers = timers;
  }
  if (isRecord(state.companionHp)) {
    s.companionHp = state.companionHp as SessionState["companionHp"];
  }
  if (isRecord(state.manifestedWeaponOverrides)) {
    s.manifestedWeaponOverrides =
      state.manifestedWeaponOverrides as SessionState["manifestedWeaponOverrides"];
  }
  if (isRecord(state.pactWeaponConfig)) {
    s.pactWeaponConfig = state.pactWeaponConfig as SessionState["pactWeaponConfig"];
  }
  if (isRecord(state.pactWeaponRiderTypes)) {
    s.pactWeaponRiderTypes =
      state.pactWeaponRiderTypes as SessionState["pactWeaponRiderTypes"];
  }
  if (
    isRecord(state.polymorphForm) &&
    typeof state.polymorphForm.beastId === "string" &&
    typeof state.polymorphForm.spellId === "string" &&
    isRecord(state.polymorphForm.prior)
  ) {
    s.polymorphForm = state.polymorphForm as unknown as SessionState["polymorphForm"];
  }
  if (isNonEmptyString(state.bardicInspirationDie)) {
    s.bardicInspirationDie = state.bardicInspirationDie;
  }
  return s;
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
  state: Record<string, unknown>;
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

/** Result of {@link parseCharacterEnvelope} — the parsed engine core or a validation
 *  error (the SAME message the import surfaces). */
export type ParsedEnvelope =
  | { ok: true; character: CharacterData; session: SessionState }
  | { ok: false; error: string };

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
  const min = buildToMin(build);
  const character = rehydrateCharacter(min);
  const validation = validateCharacterData(character);
  if (validation) return { ok: false, error: validation };
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
  if (!parsedCore.ok) return { success: false, error: parsedCore.error };
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
      shareId: null,
    },
    portraitBase64: typeof meta.portrait === "string" ? meta.portrait : null,
    portraitCrop,
  };
  return stampImportedAc(result);
}

// `sanitizeSession` re-exported so existing `from "@/lib/character-codec"` callers
// (and the character-io re-export) get it from one place.
export { sanitizeSession };
