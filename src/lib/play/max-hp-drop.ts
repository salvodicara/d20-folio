/**
 * #1365 — current HP follows the max down. When a change lowers the effective max
 * HP (an attuned CON item sold, removed or unattuned, Aid ending, a feat removed),
 * current HP above the new max comes down to it, as D&D Beyond and Roll20 show it.
 * A max that rises never heals, and a max of 0 is left to the Hit Point maximum
 * reduction rules (`setHpMaxReduction`). Pure: the sheet events apply it as a
 * consequence (so the play log reproduces it), and the store applies it to every
 * other write.
 */
import { effectiveMaxHp } from "@/lib/aggregate-character";
import type { CharacterDoc } from "@/types/character";

/** The session slices the effective max reads (`AggregationSession` + the max's own). */
const MAX_INPUTS = [
  "activeFeatures",
  "grantBundleChoices",
  "conditions",
  "concentrationConditions",
  "encounterEffects",
  "partyAura",
  "concentration",
  "itemResources",
  "world",
  "hpMaxReduction",
  "fadingPenalties",
  "sessionDefenses",
  "activeForm",
  "polymorphForm",
  "magicJar",
] as const satisfies ReadonlyArray<keyof CharacterDoc["session"]>;

/** Whether a write can have moved the max: the build, or a session slice it reads. A
 *  write that touches neither (a timer tick, an HP change) skips the derive. */
export function maxInputsChanged(before: CharacterDoc, after: CharacterDoc): boolean {
  if (before.character !== after.character) return true;
  if (before.session === after.session) return false;
  return MAX_INPUTS.some((key) => !sameSlice(before.session[key], after.session[key]));
}

/** The same value, or an array rebuilt with the same items (a timer tick rebuilds
 *  `activeFeatures` on every round). */
function sameSlice(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((item, i) => item === b[i]);
}

export function hpClampedToDroppedMax(
  before: CharacterDoc,
  after: CharacterDoc
): CharacterDoc {
  if (before.id !== after.id || !maxInputsChanged(before, after)) return after;
  const max = effectiveMaxHp(after.character, after.session);
  const current = after.session.hp.current;
  if (max <= 0 || current <= max) return after;
  if (max >= effectiveMaxHp(before.character, before.session)) return after;
  return {
    ...after,
    session: { ...after.session, hp: { ...after.session.hp, current: max } },
  };
}
