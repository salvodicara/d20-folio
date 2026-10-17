/**
 * What putting armor on or taking it off costs in time (SRD 5.2.1 "Armor": the
 * {@link ARMOR_DON_DOFF} table). The sheet never blocks the Equip toggle (the player
 * may be changing between scenes); it says the time, and inside a fight it flags a
 * minutes-long change, which no single action covers.
 */
import { ARMOR_DON_DOFF, type ArmorTime } from "@/data/armor";
import type { ArmorCategory } from "@/data/types";

export interface ArmorChange {
  verb: "don" | "doff";
  time: ArmorTime;
  /** In a fight, and the change takes minutes rather than an action. */
  tooSlowForFight: boolean;
}

/** The don (equipping) or doff time of an armor category; null for non-armor. */
export function armorChange(
  category: ArmorCategory | undefined,
  equipping: boolean,
  inEncounter: boolean
): ArmorChange | null {
  if (!category) return null;
  const times = ARMOR_DON_DOFF[category];
  const time = equipping ? times.don : times.doff;
  return {
    verb: equipping ? "don" : "doff",
    time,
    tooSlowForFight: inEncounter && typeof time === "number",
  };
}
