/**
 * The custom (homebrew) entries' create moves, shared by the classic sheet's Custom
 * forms and the new Play screen's (#1230), so both UIs write a homebrew the same way.
 *
 * CUSTOM IS THE LIBRARY: every create lands on the character AND upserts the same
 * homebrew into the account-level library ({@link keepInLibrary}, keyed by the item's
 * own stable `instanceId`), so it is offerable to every other character with no save
 * gesture. A successful keep is silent (the creation is the feedback); a keep REFUSED
 * by the free-tier cap says so, since the player would otherwise believe their
 * homebrew was filed away. An unhydrated library (signed out) stays silent and the
 * creation still lands.
 */
import type { TFunction } from "i18next";

import { FREE_TIER_LIMITS } from "@/lib/limits";
import type { LibraryDraft } from "@/lib/library";
import { useCharacterStore } from "@/stores/characterStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { useToastStore } from "@/stores/toastStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CustomEquipment } from "@/types/character";

/** Keep a freshly created homebrew in the account library, and say so when the
 *  free-tier cap refused it (the item still lands on the sheet). */
export function keepInLibrary(draft: LibraryDraft, t: TFunction): void {
  const { outcome } = useLibraryStore.getState().saveToLibrary(draft);
  if (outcome !== "full") return;
  useToastStore.getState().showToast({
    message: t("custom.libraryFull", { max: FREE_TIER_LIMITS.libraryEntries }),
    duration: 6000,
  });
}

/** Put a homebrew item in the inventory and keep it in the library. */
export function addCustomEquipment(item: CustomEquipment, t: TFunction): void {
  const store = useCharacterStore.getState();
  const doc = store.character;
  if (!doc) return;
  store.setCharacter({
    ...doc,
    character: { ...doc.character, equipment: [...doc.character.equipment, item] },
  });
  keepInLibrary({ kind: "equipment", item }, t);
}

/** The Play screen's add: {@link addCustomEquipment} with the 5 s undo, which takes
 *  the item back off the sheet (the library keeps its template). */
export function addCustomEquipmentUndoable(
  item: CustomEquipment,
  message: string,
  t: TFunction
): void {
  registerUndoableToast(
    { message },
    () => {
      if (!useCharacterStore.getState().character) return null;
      addCustomEquipment(item, t);
      return () => {
        const now = useCharacterStore.getState().character;
        if (!now) return;
        useCharacterStore.getState().setCharacter({
          ...now,
          character: {
            ...now.character,
            equipment: now.character.equipment.filter(
              (row) => !("custom" in row) || row.instanceId !== item.instanceId
            ),
          },
        });
      };
    },
    { turnScoped: false }
  );
}
