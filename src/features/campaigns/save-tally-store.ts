/**
 * The counts of tracked repeat saves (Contagion, Flesh to Stone: three successes end
 * it, three failures settle it), kept on the device that answers them, as the
 * pending prompts are. Saved in this browser so a reload keeps the count.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { SaveTally } from "@/lib/condition-ends";

const NONE: SaveTally = { successes: 0, failures: 0 };

interface SaveTallyStore {
  /** By `<campaignId>:<effectId>`. */
  tallies: Record<string, SaveTally>;
  set: (key: string, tally: SaveTally | null) => void;
}

export function tallyKey(campaignId: string, effectId: string): string {
  return `${campaignId}:${effectId}`;
}

export const useSaveTallyStore = create<SaveTallyStore>()(
  persist(
    (set) => ({
      tallies: {},
      set: (key, tally) =>
        set((s) => ({
          tallies: tally
            ? { ...s.tallies, [key]: tally }
            : Object.fromEntries(Object.entries(s.tallies).filter(([k]) => k !== key)),
        })),
    }),
    { name: "d20-save-tallies" }
  )
);

/** The count so far of one tracked save. */
export function tallyOf(campaignId: string, effectId: string): SaveTally {
  return useSaveTallyStore.getState().tallies[tallyKey(campaignId, effectId)] ?? NONE;
}
