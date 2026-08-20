import {
  ALL_ARMOR_CATEGORIES,
  ALL_CREATURE_TYPES,
  ALL_WEAPON_CATEGORIES,
  ALL_WEAPON_TYPES,
  CREATURE_SIZE_ORDER,
} from "@/data/types";
import { isActionJournal, materialRefKey } from "@/lib/action-journal";
import { conformExhaustionLevel } from "@/lib/condition";
import { conformDamageDefenseProfile } from "@/lib/damage";
import type {
  NewInventoryInstance,
  NewMaterialEntity,
} from "@/types/mechanics-operation";
import { conformDiceFormula } from "@/lib/dice-formula";
import {
  createOccurrenceState,
  isEffectOccurrence,
  parseOccurrenceState,
} from "@/lib/mechanic-occurrences";
import {
  conformEntityRef,
  conformInventoryGenerationRef,
  conformOccurrenceGenerationRef,
  entityRefKey,
  inventoryGenerationRefKey,
} from "@/lib/mechanics-reference-schema";
import { conformResourceCell, conformResourceSpec } from "@/lib/resources";
import { conformTurnEconomyState } from "@/lib/turn-economy";
import { conformCreatureVitals, conformObjectVitals } from "@/lib/vitals";
import {
  conformWeaponCapabilities,
  validateWeaponProperties,
} from "@/lib/weapon-property";
import { ABILITY_CODES as CANONICAL_ABILITY_CODES } from "@/types/ability";
import { DAMAGE_TYPES as CANONICAL_DAMAGE_TYPES } from "@/types/damage";
import type { ActionJournal } from "@/types/action-journal";
import type { MechanicOccurrence } from "@/types/mechanic-occurrence";
import type {
  ClockRef,
  EntityRef,
  MaterialRef,
  OccurrenceGenerationRef,
} from "@/types/mechanics-reference";
import {
  MATERIAL_STATE_SCHEMA,
  type CharacterMaterialParseResult,
  type CharacterMaterialState,
  type CharacterResources,
  type CreatureEntityTemplate,
  type CreatureMaterialEntity,
  type CustomArmorMechanics,
  type CustomCreatureDefinition,
  type CustomItemDefinition,
  type CustomObjectDefinition,
  type CustomWeaponMechanics,
  type EncounterState,
  type EncounterParticipant,
  type EntityStatOverrides,
  type InventoryInstance,
  type ItemDefinition,
  type ItemInstanceOverrides,
  type MaterialCoordinator,
  type MaterialEntity,
  type MaterialTag,
  type ObjectEntityTemplate,
  type ObjectMaterialEntity,
  type ObjectMaterial,
  type ObjectStatOverrides,
  type SharedMaterialParseResult,
  type SharedMaterialState,
} from "@/types/material-state";
import type { CountResourceCell, ResourceCell, ResourceSpec } from "@/types/resource";
import type { CreatureVitals } from "@/types/vitals";

const MAX_ID_LENGTH = 256;
const MAX_TEXT_LENGTH = 16_384;
const MAX_MAP_ENTRIES = 2_048;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ABILITY_CODES = new Set<string>(CANONICAL_ABILITY_CODES);
const ARMOR_CATEGORIES = new Set<string>(ALL_ARMOR_CATEGORIES);
const CREATURE_SIZES = new Set<string>(CREATURE_SIZE_ORDER);
const CREATURE_TYPES = new Set<string>(ALL_CREATURE_TYPES);
const DAMAGE_TYPES = new Set<string>(CANONICAL_DAMAGE_TYPES);
const OBJECT_MATERIAL_KINDS = new Set([
  "adamantine",
  "bone",
  "cloth",
  "crystal",
  "glass",
  "ice",
  "iron",
  "mithral",
  "paper",
  "rope",
  "steel",
  "stone",
  "wood",
]);
const WEAPON_CATEGORIES = new Set<string>(ALL_WEAPON_CATEGORIES);
const WEAPON_TYPES = new Set<string>(ALL_WEAPON_TYPES);
const WEAPON_MASTERIES = new Set<string>([
  "Cleave",
  "Graze",
  "Nick",
  "Push",
  "Sap",
  "Slow",
  "Topple",
  "Vex",
]);
const HIT_DICE = new Set(["d4", "d6", "d8", "d10", "d12"]);
const CURRENCY_DENOMINATIONS = new Set(["pp", "gp", "ep", "sp", "cp"]);
const JOURNAL_FIELDS = new Set([
  "schema",
  "epoch",
  "revision",
  "actions",
  "buildRevision",
]);

type UnknownRecord = Record<string, unknown>;
type CharacterMaterialRef = Extract<MaterialRef, { kind: "character-play" }>;
type SharedMaterialRef = Extract<MaterialRef, { kind: "shared-combat" }>;

function isDensePlainArray(value: unknown): value is unknown[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_MAP_ENTRIES ||
    Object.getPrototypeOf(value) !== Array.prototype
  )
    return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== value.length + 1 || ownKeys.at(-1) !== "length") return false;
  return ownKeys.slice(0, -1).every((key, index) => {
    if (key !== String(index)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && "value" in descriptor;
  });
}

function isExactRecord(value: unknown, keys: readonly string[]): value is UnknownRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string"))
    return false;
  const expected = [...keys].sort();
  const actual = (ownKeys as string[]).sort();
  return actual.every((key, index) => {
    if (key !== expected[index]) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && "value" in descriptor;
  });
}

function isSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0)
  );
}

function isCounter(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isSafeInteger(value) && value > 0;
}

function isFiniteNonnegative(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    !Object.is(value, -0)
  );
}

function isId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !UNSAFE_KEYS.has(value)
  );
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TEXT_LENGTH;
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isNullableCounter(value: unknown): value is number | null {
  return value === null || isCounter(value);
}

function isNullablePositive(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value);
}

function isNullableSafeInteger(value: unknown): value is number | null {
  return value === null || isSafeInteger(value);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseMap<T>(
  value: unknown,
  parser: (entry: unknown, key: string) => T | null,
  allowedKeys?: ReadonlySet<string>
): Record<string, T> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length > MAX_MAP_ENTRIES || ownKeys.some((key) => typeof key !== "string"))
    return null;
  const result: Record<string, T> = {};
  for (const key of (ownKeys as string[]).sort()) {
    if (!isId(key) || (allowedKeys && !allowedKeys.has(key))) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true || !("value" in descriptor)) return null;
    const parsed = parser(descriptor.value, key);
    if (parsed === null) return null;
    result[key] = parsed;
  }
  return result;
}

function freezeDeep<T>(value: T): Readonly<T> {
  const visit = (current: unknown): void => {
    if (typeof current !== "object" || current === null || Object.isFrozen(current))
      return;
    for (const child of Object.values(current)) visit(child);
    Object.freeze(current);
  };
  visit(value);
  return value;
}

function parseOccurrenceGenerationRef(value: unknown): OccurrenceGenerationRef | null {
  const reference = conformOccurrenceGenerationRef(value);
  return reference ? structuredClone(reference) : null;
}

function parseCountCell(value: unknown): CountResourceCell | null {
  const cell = conformResourceCell(value);
  return cell?.kind === "count" ? structuredClone(cell) : null;
}

function parseResourceCell(value: unknown): ResourceCell | null {
  const cell = conformResourceCell(value);
  return cell ? structuredClone(cell) : null;
}

