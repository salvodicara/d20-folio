/**
 * A zone firing on a creature, played through the damage tray (edge-case M9): the
 * zone spell's own action on that one target, from the caster's sheet. The table
 * says the creature is inside; the tray takes the rolled total and applies it.
 */
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { getSpellById } from "@/data/spells";
import type { Locale } from "@/lib/locale";
import { damageTrayPlan } from "@/lib/play/damage-tray";
import { localizeActions } from "@/lib/views/combat-action-view";
import type { ZoneInstance } from "@/lib/zones";
import { useCharacterStore } from "@/stores/characterStore";
import { useDamageTrayStore } from "./damage-tray-store";

/** Open the tray for `zone` on `targetId`; false when the open sheet can't play it. */
export function openZoneTray(
  zone: ZoneInstance,
  targetId: string,
  locale: Locale
): boolean {
  const doc = useCharacterStore.getState().character;
  const status = useCombatStatusStore.getState().status;
  if (!doc || !status || doc.id !== status.characterId) return false;
  // The spell's own row that deals the zone's damage: the recurring one while the
  // spell runs (Spirit Guardians), else the cast (an instant zone).
  const rows = localizeActions(doc, locale).filter((a) => a.spellId === zone.spellId);
  const planFor = (action: (typeof rows)[number]) => ({
    action,
    plan: damageTrayPlan(action, [targetId], status.myId),
  });
  // A zone whose cast resolves nothing (Spike Growth) and that has no recurring row
  // plays its cast row as the repeat use the zone's trigger is.
  const found =
    rows.map(planFor).find((entry) => entry.plan !== null) ??
    rows
      .map((action) =>
        planFor({ ...action, summary: { ...action.summary, recurringUse: true } })
      )
      .find((entry) => entry.plan !== null);
  if (!found?.plan) return false;
  const { action, plan } = found;
  const budget = getSpellById(zone.spellId)?.budget;
  useDamageTrayStore.getState().show({
    characterId: doc.id,
    actionName: action.name,
    source: action.nameLoc,
    castLogId: null,
    actionId: action.id,
    plan,
    zone: { effectId: zone.id, ...(budget ? { budget: { max: budget.max } } : {}) },
  });
  return true;
}
