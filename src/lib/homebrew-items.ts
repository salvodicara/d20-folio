/**
 * homebrew-items — the ONE validator between a homebrew weapon's or item's authored
 * mechanics and the engine.
 *
 * A homebrew weapon or item (`CustomWeapon.mechanics`, `CustomEquipment.mechanics`)
 * declares its mechanics in the catalogue magic item's own shape
 * (`HomebrewItemMechanics`, derived from `SrdMagicItemData`), so every structured
 * fact a catalogue magic item can carry a player's item can carry too. The stored
 * object stays exactly as written (the character and library codecs carry it
 * verbatim), and the engine reads it only through `homebrewItemData`: each field is
 * conformed against its exact schema below, and a field the schema rejects is left
 * out of play — never repaired, never erased from storage. Grants are conformed one
 * by one, like a homebrew feature's. An unknown field (a newer client's) is
 * preserved and inert.
 *
 * The result is a catalogue-shaped `SrdMagicItemData` whose id is the physical
 * copy's own `instanceId` (a homebrew item IS one copy), so the item flows through
 * the SAME paths as a catalogue magic item: its grants while worn and attuned, its
 * typed charges (spent by the same controller, recovered at the same boundaries,
 * depleted by the same rule), the spells cast from them, and — on a weapon — its
 * +N and extra damage on its own row.
 */
import { MAGIC_ITEMS_BY_ID } from "@/data/magic-items";
import type { HomebrewItemMechanics, ResourceSpec, SrdMagicItemData } from "@/data/types";
import { ALL_MAGIC_ITEM_RARITIES, ALL_MAGIC_ITEM_TYPES } from "@/data/types";
import {
  arraySchema,
  booleanSchema,
  conformExact,
  customSchema,
  literalSchema,
  numberSchema,
  objectSchema,
  stringSchema,
  unionSchema,
  type ExactSchema,
  type ExactSchemaContext,
} from "@/lib/exact-schema";
import { conformGrant, type Grant } from "@/lib/grants";
import {
  conformResourceRecoveryTrigger,
  isValidItemInstanceId,
  isValidResourceItemSpec,
} from "@/lib/resources";
import type {
  CustomEquipment,
  CustomWeapon,
  SrdEquipmentRef,
  SrdWeaponRef,
} from "@/types/character";

// ─── The exact shape of every structured catalogue magic-item field ──────────

const literals = (values: ReadonlyArray<string>): ExactSchema =>
  unionSchema(values.map((value) => literalSchema(value)));

const ENTERED_ROLL = objectSchema(
  { dice: numberSchema, sides: numberSchema },
  { modifier: numberSchema }
);
const FULL = objectSchema({ kind: literalSchema("full") });
const FIXED = objectSchema({ kind: literalSchema("fixed"), amount: numberSchema });
const ROLLED = objectSchema({ kind: literalSchema("entered-roll"), roll: ENTERED_ROLL });
const OUTCOME = objectSchema({
  kind: literalSchema("set-item-disposition"),
  disposition: literals(["destroyed", "nonmagical"]),
});

/** One typed charge pool, in the catalogue's `ResourceSpec` dialect. */
const RESOURCE = objectSchema(
  {
    kind: literalSchema("counter"),
    id: stringSchema,
    unit: literals(["charges", "uses", "beads", "rounds"]),
    capacity: unionSchema([FIXED, ROLLED]),
    initial: unionSchema([
      FULL,
      objectSchema({ kind: literalSchema("empty") }),
      FIXED,
      ROLLED,
    ]),
  },
  {
    recoveries: arraySchema(
      objectSchema({
        trigger: customSchema<"trigger", Readonly<Record<string, unknown>>>("trigger"),
        amount: unionSchema([FULL, FIXED, ROLLED]),
      })
    ),
    onEmpty: unionSchema([
      objectSchema({
        kind: literalSchema("entered-d20"),
        bands: arraySchema(
          objectSchema({
            min: numberSchema,
            max: numberSchema,
            outcomes: arraySchema(OUTCOME),
          })
        ),
      }),
      objectSchema({
        kind: literalSchema("deterministic"),
        outcomes: arraySchema(OUTCOME),
      }),
    ]),
  }
);

/** A plain JSON object whose inner shape is the catalogue's own nested dialect (a
 *  summoned stat block, a bestiary rule): checked to be an object here, read by the
 *  same consumer the catalogue's goes through. */
const OBJECT = customSchema<"object", Readonly<Record<string, unknown>>>("object");
const GRANT = customSchema<"grant", Grant>("grant");

function plainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

const CONTEXT: ExactSchemaContext<
  {
    object: Readonly<Record<string, unknown>>;
    grant: Grant;
    trigger: Readonly<Record<string, unknown>>;
  },
  Record<never, never>
> = {
  customs: {
    object: (value) => (plainObject(value) ? value : null),
    grant: (value) => conformGrant(value),
    trigger: (value) => conformResourceRecoveryTrigger(value),
  },
  refs: {},
};

/**
 * Every structured catalogue magic-item field → its exact schema. Typed over every
 * key of `HomebrewItemMechanics` (itself derived from `SrdMagicItemData`), so a new
 * catalogue field fails the type check until it is classified here. The catalogue
 * corpus conforms to these schemas (`homebrew-item-mechanics.test.ts`), so the two
 * cannot drift. `grants` is listed for completeness; it is conformed per element,
 * and `resources` also passes the catalogue's own semantic check (unique ids, a
 * d20 table covering 1–20, one recovery per boundary).
 */
