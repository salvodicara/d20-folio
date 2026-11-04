/**
 * Repeat saves due (#710: `fightConditionEnds`), waiting on the target's card: the
 * DM's Scontro row for a monster, Play for the player's own character. Each device
 * keeps only its own combatants' saves (the fight listener decides). A save leaves
 * when answered, when its effect is gone, or when its target's next turn starts; one
 * due at the start of the target's turn leaves when that turn ends.
 */
import { create } from "zustand";

import type { DueRepeatSave } from "@/lib/condition-ends";
import type { ActiveCombatEffect } from "@/types/combat-effect";

export interface PendingRepeatSave extends DueRepeatSave {
  campaignId: string;
  targetName: string;
  /** The one who applied it, named for a "can't see them" prompt (Fear). */
  actorName?: string;
  /** The condition effect a success ends, kept so an undo can put it back. */
  effect: ActiveCombatEffect;
  /** Whose turn it was when last looked at: a target's turn "begins" only when the
   *  turn moves to it (damage taken on its own turn waits until its next one). */
  turnSeen?: string | null;
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
 *  come round again (a turn-start save: its turn is still running). */
export function prunedRepeatSaves(
  saves: ReadonlyArray<PendingRepeatSave>,
  look: RepeatSaveLook
): PendingRepeatSave[] {
  const current = look.currentCombatantId;
  return saves.flatMap((s) => {
    if (!look.active.has(s.id)) return [];
    if (s.at === "target-turn-start") return current === s.targetId ? [s] : [];
    if (current === s.targetId && s.turnSeen !== s.targetId) return [];
    return [s.turnSeen === current ? s : { ...s, turnSeen: current }];
  });
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
      return saves.length === s.saves.length && saves.every((x, i) => x === s.saves[i])
        ? s
        : { saves };
    }),
}));
