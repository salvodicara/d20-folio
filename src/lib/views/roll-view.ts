/**
 * Roll presenter — one localized log line per `roll` action (mirrors `combat-log-view.ts`:
 * `t` is injected, nothing here imports i18next). Hidden rolls show their faces only to the
 * DM and to the person who rolled (constitution §2.2: never hide a player's own roll).
 */
import type { RollRecord } from "@/lib/combat/dice";
import type { TranslateFn } from "./combat-log-view";

export interface RollViewer {
  readonly uid: string;
  readonly dm: boolean;
}

export function rollLine(
  t: TranslateFn,
  roll: RollRecord,
  by: string,
  viewer: RollViewer,
  who: string
): string {
  const purpose = t(`combatLog.rollPurpose.${roll.purpose}`);
  const concealed = roll.hidden && !viewer.dm && viewer.uid !== by;
  if (concealed) return t("combatLog.rollHidden", { who, purpose });
  return t(roll.source === "manual" ? "combatLog.rollManual" : "combatLog.rollApp", {
    who,
    purpose,
    formula: roll.formula,
    faces: roll.faces.join(", "),
    total: roll.total,
  });
}
