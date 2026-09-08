import {
  CREATION_CATALOGUE,
  CREATION_RELEASE,
  CREATION_ADAPTER_VERSION,
} from "./catalogue-policy";
export {
  CREATION_CATALOGUE,
  CREATION_RELEASE,
  CREATION_ADAPTER_VERSION,
} from "./catalogue-policy";
import { frozen } from "../identity/model";
import { equal } from "../shared/model";
import { assertJsonBudget } from "../shared/json-budget";
import { creationRootDefinition } from "./root-adapter";
import type { CatalogueSnapshot } from "../homebrew/sources";
import type { JsonValue, LibraryDefinition } from "../library/model";
import {
  creationSources,
  type CreationSource,
  type CreationSourceKind,
} from "./catalogue-source";
const families: CreationSourceKind[] = [
  "class",
  "species",
  "background",
  "feat",
  "spell",
  "equipment",
  "invocation",
];
let sources: Map<string, CreationSource> | undefined;
const snapshots = new Map<string, CatalogueSnapshot>();
export function catalogueSource(key: string): CreationSource {
  sources ??= new Map(
    families
      .flatMap((kind) => creationSources(kind))
      .map((source) => [source.key, source])
  );
  const source = sources.get(key);
  if (!source) throw new Error("catalogue-source-unavailable");
  return source;
}
/** JSON absence is retained; executable or circular source data cannot become a snapshot. */
function sourceJson(value: unknown): JsonValue {
  const result = JSON.parse(
    JSON.stringify(value, (_key, field: unknown) => {
      if (
        (typeof field === "number" && !Number.isFinite(field)) ||
        ["function", "symbol", "bigint"].includes(typeof field)
      )
        throw new Error("catalogue-source-unavailable");
      return field;
    })
  ) as JsonValue;
  assertJsonBudget(result, 200_000);
  return result;
}
function leafDefinition(source: CreationSource): LibraryDefinition {
  if (source.kind !== "spell" && source.kind !== "equipment")
    throw new Error("catalogue-acquisition-not-adapted");
  const family =
    source.kind === "spell"
      ? "spell"
      : source.value.category === "weapon"
        ? "weapon"
        : "equipment";
  const data: Record<string, JsonValue> = {
    authoringVersion: 1,
    edition: "2024",
    source: source.value.source,
    sourceVersion: CREATION_RELEASE,
    mechanicId: source.id,
  };
  if (source.kind === "spell") {
    const spell = source.value;
    Object.assign(data, {
      level: spell.level,
      school: spell.school,
      ritual: spell.ritual,
      concentration: spell.concentration,
      verbal: spell.components.v,
      somatic: spell.components.s,
      material: spell.components.m,
    });
    const activation = { action: "action", bonus: "bonus-action", reaction: "reaction" }[
      spell.castingTime
    ];
    if (activation) data.activation = activation;
    if (spell.components.costGp !== undefined)
      data.materialCost = spell.components.costGp;
    if (spell.components.consumed !== undefined)
      data.materialConsumed = spell.components.consumed;
    if (spell.instantaneous === true)
      Object.assign(data, { durationKind: "instant", durationAmount: 0 });
  } else {
    const item = source.value;
    const currency = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };
    const bundleSize = item.bundleSize ?? 1;
    data.cost = (item.cost.amount * currency[item.cost.unit]) / bundleSize;
    if (item.weight !== undefined) data.weight = (item.weight * 0.45359237) / bundleSize;
    if (family === "weapon") {
      if (!item.weaponCategory || !item.weaponType)
        throw new Error("catalogue-source-unavailable");
      Object.assign(data, { category: item.weaponCategory, mode: item.weaponType });
      if (item.damage)
        Object.assign(data, {
          damageFormula: item.damage.die,
          damageType: item.damage.type,
        });
      if (item.mastery) data.mastery = item.mastery.toLowerCase();
      // These are exact authored tokens. Parameterized property text stays in sourceData.
      for (const property of ["Finesse", "Light", "Heavy", "Loading", "Reach"])
        if (item.properties?.includes(property)) data["property" + property] = true;
      if (item.properties?.includes("Two-Handed")) data.propertyTwoHanded = true;
    } else {
      data.category = item.category === "pack" ? "gear" : item.category;
      if (item.isConsumable !== undefined) data.consumable = item.isConsumable;
      if (item.ac) {
        if (item.category === "shield") data.shieldBonus = item.ac.base;
        else
          Object.assign(data, {
            armorBase: item.ac.base,
            armorDex: !item.ac.dexBonus
              ? "none"
              : item.ac.maxDex === undefined
                ? "full"
                : "capped",
            ...(item.ac.maxDex !== undefined ? { armorDexCap: item.ac.maxDex } : {}),
          });
      }
    }
  }
  return {
    schema: 1,
    family,
    name: source.name,
    description: source.description,
    tags: [],
    payload: { schema: 1, data },
  };
}
export function catalogueSnapshot(key: string): CatalogueSnapshot {
  const previous = snapshots.get(key);
  if (previous) return previous;
  const source = catalogueSource(key);
  const snapshot: CatalogueSnapshot = frozen({
    kind: "catalogue",
    schema: 1,
    catalogue: CREATION_CATALOGUE,
    release: CREATION_RELEASE,
    adapterVersion: CREATION_ADAPTER_VERSION,
    entryId: key,
    definition:
      source.kind === "spell" || source.kind === "equipment"
        ? leafDefinition(source)
        : creationRootDefinition(source, catalogueSnapshot),
    sourceData: sourceJson({
      kind: source.kind,
      data: source.value,
      ...(source.kind === "class" ? { features: source.features } : {}),
    }),
  });
  snapshots.set(key, snapshot);
  return snapshot;
}
export function verifyCatalogueSnapshot(
  snapshot: CatalogueSnapshot,
  includedNode = false
): boolean {
  try {
    const expected = catalogueSnapshot(snapshot.entryId);
    if (!includedNode) return equal(snapshot, expected);
    const included = structuredClone(expected);
    delete included.definition.payload.data.dependencies;
    return equal(snapshot, included);
  } catch {
    return false;
  }
}
