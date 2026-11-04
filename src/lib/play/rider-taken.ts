/**
 * A generic rider landing on the character (a wight's Life Drain, a purple worm's
 * swallow, a giant's shove) as sheet events and its log line. Pure: the character
 * in, the events out; the caller dispatches them one by one (each a play-log entry,
 * so an undo takes it back) and appends the log line.
 *
 *  - a Hit Point maximum drain adds to the running reduction through
 *    `set-hp-max-reduction` (the path Harm uses; a Long Rest restores it);
 *  - a swallow gives Blinded and Restrained through `add-condition`; its Total
 *    Cover from outside and its damage at the start of each of the swallower's
 *    turns are facts (`swallowedFacts`) the table and the log read;
 *  - a Speed loss lights a state that lowers the Speed until the turn edge the
 *    caller gives (`rider-speed-loss`); the same source twice doesn't stack;
 *  - a push changes nothing on the sheet: the app never moves a token, so the log
 *    line is its whole record.
 */
import {
  hpMaxReductionAmount,
  SWALLOWED_CONDITIONS,
  type RiderEffect,
} from "@/lib/activities";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import type { LocText } from "@/lib/loc-text";
import type { CharacterDoc } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";
import { riderSpeedLossKey } from "./rider-speed-loss";
import type { SheetEvent } from "./sheet-events";

/** The sheet events a rider makes on the character, in order; [] when none. */
export function riderTakenEvents(
  doc: CharacterDoc,
  effect: RiderEffect,
  /** The damage the character took from the same use, a drain's rolled dice, the
   *  rider's source, and the owner-turn edge a timed rider ends at. */
  facts: {
    damageTaken: number;
    rolled?: number;
    source?: LocText;
    boundary?: { round: number; phase: "turn-start" | "turn-end" };
  }
): SheetEvent[] {
  switch (effect.kind) {
    case "hp-max-reduction": {
      const amount = hpMaxReductionAmount(effect, facts);
      if (amount === 0) return [];
      return [
        {
          kind: "set-hp-max-reduction",
          total: (doc.session.hpMaxReduction ?? 0) + amount,
        },
      ];
    }
    case "swallow": {
      const on = effectiveSessionConditions(doc.session);
      return SWALLOWED_CONDITIONS.filter((condition) => !on.includes(condition)).map(
        (condition) => ({ kind: "add-condition" as const, condition })
      );
    }
    case "speed-reduction": {
      const key = riderSpeedLossKey(effect.feet, facts.source);
      if ((doc.session.activeFeatures ?? []).includes(key)) {
        return facts.boundary
          ? [{ kind: "arm-effect-boundary", key, ...facts.boundary }]
          : [];
      }
      return [
        { kind: "set-active-state", key, isActive: true, litRound: 0 },
        ...(facts.boundary
          ? [{ kind: "arm-effect-boundary" as const, key, ...facts.boundary }]
          : []),
      ];
    }
    case "forced-movement":
      return [];
  }
}

/** Leaving the swallower (escape, regurgitated, its death): its conditions end. */
export function swallowEndEvents(doc: CharacterDoc): SheetEvent[] {
  const on = effectiveSessionConditions(doc.session);
  return SWALLOWED_CONDITIONS.filter((condition) => on.includes(condition)).map(
    (condition) => ({ kind: "remove-condition" as const, condition })
  );
}

/** The sheet log line for a rider that landed, from `source` when known. */
export function riderTakenLog(
  effect: RiderEffect,
  source?: LocText
): Extract<CombatEvent, { kind: "rider-taken" }> {
  return { kind: "rider-taken", rider: effect, ...(source ? { source } : {}) };
}
