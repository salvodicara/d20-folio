/**
 * A spell offered as a pick (level-up, creation, «Scelte da completare»), as a row
 * that reads at a glance like a spell row on the sheet and D&D Beyond's picker:
 * its name, one facts line (level · school · casting time · range), the
 * Concentration and Ritual marks, and its effect read from the spell's data
 * («8d6 Fuoco», «2d8 PF», «Affascinato»), or none. No prose: the full text opens
 * on request. Long lists narrow by a search (name first, then the text) and by
 * spell level.
 *
 * Pure: names and facts resolve here in the reader's language.
 */
import { spells as allSpells } from "@/data/spells";
import type { SrdSpellData } from "@/data/types";
import { localizeSrd } from "@/i18n/resolver";
import i18n from "@/i18n";
import type { Locale } from "@/lib/locale";
import { rankedSearch } from "@/lib/search";
import { spellPickVM } from "@/lib/views/spell-pick-view";

/** From this many options a list gets a search field and a level filter. */
export const SPELL_FILTER_FROM = 12;

export interface SpellPickRow {
  id: string;
  name: string;
  /** 0 for a cantrip. */
  level: number;
  school: string;
  castingTime: string;
  range: string;
  concentration: boolean;
  ritual: boolean;
  /** Its damage, healing or the condition it applies; null when it has none. */
  effect: string | null;
  /** The full text (markdown), for the detail. */
  description: string;
  searchText: string;
  readonly searchDesc: string;
}

const BY_ID = new Map(allSpells.map((s) => [s.id, s]));

/** What the spell does, as the sheet writes it: damage, healing, or a condition. */
export function spellEffect(spell: SrdSpellData, locale: Locale): string | null {
  const t = i18n.getFixedT(locale);
  if (spell.damageDice) {
    return [
      spell.damageDice,
      spell.damageType ? t(`srd.damage_${spell.damageType}`) : null,
    ]
      .filter(Boolean)
      .join("\u00a0");
  }
  if (spell.healDice)
    return t("play.healing", { amount: spell.healDice }).replace(/ /g, "\u00a0");
  const conditions = spell.conditionApplication?.options ?? [];
  if (conditions.length) {
    return conditions
      .map((id) => localizeSrd("condition", id, "name", locale))
      .join(" / ");
  }
  return null;
}

export function spellPickRows(ids: readonly string[], locale: Locale): SpellPickRow[] {
  const t = i18n.getFixedT(locale);
  return ids.flatMap((id) => {
    const spell = BY_ID.get(id);
    if (!spell) return [];
    const vm = spellPickVM(spell, locale);
    return [
      {
        id,
        name: vm.name,
        level: vm.level,
        school: t(`srd.school_${vm.school}`),
        castingTime: t(`srd.castingTime_${vm.castingTimeKey}`),
        range: vm.range,
        concentration: vm.concentration,
        ritual: vm.ritual,
        effect: spellEffect(spell, locale),
        description: vm.description,
        searchText: vm.searchText,
        get searchDesc() {
          return vm.searchDesc;
        },
      },
    ];
  });
}

/** The rows at `level` (null: every level) matching `query`, best matches first. */
export function filterSpellRows(
  rows: readonly SpellPickRow[],
  query: string,
  level: number | null
): readonly SpellPickRow[] {
  const at = level === null ? rows : rows.filter((r) => r.level === level);
  return rankedSearch(
    query,
    at,
    (r) => r.searchText,
    (r) => r.searchDesc
  );
}