function parseCharacterResources(value: unknown): CharacterResources | null {
  if (
    !isExactRecord(value, [
      "pools",
      "standardSpellSlots",
      "pactSpellSlot",
      "hitDice",
      "currency",
    ])
  )
    return null;
  const pools = parseMap(value.pools, parseResourceCell);
  const standardSpellSlots = parseMap(value.standardSpellSlots, parseCountCell);
  const pactSpellSlot =
    value.pactSpellSlot === null ? null : parseCountCell(value.pactSpellSlot);
  const hitDice = parseMap(value.hitDice, parseCountCell, HIT_DICE);
  const currency = parseMap(value.currency, parseCountCell, CURRENCY_DENOMINATIONS);
  if (!pools || !standardSpellSlots || !hitDice || !currency) return null;
  if (value.pactSpellSlot !== null && !pactSpellSlot) return null;
  if (Object.keys(currency).length !== CURRENCY_DENOMINATIONS.size) {
    return null;
  }
  return {
    pools,
    standardSpellSlots,
    pactSpellSlot,
    hitDice,
    currency,
  };
}

function parseStringSet(value: unknown): string[] | null {
  if (!isDensePlainArray(value) || !value.every(isId)) return null;
  const sorted = [...value].sort();
  return sorted.some((entry, index) => index > 0 && entry === sorted[index - 1])
    ? null
    : sorted;
}

function parseOrderedIds(value: unknown): string[] | null {
  if (!isDensePlainArray(value) || !value.every(isId)) return null;
  return new Set(value).size === value.length ? [...value] : null;
}

function parseSelections(value: unknown): Record<string, string | string[]> | null {
  return parseMap(value, (entry) => {
    if (isId(entry)) return entry;
    return parseStringSet(entry);
  });
}

function parsePreferences(value: unknown): CharacterMaterialState["preferences"] | null {
  if (!isExactRecord(value, ["pinnedActionIds", "unpinnedActionIds"])) return null;
  const pinnedActionIds = parseStringSet(value.pinnedActionIds);
  const unpinnedActionIds = parseStringSet(value.unpinnedActionIds);
  const pinned = new Set(pinnedActionIds ?? []);
  if (
    !pinnedActionIds ||
    !unpinnedActionIds ||
    unpinnedActionIds.some((id) => pinned.has(id))
  ) {
    return null;
  }
  return { pinnedActionIds, unpinnedActionIds };
}

function parseCustomWeapon(value: unknown): CustomWeaponMechanics | null {
  if (
    !isExactRecord(value, [
      "category",
      "type",
      "damageFormula",
      "damageType",
      "capabilities",
      "mastery",
    ]) ||
    typeof value.category !== "string" ||
    !WEAPON_CATEGORIES.has(value.category) ||
    typeof value.type !== "string" ||
    !WEAPON_TYPES.has(value.type) ||
    typeof value.damageType !== "string" ||
    !DAMAGE_TYPES.has(value.damageType) ||
    !(
      value.mastery === null ||
      (typeof value.mastery === "string" && WEAPON_MASTERIES.has(value.mastery))
    )
  ) {
    return null;
  }
  const damageFormula = conformDiceFormula(value.damageFormula);
  const capabilities = conformWeaponCapabilities(value.capabilities);
  if (
    !damageFormula ||
    !capabilities ||
    !validateWeaponProperties({
      capabilities,
      weaponType: value.type as CustomWeaponMechanics["type"],
    })
  ) {
    return null;
  }
  return {
    category: value.category as CustomWeaponMechanics["category"],
    type: value.type as CustomWeaponMechanics["type"],
    damageFormula: structuredClone(damageFormula),
    damageType: value.damageType as CustomWeaponMechanics["damageType"],
    capabilities: structuredClone(capabilities),
    mastery: value.mastery as CustomWeaponMechanics["mastery"],
  };
}

function parseCustomArmor(value: unknown): CustomArmorMechanics | null {
  if (
    !isExactRecord(value, [
      "category",
      "baseArmorClass",
      "addsDexterity",
      "dexterityCap",
      "strengthRequirement",
      "stealthDisadvantage",
    ]) ||
    typeof value.category !== "string" ||
    !ARMOR_CATEGORIES.has(value.category) ||
    !isCounter(value.baseArmorClass) ||
    typeof value.addsDexterity !== "boolean" ||
    !isNullableCounter(value.dexterityCap) ||
    !isNullableCounter(value.strengthRequirement) ||
    typeof value.stealthDisadvantage !== "boolean" ||
    (!value.addsDexterity && value.dexterityCap !== null)
  ) {
    return null;
  }
  return {
    category: value.category as CustomArmorMechanics["category"],
    baseArmorClass: value.baseArmorClass,
    addsDexterity: value.addsDexterity,
    dexterityCap: value.dexterityCap,
    strengthRequirement: value.strengthRequirement,
    stealthDisadvantage: value.stealthDisadvantage,
  };
}

function parseCustomItemResource(value: unknown, id: string): ResourceSpec | null {
  const spec = conformResourceSpec(value);
  return spec?.id === id ? structuredClone(spec) : null;
}

function resourceCellShapeMatchesSpec(spec: ResourceSpec, cell: ResourceCell): boolean {
  if (cell.kind !== spec.kind) return false;
  return (
    (spec.capacity.kind === "bounded" && cell.capacity.base.kind === "derived") ||
    (spec.capacity.kind === "formula" && cell.capacity.base.kind === "formula") ||
    (spec.capacity.kind === "unbounded" && cell.capacity.base.kind === "unbounded")
  );
}

function parseTags(value: unknown): MaterialTag[] | null {
  if (!isDensePlainArray(value) || value.length > MAX_MAP_ENTRIES) return null;
  const tags: MaterialTag[] = [];
  for (const entry of value) {
    if (
      !isExactRecord(entry, ["label", "color"]) ||
      !isName(entry.label) ||
      !isName(entry.color)
    ) {
      return null;
    }
    tags.push({ label: entry.label, color: entry.color });
  }
  tags.sort((left, right) => {
    const labelOrder = compareCodeUnits(left.label, right.label);
    return labelOrder === 0 ? compareCodeUnits(left.color, right.color) : labelOrder;
  });
  return tags.some((tag, index) => {
    const previous = tags[index - 1];
    return (
      previous !== undefined &&
      tag.label === previous.label &&
      tag.color === previous.color
    );
  })
    ? null
    : tags;
}

function parseCustomItem(value: unknown): CustomItemDefinition | null {
  if (
    !isExactRecord(value, [
      "name",
      "description",
      "emoji",
      "category",
      "weightLb",
      "armorClassBonus",
      "consumable",
      "potionFormula",
      "resources",
      "weapon",
      "armor",
    ]) ||
    !isName(value.name) ||
    !isText(value.description) ||
    !isText(value.emoji) ||
    (value.category !== "weapon" &&
      value.category !== "armor" &&
      value.category !== "gear") ||
    !(value.weightLb === null || isFiniteNonnegative(value.weightLb)) ||
    !isSafeInteger(value.armorClassBonus) ||
    typeof value.consumable !== "boolean" ||
    (value.potionFormula !== null && !value.consumable)
  ) {
    return null;
  }
  const potionFormula =
    value.potionFormula === null ? null : conformDiceFormula(value.potionFormula);
  const weapon = value.weapon === null ? null : parseCustomWeapon(value.weapon);
  const armor = value.armor === null ? null : parseCustomArmor(value.armor);
  const resources = parseMap(value.resources, parseCustomItemResource);
  if (
    (value.potionFormula !== null && !potionFormula) ||
    (value.weapon !== null && !weapon) ||
    (value.armor !== null && !armor) ||
    !resources ||
    (value.category === "weapon" && (!weapon || armor !== null)) ||
    (value.category === "armor" && (!armor || weapon !== null)) ||
    (value.category === "gear" && (weapon !== null || armor !== null))
  ) {
    return null;
  }
  return {
    name: value.name,
    description: value.description,
    emoji: value.emoji,
    category: value.category,
    weightLb: value.weightLb,
    armorClassBonus: value.armorClassBonus,
    consumable: value.consumable,
    potionFormula: potionFormula ? structuredClone(potionFormula) : null,
    resources,
    weapon,
    armor,
  };
}

