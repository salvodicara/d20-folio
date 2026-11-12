/**
 * The save spell waiting for its creatures' saves: the sheet's latest use of a save
 * spell with nothing for the app to apply (Command). Its row shows one «Saved ·
 * Failed» line per picked creature (`SaveOutcomeChips`); the next use replaces it,
 * the end of the turn clears it.
 */
import { create } from "zustand";

import { ALONE_SAVE_ID } from "@/types/combat-log";
import { useCharacterStore } from "@/stores/characterStore";

export interface PendingSaves {
  /** The use's own log line, where the saves are written. */
  logId: string;
  /** The action row that shows the chips. */
  actionId: string;
  /** The creatures that save, with the names the row shows. */
  targets: ReadonlyArray<{ id: string; name: string }>;
  /** Cast with nobody named (solo): one «Save» line, with a damage field when the
   *  spell deals damage. Its save is written under `ALONE_SAVE_ID`. */
  alone?: { damage: boolean };
}

interface SaveOutcomeStore {
  pending: PendingSaves | null;
  offer: (pending: PendingSaves) => void;
  clear: () => void;
}

export const useSaveOutcomeStore = create<SaveOutcomeStore>((set) => ({
  pending: null,
  offer: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));

/** Write one creature's save on the use's own log line (absent = cleared). */
export function rewriteSave(
  logId: string,
  targetId: string,
  save?: "saved" | "failed"
): void {
  const store = useCharacterStore.getState();
  const entry = store.character?.session.logEntries.find((e) => e.id === logId);
  if (entry?.event.kind !== "action-use") return;
  const { saves: before, ...rest } = entry.event;
  const others = Object.entries(before ?? {}).filter(([id]) => id !== targetId);
  const saves = Object.fromEntries(save ? [...others, [targetId, save]] : others);
  // Clearing the one save of a cast with nobody named clears its damage too.
  const { amount, ...base } = rest;
  const keepAmount = !(targetId === ALONE_SAVE_ID && !save);
  store.amendLogEntry(entry.id, {
    ...base,
    ...(keepAmount && amount !== undefined ? { amount } : {}),
    ...(Object.keys(saves).length > 0 ? { saves } : {}),
  });
}

/** Write the damage a cast with nobody named dealt on its own log line (absent =
 *  cleared). */
export function rewriteSaveDamage(logId: string, amount?: number): void {
  const store = useCharacterStore.getState();
  const entry = store.character?.session.logEntries.find((e) => e.id === logId);
  if (entry?.event.kind !== "action-use") return;
  const { amount: _amount, ...rest } = entry.event;
  void _amount;
  store.amendLogEntry(entry.id, {
    ...rest,
    ...(amount !== undefined ? { amount } : {}),
  });
}
