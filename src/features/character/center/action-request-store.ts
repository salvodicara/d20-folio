/**
 * An action asked for from outside the sheet's turn economy (an offer in a toast:
 * Uncanny Metabolism at the first initiative roll). The `TurnEconomyProvider` runs it
 * through the same path as a tap on its row, with its prompts and its undo.
 */
import { create } from "zustand";

interface ActionRequestState {
  /** The asked action's id, with a counter so the same id can be asked twice. */
  request: { actionId: string; n: number } | null;
  ask: (actionId: string) => void;
}

export const useActionRequestStore = create<ActionRequestState>((set, get) => ({
  request: null,
  ask: (actionId) => set({ request: { actionId, n: (get().request?.n ?? 0) + 1 } }),
}));