export const HOMEBREW_ITEM_FIELD_SCHEMAS: {
  readonly [Key in keyof Required<HomebrewItemMechanics>]: ExactSchema;
} = {
  rarity: literals(ALL_MAGIC_ITEM_RARITIES),
  type: literals(ALL_MAGIC_ITEM_TYPES),
  attunement: booleanSchema,
  price: stringSchema,
  weight: numberSchema,
  grants: arraySchema(GRANT),
  resources: arraySchema(RESOURCE),
  durationRounds: numberSchema,
  summonedMonsters: OBJECT,
  bestiaryPick: OBJECT,
};

/** A typed pool list the catalogue itself would accept, or null. */
function conformResources(raw: unknown): ReadonlyArray<ResourceSpec> | null {
  const value = conformExact(HOMEBREW_ITEM_FIELD_SCHEMAS.resources, raw, CONTEXT);
  if (!Array.isArray(value)) return null;
  const resources = value as ReadonlyArray<ResourceSpec>;
  return isValidResourceItemSpec({ itemId: "homebrew-item", resources })
    ? resources
    : null;
}

// ─── Reading a stored homebrew item ──────────────────────────────────────────

type HomebrewItem = CustomEquipment | CustomWeapon;

const mechanicsCache = new WeakMap<object, HomebrewItemMechanics>();

/**
 * The playable mechanics of a stored homebrew weapon or item: every known field
 * its schema accepts, grants conformed one by one. Undefined when it declares none
 * (an older, text-only homebrew item).
 */
export function homebrewItemMechanics(
  item: Pick<HomebrewItem, "mechanics">
): HomebrewItemMechanics | undefined {
  const authored: unknown = item.mechanics;
  if (!plainObject(authored)) return undefined;
  const hit = mechanicsCache.get(authored);
  if (hit) return hit;
  const accepted: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(HOMEBREW_ITEM_FIELD_SCHEMAS)) {
    if (!Object.hasOwn(authored, key)) continue;
    const raw = authored[key];
    if (key === "grants") {
      if (!Array.isArray(raw)) continue;
      accepted.grants = raw.flatMap((grant: unknown) => {
        const conformed = conformGrant(grant);
        return conformed ? [conformed] : [];
      });
      continue;
    }
    const value: unknown =
      key === "resources" ? conformResources(raw) : conformExact(schema, raw, CONTEXT);
    if (value !== null) accepted[key] = value;
  }
  const mechanics = Object.freeze(accepted) as HomebrewItemMechanics;
  mechanicsCache.set(authored, mechanics);
  return mechanics;
}

const dataCache = new WeakMap<object, SrdMagicItemData>();

/**
 * A homebrew weapon or item as catalogue magic-item data — the one shape the item
 * engine reads. Its id is the copy's own `instanceId`, the identity its charges are
 * stored under (`session.itemResources[instanceId].itemId`). Undefined for a
 * text-only homebrew item (no `mechanics`), and for an id that is not a valid copy
 * id or that a catalogue item already owns (never lend a catalogue item's state).
 */
export function homebrewItemData(item: HomebrewItem): SrdMagicItemData | undefined {
  const hit = dataCache.get(item);
  if (hit) return hit;
  const mechanics = homebrewItemMechanics(item);
  if (!mechanics) return undefined;
  if (!isValidItemInstanceId(item.instanceId) || MAGIC_ITEMS_BY_ID.has(item.instanceId)) {
    return undefined;
  }
  const isWeapon = "damageDie" in item;
  const potionFormula = isWeapon ? undefined : item.potionFormula;
  const data: SrdMagicItemData = {
    ...mechanics,
    id: item.instanceId,
    rarity: mechanics.rarity ?? "common",
    type: mechanics.type ?? (isWeapon ? "weapon" : "wondrous"),
    attunement: mechanics.attunement ?? false,
    ...(potionFormula !== undefined ? { potionFormula } : {}),
    // A homebrew item belongs to no book; it is the player's own.
    source: "Wiki",
  };
  dataCache.set(item, data);
  return data;
}

/** The homebrew items among the equipment, as catalogue-shaped item data. */
export function homebrewItemCatalogue(
  equipment: ReadonlyArray<SrdEquipmentRef | CustomEquipment>
): SrdMagicItemData[] {
  return equipment.flatMap((entry) => {
    if (!("custom" in entry)) return [];
    const data = homebrewItemData(entry);
    return data ? [data] : [];
  });
}

/**
 * The item id one physical copy answers to: a catalogue copy's `srdId`, a structured
 * homebrew copy's own id (its `instanceId`); undefined for a text-only homebrew item.
 */
export function itemCopyItemId(
  entry: SrdEquipmentRef | CustomEquipment
): string | undefined {
  return "custom" in entry ? homebrewItemData(entry)?.id : entry.srdId;
}

/** The magic-item data behind one copy: the catalogue row, or the homebrew item's own. */
export function itemDataForCopy(
  entry: SrdEquipmentRef | CustomEquipment | SrdWeaponRef | CustomWeapon
): SrdMagicItemData | undefined {
  return "custom" in entry ? homebrewItemData(entry) : MAGIC_ITEMS_BY_ID.get(entry.srdId);
}

/** Whether a homebrew weapon carries magic-item mechanics (it is a magic weapon). */
export function isHomebrewMagicWeapon(weapon: CustomWeapon): boolean {
  return homebrewItemData(weapon) !== undefined;
}
