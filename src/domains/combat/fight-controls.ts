/**
 * Which Scontro buttons a member sees (the owner's combat lifecycle, 2026-10-23). A fight
 * started by a roll (it has a `clock`) is everyone's to pass, step back and end; a fight
 * the DM started by hand keeps passing to the DM or whoever's turn it is. Anyone with a
 * character who hasn't rolled may roll in (the first roll starts the fight). «Riapri» is
 * offered only for a just-ended fight while none runs. The engine's reason to end is a
 * suggestion: the member ends it, nothing ends silently. «Tira per chi manca» is the
 * DM's alone (only the DM may write other players' rolls), while anyone is missing.
 */
import {
  encounterEndReason,
  mayStepTurn,
} from "@/features/campaigns/encounter-lifecycle";
import type { EncounterEndReason, EncounterState } from "@/types/campaign";

export interface FightControls {
  roll: boolean;
  rollMissing: boolean;
  pass: boolean;
  back: boolean;
  end: boolean;
  reopen: boolean;
  suggestEnd: Exclude<EncounterEndReason, "manual"> | null;
}

export function fightControls(
  fight: EncounterState | null,
  ended: EncounterState | null,
  me: {
    uid: string;
    isDm: boolean;
    hasCharacter: boolean;
    rolled: boolean;
    /** How many of the fight's (or, before one, the party's) characters haven't rolled. */
    missing: number;
  },
  now: number
): FightControls {
  const rollMissing = me.isDm && me.missing > 0;
  if (!fight)
    return {
      roll: me.hasCharacter,
      rollMissing,
      pass: false,
      back: false,
      end: false,
      reopen: ended !== null,
      suggestEnd: null,
    };
  const turns = mayStepTurn(fight, me);
  return {
    roll: me.hasCharacter && !me.rolled,
    rollMissing,
    pass: turns,
    back: turns,
    end: true,
    reopen: false,
    suggestEnd: encounterEndReason(fight, { now }),
  };
}
