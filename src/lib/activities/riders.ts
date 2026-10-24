/**
 * The generic riders (push or pull, Speed loss, Hit Point maximum drain, swallow)
 * as table facts: the line a card or the log shows for each, the conditions and
 * cover a swallowed target has, and how much a drain takes off the maximum. Pure:
 * the reader that commits a use applies them (the maximum through
 * `setHpMaxReduction`, the conditions through the condition ledger); the app never
 * moves a token.
 */
import type { ConditionId } from "@/data/types";
import type { LocText } from "@/lib/loc-text";
import type { DamageType } from "@/types/damage";
import type { ActivityEffect } from "./types";

export type RiderEffect = Extract<
  ActivityEffect,
  { kind: "forced-movement" | "speed-reduction" | "hp-max-reduction" | "swallow" }
>;

const RIDER_KINDS: ReadonlySet<ActivityEffect["kind"]> = new Set([
  "forced-movement",
  "speed-reduction",
  "hp-max-reduction",
  "swallow",
]);

/** Whether an effect is one of the generic riders. */
export function isRiderEffect(effect: ActivityEffect): effect is RiderEffect {
  return RIDER_KINDS.has(effect.kind);
}

/**
 * One informational line. A distance stays a number of feet: the presenter fills
 * the text's `{{distance}}` in the reader's units (`localeDistance`). `damageType`
 * is the chip it shows beside the line.
 */
export interface RiderNote {
  text: LocText;
  distanceFt?: number;
  damageType?: DamageType;
}

const KEY = "combat.effectRider";

/** The lines a rider shows on a card or in the log, in order. */
export function riderNotes(effect: RiderEffect): RiderNote[] {
  switch (effect.kind) {
    case "forced-movement":
      return [{ text: { ui: `${KEY}.${effect.direction}` }, distanceFt: effect.feet }];
    case "speed-reduction":
      return [
        {
          text: {
            ui: effect.until
              ? `${KEY}.speedReduction_${effect.until.phase}_${effect.until.anchor}`
              : `${KEY}.speedReduction`,
          },
          distanceFt: effect.feet,
        },
      ];
    case "hp-max-reduction":
      return [
        {
          text: effect.dice?.dice
            ? { ui: `${KEY}.hpMaxReductionDice`, params: { dice: effect.dice.dice } }
            : { ui: `${KEY}.hpMaxReductionDamage` },
          // "equal to the Necrotic damage taken": the chip names the type that counts.
          ...(effect.damageType ? { damageType: effect.damageType } : {}),
        },
      ];
    case "swallow": {
      const notes: RiderNote[] = [{ text: { ui: `${KEY}.swallowed` } }];
      const damage = effect.damage;
      const dice = damage?.dice.dice;
      if (damage && dice) {
        notes.push({
          text: { ui: `${KEY}.swallowDamage`, params: { dice } },
          ...(damage.types[0] ? { damageType: damage.types[0] } : {}),
        });
      }
      return notes;
    }
  }
}

/** The conditions a swallowed creature has while swallowed. */
export const SWALLOWED_CONDITIONS: ReadonlyArray<ConditionId> = ["blinded", "restrained"];

/** What being swallowed does to the target, as facts the ledger and the table read. */
export interface SwallowedFacts {
  conditions: ReadonlyArray<ConditionId>;
  /** Against attacks and other effects from outside the swallower. */
  cover: "total";
  /** The damage it takes at the start of each of the swallower's turns. */
  recurring?: {
    dice: string;
    types: ReadonlyArray<DamageType>;
    phase: "turn-start";
    anchor: "actor";
  };
}

export function swallowedFacts(
  effect: Extract<RiderEffect, { kind: "swallow" }>
): SwallowedFacts {
  const dice = effect.damage?.dice.dice;
  return {
    conditions: SWALLOWED_CONDITIONS,
    cover: "total",
    ...(effect.damage && dice
      ? {
          recurring: {
            dice,
            types: effect.damage.types,
            phase: "turn-start" as const,
            anchor: "actor" as const,
          },
        }
      : {}),
  };
}

/**
 * How many points a drain takes off the target's Hit Point maximum: the rolled
 * total of its dice, or the damage the target took from the same use. Never
 * negative; the caller adds it to the running reduction (`setHpMaxReduction`).
 */
export function hpMaxReductionAmount(
  effect: Extract<RiderEffect, { kind: "hp-max-reduction" }>,
  facts: { damageTaken: number; rolled?: number }
): number {
  const amount =
    effect.dice?.dice !== undefined ? (facts.rolled ?? 0) : facts.damageTaken;
  return Math.max(0, Math.round(amount));
}
