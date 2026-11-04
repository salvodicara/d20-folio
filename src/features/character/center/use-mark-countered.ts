/**
 * «Contrastato» (Counterspell 2024, edge-case M12): a slot cast this turn marked
 * countered gets its slot back, with the log line that says so; the action stays spent.
 * One path for every surface (the cockpit's turn tracker, the Play screen's turn line),
 * undoable as a whole.
 */
import { useTranslation } from "react-i18next";

import type { Locale } from "@/lib/locale";
import { counteredEvent, type CounterableCast } from "@/lib/play/countered";
import { localizeText } from "@/lib/views/srd-i18n";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";

export function useMarkCountered(locale: Locale): (cast: CounterableCast) => void {
  const { t } = useTranslation();
  return (cast) => {
    const name = localizeText(cast.action, locale);
    registerUndoableToast(
      { message: t("combat.counteredToast", { name, level: cast.level }) },
      () => {
        const store = useCharacterStore.getState();
        store.restoreSpellSlot(cast.level, cast.pactMagic);
        const logId = store.logEvent(counteredEvent(cast));
        return () => {
          const live = useCharacterStore.getState();
          live.useSpellSlot(cast.level, cast.pactMagic);
          live.removeLogEntry(logId);
        };
      },
      { turnScoped: false }
    );
  };
}
