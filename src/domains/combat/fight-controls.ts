/**
 * Which Scontro buttons a member sees (the owner's combat lifecycle, 2026-10-23). A fight
 * started by a roll (it has a `clock`) is everyone's to pass, step back and end; a fight
 * the DM started by hand keeps passing to the DM or whoever's turn it is. Anyone with a
 * character who hasn't rolled may roll in (the first roll starts the fight). «Riapri» is
 * offered only for a just-ended fight while none runs. The engine's reason to end is a
 * suggestion: the member ends it, nothing ends silently.
 */
import { encounterEndReason } from "@/features/campaigns/encounter-lifecycle";
import type { EncounterEndReason, EncounterState } from "@/types/campaign";

export interface FightControls {
  roll: boolean;
  pass: boolean;
  back: boolean;
  end: boolean;
  reopen: boolean;
  suggestEnd: Exclude<EncounterEndReason, "manual"> | null;
}

export function fightControls(
  fight: EncounterState | null,
  ended: EncounterState | null,
  me: { uid: string; isDm: boolean; hasCharacter: boolean; rolled: boolean },
  now: number
): FightControls {
  if (!fight)
    return {
      roll: me.hasCharacter,
      pass: false,
      back: false,
      end: false,
      reopen: ended !== null,
      suggestEnd: null,
    };
  const mine = fight.currentCombatantId === `pc-${me.uid}`;
  const turns = fight.clock !== undefined || me.isDm || mine;
  return {
    roll: me.hasCharacter && !me.rolled,
    pass: turns,
    back: turns,
    end: true,
    reopen: false,
    suggestEnd: encounterEndReason(fight, { now }),
  };
}
