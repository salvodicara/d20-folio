/**
 * The damage tray's targets and header line, shared by the player's sheet and the
 * DM's monster card ({@link "./DamageTrayPanel".DamageTrayPanel}).
 */
import type { useTranslation } from "react-i18next";

import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import { hpBand } from "@/features/character/molecules/hp-tier";
import type { DamageDefenses } from "@/lib/damage-intake";
import type { Locale } from "@/lib/locale";
import {
  initialTrayRow,
  type DamageTrayPlan,
  type TrayRow,
} from "@/lib/play/damage-tray";
import type { CreatureType } from "@/data/types";
import { conditionLabel } from "@/lib/views/tracker-view";

/** One target as the tray shows it. */
export interface TrayTarget {
  id: string;
  name: string;
  kind: "self" | "pc" | "monster";
  /** Exact HP when the viewer may see it. */
  hp?: { current: number; max: number; temp: number };
  /** The concealed band (a monster's HP the viewer may not see). */
  band?: ReturnType<typeof hpBand>;
  defenses?: DamageDefenses;
  /** The creature's type, when known: an on-a-20 rider may hinge on it (Mace of
   *  Smiting's 14 against a Construct). Absent for a player character. */
  creatureType?: CreatureType;
  row?: EncounterCombatantView;
}

/** The target's first tray row, with everything the tray reads from the creature:
 *  its defenses and its type. */
export function initialTrayRowFor(plan: DamageTrayPlan, target: TrayTarget): TrayRow {
  return initialTrayRow(plan, target.id, target.defenses, target.creatureType);
}

/** An encounter row as a tray target; `exact` when the viewer may see its HP. */
export function trayTargetFromRow(
  row: EncounterCombatantView,
  exact: boolean
): TrayTarget {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === "pc" ? "pc" : "monster",
    ...(exact
      ? { hp: { current: row.currentHp, max: row.maxHp, temp: row.tempHp } }
      : { band: hpBand(row.currentHp, row.maxHp) }),
    ...(row.defenses ? { defenses: row.defenses } : {}),
    ...(row.creatureType ? { creatureType: row.creatureType } : {}),
    row,
  };
}

type T = ReturnType<typeof useTranslation>["t"];

/** What the plan deals and the save it asks: "Fire damage · DEX save · DC 21". */
export function trayRubric(plan: DamageTrayPlan, t: T, locale: Locale): string {
  return [effectLabel(plan, t, locale), saveLabel(plan, t)].filter(Boolean).join(" · ");
}

function effectLabel(plan: DamageTrayPlan, t: T, locale: Locale): string {
  switch (plan.effect) {
    case "damage":
      // Each language's own phrase: Italian "Danni Taglienti", "Danni da Fuoco".
      return plan.damageType
        ? t(`combat.damageTray.damageOf.${plan.damageType}`)
        : t("mechanics.cast.optionDamage");
    case "heal":
      return t("combat.heal");
    case "temp-hp":
      return t("combat.tempHpRollLabel");
    default:
      // A condition-only action (Hold Person): what a failed save does.
      return (plan.conditions?.options ?? [])
        .map((id) => conditionLabel(id, locale))
        .join(" / ");
  }
}

function saveLabel(plan: DamageTrayPlan, t: T): string | null {
  const save = plan.save;
  if (!save?.ability || save.dc === undefined) return null;
  return t("combat.cunningStrikeSave", {
    ability: t(`abilities.${save.ability}_short`),
    dc: save.dc,
  });
}
