/**
 * Environment hazards with clean mechanics (SRD 5.2.1), as pure facts and
 * transitions; the app never rolls, so each names the roll and the caller records it:
 *
 *  - Burning: 1d4 Fire damage at the start of each of the creature's turns until put
 *    out — by its own action (it falls Prone, rolling on the ground) or by being
 *    doused, submerged or suffocated. `session.burning` marks it.
 *  - Slippery Ice: Difficult Terrain; moving onto it for the first time on a turn, or
 *    starting the turn there, asks a DC 10 Dexterity save or Prone.
 *  - Strong Wind: Disadvantage on ranged weapon attack rolls; open flames go out; a
 *    flyer that hasn't landed by the end of its turn falls (the fall is `fall.ts`).
 *
 * Extreme cold and heat, frigid and deep water are `views/hazard-saves.ts`; thirst and
 * hunger `provisions.ts`; suffocation `suffocation.ts`.
 */
import type { MonsterDamage } from "@/data/types";
import type { CharacterDoc, SessionState } from "@/types/character";
import { addCondition } from "./conditions";

const PRONE = "prone";

/** The damage a burning creature takes at the start of each of its turns. */
const BURNING_DAMAGE: MonsterDamage = { dice: "1d4", damageType: "fire" };

/** The creature catches fire. Null when it is already burning. */
export function setOnFire(doc: CharacterDoc): SessionState | null {
  if (doc.session.burning) return null;
  return { ...doc.session, burning: true };
}

/** The damage its turn start deals while it burns, or null when it does not. */
export function burningTurnStart(doc: CharacterDoc): MonsterDamage | null {
  return doc.session.burning ? { ...BURNING_DAMAGE } : null;
}

/** How the fire goes out: rolling on the ground (its action, then Prone), or put out
 *  from outside. */
export type Extinguish = "roll" | "doused" | "submerged" | "suffocated";

/** The fire goes out. `action`: it took the creature's action. Null when it was not
 *  burning. */
export function extinguish(
  doc: CharacterDoc,
  how: Extinguish
): { session: SessionState; action: boolean } | null {
  if (!doc.session.burning) return null;
  const out = { ...doc.session };
  delete out.burning;
  if (how !== "roll") return { session: out, action: false };
  return {
    session: addCondition({ ...doc, session: out }, PRONE) ?? out,
    action: true,
  };
}

/** When slippery ice asks its save: on entering it (the first time this turn), at the
 *  start of the turn there, or on moving across it again this turn (no save). */
export type IceMoment = "entered" | "turn-start" | "again";

/** The save slippery ice asks, or null. */
export function slipperyIceSave(moment: IceMoment): {
  ability: "DEX";
  dc: number;
  onFail: "prone";
  difficultTerrain: true;
} | null {
  if (moment === "again") return null;
  return { ability: "DEX", dc: 10, onFail: "prone", difficultTerrain: true };
}

/** What a strong wind does at the table. */
export const STRONG_WIND = {
  attack: {
    mode: "disadvantage",
    kinds: ["ranged"],
    weaponOnly: true,
  },
  extinguishesOpenFlames: true,
  dispersesFog: true,
} as const;

/** A flyer in a strong wind that hasn't landed at the end of its turn falls. */
export function strongWindFall(creature: { flying: boolean; landed: boolean }): boolean {
  return creature.flying && !creature.landed;
}
