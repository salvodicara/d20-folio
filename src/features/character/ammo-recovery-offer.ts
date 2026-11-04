/**
 * After a fight: a minute spent searching the battlefield brings back half the
 * ammunition used (SRD 5.2.1 Ammunition, `ammunitionRecovery`). The same offer
 * wherever the fight ends: a campaign encounter (GlobalCombatMount) or a solo
 * fight's «End combat» (ThisTurnTracker). Recovering is undoable.
 */
import type { TFunction } from "i18next";

import { ammunitionRecovery } from "@/lib/play/ammunition";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { registerUndoableToast } from "@/stores/undoStore";

/** Offer the open character's recovery; false when nothing would come back. */
export function offerAmmunitionRecovery(t: TFunction): boolean {
  const doc = useCharacterStore.getState().character;
  if (!doc) return false;
  const back = ammunitionRecovery(doc);
  if (back.length === 0) return false;
  const pieces = back.reduce((sum, r) => sum + r.recovered, 0);
  useToastStore.getState().showToast({
    message: t("combat.ammoRecoverable", { count: pieces }),
    duration: 30000,
    action: {
      label: t("common.recover"),
      run: () => {
        registerUndoableToast(
          { message: t("combat.ammoRecovered", { count: pieces }) },
          () => useCharacterStore.getState().dispatch({ kind: "recover-ammunition" }),
          { turnScoped: false }
        );
      },
    },
  });
  return true;
}
