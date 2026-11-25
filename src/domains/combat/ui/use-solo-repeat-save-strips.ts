/**
 * The solo repeat-save strips (#1333) worded for the open sheet: what the Play strip
 * and the classic banner both show, with their two answers.
 */
import { useTranslation } from "react-i18next";

import {
  answerSoloRepeatSaveFailed,
  answerSoloRepeatSaveSaved,
  useSoloRepeatSaveStore,
  visibleSoloRepeatSaves,
} from "@/features/character/center/solo-repeat-save-store";
import { useLocale } from "@/hooks/useLocale";
import { localizeSrd } from "@/i18n/resolver";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { useCharacterStore } from "@/stores/characterStore";

/** One strip as both screens show it: its sentence and its two answers. */
export interface SoloRepeatSaveStrip {
  id: string;
  condition: string;
  text: string;
  saved: () => void;
  failed: () => void;
}

/** The strips the open sheet owes now, worded. */
export function useSoloRepeatSaveStrips(): SoloRepeatSaveStrip[] {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const saves = useSoloRepeatSaveStore((s) => s.saves);
  const doc = useCharacterStore((s) => s.character);
  const readonly = useCharacterStore((s) => s.readonly);
  if (readonly || !doc) return [];
  return visibleSoloRepeatSaves(saves, doc).map((save) => {
    const condition = localizeSrd("condition", save.conditionId, "name", locale);
    const abilityName = t(`abilities.${save.ability}`);
    const values = {
      condition,
      source: grantSourceLabel(save.source.id, locale),
      ability: save.advantage
        ? t("combat.repeatSaveWithAdvantage", { ability: abilityName })
        : abilityName,
      ...(save.dc !== undefined ? { dc: save.dc } : {}),
    };
    return {
      id: save.id,
      condition,
      text: t(
        save.dc !== undefined ? "combat.soloRepeatSaveDueDc" : "combat.soloRepeatSaveDue",
        values
      ),
      saved: () =>
        answerSoloRepeatSaveSaved(save, {
          message: t("combat.repeatSaveEnded", {
            condition,
            target: doc.character.name,
          }),
        }),
      failed: () =>
        answerSoloRepeatSaveFailed(save, {
          message: t("combat.soloRepeatSaveKept", { condition }),
        }),
    };
  });
}
