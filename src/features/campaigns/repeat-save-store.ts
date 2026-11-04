/**
 * Repeat saves due at the end of a turn (#710: `fightConditionEnds`), waiting on the
 * target's card: the DM's Scontro row for a monster, Play for the player's own
 * character. Each device keeps only its own combatants' saves (the fight listener
 * decides). A save leaves when answered, when its effect is gone, or when its target's
 * next turn starts.
 */
import { create } from "zustand";

import type { DueRepeatSave } from "@/lib/condition-ends";
import type { ActiveCombatEffect } from "@/types/combat-effect";

export interface PendingRepeatSave extends DueRepeatSave {
  campaignId: string;
  targetName: string;
  /** The condition effect a success ends, kept so an undo can put it back. */
  effect: ActiveCombatEffect;
}

interface RepeatSaveStore {
  saves: PendingRepeatSave[];
  add: (save: PendingRepeatSave) => void;
  remove: (id: string) => void;
  prune: (look: RepeatSaveLook) => void;
}

/** What decides whether a save still waits. */
export interface RepeatSaveLook {
  currentCombatantId: string | null;
  /** The ids of the effects still active in the fight. */
  active: ReadonlySet<string>;
}

/** The saves still waiting: their effect is active and their target's turn hasn't
 *  come round again. */
export function prunedRepeatSaves(
  saves: ReadonlyArray<PendingRepeatSave>,
  look: RepeatSaveLook
): PendingRepeatSave[] {
  return saves.filter(
    (s) => look.active.has(s.id) && s.targetId !== look.currentCombatantId
  );
}

export const useRepeatSaveStore = create<RepeatSaveStore>((set) => ({
  saves: [],
  add: (save) =>
    set((s) =>
      s.saves.some((x) => x.id === save.id) ? s : { saves: [...s.saves, save] }
    ),
  remove: (id) => set((s) => ({ saves: s.saves.filter((x) => x.id !== id) })),
  prune: (look) =>
    set((s) => {
      const saves = prunedRepeatSaves(s.saves, look);
      return saves.length === s.saves.length ? s : { saves };
    }),
}));
