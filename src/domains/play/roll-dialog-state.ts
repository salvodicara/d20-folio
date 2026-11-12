/**
 * The roll dialogs' Advantage / Disadvantage, for the new Play screen (headless: the
 * roll dialog renders it). The same rules as the classic sheet:
 *
 * - Initiative: `initiativeRollState` over the sheet's grants, the conditions in the
 *   fight (2024 Invisible, Incapacitated) and the manual override. Surprise (SRD 5.2.1:
 *   a surprised combatant «has Disadvantage on their Initiative roll») is the one-tap
 *   `surprised` state, toggled with its undo (`toggleSurprise`).
 * - Death saves: the death save's own Advantage / Disadvantage sources
 *   (`deathSaveD20Context`, e.g. the Champion's Survivor).
 *
 * `faces` is how many d20 the player enters: two only when one polarity is left.
 */
import type { TFunction } from "i18next";

import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { deathSaveD20Context, enteredD20FaceCount } from "@/lib/character-d20-tests";
import { initiativeRollState } from "@/lib/compute";
import { sheetConditionEffects } from "@/lib/condition-sources";
import { isSurprised } from "@/lib/surprise-state";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";

export type RollMode = "advantage" | "disadvantage" | "none";

export interface RollModel {
  readonly mode: RollMode;
  readonly faces: 1 | 2;
}

const facesOf = (mode: RollMode): 1 | 2 => (mode === "none" ? 1 : 2);

/** The initiative roll: its mode, faces, and whether Surprise is lit. */
export function initiativeRollModel(
  doc: CharacterDoc,
  /** The fight around the sheet (its conditions' rows), when there is one. */
  encounter?: Parameters<typeof sheetConditionEffects>[1]
): RollModel & { readonly surprised: boolean } {
  const mode = initiativeRollState(
    aggregateCharacterGrants(doc.character, doc.session),
    doc.character.initiativeAdvantageOverride,
    sheetConditionEffects(doc, encounter)
  );
  return { mode, faces: facesOf(mode), surprised: isSurprised(doc.session) };
}

/** Light or clear Surprise on the open sheet, with the classic undo toast. */
export function toggleSurprise(t: TFunction): void {
  const surprised = isSurprised(useCharacterStore.getState().character?.session ?? {});
  const next = !surprised;
  registerUndoableToast(
    { message: t(next ? "combat.surpriseOnToast" : "combat.surpriseOffToast") },
    () => {
      const store = useCharacterStore.getState();
      if (!store.dispatch({ kind: "set-surprised", surprised: next })) return null;
      return () =>
        useCharacterStore
          .getState()
          .dispatch({ kind: "set-surprised", surprised: !next });
    },
    { turnScoped: false }
  );
}

/** A roll's mode with a paid Advantage added (a Luck Point): a plain roll gains
 *  Advantage, a Disadvantaged one cancels to a plain roll (2024 D20 Tests). */
export function withPaidAdvantage(mode: RollMode): RollMode {
  return mode === "disadvantage" ? "none" : "advantage";
}

/** The death save: its mode and faces, from its own sources. */
export function deathSaveRollModel(doc: CharacterDoc): RollModel {
  const context = deathSaveD20Context(doc);
  const faces = enteredD20FaceCount(context);
  const mode: RollMode =
    faces === 1
      ? "none"
      : context.advantageSourceIds.length > 0
        ? "advantage"
        : "disadvantage";
  return { mode, faces };
}
