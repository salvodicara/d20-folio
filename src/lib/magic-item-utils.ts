/**
 * Pure helpers for working with SRD magic items.
 *
 * Kept separate from the component file to keep react-refresh happy and to
 * make the parsers unit-testable in isolation.
 */

import type { ResourceEnteredRoll, SrdMagicItemData } from "@/data/types";

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

/** "7" or a dice count "1d6+3" (captures: count, sides, sign, modifier). */
const COUNT = String.raw`(\d+)(?:d(\d+)(?:\s*([+-])\s*(\d+))?)?`;

function enteredRoll(m: RegExpExecArray): ResourceEnteredRoll {
  const modifier = m[4] === undefined ? 0 : Number(m[4]) * (m[3] === "-" ? -1 : 1);
  return {
    dice: Number(m[1]),
    sides: Number(m[2]),
    ...(modifier !== 0 ? { modifier } : {}),
  };
}

/**
 * Parse a "charges: N" / "N charges" / "charges (N)" hint from a magic
 * item's properties list. Returns the maximum charge count or undefined
 * when no charges hint is present. Used by the MagicItemAddModal to
 * pre-fill the `charges.max` field when a wand/staff is added.
 *
 * A rolled count ("charges: 1d6+3", Necklace of Fireballs) is the formula's
 * maximum: the app never rolls, so the player spends down to the table's roll.
 */
export function parseMagicItemCharges(
  item: Pick<SrdMagicItemData, "properties">
): number | undefined {
  for (const p of item.properties ?? []) {
    const rolled = new RegExp(String.raw`\bcharges?\s*[:=]\s*${COUNT}`, "i").exec(p);
    if (rolled?.[2] !== undefined) {
      const roll = enteredRoll(rolled);
      const max = roll.dice * roll.sides + (roll.modifier ?? 0);
      if (max > 0) return max;
      continue;
    }
    // "charges: 7" / "charges (7)" / "7 charges"
    const m =
      rolled ??
      /\bcharges?\s*\(\s*(\d+)\s*\)/i.exec(p) ??
      /\b(\d+)\s+charges?\b/i.exec(p);
    if (m?.[1]) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

/** What an item regains daily at dawn: a fixed amount or a roll the table makes. */
export type MagicItemDawnRecharge =
  | { kind: "fixed"; amount: number }
  | { kind: "entered-roll"; roll: ResourceEnteredRoll };

/**
 * Parse a "recharge: 1d6+1 / dawn" / "recharge: 1 / dawn" tag. Undefined means
 * the item's text gives no dawn recovery: its charges never come back.
 */
export function parseMagicItemDawnRecharge(
  item: Pick<SrdMagicItemData, "properties">
): MagicItemDawnRecharge | undefined {
  for (const p of item.properties ?? []) {
    const m = new RegExp(String.raw`^recharge:\s*${COUNT}\s*/\s*dawn$`, "i").exec(
      p.trim()
    );
    if (!m) continue;
    return m[2] === undefined
      ? { kind: "fixed", amount: Number(m[1]) }
      : { kind: "entered-roll", roll: enteredRoll(m) };
  }
  return undefined;
}

/**
 * The legacy `charges` max an SRD ref of this item carries: items without typed
 * `resources` or a free-cast grant pool (those own their charges elsewhere).
 */
export function legacyMagicItemCharges(
  item: Pick<SrdMagicItemData, "properties" | "resources" | "grants">
): number | undefined {
  if (item.resources?.length) return undefined;
  const hasGrantPool = item.grants?.some(
    (grant) => grant.type === "free-cast-spell" || grant.type === "free-cast-from-list"
  );
  return hasGrantPool ? undefined : parseMagicItemCharges(item);
}
