/**
 * A learned maneuver's line in «Al colpo» (board 2b mock, D5a): its cost in Superiority
 * Dice with how many are left, what the die adds to, and the save it calls for. Each
 * fact keeps its words together; a separator never starts a line.
 */
import type { TFunction } from "i18next";

import type { ManeuverOptionVM } from "./after-hit-options";

export function maneuverDetail(m: ManeuverOptionVM, t: TFunction): string {
  return [
    t("play.hit.superiorityDie", { left: m.diceLeft }),
    t(m.addsTo === "damage" ? "play.hit.addsDamage" : "play.hit.addsAttack", {
      die: m.die,
    }),
    m.save
      ? t("combat.cunningStrikeSave", {
          ability: t(`abilities.${m.save.ability}_short`),
          dc: m.save.dc,
        })
      : null,
  ]
    .filter((p): p is string => Boolean(p))
    .map((p) => p.replace(/ · /g, " · "))
    .join(" · ");
}
