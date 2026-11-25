/**
 * The solo End Turn's repeat-save strips (#1333), waiting on the player's own sheet:
 * raised by the solo turn edge (End Turn, an extra turn) in place of the last edge's,
 * gone when answered. A save is due at one edge only, so the next edge replaces it;
 * a shared fight never raises them (its own RepeatSavePrompts ask there).
 *
 * Which conditions carry a known source is read here, in one place: the sheet's own
 * solo condition effects (`combatActiveEffects`) and the chips whose origin the player
 * named («From what?»). «Saved» ends both exactly: `removeConditionSilent` drops the
 * chip with its origin and the effects with it.
 */
import { create } from "zustand";

import { useRepeatSaveStore } from "@/features/campaigns/repeat-save-store";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { failedRepeatSaveEffects } from "@/lib/play/repeat-saves";
import {
  sheetOriginConditions,
  sheetSourcedConditions,
  soloRepeatSavesDue,
  type SheetSourcedCondition,
  type SoloRepeatSave,
} from "@/lib/play/solo-repeat-saves";
import type { CharacterDoc } from "@/types/character";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import { vitalExhaustion } from "@/lib/character-vitals";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast, type UndoLabel } from "@/stores/undoStore";

export interface PendingSoloRepeatSave extends SoloRepeatSave {
  characterId: string;
}

interface SoloRepeatSaveStore {
  saves: PendingSoloRepeatSave[];
  set: (saves: PendingSoloRepeatSave[]) => void;
}

export const useSoloRepeatSaveStore = create<SoloRepeatSaveStore>((set) => ({
  saves: [],
  set: (saves) => set({ saves }),
}));

/** The conditions the sheet holds from a known source: its solo condition effects,
 *  then the chips whose origin the player named (one an effect already holds is
 *  asked once, from the effect). */
function sheetConditions(
  doc: CharacterDoc,
  effects: ReadonlyArray<ActiveCombatEffect>
): SheetSourcedCondition[] {
  const held = sheetSourcedConditions(effects);
  const named = sheetOriginConditions(doc.session).filter(
    (c) => !held.some((h) => h.conditionId === c.conditionId)
  );
  return [...held, ...named];
}

/** The strips the open sheet owes at this solo turn edge, in place of the last
 *  edge's; returns the restore of the strips it replaced (End Turn's undo). */
export function raiseSoloRepeatSaves(): () => void {
  const store = useSoloRepeatSaveStore.getState();
  const before = store.saves;
  const cs = useCharacterStore.getState();
  const doc = cs.character;
  const saves: PendingSoloRepeatSave[] =
    doc && !cs.readonly
      ? soloRepeatSavesDue(sheetConditions(doc, cs.combatActiveEffects), {
          campaignConditions: useRepeatSaveStore
            .getState()
            .saves.filter((s) => s.characterId === doc.id)
            .map((s) => s.conditionId),
        }).map((save) => ({ ...save, characterId: doc.id }))
      : [];
  store.set(saves);
  return () => useSoloRepeatSaveStore.getState().set(before);
}

/** The strips the open sheet shows now: its own, while it still holds the condition. */
export function visibleSoloRepeatSaves(
  saves: ReadonlyArray<PendingSoloRepeatSave>,
  doc: { id: string; session: Parameters<typeof effectiveSessionConditions>[0] } | null
): PendingSoloRepeatSave[] {
  if (!doc) return [];
  const held = new Set(effectiveSessionConditions(doc.session));
  return saves.filter((s) => s.characterId === doc.id && held.has(s.conditionId));
}

function withoutSave(id: string): () => void {
  const store = useSoloRepeatSaveStore.getState();
  const before = store.saves;
  store.set(before.filter((s) => s.id !== id));
  return () => useSoloRepeatSaveStore.getState().set(before);
}

/** «Saved»: the cast's conditions on the sheet end and the strip closes; one undo
 *  brings both back. */
export function answerSoloRepeatSaveSaved(
  save: PendingSoloRepeatSave,
  label: UndoLabel
): void {
  registerUndoableToast(
    label,
    () => {
      const cs = useCharacterStore.getState();
      if (cs.readonly || cs.character?.id !== save.characterId) return null;
      const reverses = save.conditionIds.flatMap((id) => {
        const undo = useCharacterStore.getState().removeConditionSilent(id);
        return undo ? [undo] : [];
      });
      if (reverses.length === 0) return null;
      const restoreStrip = withoutSave(save.id);
      return () => {
        for (const undo of [...reverses].reverse()) undo();
        restoreStrip();
      };
    },
    { turnScoped: false }
  );
}

/** «Failed»: the condition stays and the strip closes; a failure's Exhaustion (Vision
 *  of Elapsing Eons) lands on the sheet. One undo puts it all back. */
export function answerSoloRepeatSaveFailed(
  save: PendingSoloRepeatSave,
  label: UndoLabel
): void {
  registerUndoableToast(
    label,
    () => {
      const cs = useCharacterStore.getState();
      const doc = cs.character;
      if (cs.readonly || doc?.id !== save.characterId) return null;
      const failure = failedRepeatSaveEffects(doc, save);
      const exhaustionBefore = vitalExhaustion(doc.session);
      if (failure) cs.setExhaustion(failure.exhaustion);
      const restoreStrip = withoutSave(save.id);
      return () => {
        if (failure) useCharacterStore.getState().setExhaustion(exhaustionBefore);
        restoreStrip();
      };
    },
    { turnScoped: false }
  );
}
