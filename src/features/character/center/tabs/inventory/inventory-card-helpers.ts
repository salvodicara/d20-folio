/**
 * inventory-card-helpers — the pure presenter↔edge split for the Inventory cards
 * (docs/ARCHITECTURE.md). SRD CONTENT arrives PRE-LOCALIZED on the row VMs
 * ({@link import("@/lib/views/inventory-view").WeaponRowVM} /
 * {@link import("@/lib/views/inventory-view").ItemRowVM}); these helpers only turn
 * RAW numbers + ids into the APP-localized display strings (damage formula, to-hit,
 * verdict outcome, damage-type words) via the passed `t`. No BiText / `[locale]`
 * reads — that all happened in the presenter.
 */
import type { TFunction } from "i18next";
import type { VerdictOutcome } from "@/components/shared/UniversalCard";
import {
  itemResourceRecoveryTranslationKey,
  type ItemResourceVM,
} from "@/lib/views/item-resource-view";
import type { ItemRowVM } from "@/lib/views/inventory-view";

/**
 * Map an SRD damage-type id to the ONE folio verdict outcome (drives the
 * `.uc-verdict[data-o]` chromatic chip via the §11 `--dmg-*` tokens). Physical
 * types collapse to "physical"; an unknown id → "neutral" (honest blank).
 */
const PHYSICAL_DAMAGE = new Set(["slashing", "piercing", "bludgeoning"]);
const ELEMENTAL_DAMAGE = new Set<VerdictOutcome>([
  "fire",
  "cold",
  "lightning",
  "acid",
  "thunder",
  "poison",
  "necrotic",
  "radiant",
  "force",
  "psychic",
]);

export function damageVerdictOutcome(damageType: string | undefined): VerdictOutcome {
  if (!damageType) return "neutral";
  if (PHYSICAL_DAMAGE.has(damageType)) return "physical";
  return ELEMENTAL_DAMAGE.has(damageType as VerdictOutcome)
    ? (damageType as VerdictOutcome)
    : "neutral";
}

/**
 * Curated short damage-type label for the weapon verdict ("1d8+3 Prc"). Uses the
 * same `srd.damageShort_*` keys as Spells / Combat so all migrated card pages
 * abbreviate identically.
 */
export function damageTypeAbbr(damageType: string, t: TFunction): string {
  return t(`srd.damageShort_${damageType}`);
}

/** Player-facing copy name: deterministic inventory order, never an opaque UUID. */
export function inventoryItemDisplayName(vm: ItemRowVM, t: TFunction): string {
  const copyNumber = vm.resources[0]?.copyNumber;
  return copyNumber == null
    ? vm.name
    : t("magicItems.resourceCopy", { name: vm.name, number: copyNumber });
}

/** Localized count + unit, or an honest prompt when initialization needs a roll. */
export function itemResourceCountLabel(resource: ItemResourceVM, t: TFunction): string {
  if (resource.current == null || resource.capacity == null) {
    return t("magicItems.resourceNeedsRoll");
  }
  return `${resource.current} / ${resource.capacity} ${t(resource.unitKey)}`;
}

/** Exact cadence from typed triggers; dawn/dusk never collapse into rest labels. */
export function itemResourceRecoveryLabel(
  resource: ItemResourceVM,
  t: TFunction
): string {
  if (resource.recoveryTriggers.length === 0) {
    return t("combat.resourceRecoveryNone");
  }
  return resource.recoveryTriggers
    .map((trigger) => t(itemResourceRecoveryTranslationKey(trigger)))
    .join(" · ");
}
