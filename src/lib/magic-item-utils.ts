/**
 * Pure helpers for working with SRD magic items.
 *
 * Kept separate from the component file to keep react-refresh happy and to
 * make the parsers unit-testable in isolation.
 */

import type { SrdMagicItemData } from "@/data/types";

/**
 * Parse an "AC +N" / "+N AC" hint from the properties list of a magic item
 * (e.g. Bracers of Defense, Ring of Protection). Returns the numeric bonus
 * or undefined when no AC hint is present.
 */
export function parseMagicItemAcBonus(
  item: Pick<SrdMagicItemData, "properties">
): number | undefined {
  for (const p of item.properties ?? []) {
    const m = /([+-]\s*\d+)\s*ac\b/i.exec(p) ?? /\bac\s*([+-]\s*\d+)/i.exec(p);
    if (m?.[1]) {
      const n = parseInt(m[1].replace(/\s+/g, ""), 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

/**
 * Parse a "charges: N" / "N charges" / "charges (N)" hint from a magic
 * item's properties list. Returns the maximum charge count or undefined
 * when no charges hint is present. Used by the MagicItemAddModal to
 * pre-fill the `charges.max` field when a wand/staff is added.
 */
export function parseMagicItemCharges(
  item: Pick<SrdMagicItemData, "properties">
): number | undefined {
  for (const p of item.properties ?? []) {
    // "charges: 7" / "charges (7)" / "7 charges"
    const m =
      /charges?\s*[:=]\s*(\d+)/i.exec(p) ??
      /charges?\s*\(\s*(\d+)\s*\)/i.exec(p) ??
      /\b(\d+)\s+charges?\b/i.exec(p);
    if (m?.[1]) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}