function parseItemDefinition(value: unknown): ItemDefinition | null {
  if (
    isExactRecord(value, ["kind", "itemId"]) &&
    value.kind === "catalogue" &&
    isId(value.itemId)
  ) {
    return { kind: "catalogue", itemId: value.itemId };
  }
  if (!isExactRecord(value, ["kind", "definition"]) || value.kind !== "custom")
    return null;
  const definition = parseCustomItem(value.definition);
  return definition ? { kind: "custom", definition } : null;
}

function parseItemOverrides(value: unknown): ItemInstanceOverrides | null {
  if (
    !isExactRecord(value, [
      "name",
      "armorClass",
      "attackBonus",
      "damageFormula",
      "damageType",
    ]) ||
    !(value.name === null || isName(value.name)) ||
    !isNullableCounter(value.armorClass) ||
    !isNullableSafeInteger(value.attackBonus) ||
    !(
      value.damageType === null ||
      (typeof value.damageType === "string" && DAMAGE_TYPES.has(value.damageType))
    )
  ) {
    return null;
  }
  const damageFormula =
    value.damageFormula === null ? null : conformDiceFormula(value.damageFormula);
  if (value.damageFormula !== null && !damageFormula) return null;
  return {
    name: value.name,
    armorClass: value.armorClass,
    attackBonus: value.attackBonus,
    damageFormula: damageFormula ? structuredClone(damageFormula) : null,
    damageType: value.damageType as ItemInstanceOverrides["damageType"],
  };
}

/** Exact structural boundary for one physical inventory generation. */
export function conformInventoryInstance(value: unknown): InventoryInstance | null {
  if (
    !isExactRecord(value, [
      "ordinal",
      "definition",
      "quantity",
      "equipped",
      "attuned",
      "notes",
      "tags",
      "ownerOccurrence",
      "overrides",
      "resources",
      "disposition",
      "enchantment",
    ]) ||
    !isPositiveInteger(value.ordinal) ||
    typeof value.equipped !== "boolean" ||
    typeof value.attuned !== "boolean" ||
    !isText(value.notes) ||
    (value.disposition !== "magical" && value.disposition !== "nonmagical")
  ) {
    return null;
  }
  const definition = parseItemDefinition(value.definition);
  const quantity = parseCountCell(value.quantity);
  const tags = parseTags(value.tags);
  const ownerOccurrence =
    value.ownerOccurrence === null
      ? null
      : parseOccurrenceGenerationRef(value.ownerOccurrence);
  const overrides = parseItemOverrides(value.overrides);
  const resources = parseMap(value.resources, parseResourceCell);
  const enchantment =
    value.enchantment === null ? null : conformInventoryGenerationRef(value.enchantment);
  if (
    !definition ||
    !quantity ||
    quantity.capacity.base.kind !== "unbounded" ||
    quantity.capacity.override !== null ||
    quantity.disabled ||
    !tags ||
    (value.ownerOccurrence !== null && !ownerOccurrence) ||
    !overrides ||
    !resources ||
    (value.enchantment !== null && !enchantment)
  ) {
    return null;
  }
  if (
    quantity.current > 1 &&
    (value.equipped ||
      value.attuned ||
      Object.keys(resources).length > 0 ||
      enchantment !== null)
  ) {
    return null;
  }
  if (
    quantity.current === 0 &&
    (value.equipped || value.attuned || enchantment !== null)
  ) {
    return null;
  }
  if (definition.kind === "custom") {
    const definitions = definition.definition.resources;
    const definitionIds = Object.keys(definitions);
    const stateIds = Object.keys(resources);
    if (
      definitionIds.length !== stateIds.length ||
      definitionIds.some((id, index) => id !== stateIds[index])
    ) {
      return null;
    }
    for (const id of definitionIds) {
      const resourceDefinition = definitions[id];
      const cell = resources[id];
      if (
        !resourceDefinition ||
        !cell ||
        !resourceCellShapeMatchesSpec(resourceDefinition, cell)
      )
        return null;
    }
  }
  return {
    ordinal: value.ordinal,
    definition,
    quantity,
    equipped: value.equipped,
    attuned: value.attuned,
    notes: value.notes,
    tags,
    ownerOccurrence,
    overrides,
    resources,
    disposition: value.disposition,
    enchantment,
  };
}

