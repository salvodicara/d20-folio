/**
 * A form's numbers on one line (the Wild Shape and familiar pickers): Challenge Rating,
 * AC, Hit Points and speeds, each fact kept whole («Volo 18 m» never breaks inside).
 */
import type { TFunction } from "i18next";

import type { SpeedMode } from "@/domains/play/form-picker-view";
import type { Locale } from "@/lib/locale";
import { localeDistance } from "@/lib/utils";

const SPEED_KEY: Record<SpeedMode, string> = {
  walk: "polymorph.speedWalk",
  fly: "character.speed_fly",
  swim: "character.speed_swim",
  climb: "character.speed_climb",
  burrow: "character.speed_burrow",
};

export function formFacts(
  r: { cr: string; ac: number; hp: number; speeds: { mode: SpeedMode; ft: number }[] },
  t: TFunction,
  locale: Locale
): string {
  return [
    t("polymorph.crShort", { cr: r.cr }),
    `${t("character.armorClassShort")} ${String(r.ac)}`,
    `${t("units.hp")} ${String(r.hp)}`,
    ...r.speeds.map((s) => `${t(SPEED_KEY[s.mode])} ${localeDistance(s.ft, locale)}`),
  ]
    .map((fact) => fact.replace(/ /g, "\u00a0"))
    .join("\u00a0· ");
}
