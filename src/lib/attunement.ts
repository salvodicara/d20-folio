/**
 * attunement — the ONE gate that decides whether an equipped item's effects
 * (declarative grants, AC bonus, AC formula) actually apply to the character.
 *
 * RAW 2024: an item that REQUIRES attunement contributes nothing until the
 * player attunes to it. A minimally-stored ref (hand-written, or added before
 * an `attuned` flag was ever written) leaves `attuned` UNDEFINED — which is NOT
 * attuned. Deriving the requirement from the SRD magic-item DATA (`attunement:
 * true`), never from the ref's shape, is golden rule 6: a Brooch of Shielding
 * gates identically however it was stored, and the sheet/engine can't disagree.
 */
import type { SrdEquipmentRef, CustomEquipment } from "@/types/character";
import { getMagicItem } from "@/data/magic-items";

type EquipRef = SrdEquipmentRef | CustomEquipment;

/**
 * Whether an equipment ref REQUIRES attunement — from the SRD magic-item data
 * (`attunement: true`). Custom (homebrew) items have no SRD row, so they opt in
 * by carrying an explicit `attuned` flag.
 */
export function requiresAttunement(ref: EquipRef): boolean {
  if ("custom" in ref) return ref.attuned !== undefined;
  return getMagicItem(ref.srdId)?.attunement === true || ref.attuned !== undefined;
}

/**
 * Whether an equipment ref's attunement is SATISFIED — i.e. its effects apply.
 * An attunement-required item is satisfied ONLY when `attuned === true`
 * (`undefined` = never attuned = inert); a non-attunement item is always
 * satisfied. The single gate `resolveGrantSourcesForEquipment` and `computeAC`
 * share, so grants and AC can never diverge (golden rules 2 + 6).
 */
export function attunementSatisfied(ref: EquipRef): boolean {
  return !requiresAttunement(ref) || ref.attuned === true;
}
