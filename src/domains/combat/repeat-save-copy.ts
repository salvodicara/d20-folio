/** What a repeat-save prompt says, from the save it asks about. */
import type { PendingRepeatSave } from "@/features/campaigns/repeat-save-store";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";

/** What a success ends, by name: the condition, or the spell whose effect imposes
 *  none (Slow). */
export function repeatSaveSubject(
  save: { conditionId?: string; source: { id: string } },
  locale: Locale
): string {
  return save.conditionId !== undefined
    ? localizeSrd("condition", save.conditionId, "name", locale)
    : localizeSrd("spell", save.source.id, "name", locale);
}

/** The prompt's key and values: when it became due (turn end or start, damage), on
 *  what condition (out of the actor's sight), with Advantage, with the DC. */
export function repeatSaveDueCopy(
  save: PendingRepeatSave,
  abilityName: string,
  condition: string,
  t: (key: string, values?: Record<string, unknown>) => string
): [string, Record<string, unknown>] {
  const base =
    save.when === "out-of-actor-sight"
      ? "combat.repeatSaveDueUnseen"
      : save.at === "target-turn-start"
        ? "combat.repeatSaveDueStart"
        : save.at === "target-damaged"
          ? "combat.repeatSaveDueDamaged"
          : "combat.repeatSaveDue";
  return [
    save.dc !== undefined ? `${base}Dc` : base,
    {
      target: save.targetName,
      ability: save.advantage
        ? t("combat.repeatSaveWithAdvantage", { ability: abilityName })
        : abilityName,
      condition,
      ...(save.actorName !== undefined ? { actor: save.actorName } : {}),
      ...(save.dc !== undefined ? { dc: save.dc } : {}),
    },
  ];
}
