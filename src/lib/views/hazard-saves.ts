/**
 * The environment's Constitution saves as prompt data (SRD 5.2.1 "Environmental
 * Effects"): Extreme Cold and Extreme Heat at the end of each hour, Frigid Water each
 * minute past the Constitution score, Deep Water after each hour of swimming. A failure
 * is 1 Exhaustion level, applied through the sheet's own `set-exhaustion` event. The
 * app never rolls: the prompt names the save, its DC and bonus, and whether it
 * succeeds on its own or rolls with Disadvantage; the player declares the result.
 *
 * Read from the one derived sheet (`deriveCharacter`): effective defenses (grants,
 * build overrides, session defenses), speeds and the Constitution save bonus.
 */
import { getEquipment } from "@/data/equipment";
import type { SheetEvent } from "@/lib/play/sheet-events";
import type { CharacterDoc } from "@/types/character";
import type { DamageType } from "@/types/damage";
import { deriveCharacter } from "./derive-character";

export const HAZARDS = [
  "extreme-cold",
  "extreme-heat",
  "frigid-water",
  "deep-water",
] as const;
export type HazardId = (typeof HAZARDS)[number];

export interface HazardSaveQuery {
  hazard: HazardId;
  /** Which check this is, from 1: the hour (cold, heat, deep water) or the minute in
   *  the water (frigid water) that just ended. */
  step: number;
  /** Extreme Heat only: the creature has drinkable water (no save). */
  drinkableWater?: boolean;
}

export interface HazardSavePrompt {
  hazard: HazardId;
  ability: "CON";
  dc: number;
  /** The character's Constitution save bonus. */
  bonus: number;
  /** Resistance or Immunity to the hazard's damage type: the save just succeeds. */
  autoSuccess: boolean;
  /** Extreme Heat in Medium or Heavy armor. */
  disadvantage: boolean;
}

const SAFE_TYPE: Partial<Record<HazardId, DamageType>> = {
  "extreme-cold": "cold",
  "frigid-water": "cold",
  "extreme-heat": "fire",
};

function wearsMediumOrHeavyArmor(doc: CharacterDoc): boolean {
  return doc.character.equipment.some((item) => {
    if (!item.equipped) return false;
    const category =
      "custom" in item ? item.armorCategory : getEquipment(item.srdId)?.armorCategory;
    return category === "medium" || category === "heavy";
  });
}

/** The save this hazard asks at this step, or null when it asks none. */
export function hazardSave(
  doc: CharacterDoc,
  query: HazardSaveQuery
): HazardSavePrompt | null {
  const { hazard, step } = query;
  if (!Number.isSafeInteger(step) || step < 1) return null;
  const sheet = deriveCharacter(doc);
  if (hazard === "extreme-heat" && query.drinkableWater) return null;
  if (hazard === "frigid-water" && step <= sheet.abilities.CON.score) return null;
  if (hazard === "deep-water" && sheet.speeds.some((speed) => speed.kind === "swim")) {
    return null;
  }
  const safe = SAFE_TYPE[hazard];
  const { resistances, immunities, allDamageResistance } = sheet.defenses;
  return {
    hazard,
    ability: "CON",
    dc: hazard === "extreme-heat" ? 5 + (step - 1) : 10,
    bonus: sheet.saves.find((save) => save.ability === "CON")?.bonus ?? 0,
    autoSuccess:
      safe !== undefined &&
      (allDamageResistance || resistances.has(safe) || immunities.has(safe)),
    disadvantage: hazard === "extreme-heat" && wearsMediumOrHeavyArmor(doc),
  };
}

/** A failed environment save: 1 more Exhaustion level. */
export function hazardSaveFailed(doc: CharacterDoc): SheetEvent {
  return { kind: "set-exhaustion", level: doc.session.exhaustion + 1 };
}
