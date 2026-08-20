/** Exact conformance and typed lookup for weapon properties. */

import type { WeaponType } from "@/data/types";
import { conformDiceFormula } from "@/lib/dice-formula";
import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import {
  WEAPON_CAPABILITIES_SCHEMA,
  WEAPON_CAPABILITY_KINDS,
  WEAPON_CAPABILITY_SCHEMA,
  WEAPON_PROPERTY_SCHEMA,
  WEAPON_RANGE_PAIR_SCHEMA,
  type WeaponCapabilities,
  type WeaponCapability,
  type WeaponProperty,
  type WeaponPropertySchemaCustomTypes,
  type WeaponRangePair,
} from "@/types/weapon-property";

export type {
  WeaponCapabilities,
  WeaponCapability,
  WeaponProperty,
  WeaponRangePair,
} from "@/types/weapon-property";

const DEFAULT_REACH_FT = 5;
const MAX_REACH_FT = 100;
const MAX_RANGE_FT = 10_000;
const MAX_ITEM_ID_LENGTH = 128;
const STABLE_ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function distanceFt(value: unknown): number | null {
  return Number.isSafeInteger(value) &&
    (value as number) > 0 &&
    (value as number) <= MAX_RANGE_FT &&
    (value as number) % 5 === 0
    ? (value as number)
    : null;
}

function stableItemId(value: unknown): string | null {
  return typeof value === "string" &&
    value.length <= MAX_ITEM_ID_LENGTH &&
    STABLE_ITEM_ID.test(value)
    ? value
    : null;
}

const WEAPON_PROPERTY_CONTEXT: ExactSchemaContext<
  WeaponPropertySchemaCustomTypes,
  Record<never, never>
> = {
  customs: {
    "dice-formula": conformDiceFormula,
    "positive-distance-ft": distanceFt,
    "stable-item-id": stableItemId,
  },
  refs: {},
};

const conformRangeStructure = exactConformer(
  WEAPON_RANGE_PAIR_SCHEMA,
  WEAPON_PROPERTY_CONTEXT
);
const conformPropertyStructure = exactConformer(
  WEAPON_PROPERTY_SCHEMA,
  WEAPON_PROPERTY_CONTEXT
);
const conformCapabilityStructure = exactConformer(
  WEAPON_CAPABILITY_SCHEMA,
  WEAPON_PROPERTY_CONTEXT
);
const conformCapabilitiesStructure = exactConformer(
  WEAPON_CAPABILITIES_SCHEMA,
  WEAPON_PROPERTY_CONTEXT
);

function validRange(range: WeaponRangePair): boolean {
  return range.normalFt <= range.longFt;
}

function validCapability(capability: WeaponCapability): boolean {
  switch (capability.kind) {
    case "ammunition":
    case "range":
    case "thrown":
      return validRange(capability.range);
    case "reach":
      return capability.reachFt <= MAX_REACH_FT;
    case "finesse":
    case "heavy":
    case "light":
    case "loading":
    case "two-handed":
    case "versatile":
      return true;
  }
}

/** Exact, cloned, deeply frozen normal/long range. */
export function conformWeaponRangePair(value: unknown): Readonly<WeaponRangePair> | null {
  const range = conformRangeStructure(value);
  return range && validRange(range) ? range : null;
}

/** Exact, cloned, deeply frozen official weapon property. */
export function conformWeaponProperty(value: unknown): Readonly<WeaponProperty> | null {
  const property = conformPropertyStructure(value);
  return property && validCapability(property) ? property : null;
}

/** Exact, cloned, deeply frozen property or intrinsic-range capability. */
export function conformWeaponCapability(
  value: unknown
): Readonly<WeaponCapability> | null {
  const capability = conformCapabilityStructure(value);
  return capability && validCapability(capability) ? capability : null;
}

function kindOrder(kind: WeaponCapability["kind"]): number {
  return WEAPON_CAPABILITY_KINDS.indexOf(kind);
}

type RangeAuthority = Extract<
  WeaponCapability,
  { readonly kind: "ammunition" | "range" | "thrown" }
>;

function rangeAuthority(capability: WeaponCapability): capability is RangeAuthority {
  return (
    capability.kind === "ammunition" ||
    capability.kind === "range" ||
    capability.kind === "thrown"
  );
}

/**
 * Exact canonical property set. Kinds are unique and ordered by
 * `WEAPON_CAPABILITY_KINDS`; a weapon has at most one range authority.
 */
export function conformWeaponCapabilities(
  value: unknown
): Readonly<WeaponCapabilities> | null {
  const capabilities = conformCapabilitiesStructure(value);
  if (!capabilities || capabilities.length > WEAPON_CAPABILITY_KINDS.length) {
    return null;
  }

  let previousOrder = -1;
  let rangeAuthorities = 0;
  for (const capability of capabilities) {
    const order = kindOrder(capability.kind);
    if (
      !validCapability(capability) ||
      order <= previousOrder ||
      (rangeAuthority(capability) && (rangeAuthorities += 1) > 1)
    ) {
      return null;
    }
    previousOrder = order;
  }

  const ammunition = hasWeaponProperty(capabilities, "ammunition");
  const intrinsicRange = capabilities.some(({ kind }) => kind === "range");
  const loading = hasWeaponProperty(capabilities, "loading");
  const reach = hasWeaponProperty(capabilities, "reach");
  const twoHanded = hasWeaponProperty(capabilities, "two-handed");
  const versatile = hasWeaponProperty(capabilities, "versatile");

  return (loading && !ammunition) ||
    ((ammunition || intrinsicRange) && (reach || versatile)) ||
    (twoHanded && versatile)
    ? null
    : capabilities;
}

export interface WeaponPropertyProfile {
  readonly capabilities: readonly WeaponCapability[];
  readonly weaponType: WeaponType;
}

/** Cross-field rules that require the weapon's attack type. */
export function validateWeaponProperties(profile: WeaponPropertyProfile): boolean {
  const capabilities = conformWeaponCapabilities(profile.capabilities);
  if (!capabilities) return false;

  const ammunition = hasWeaponProperty(capabilities, "ammunition");
  const intrinsicRange = capabilities.some(({ kind }) => kind === "range");
  const thrown = hasWeaponProperty(capabilities, "thrown");
  const reach = hasWeaponProperty(capabilities, "reach");
  const versatile = hasWeaponProperty(capabilities, "versatile");

  return profile.weaponType === "melee"
    ? !ammunition && !intrinsicRange
    : (ammunition || intrinsicRange || thrown) && !reach && !versatile;
}

export function hasWeaponProperty(
  capabilities: readonly WeaponCapability[],
  kind: WeaponProperty["kind"]
): boolean {
  return capabilities.some((capability) => capability.kind === kind);
}

/** The sole normal/long attack range, or `null` for a melee-only weapon. */
export function getWeaponRange(
  capabilities: readonly WeaponCapability[]
): WeaponRangePair | null {
  for (const capability of capabilities) {
    if (rangeAuthority(capability)) return capability.range;
  }
  return null;
}

/** Effective melee reach; ordinary weapons derive the rules-default five feet. */
export function getWeaponReachFt(capabilities: readonly WeaponCapability[]): number {
  for (const capability of capabilities) {
    if (capability.kind === "reach") return capability.reachFt;
  }
  return DEFAULT_REACH_FT;
}
