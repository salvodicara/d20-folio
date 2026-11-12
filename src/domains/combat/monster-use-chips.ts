/**
 * The DM's limited uses under a monster's line in the campaign's Scontro (rules-gap
 * board A1): D&D Beyond's tracker check boxes, named as the stat block names them
 * («Soffio di Fuoco · Ricarica 5–6», «Ragnatela · 1/Giorno», a per-day spell, the
 * legendary pool), each with what is left. A spent Recharge says its d6 is due (the
 * app never rolls: the DM enters the face, `rollMonsterRecharge`).
 */
import type { TFunction } from "i18next";

import type { MonsterStatBlock } from "@/data/types";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import type { EncounterMonster } from "@/types/campaign";

import { monsterUsesView, type MonsterUseRow } from "./monster-uses-view";

export interface MonsterUseChip extends MonsterUseRow {
  label: string;
  /** A spent Recharge: its d6 is rolled at the start of the monster's turn. */
  rollDue: boolean;
}

function entryLabel(srdId: string, use: MonsterUseRow, t: TFunction, locale: Locale) {
  if (use.kind === "legendary") return t("monster.legendaryActions");
  if (use.kind === "spell" && use.spellId)
    return `${localizeSrd("spell", use.spellId, "name", locale)} · ${t("monster.usesPerDay", { count: use.max })}`;
  const [section, entryId] = use.key.split(":");
  const key = `${srdId}.${section ?? ""}.${entryId ?? ""}`;
  const name = hasSrd("monster", key, "name", locale)
    ? localizeSrd("monster", key, "name", locale)
    : (entryId ?? use.key);
  const tail =
    use.kind === "recharge"
      ? use.recharge === 6
        ? t("monster.rechargeExact")
        : t("monster.recharge", { min: use.recharge })
      : t("monster.usesPerDay", { count: use.max });
  return `${name} · ${tail}`;
}

export function monsterUseChips(
  srdId: string,
  monster: Pick<EncounterMonster, "spent">,
  block: MonsterStatBlock,
  t: TFunction,
  locale: Locale
): MonsterUseChip[] {
  return monsterUsesView(monster, block).map((use) => ({
    ...use,
    label: entryLabel(srdId, use, t, locale),
    rollDue: use.kind === "recharge" && use.left === 0,
  }));
}
