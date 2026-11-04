/**
 * Monster zones on the DM's Scontro (#752): the zone spells a monster can cast, the
 * line a hit asks about («TS su Saggezza, CD 14 · 3d8 Radiante · metà se riesce»),
 * and the damage that lands after the creature's save.
 */
import i18n from "i18next";

import { spells } from "@/data/spells";
import type { MonsterStatBlock } from "@/data/types";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import type { ZoneHitDamage } from "@/lib/zones";

export interface ZoneSpellChoice {
  id: string;
  name: string;
  level: number;
}

export function monsterZoneSpells(locale: Locale): ZoneSpellChoice[] {
  return spells
    .filter((s) => s.zone !== undefined)
    .map((s) => ({
      id: s.id,
      name: localizeSrd("spell", s.id, "name", locale),
      level: s.level,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

export function zoneHitLine(hit: ZoneHitDamage, locale: Locale): string {
  const t = i18n.getFixedT(locale);
  return [
    hit.saveAbility
      ? hit.dc !== undefined
        ? t("fight.zone.saveDc", {
            ability: t(`abilities.${hit.saveAbility}`),
            dc: hit.dc,
          })
        : t("fight.zone.save", { ability: t(`abilities.${hit.saveAbility}`) })
      : null,
    hit.dice
      ? [hit.dice, hit.damageType ? t(`srd.damage_${hit.damageType}`) : null]
          .filter(Boolean)
          .join(" ")
      : null,
    hit.onSave === "half" ? t("fight.zone.halfOnSave") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The damage that lands: all of it on a failed save, half (down) on a save that
 *  halves, none on a save that negates. */
export function zoneHitAmount(
  total: number,
  saved: boolean,
  hit: Pick<ZoneHitDamage, "onSave">
): number {
  if (!saved) return total;
  return hit.onSave === "half" ? Math.floor(total / 2) : 0;
}

/** The spell save DC a stat block prints on its Spellcasting, or null when it has none. */
export function monsterSpellDc(block: MonsterStatBlock | undefined): number | null {
  if (!block) return null;
  for (const entry of [
    ...(block.traits ?? []),
    ...block.actions,
    ...(block.bonusActions ?? []),
    ...(block.reactions ?? []),
  ]) {
    if (entry.kind === "spellcasting" && entry.dc !== undefined) return entry.dc;
  }
  return null;
}
