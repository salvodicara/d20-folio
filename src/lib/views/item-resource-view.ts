/**
 * Pure presenter for mutable resources owned by physical magic-item copies.
 *
 * The rules layer keeps opaque instance/resource ids and exact recovery
 * boundaries. This seam turns those facts into render-safe view models without
 * localizing app chrome or exposing an instance id to the player. Consumers keep
 * the exact identity for commands, then resolve the supplied translation keys at
 * the React edge.
 */

import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import type {
  ResourceRecoveryTrigger,
  ResourceSpec,
  SrdMagicItemData,
} from "@/data/types";
import { attunementSatisfied } from "@/lib/attunement";
import { resolveItemResources, type ItemResourceOmission } from "@/lib/item-resources";
import { makeItemResourceIdentity, type ItemResourceIdentity } from "@/lib/resources";
import type { CharacterDoc, SrdEquipmentRef } from "@/types/character";

export type ItemResourceLabelTranslationKey =
  | "equipment.charges"
  | "magicItems.resourceLabelUses"
  | "magicItems.resourceLabelBeads"
  | "magicItems.resourceLabelRounds";

export type ItemResourceUnitTranslationKey =
  | "units.charges"
  | "units.uses"
  | "units.beads"
  | "units.rounds";

export type ItemResourceRecoveryTranslationKey =
  | "combat.perShortRest"
  | "combat.perLongRest"
  | "combat.resourceRecoveryDawn"
  | "combat.resourceRecoveryDusk"
  | "combat.resourceRecoveryTurnStart"
  | "combat.resourceRecoveryTurnEnd"
  | "combat.resourceRecoveryEvent"
  | "combat.resourceRecoveryManual";

export interface ItemResourceVM {
  /** Exact command address. Opaque ids are never rendered. */
  identity: ItemResourceIdentity;
  /** Display-safe app-string identities, localized only at the React edge. */
  labelKey: ItemResourceLabelTranslationKey;
  unitKey: ItemResourceUnitTranslationKey;
  /** Null means the table must enter a roll before the first transition. */
  current: number | null;
  capacity: number | null;
  /** Exact boundaries from catalogue data; dawn/dusk never alias to a rest. */
  recoveryTriggers: readonly ResourceRecoveryTrigger[];
  /** 1-based only when multiple valid physical copies share the catalogue id. */
  copyNumber: number | null;
  /** False once the exact physical item is nonmagical, consumed, or destroyed. */
  available: boolean;
  /** True when depletion disabled this counter while the physical item remains. */
  disabled: boolean;
  /** Presentational affordance only; the command provider rechecks live state. */
  canSpend: boolean;
}

export interface ItemResourceViewResult {
  resources: ItemResourceVM[];
  /** Invalid/ambiguous owners stay omitted, with diagnostics retained for callers. */
  omissions: ItemResourceOmission[];
}

function labelKey(unit: ResourceSpec["unit"]): ItemResourceLabelTranslationKey {
  switch (unit) {
    case "charges":
      return "equipment.charges";
    case "uses":
      return "magicItems.resourceLabelUses";
    case "beads":
      return "magicItems.resourceLabelBeads";
    case "rounds":
      return "magicItems.resourceLabelRounds";
  }
}

function unitKey(unit: ResourceSpec["unit"]): ItemResourceUnitTranslationKey {
  switch (unit) {
    case "charges":
      return "units.charges";
    case "uses":
      return "units.uses";
    case "beads":
      return "units.beads";
    case "rounds":
      return "units.rounds";
  }
}

/** Presentation-only label key for one exact engine recovery boundary. */
export function itemResourceRecoveryTranslationKey(
  trigger: ResourceRecoveryTrigger
): ItemResourceRecoveryTranslationKey {
  switch (trigger.kind) {
    case "short-rest":
      return "combat.perShortRest";
    case "long-rest":
      return "combat.perLongRest";
    case "dawn":
      return "combat.resourceRecoveryDawn";
    case "dusk":
      return "combat.resourceRecoveryDusk";
    case "turn-start":
      return "combat.resourceRecoveryTurnStart";
    case "turn-end":
      return "combat.resourceRecoveryTurnEnd";
    case "event":
      return "combat.resourceRecoveryEvent";
    case "manual":
      return "combat.resourceRecoveryManual";
  }
}

function exactOwner(
  doc: CharacterDoc,
  itemId: string,
  instanceId: string
): SrdEquipmentRef | null {
  const owners = doc.character.equipment.filter(
    (entry): entry is SrdEquipmentRef =>
      !("custom" in entry) && entry.srdId === itemId && entry.instanceId === instanceId
  );
  return owners.length === 1 ? (owners[0] ?? null) : null;
}

/**
 * Build one render-safe VM per typed resource on every valid physical copy.
 * Catalogue order and equipment order are preserved; copies never collapse by
 * item id. A custom catalogue can be supplied by focused tests, while production
 * defaults to the composed SRD + private-pack catalogue.
 */
export function buildItemResourceViewModels(
  doc: CharacterDoc,
  catalogue: readonly Pick<SrdMagicItemData, "id" | "resources">[] = SRD_MAGIC_ITEMS
): ItemResourceViewResult {
  const resolved = resolveItemResources({
    equipment: doc.character.equipment,
    catalogue,
    itemResources: doc.session.itemResources,
  });

  const copiesByItem = new Map<string, string[]>();
  for (const resource of resolved.resources) {
    const copies = copiesByItem.get(resource.itemId) ?? [];
    if (!copies.includes(resource.instanceId)) copies.push(resource.instanceId);
    copiesByItem.set(resource.itemId, copies);
  }

  return {
    omissions: resolved.omissions,
    resources: resolved.resources.map((resource) => {
      const owner = exactOwner(doc, resource.itemId, resource.instanceId);
      const copies = copiesByItem.get(resource.itemId) ?? [];
      const copyIndex = copies.indexOf(resource.instanceId);
      const copyNumber = copies.length > 1 && copyIndex >= 0 ? copyIndex + 1 : null;
      const current = resource.current ?? null;
      const capacity = resource.capacity ?? null;
      const isLive =
        resource.itemState === undefined || resource.itemState.disposition === "magical";
      const enabled = resource.state?.disabled !== true;

      return {
        identity: makeItemResourceIdentity(
          resource.itemId,
          resource.instanceId,
          resource.resourceId
        ),
        labelKey: labelKey(resource.spec.unit),
        unitKey: unitKey(resource.spec.unit),
        current,
        capacity,
        recoveryTriggers:
          resource.spec.recoveries?.map(({ trigger }) => ({ ...trigger })) ?? [],
        copyNumber,
        available: isLive,
        disabled: !enabled,
        canSpend:
          owner !== null &&
          owner.equipped === true &&
          attunementSatisfied(owner) &&
          isLive &&
          enabled &&
          current !== 0,
      };
    }),
  };
}
