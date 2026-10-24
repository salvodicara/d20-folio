/**
 * What a rest would do, shown before it is taken: the Hit Point Dice a Short Rest
 * can spend and what each heals on average, and what the rest gives back or ends.
 * Read as the difference between the character now and after the rest's own
 * transition (`shortRestCharacter` / `longRestCharacter`), so the preview can never
 * promise what the rest doesn't do. Ids only: the screen names them.
 */
import type { CharacterDoc } from "@/types/character";
import { hitDicePool, type HitDieSize } from "./hit-dice";
import { longRestCharacter, shortRestCharacter } from "./rests";
import { shortRestHealing } from "./short-rest-healing";

export type RestKind = "short" | "long";

export type RestRecovery =
  | { kind: "tracker"; id: string; amount: number }
  | { kind: "slot"; key: string; amount: number }
  | { kind: "hit-dice"; amount: number }
  | { kind: "hp"; amount: number }
  | { kind: "exhaustion"; amount: number };

export interface RestPreview {
  kind: RestKind;
  /** The Hit Point Dice: how many the character has, and how many are left to spend. */
  hitDice: { total: number; available: number };
  /** What one die of each size heals on a Short Rest, on its average roll (the
   *  character's items count: a doubling Periapt, a maximizing potion). */
  perDieHeal: { die: HitDieSize; average: number }[];
  /** What the rest gives back. */
  recovers: RestRecovery[];
  /** The active states the rest ends. */
  ends: string[];
}

/** A die's average roll as the SRD rounds it (a d8 averages 5). */
const averageRoll = (die: HitDieSize): number => Math.floor(die / 2) + 1;

export function restPreview(doc: CharacterDoc, kind: RestKind): RestPreview {
  const after = kind === "short" ? shortRestCharacter(doc) : longRestCharacter(doc);
  const pool = hitDicePool(doc.character);
  const total = pool.reduce((sum, entry) => sum + entry.count, 0);
  const recovers: RestRecovery[] = [];

  const hp = after.session.hp.current - doc.session.hp.current;
  if (hp > 0) recovers.push({ kind: "hp", amount: hp });
  const hitDice = doc.session.hitDice.used - after.session.hitDice.used;
  if (hitDice > 0) recovers.push({ kind: "hit-dice", amount: hitDice });
  const exhaustion = doc.session.exhaustion - after.session.exhaustion;
  if (exhaustion > 0) recovers.push({ kind: "exhaustion", amount: exhaustion });

  for (const [id, state] of Object.entries(doc.session.trackers)) {
    const amount = state.used - (after.session.trackers[id]?.used ?? 0);
    if (amount > 0) recovers.push({ kind: "tracker", id, amount });
  }
  for (const [key, slot] of Object.entries(doc.session.spellSlots)) {
    const amount = slot.used - (after.session.spellSlots[key]?.used ?? 0);
    if (amount > 0) recovers.push({ kind: "slot", key, amount });
  }

  const still = new Set(after.session.activeFeatures ?? []);
  return {
    kind,
    hitDice: { total, available: Math.max(0, total - doc.session.hitDice.used) },
    perDieHeal: pool.map(({ die }) => ({
      die,
      average: shortRestHealing(doc, 1, averageRoll(die)) ?? 0,
    })),
    recovers,
    ends: (doc.session.activeFeatures ?? []).filter((key) => !still.has(key)),
  };
}
