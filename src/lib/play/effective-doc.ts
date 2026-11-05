/**
 * Another creature's sheet as the rules read it: its stored sheet with the effects
 * others left on it projected (`session.encounterEffects`), from the live fight and
 * from the campaign's effects out of a fight, one identity across both. Every reader
 * of a sheet that isn't the open one goes through `effectiveDoc` (a hit from another
 * device, the DM's view, the party's numbers), and the owner's device projects the
 * same effects (`effectsOnTarget`), so a buff counts wherever the sheet is read
 * (tests/unit/effective-doc.guard.test.ts). Pure.
 */
import { effectsForTarget } from "@/lib/combat-effects";
import type {
  ActiveCombatEffect,
  CombatEffectOp,
  EncounterPosition,
} from "@/types/combat-effect";
import type { CharacterDoc } from "@/types/character";
import {
  campaignEffectsFor,
  withCampaignEffects,
  type CampaignEffectDoc,
} from "./campaign-effects";

/** Where the effects on a creature come from. */
export interface TargetEffectSources {
  /** The live fight's effect log and where the fight is (turn-bound expiries). */
  encounter?: {
    operations: ReadonlyArray<CombatEffectOp> | undefined;
    position?: EncounterPosition;
  };
  /** The campaign's effects out of a fight, at the campaign clock's minute. */
  campaign?: { docs: ReadonlyArray<CampaignEffectDoc>; minute: number };
}

/** The live effects others left on the creature `targetId` (`pc-<uid>`, a monster). */
export function effectsOnTarget(
  targetId: string,
  sources: TargetEffectSources
): ActiveCombatEffect[] {
  const fight = sources.encounter
    ? effectsForTarget(sources.encounter.operations, targetId, sources.encounter.position)
    : [];
  const campaign = sources.campaign
    ? campaignEffectsFor(sources.campaign.docs, targetId, sources.campaign.minute)
    : [];
  return withCampaignEffects(fight, campaign);
}

/** The sheet with `effects` projected, as the owner's device projects them, next to
 *  the ones its own play state already holds (one identity). For reading only: the
 *  character codec never stores `encounterEffects`. */
export function effectiveDoc(
  doc: CharacterDoc,
  effects: ReadonlyArray<ActiveCombatEffect>
): CharacterDoc {
  const held = withCampaignEffects(doc.session.encounterEffects ?? [], effects);
  // A plain field, so the rules' own session copies (`{ ...session }`) keep it: this
  // doc is read, never stored, and the codec writes only the fields it lists.
  const session = { ...doc.session };
  if (held.length > 0) session.encounterEffects = held;
  else delete session.encounterEffects;
  return { ...doc, session };
}
