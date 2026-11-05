/**
 * A magic item's rules beyond its wearer's sheet (edge-case M20,
 * docs/architecture/2026-11-dm-state-and-roster.md). The public ones hide nothing:
 * the damage an item takes as an object, a sentient item's conflict DC. The DM's side
 * is per copy, keyed by its instanceId: what only the DM knows (`dmItems`: is this
 * copy cursed, its rolled artifact properties, notes) and what the DM has revealed
 * (`itemReveals`, members read). Revealing moves knowledge from one to the other;
 * nothing hidden ever reaches a document a player can read. Pure.
 */
import { getMagicItem } from "@/data/magic-items";
import { abilityModifier } from "@/lib/ability";
import type { TableRules } from "@/lib/table-rules";

/** The damage a magic item takes (SRD 5.2.1 "Magic Items"): most have Resistance to
 *  all damage; Potions and Scrolls, and anything the catalogue doesn't know, take it
 *  whole. */
export function damageToItem(itemId: string, amount: number): number {
  const item = getMagicItem(itemId);
  if (!item || item.type === "potion" || item.type === "scroll") return amount;
  return Math.floor(amount / 2);
}

/** A sentient item's conflict: its bearer's Charisma save against 12 + the item's
 *  Charisma modifier. */
export function sentientConflictDc(item: { charisma: number }): number {
  return 12 + abilityModifier(item.charisma);
}

/** What only the DM knows about one copy (`campaigns/{c}/dmItems/{instanceId}`). */
export interface DmItemState {
  /** This copy is cursed (the catalogue says what the curse does). */
  cursed?: boolean;
  /** An artifact's properties rolled for this copy, as the DM's table names them. */
  properties?: string[];
  notes?: string;
}

/** What the DM has revealed of one copy (`campaigns/{c}/itemReveals/{instanceId}`). */
export interface ItemReveal {
  curse?: true;
  properties?: string[];
}

/** The reveal of a cursed copy's curse; null when it isn't cursed or already known. */
export function revealCurse(
  dm: DmItemState,
  reveal: ItemReveal | undefined
): ItemReveal | null {
  if (!dm.cursed || reveal?.curse) return null;
  return { ...reveal, curse: true };
}

/** What casting Identify on a copy reveals beyond its open facts (charges are on the
 *  item): the curse, only where the item says Identify reveals it (Armor of
 *  Vulnerability) and only on a cursed copy. */
export function identifyReveal(
  itemId: string,
  dm: DmItemState,
  reveal: ItemReveal | undefined
): ItemReveal | null {
  return getMagicItem(itemId)?.curse?.revealedByIdentify ? revealCurse(dm, reveal) : null;
}

/** Whether a copy's curse binds its attunement on the sheet. Solo, the catalogue
 *  as written; in a campaign, only once the DM has revealed it (blocking it before
 *  would itself reveal the curse). */
export function curseBinds(
  itemId: string,
  where: { campaign: boolean; reveal?: ItemReveal }
): boolean {
  if (getMagicItem(itemId)?.curse?.bindsAttunement !== true) return false;
  return !where.campaign || where.reveal?.curse === true;
}

/** An artifact copy's rolled properties: those revealed, and those still hidden. */
export function rolledProperties(
  dm: DmItemState,
  reveal: ItemReveal | undefined
): { revealed: string[]; hidden: string[] } {
  const known = new Set(reveal?.properties ?? []);
  const rolled = dm.properties ?? [];
  return {
    revealed: rolled.filter((p) => known.has(p)),
    hidden: rolled.filter((p) => !known.has(p)),
  };
}

/** The reveal of one rolled property; null when not rolled or already revealed. */
export function revealProperty(
  dm: DmItemState,
  reveal: ItemReveal | undefined,
  property: string
): ItemReveal | null {
  if (!(dm.properties ?? []).includes(property)) return null;
  if (reveal?.properties?.includes(property)) return null;
  return { ...reveal, properties: [...(reveal?.properties ?? []), property] };
}

/** An evolving item's unlocked properties (optional rule, `evolvingItems`): the
 *  owner sees them, so they live on the item itself; none when the table doesn't
 *  play the rule. */
export function unlockedProperties(
  ref: { unlockedProperties?: ReadonlyArray<string> },
  rules: Pick<TableRules, "evolvingItems">
): string[] {
  return rules.evolvingItems ? [...(ref.unlockedProperties ?? [])] : [];
}

const MAX_NOTES = 4000;
const MAX_LIST = 64;
const MAX_ID = 128;

const strings = (raw: unknown): string[] | undefined =>
  Array.isArray(raw)
    ? raw
        .filter((v): v is string => typeof v === "string" && v.length <= MAX_ID)
        .slice(0, MAX_LIST)
    : undefined;

/** A stored `dmItems` document, bounded; unknown fields dropped. */
export function parseDmItemState(raw: unknown): DmItemState {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const properties = strings(r.properties);
  return {
    ...(r.cursed === true ? { cursed: true } : {}),
    ...(properties?.length ? { properties } : {}),
    ...(typeof r.notes === "string" && r.notes
      ? { notes: r.notes.slice(0, MAX_NOTES) }
      : {}),
  };
}

/** A stored `itemReveals` document, bounded; unknown fields dropped. */
export function parseItemReveal(raw: unknown): ItemReveal {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const properties = strings(r.properties);
  return {
    ...(r.curse === true ? { curse: true as const } : {}),
    ...(properties?.length ? { properties } : {}),
  };
}
