/**
 * Armor display helpers — turn an SRD `ac` block into a read-only display string.
 *
 * Pure (the i18n `t` is injected) so the inventory UI and the unit suite share one
 * formatter. The AC of a STANDARD armor is SRD data and is never user-editable;
 * this is the "show useful stuff e.g. the AC of an armor" fact.
 */

/** The SRD armor AC shape (`SrdEquipmentData["ac"]`). */
export interface ArmorAc {
  base: number;
  dexBonus: boolean;
  maxDex?: number;
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Format an armor's AC formula for a read-only fact:
 *   - shield        → "+2"            (a flat bonus)
 *   - heavy armor   → "18"            (no DEX)
 *   - light armor   → "11 + DEX"      (uncapped DEX)
 *   - medium armor  → "14 + DEX (max 2)"
 * `category === "shield"` is rendered as a bonus; everything else as a value.
 * The DEX abbreviation + "max N" note localize via `t`.
 */
export function formatArmorAcValue(
  ac: ArmorAc,
  category: string | undefined,
  t: Translate
): string {
  if (category === "shield") return `+${ac.base}`;
  if (!ac.dexBonus) return String(ac.base);
  const dex = t("abilities.DEX_short");
  if (ac.maxDex != null) {
    return `${ac.base} + ${dex} (${t("equipment.acMaxDex", { n: ac.maxDex })})`;
  }
  return `${ac.base} + ${dex}`;
}
