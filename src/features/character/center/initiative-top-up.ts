/**
 * A fight's first initiative roll regains the trackers that top up on it (Bard
 * Superior Inspiration, Persistent Rage), with the standard undo snackbar. Shared
 * by every place the player rolls: the cockpit turn band and the topbar pip.
 */
import type { TFunction } from "i18next";
import type { BiText } from "@/data/types";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore, wireUndoToast } from "@/stores/undoStore";

export function applyFirstRollTopUps(t: TFunction, locale: keyof BiText): void {
  const { sourceIds, restore } = useCharacterStore
    .getState()
    .applyInitiativeTrackerTopUps();
  if (sourceIds.length === 0) return;
  // Pattern B (the reversal contract): the top-up already ran and the message
  // names its source — register on the session undo stack so ⌘Z / the standing
  // control reach it too, then wire the standard 5s snackbar. Character-state
  // entry (a tracker restore, not per-turn economy) → turnScoped false.
  const message = t("combat.initiativeTopUp", {
    source: grantSourceLabel(sourceIds[0] ?? "", locale),
  });
  const entryId = useUndoStore.getState().register({
    label: { message },
    turnScoped: false,
    undo: restore,
    redo: () => {
      const again = useCharacterStore.getState().applyInitiativeTrackerTopUps();
      return again.sourceIds.length > 0 ? again.restore : null;
    },
  });
  wireUndoToast(entryId, { message });
}