function parseInventory(
  value: unknown,
  owner: CharacterMaterialRef
): Record<string, InventoryInstance> | null {
  const inventory = parseMap(value, conformInventoryInstance);
  if (!inventory) return null;
  const enchantOwners = new Set<string>();
  for (const [instanceId, instance] of Object.entries(inventory)) {
    if (instance.attuned && instance.disposition !== "magical") return null;
    const enchantmentRef = instance.enchantment;
    if (enchantmentRef !== null) {
      const enchantment = inventory[enchantmentRef.instanceId];
      const enchantmentKey = inventoryGenerationRefKey(enchantmentRef);
      if (
        materialRefKey(enchantmentRef.owner) !== materialRefKey(owner) ||
        (enchantmentRef.instanceId === instanceId &&
          enchantmentRef.instanceOrdinal === instance.ordinal) ||
        !enchantment ||
        enchantment.ordinal !== enchantmentRef.instanceOrdinal ||
        enchantment.quantity.current !== 1 ||
        enchantment.disposition !== "magical" ||
        enchantOwners.has(enchantmentKey)
      )
        return null;
      enchantOwners.add(enchantmentKey);
    }
    const seen = new Set([`${instanceId}\u0000${instance.ordinal}`]);
    let cursor = enchantmentRef;
    while (cursor !== null) {
      const key = `${cursor.instanceId}\u0000${cursor.instanceOrdinal}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const linked = inventory[cursor.instanceId];
      if (!linked || linked.ordinal !== cursor.instanceOrdinal) return null;
      cursor = linked.enchantment;
    }
  }
  return inventory;
}

function ordinalsAreValid<T extends { readonly ordinal: number }>(
  values: Readonly<Record<string, T>>,
  nextOrdinal: number
): boolean {
  const ordinals = Object.values(values).map(({ ordinal }) => ordinal);
  return (
    new Set(ordinals).size === ordinals.length &&
    ordinals.every((ordinal) => ordinal < nextOrdinal)
  );
}

function parseAbilityScores(
  value: unknown
): CustomCreatureDefinition["abilityScores"] | null {
  if (!isExactRecord(value, CANONICAL_ABILITY_CODES)) return null;
  if (
    CANONICAL_ABILITY_CODES.some(
      (ability) =>
        !isSafeInteger(value[ability]) || value[ability] < 1 || value[ability] > 30
    )
  ) {
    return null;
  }
  return Object.fromEntries(
    CANONICAL_ABILITY_CODES.map((ability) => [ability, value[ability]])
  ) as CustomCreatureDefinition["abilityScores"];
}

function parseSavingThrows(
  value: unknown
): CustomCreatureDefinition["savingThrowBonuses"] | null {
  return parseMap(value, (entry) => (isSafeInteger(entry) ? entry : null), ABILITY_CODES);
}

function parseCustomCreature(value: unknown): CustomCreatureDefinition | null {
  if (
    !isExactRecord(value, [
      "name",
      "creatureType",
      "size",
      "armorClass",
      "hitPointMaximum",
      "speedFt",
      "proficiencyBonus",
      "abilityScores",
      "savingThrowBonuses",
    ]) ||
    !isName(value.name) ||
    typeof value.creatureType !== "string" ||
    !CREATURE_TYPES.has(value.creatureType) ||
    typeof value.size !== "string" ||
    !CREATURE_SIZES.has(value.size) ||
    !isCounter(value.armorClass) ||
    !isPositiveInteger(value.hitPointMaximum) ||
    !isCounter(value.speedFt) ||
    !isPositiveInteger(value.proficiencyBonus)
  ) {
    return null;
  }
  const abilityScores = parseAbilityScores(value.abilityScores);
  const savingThrowBonuses = parseSavingThrows(value.savingThrowBonuses);
  if (!abilityScores || !savingThrowBonuses) return null;
  return {
    name: value.name,
    creatureType: value.creatureType as CustomCreatureDefinition["creatureType"],
    size: value.size as CustomCreatureDefinition["size"],
    armorClass: value.armorClass,
    hitPointMaximum: value.hitPointMaximum,
    speedFt: value.speedFt,
    proficiencyBonus: value.proficiencyBonus,
    abilityScores,
    savingThrowBonuses,
  };
}

function parseCreatureEntityTemplate(value: unknown): CreatureEntityTemplate | null {
  if (
    isExactRecord(value, ["kind", "sourceId", "variantId"]) &&
    value.kind === "catalogue-companion" &&
    isId(value.sourceId) &&
    isId(value.variantId)
  ) {
    return {
      kind: "catalogue-companion",
      sourceId: value.sourceId,
      variantId: value.variantId,
    };
  }
  if (
    isExactRecord(value, ["kind", "monsterId", "creatureTypeOverride"]) &&
    value.kind === "catalogue-monster" &&
    isId(value.monsterId) &&
    (value.creatureTypeOverride === null ||
      (typeof value.creatureTypeOverride === "string" &&
        CREATURE_TYPES.has(value.creatureTypeOverride)))
  ) {
    return {
      kind: "catalogue-monster",
      monsterId: value.monsterId,
      creatureTypeOverride: value.creatureTypeOverride as Extract<
        CreatureEntityTemplate,
        { kind: "catalogue-monster" }
      >["creatureTypeOverride"],
    };
  }
  if (!isExactRecord(value, ["kind", "definition"]) || value.kind !== "custom")
    return null;
  const definition = parseCustomCreature(value.definition);
  return definition ? { kind: "custom", definition } : null;
}

function parseObjectMaterial(value: unknown): ObjectMaterial | null {
  if (isExactRecord(value, ["kind", "materialId"]) && value.kind === "custom") {
    return isId(value.materialId)
      ? { kind: "custom", materialId: value.materialId }
      : null;
  }
  return isExactRecord(value, ["kind"]) &&
    typeof value.kind === "string" &&
    OBJECT_MATERIAL_KINDS.has(value.kind)
    ? ({ kind: value.kind } as ObjectMaterial)
    : null;
}

function parseObjectMaterials(value: unknown): ObjectMaterial[] | null {
  if (!isDensePlainArray(value) || value.length === 0) return null;
  const materials = value.map(parseObjectMaterial);
  if (materials.some((entry) => entry === null)) return null;
  const sorted = (materials as ObjectMaterial[]).sort((left, right) =>
    compareCodeUnits(JSON.stringify(left), JSON.stringify(right))
  );
  return new Set(sorted.map((entry) => JSON.stringify(entry))).size === sorted.length
    ? sorted
    : null;
}

function parseCustomObject(value: unknown): CustomObjectDefinition | null {
  if (
    !isExactRecord(value, [
      "name",
      "size",
      "armorClass",
      "hitPointMaximum",
      "damageDefenseProfile",
      "magical",
      "materials",
    ]) ||
    !isName(value.name) ||
    typeof value.size !== "string" ||
    !CREATURE_SIZES.has(value.size) ||
    !isCounter(value.armorClass) ||
    !isPositiveInteger(value.hitPointMaximum) ||
    typeof value.magical !== "boolean"
  ) {
    return null;
  }
  const damageDefenseProfile = conformDamageDefenseProfile(value.damageDefenseProfile);
  const materials = parseObjectMaterials(value.materials);
  return damageDefenseProfile && materials
    ? {
        name: value.name,
        size: value.size as CustomObjectDefinition["size"],
        armorClass: value.armorClass,
        hitPointMaximum: value.hitPointMaximum,
        damageDefenseProfile: structuredClone(damageDefenseProfile),
        magical: value.magical,
        materials,
      }
    : null;
}

function parseObjectEntityTemplate(value: unknown): ObjectEntityTemplate | null {
  if (
    isExactRecord(value, ["kind", "objectId"]) &&
    value.kind === "catalogue-object" &&
    isId(value.objectId)
  ) {
    return { kind: "catalogue-object", objectId: value.objectId };
  }
  if (
    isExactRecord(value, ["kind", "owner", "instanceId", "instanceOrdinal"]) &&
    value.kind === "inventory-item" &&
    isCharacterMaterialRef(value.owner) &&
    isId(value.instanceId) &&
    isPositiveInteger(value.instanceOrdinal)
  ) {
    return {
      kind: "inventory-item",
      owner: { ...value.owner },
      instanceId: value.instanceId,
      instanceOrdinal: value.instanceOrdinal,
    };
  }
  if (!isExactRecord(value, ["kind", "definition"]) || value.kind !== "custom") {
    return null;
  }
  const definition = parseCustomObject(value.definition);
  return definition ? { kind: "custom", definition } : null;
}

function parseEntityOverrides(value: unknown): EntityStatOverrides | null {
  if (
    !isExactRecord(value, [
      "armorClass",
      "hitPointMaximum",
      "speedFt",
      "initiativeBonus",
    ]) ||
    !isNullableCounter(value.armorClass) ||
    !isNullablePositive(value.hitPointMaximum) ||
    !isNullableCounter(value.speedFt) ||
    !isNullableSafeInteger(value.initiativeBonus)
  ) {
    return null;
  }
  return {
    armorClass: value.armorClass,
    hitPointMaximum: value.hitPointMaximum,
    speedFt: value.speedFt,
    initiativeBonus: value.initiativeBonus,
  };
}

function parseObjectOverrides(value: unknown): ObjectStatOverrides | null {
  if (
    !isExactRecord(value, [
      "armorClass",
      "size",
      "hitPointMaximum",
      "damageDefenseProfile",
      "magical",
      "materials",
    ]) ||
    !(
      value.size === null ||
      (typeof value.size === "string" && CREATURE_SIZES.has(value.size))
    ) ||
    !isNullableCounter(value.armorClass) ||
    !isNullablePositive(value.hitPointMaximum) ||
    !(value.magical === null || typeof value.magical === "boolean")
  ) {
    return null;
  }
  const damageDefenseProfile =
    value.damageDefenseProfile === null
      ? null
      : conformDamageDefenseProfile(value.damageDefenseProfile);
  const materials =
    value.materials === null ? null : parseObjectMaterials(value.materials);
  if (
    (damageDefenseProfile === null && value.damageDefenseProfile !== null) ||
    (materials === null && value.materials !== null)
  ) {
    return null;
  }
  return {
    size: value.size as ObjectStatOverrides["size"],
    armorClass: value.armorClass,
    hitPointMaximum: value.hitPointMaximum,
    damageDefenseProfile:
      damageDefenseProfile === null ? null : structuredClone(damageDefenseProfile),
    magical: value.magical,
    materials,
  };
}

function parseCreatureEntity(value: UnknownRecord): CreatureMaterialEntity | null {
  const template = parseCreatureEntityTemplate(value.template);
  const vitals = conformCreatureVitals(value.vitals);
  const exhaustion = conformExhaustionLevel(value.exhaustion);
  const overrides = parseEntityOverrides(value.overrides);
  if (
    !template ||
    !vitals ||
    exhaustion === null ||
    (exhaustion === 6 && vitals.zeroHitPoints?.kind !== "dead") ||
    !overrides ||
    !entityVitalsWithinKnownMaximum(vitals, template, overrides)
  ) {
    return null;
  }
  const base = parseMaterialEntityBase(value);
  return base
    ? {
        kind: "creature",
        template,
        vitals: structuredClone(vitals),
        exhaustion,
        overrides,
        ...base,
      }
    : null;
}

function parseObjectEntity(value: UnknownRecord): ObjectMaterialEntity | null {
  const template = parseObjectEntityTemplate(value.template);
  const vitals = conformObjectVitals(value.vitals);
  const overrides = parseObjectOverrides(value.overrides);
  const maximum =
    overrides?.hitPointMaximum ??
    (template?.kind === "custom" ? template.definition.hitPointMaximum : null);
  if (
    !template ||
    !vitals ||
    !overrides ||
    (maximum !== null && vitals.hitPoints.current > maximum)
  ) {
    return null;
  }
  const base = parseMaterialEntityBase(value);
  return base
    ? {
        kind: "object",
        template,
        vitals: structuredClone(vitals),
        overrides,
        ...base,
      }
    : null;
}

function parseMaterialEntityBase(
  value: UnknownRecord
): Pick<
  MaterialEntity,
  "ordinal" | "controller" | "ownerOccurrence" | "availability" | "label" | "resources"
> | null {
  const controller =
    value.controller === null ? null : conformEntityRef(value.controller);
  const ownerOccurrence =
    value.ownerOccurrence === null
      ? null
      : parseOccurrenceGenerationRef(value.ownerOccurrence);
  const resources = parseMap(value.resources, parseResourceCell);
  if (
    !isPositiveInteger(value.ordinal) ||
    (value.controller !== null && !controller) ||
    (value.ownerOccurrence !== null && !ownerOccurrence) ||
    !resources ||
    (value.availability !== "present" && value.availability !== "dismissed") ||
    !isText(value.label)
  ) {
    return null;
  }
  return {
    ordinal: value.ordinal,
    controller,
    ownerOccurrence,
    availability: value.availability,
    label: value.label,
    resources,
  };
}

/** Exact structural boundary for one non-self material entity generation. */
export function conformMaterialEntity(value: unknown): MaterialEntity | null {
  const commonKeys = [
    "kind",
    "template",
    "ordinal",
    "controller",
    "ownerOccurrence",
    "availability",
    "label",
    "vitals",
    "resources",
    "overrides",
  ] as const;
  if (isExactRecord(value, [...commonKeys, "exhaustion"]) && value.kind === "creature") {
    return parseCreatureEntity(value);
  }
  if (isExactRecord(value, commonKeys) && value.kind === "object") {
    return parseObjectEntity(value);
  }
  return null;
}

function parseClockRef(value: unknown): ClockRef | null {
  if (
    !isExactRecord(value, ["material", "epoch"]) ||
    (!isCharacterMaterialRef(value.material) && !isSharedMaterialRef(value.material)) ||
    !isCounter(value.epoch)
  ) {
    return null;
  }
  return { material: { ...value.material }, epoch: value.epoch };
}

function parseTimeline(value: unknown): MaterialCoordinator["timeline"] | null {
  if (
    !isExactRecord(value, ["epoch", "elapsedSeconds", "nextBoundaryOrdinal"]) ||
    !isCounter(value.epoch) ||
    !isCounter(value.elapsedSeconds) ||
    !isPositiveInteger(value.nextBoundaryOrdinal)
  ) {
    return null;
  }
  return {
    epoch: value.epoch,
    elapsedSeconds: value.elapsedSeconds,
    nextBoundaryOrdinal: value.nextBoundaryOrdinal,
  };
}

function parseParticipant(value: unknown): EncounterParticipant | null {
  if (
    !isExactRecord(value, [
      "ordinal",
      "combatant",
      "economy",
      "initiativeRoll",
      "skipped",
    ]) ||
    !isPositiveInteger(value.ordinal) ||
    !(
      value.initiativeRoll === null ||
      (isSafeInteger(value.initiativeRoll) &&
        value.initiativeRoll >= 1 &&
        value.initiativeRoll <= 20)
    ) ||
    typeof value.skipped !== "boolean"
  ) {
    return null;
  }
  const combatant = conformEntityRef(value.combatant);
  const economy = conformTurnEconomyState(value.economy);
  return combatant && economy
    ? {
        ordinal: value.ordinal,
        combatant,
        economy: structuredClone(economy),
        initiativeRoll: value.initiativeRoll,
        skipped: value.skipped,
      }
    : null;
}

function occurrenceRefTargets(
  reference: OccurrenceGenerationRef,
  currentMaterial: MaterialRef,
  occurrences: Readonly<Record<string, MechanicOccurrence>>,
  matches: (ref: EntityRef) => boolean,
  requiredKind: "material-lifecycle" | null = null
): boolean {
  if (materialRefKey(reference.occurrence.material) !== materialRefKey(currentMaterial))
    return true;
  const occurrence = occurrences[reference.occurrence.occurrenceId];
  return (
    occurrence !== undefined &&
    occurrence.ordinal === reference.ordinal &&
    isEffectOccurrence(occurrence) &&
    (requiredKind === null || occurrence.kind === requiredKind) &&
    matches(occurrence.target)
  );
}

function maxForEntity(
  template: CreatureEntityTemplate,
  overrides: EntityStatOverrides
): number | null {
  if (overrides.hitPointMaximum !== null) return overrides.hitPointMaximum;
  return template.kind === "custom" ? template.definition.hitPointMaximum : null;
}

function entityVitalsWithinKnownMaximum(
  vitals: CreatureVitals,
  template: CreatureEntityTemplate,
  overrides: EntityStatOverrides
): boolean {
  const maximum = maxForEntity(template, overrides);
  return maximum === null || vitals.hitPoints.current <= maximum;
}

function isCharacterMaterialRef(value: unknown): value is CharacterMaterialRef {
  return (
    isExactRecord(value, ["kind", "uid", "characterId"]) &&
    value.kind === "character-play" &&
    isId(value.uid) &&
    isId(value.characterId)
  );
}

function isSharedMaterialRef(value: unknown): value is SharedMaterialRef {
  return (
    isExactRecord(value, ["kind", "campaignId"]) &&
    value.kind === "shared-combat" &&
    isId(value.campaignId)
  );
}

function parseJournalForMaterial(
  epoch: unknown,
  revision: unknown,
  actions: unknown,
  material: MaterialRef,
  rootKind: "character" | "shared"
): ActionJournal | null {
  const journal = { epoch, revision, actions };
  if (!isActionJournal(journal)) return null;
  const scopeKey = materialRefKey(material);
  for (const action of journal.actions) {
    const ownGuards = action.guards.documents.filter(
      (guard) => materialRefKey(guard.material) === scopeKey
    );
    if (ownGuards.length !== 1 || ownGuards[0]?.epoch !== epoch) return null;
    if (rootKind === "character" && action.guards.documents.length !== 1) return null;
    for (const mutation of action.mutations) {
      const first = mutation.path[0];
      if (!first || JOURNAL_FIELDS.has(first)) return null;
      if (rootKind === "character" && materialRefKey(mutation.target) !== scopeKey)
        return null;
    }
  }
  return journal;
}

function occurrenceRefs(occurrence: MechanicOccurrence): EntityRef[] {
  const refs = isEffectOccurrence(occurrence) ? [occurrence.target] : [];
  if (occurrence.kind === "standing" && occurrence.fact.kind === "target-mark") {
    refs.push(occurrence.fact.marked);
  }
  for (const rule of occurrence.endRules) {
    if (rule.kind === "turn-boundary" || rule.kind === "rest-completed") {
      refs.push(rule.combatant);
    }
  }
  return refs;
}

function characterRefResolves(
  ref: EntityRef,
  material: CharacterMaterialRef,
  entities: Readonly<Record<string, MaterialEntity>>
): boolean {
  if (materialRefKey(ref.material) !== materialRefKey(material)) return true;
  if (ref.entityId === "self") return true;
  return entities[ref.entityId]?.ordinal === ref.ordinal;
}

function sharedRefResolves(
  ref: EntityRef,
  material: SharedMaterialRef,
  entities: Readonly<Record<string, MaterialEntity>>
): boolean {
  if (ref.material.kind === "character-play") return true;
  return (
    materialRefKey(ref.material) === materialRefKey(material) &&
    ref.entityId !== "self" &&
    entities[ref.entityId]?.ordinal === ref.ordinal
  );
}

function allOccurrenceRefsResolve(
  occurrences: Readonly<Record<string, MechanicOccurrence>>,
  resolves: (ref: EntityRef) => boolean
): boolean {
  return Object.values(occurrences).every((occurrence) =>
    occurrenceRefs(occurrence).every(resolves)
  );
}

function creatureOnlyOccurrenceRefsAreValid(
  occurrences: Readonly<Record<string, MechanicOccurrence>>,
  isCreature: (ref: EntityRef) => boolean
): boolean {
  return Object.values(occurrences).every((occurrence) => {
    if (
      isEffectOccurrence(occurrence) &&
      (occurrence.kind === "condition" ||
        occurrence.kind === "concentration" ||
        occurrence.kind === "polymorph-form" ||
        occurrence.endRules.some((rule) => rule.kind === "temporary-hp-empty")) &&
      !isCreature(occurrence.target)
    ) {
      return false;
    }
    return occurrence.endRules.every(
      (rule) =>
        (rule.kind !== "turn-boundary" && rule.kind !== "rest-completed") ||
        isCreature(rule.combatant)
    );
  });
}

function temporaryHitPointSourceTargets(
  vitals: CreatureVitals,
  currentMaterial: MaterialRef,
  occurrences: Readonly<Record<string, MechanicOccurrence>>,
  matches: (ref: EntityRef) => boolean
): boolean {
  const source = vitals.hitPoints.temporary.sourceOccurrence;
  if (
    source === null ||
    materialRefKey(source.occurrence.material) !== materialRefKey(currentMaterial)
  )
    return true;
  return occurrenceRefTargets(source, currentMaterial, occurrences, matches);
}

export function parseCharacterMaterialState(
  value: unknown,
  material: CharacterMaterialRef
): CharacterMaterialParseResult {
  if (!isCharacterMaterialRef(material)) return { ok: false };
  if (
    !isExactRecord(value, [
      "schema",
      "buildRevision",
      "epoch",
      "revision",
      "actions",
      "nextOccurrenceOrdinal",
      "occurrences",
      "vitals",
      "exhaustion",
      "heroicInspiration",
      "bardicInspirationDie",
      "resources",
      "selections",
      "preferences",
      "notes",
      "nextInventoryOrdinal",
      "inventory",
      "nextEntityOrdinal",
      "entities",
      "nextEncounterEpoch",
      "encounter",
      "timeline",
      "clockBinding",
    ]) ||
    value.schema !== MATERIAL_STATE_SCHEMA ||
    !isCounter(value.buildRevision) ||
    !isPositiveInteger(value.nextInventoryOrdinal) ||
    !isPositiveInteger(value.nextEntityOrdinal) ||
    !isPositiveInteger(value.nextEncounterEpoch)
  ) {
    return { ok: false };
  }
  const journal = parseJournalForMaterial(
    value.epoch,
    value.revision,
    value.actions,
    material,
    "character"
  );
  if (!journal) return { ok: false };
  const occurrenceResult = parseOccurrenceState({
    nextOccurrenceOrdinal: value.nextOccurrenceOrdinal,
    occurrences: value.occurrences,
  });
  const vitals = conformCreatureVitals(value.vitals);
  const exhaustion = conformExhaustionLevel(value.exhaustion);
  const resources = parseCharacterResources(value.resources);
  const selections = parseSelections(value.selections);
  const preferences = parsePreferences(value.preferences);
  const inventory = parseInventory(value.inventory, material);
  const entities = parseMap(value.entities, conformMaterialEntity);
  const timeline = parseTimeline(value.timeline);
  const encounterResult = parseEncounter(
    value.encounter,
    value.nextEncounterEpoch,
    entities ?? {},
    material
  );
  const rawClockBinding = isExactRecord(value.clockBinding, ["timeline", "encounter"])
    ? value.clockBinding
    : null;
  const clockBinding = rawClockBinding
    ? {
        timeline: parseClockRef(rawClockBinding.timeline),
        encounter:
          rawClockBinding.encounter === null
            ? null
            : parseClockRef(rawClockBinding.encounter),
      }
    : null;
  if (
    !occurrenceResult.ok ||
    !vitals ||
    exhaustion === null ||
    (exhaustion === 6 && vitals.zeroHitPoints?.kind !== "dead") ||
    typeof value.heroicInspiration !== "boolean" ||
    !(
      value.bardicInspirationDie === null ||
      value.bardicInspirationDie === 6 ||
      value.bardicInspirationDie === 8 ||
      value.bardicInspirationDie === 10 ||
      value.bardicInspirationDie === 12
    ) ||
    !resources ||
    !selections ||
    !preferences ||
    !isText(value.notes) ||
    !inventory ||
    !ordinalsAreValid(inventory, value.nextInventoryOrdinal) ||
    !entities ||
    !ordinalsAreValid(entities, value.nextEntityOrdinal) ||
    Object.hasOwn(entities, "self") ||
    !timeline ||
    !encounterResult.ok ||
    !clockBinding ||
    !clockBinding.timeline ||
    (rawClockBinding?.encounter !== null && !clockBinding.encounter)
  ) {
    return { ok: false };
  }
  const localEncounterClock: ClockRef | null = encounterResult.value
    ? { material, epoch: encounterResult.value.epoch }
    : null;
  const bindingIsLocalIdle =
    materialRefKey(clockBinding.timeline.material) === materialRefKey(material) &&
    clockBinding.timeline.epoch === timeline.epoch &&
    clockBinding.encounter === null &&
    encounterResult.value === null;
  const bindingIsLocalCombat =
    localEncounterClock !== null &&
    materialRefKey(clockBinding.timeline.material) === materialRefKey(material) &&
    clockBinding.timeline.epoch === timeline.epoch &&
    clockBinding.encounter !== null &&
    materialRefKey(clockBinding.encounter.material) === materialRefKey(material) &&
    clockBinding.encounter.epoch === localEncounterClock.epoch;
  const bindingIsSharedCombat =
    encounterResult.value === null &&
    clockBinding.timeline.material.kind === "shared-combat" &&
    clockBinding.encounter?.material.kind === "shared-combat";
  if (!bindingIsLocalIdle && !bindingIsLocalCombat && !bindingIsSharedCombat) {
    return { ok: false };
  }
  for (const [instanceId, entity] of Object.entries(entities)) {
    if (
      (entity.kind === "object" &&
        entity.template.kind === "inventory-item" &&
        materialRefKey(entity.template.owner) === materialRefKey(material) &&
        inventory[entity.template.instanceId]?.ordinal !==
          entity.template.instanceOrdinal) ||
      (entity.ownerOccurrence !== null &&
        !occurrenceRefTargets(
          entity.ownerOccurrence,
          material,
          occurrenceResult.value.occurrences,
          (ref) =>
            materialRefKey(ref.material) === materialRefKey(material) &&
            ref.entityId === instanceId &&
            ref.ordinal === entity.ordinal,
          "material-lifecycle"
        )) ||
      (entity.kind === "creature" &&
        !temporaryHitPointSourceTargets(
          entity.vitals,
          material,
          occurrenceResult.value.occurrences,
          (ref) =>
            materialRefKey(ref.material) === materialRefKey(material) &&
            ref.entityId === instanceId &&
            ref.ordinal === entity.ordinal
        ))
    ) {
      return { ok: false };
    }
  }
  if (
    Object.values(inventory).some(
      (instance) =>
        instance.ownerOccurrence !== null &&
        !occurrenceRefTargets(
          instance.ownerOccurrence,
          material,
          occurrenceResult.value.occurrences,
          (ref) =>
            materialRefKey(ref.material) === materialRefKey(material) &&
            ref.entityId === "self",
          "material-lifecycle"
        )
    )
  ) {
    return { ok: false };
  }
  const resolves = (ref: EntityRef): boolean =>
    characterRefResolves(ref, material, entities);
  const isCreature = (ref: EntityRef): boolean =>
    materialRefKey(ref.material) !== materialRefKey(material) ||
    ref.entityId === "self" ||
    (entities[ref.entityId]?.ordinal === ref.ordinal &&
      entities[ref.entityId]?.kind === "creature");
  if (
    Object.values(entities).some(
      ({ controller }) => controller !== null && !resolves(controller)
    ) ||
    !allOccurrenceRefsResolve(occurrenceResult.value.occurrences, resolves) ||
    !creatureOnlyOccurrenceRefsAreValid(occurrenceResult.value.occurrences, isCreature) ||
    !temporaryHitPointSourceTargets(
      vitals,
      material,
      occurrenceResult.value.occurrences,
      (ref) =>
        materialRefKey(ref.material) === materialRefKey(material) &&
        ref.entityId === "self"
    )
  ) {
    return { ok: false };
  }
  const parsed: CharacterMaterialState = {
    schema: MATERIAL_STATE_SCHEMA,
    buildRevision: value.buildRevision,
    epoch: journal.epoch,
    revision: journal.revision,
    actions: structuredClone(journal.actions),
    nextOccurrenceOrdinal: occurrenceResult.value.nextOccurrenceOrdinal,
    occurrences: structuredClone(occurrenceResult.value.occurrences),
    vitals: structuredClone(vitals),
    exhaustion,
    heroicInspiration: value.heroicInspiration,
    bardicInspirationDie: value.bardicInspirationDie,
    resources,
    selections,
    preferences,
    notes: value.notes,
    nextInventoryOrdinal: value.nextInventoryOrdinal,
    inventory,
    nextEntityOrdinal: value.nextEntityOrdinal,
    entities,
    nextEncounterEpoch: value.nextEncounterEpoch,
    encounter: encounterResult.value,
    timeline,
    clockBinding: {
      timeline: clockBinding.timeline,
      encounter: clockBinding.encounter,
    },
  };
  return { ok: true, value: freezeDeep(parsed) };
}

type EncounterParseResult = { ok: true; value: EncounterState | null } | { ok: false };

function parseEncounter(
  value: unknown,
  nextEncounterEpoch: number,
  entities: Readonly<Record<string, MaterialEntity>>,
  material: MaterialRef
): EncounterParseResult {
  if (value === null) return { ok: true, value: null };
  if (
    !isExactRecord(value, [
      "epoch",
      "nextCombatantOrdinal",
      "participants",
      "phase",
      "round",
      "order",
      "currentCombatantId",
    ]) ||
    !isPositiveInteger(value.epoch) ||
    value.epoch >= nextEncounterEpoch ||
    !isPositiveInteger(value.nextCombatantOrdinal) ||
    (value.phase !== "initiative" && value.phase !== "turns") ||
    !isPositiveInteger(value.round) ||
    !(value.currentCombatantId === null || isId(value.currentCombatantId))
  ) {
    return { ok: false };
  }
  const participants = parseMap(value.participants, parseParticipant);
  const order = parseOrderedIds(value.order);
  if (!participants || !order) {
    return { ok: false };
  }
  const ordinals = new Set<number>();
  const combatantKeys = new Set<string>();
  const sharedKey = materialRefKey(material);
  for (const participant of Object.values(participants)) {
    if (
      participant.ordinal >= value.nextCombatantOrdinal ||
      ordinals.has(participant.ordinal)
    ) {
      return { ok: false };
    }
    ordinals.add(participant.ordinal);
    const combatantKey = entityRefKey(participant.combatant);
    if (combatantKeys.has(combatantKey)) return { ok: false };
    combatantKeys.add(combatantKey);
    const ownsSharedEntity = materialRefKey(participant.combatant.material) === sharedKey;
    if (ownsSharedEntity) {
      const participantExists =
        participant.combatant.entityId === "self"
          ? material.kind === "character-play"
          : entities[participant.combatant.entityId]?.ordinal ===
              participant.combatant.ordinal &&
            entities[participant.combatant.entityId]?.kind === "creature" &&
            entities[participant.combatant.entityId]?.availability === "present";
      if (!participantExists) {
        return { ok: false };
      }
    } else if (
      material.kind !== "shared-combat" ||
      participant.combatant.material.kind !== "character-play"
    ) {
      return { ok: false };
    }
  }
  const activeIds = Object.entries(participants)
    .filter(([, participant]) => !participant.skipped)
    .map(([participantId]) => participantId)
    .sort();
  if (value.phase === "initiative") {
    if (
      order.length !== 0 ||
      value.currentCombatantId !== null ||
      Object.values(participants).some(({ economy }) => economy.phase !== "between-turns")
    ) {
      return { ok: false };
    }
  } else if (
    order.length !== activeIds.length ||
    [...order].sort().some((id, index) => id !== activeIds[index]) ||
    value.currentCombatantId === null ||
    !order.includes(value.currentCombatantId) ||
    participants[value.currentCombatantId]?.skipped !== false ||
    activeIds.some((id) => participants[id]?.initiativeRoll === null) ||
    Object.entries(participants).some(
      ([participantId, participant]) =>
        participantId !== value.currentCombatantId &&
        participant.economy.phase !== "between-turns"
    )
  ) {
    return { ok: false };
  }
  const economyTurnIds = Object.values(participants).map(({ economy }) => economy.turnId);
  if (new Set(economyTurnIds).size !== economyTurnIds.length) return { ok: false };
  return {
    ok: true,
    value: {
      epoch: value.epoch,
      nextCombatantOrdinal: value.nextCombatantOrdinal,
      participants,
      phase: value.phase,
      round: value.round,
      order,
      currentCombatantId: value.currentCombatantId,
    },
  };
}

export function parseSharedMaterialState(
  value: unknown,
  material: SharedMaterialRef
): SharedMaterialParseResult {
  if (
    !isSharedMaterialRef(material) ||
    !isExactRecord(value, [
      "schema",
      "epoch",
      "revision",
      "actions",
      "nextOccurrenceOrdinal",
      "occurrences",
      "nextEntityOrdinal",
      "entities",
      "nextEncounterEpoch",
      "encounter",
      "timeline",
    ]) ||
    value.schema !== MATERIAL_STATE_SCHEMA ||
    !isPositiveInteger(value.nextEntityOrdinal) ||
    !isPositiveInteger(value.nextEncounterEpoch)
  ) {
    return { ok: false };
  }
  const journal = parseJournalForMaterial(
    value.epoch,
    value.revision,
    value.actions,
    material,
    "shared"
  );
  if (!journal) return { ok: false };
  const occurrenceResult = parseOccurrenceState({
    nextOccurrenceOrdinal: value.nextOccurrenceOrdinal,
    occurrences: value.occurrences,
  });
  if (!occurrenceResult.ok) return { ok: false };
  const entities = parseMap(value.entities, conformMaterialEntity);
  if (
    !entities ||
    !ordinalsAreValid(entities, value.nextEntityOrdinal) ||
    Object.hasOwn(entities, "self")
  ) {
    return { ok: false };
  }
  const sharedKey = materialRefKey(material);
  for (const [entityId, entity] of Object.entries(entities)) {
    if (
      (entity.ownerOccurrence !== null &&
        !occurrenceRefTargets(
          entity.ownerOccurrence,
          material,
          occurrenceResult.value.occurrences,
          (ref) =>
            materialRefKey(ref.material) === sharedKey &&
            ref.entityId === entityId &&
            ref.ordinal === entity.ordinal
        )) ||
      (entity.kind === "creature" &&
        !temporaryHitPointSourceTargets(
          entity.vitals,
          material,
          occurrenceResult.value.occurrences,
          (ref) =>
            materialRefKey(ref.material) === sharedKey &&
            ref.entityId === entityId &&
            ref.ordinal === entity.ordinal
        ))
    ) {
      return { ok: false };
    }
  }
  const encounterResult = parseEncounter(
    value.encounter,
    value.nextEncounterEpoch,
    entities,
    material
  );
  const timeline = parseTimeline(value.timeline);
  if (!encounterResult.ok || !timeline) return { ok: false };
  const resolves = (ref: EntityRef): boolean =>
    sharedRefResolves(ref, material, entities);
  const isCreature = (ref: EntityRef): boolean =>
    ref.material.kind === "character-play" ||
    (materialRefKey(ref.material) === sharedKey &&
      entities[ref.entityId]?.ordinal === ref.ordinal &&
      entities[ref.entityId]?.kind === "creature");
  if (
    Object.values(entities).some(
      ({ controller }) => controller !== null && !resolves(controller)
    ) ||
    !allOccurrenceRefsResolve(occurrenceResult.value.occurrences, resolves) ||
    !creatureOnlyOccurrenceRefsAreValid(occurrenceResult.value.occurrences, isCreature)
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: freezeDeep({
      schema: MATERIAL_STATE_SCHEMA,
      epoch: journal.epoch,
      revision: journal.revision,
      actions: structuredClone(journal.actions),
      nextOccurrenceOrdinal: occurrenceResult.value.nextOccurrenceOrdinal,
      occurrences: structuredClone(occurrenceResult.value.occurrences),
      nextEntityOrdinal: value.nextEntityOrdinal,
      entities,
      nextEncounterEpoch: value.nextEncounterEpoch,
      encounter: encounterResult.value,
      timeline,
    }),
  };
}

/** Fresh roots use epoch/revision zero and reserve ordinal zero; first allocations use ordinal one. */
export function createEmptyCharacterMaterialState(
  buildRevision: number,
  material: CharacterMaterialRef,
  initialVitals: CreatureVitals
): Readonly<CharacterMaterialState> {
  if (!isCounter(buildRevision))
    throw new TypeError("buildRevision must be a nonnegative safe integer");
  if (!isCharacterMaterialRef(material))
    throw new TypeError("material must be a character material reference");
  const vitals = conformCreatureVitals(initialVitals);
  if (!vitals) throw new TypeError("initialVitals must be canonical creature vitals");
  if (vitals.hitPoints.temporary.sourceOccurrence !== null) {
    throw new TypeError("fresh material state cannot reference an existing occurrence");
  }
  const occurrenceState = createOccurrenceState();
  return freezeDeep({
    schema: MATERIAL_STATE_SCHEMA,
    buildRevision,
    epoch: 0,
    revision: 0,
    actions: [],
    ...occurrenceState,
    vitals: structuredClone(vitals),
    exhaustion: 0,
    heroicInspiration: false,
    bardicInspirationDie: null,
    resources: {
      pools: {},
      standardSpellSlots: {},
      pactSpellSlot: null,
      hitDice: {},
      currency: Object.fromEntries(
        ["pp", "gp", "ep", "sp", "cp"].map((denomination) => [
          denomination,
          {
            kind: "count",
            current: 0,
            capacity: { base: { kind: "unbounded" }, override: null },
            disabled: false,
          },
        ])
      ) as CharacterResources["currency"],
    },
    selections: {},
    preferences: { pinnedActionIds: [], unpinnedActionIds: [] },
    notes: "",
    nextInventoryOrdinal: 1,
    inventory: {},
    nextEntityOrdinal: 1,
    entities: {},
    nextEncounterEpoch: 1,
    encounter: null,
    timeline: { epoch: 0, elapsedSeconds: 0, nextBoundaryOrdinal: 1 },
    clockBinding: {
      timeline: {
        material: { ...material },
        epoch: 0,
      },
      encounter: null,
    },
  });
}

/** Fresh coordinators persist across encounters; encounter epochs allocate monotonically from one. */
export function createEmptySharedMaterialState(): Readonly<SharedMaterialState> {
  const occurrenceState = createOccurrenceState();
  return freezeDeep({
    schema: MATERIAL_STATE_SCHEMA,
    epoch: 0,
    revision: 0,
    actions: [],
    ...occurrenceState,
    nextEntityOrdinal: 1,
    entities: {},
    nextEncounterEpoch: 1,
    encounter: null,
    timeline: { epoch: 0, elapsedSeconds: 0, nextBoundaryOrdinal: 1 },
  });
}

/** A creatable entity body: everything but the allocator-owned identity fields. */
export function conformNewMaterialEntity(
  value: unknown
): Readonly<NewMaterialEntity> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.hasOwn(value, "availability") ||
    Object.hasOwn(value, "ordinal") ||
    Object.hasOwn(value, "ownerOccurrence")
  ) {
    return null;
  }
  const entity = conformMaterialEntity({
    ...value,
    availability: "present",
    ordinal: 1,
    ownerOccurrence: null,
  });
  if (!entity) return null;
  // Split per branch: a shared spread would cross the creature/object unions.
  return entity.kind === "creature"
    ? {
        controller: entity.controller,
        exhaustion: entity.exhaustion,
        kind: "creature",
        label: entity.label,
        overrides: entity.overrides,
        resources: entity.resources,
        template: entity.template,
        vitals: entity.vitals,
      }
    : {
        controller: entity.controller,
        kind: "object",
        label: entity.label,
        overrides: entity.overrides,
        resources: entity.resources,
        template: entity.template,
        vitals: entity.vitals,
      };
}

/** A creatable inventory body: everything but the allocator-owned identity fields. */
export function conformNewInventoryInstance(
  value: unknown
): Readonly<NewInventoryInstance> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.hasOwn(value, "ordinal") ||
    Object.hasOwn(value, "ownerOccurrence")
  ) {
    return null;
  }
  const instance = conformInventoryInstance({
    ...value,
    ordinal: 1,
    ownerOccurrence: null,
  });
  if (!instance) return null;
  return {
    attuned: instance.attuned,
    definition: instance.definition,
    disposition: instance.disposition,
    enchantment: instance.enchantment,
    equipped: instance.equipped,
    notes: instance.notes,
    overrides: instance.overrides,
    quantity: instance.quantity,
    resources: instance.resources,
    tags: instance.tags,
  };
}
