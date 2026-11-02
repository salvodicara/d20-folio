/**
 * The spells a free-cast-from-list pool offers (Divine Intervention, War God's
 * Blessing, Wish's duplicate, a charged multi-spell item), as picker rows: localized,
 * lowest level first, filtered by a bilingual search, each with its charge cost and
 * whether the pool can pay it now. Every screen's picker reads these rows.
 */
import { spellIndex } from "@/data/spells";
import { localizeSrd } from "@/i18n/resolver";
import { srdEn } from "@/i18n/srd-en";
import type { Locale } from "@/lib/locale";
import { matchesSearch } from "@/lib/search";
import type { FreeCastFromListPool } from "@/lib/smart-tracker";

export interface FreeCastListRow {
  id: string;
  name: string;
  level: number;
  /** Charges it costs (1 for a feature pool). */
  cost: number;
  /** The pool can pay for it now (a feature pool always can). */
  affordable: boolean;
}

export function freeCastListRows(
  pool: FreeCastFromListPool,
  locale: Locale,
  query: string
): FreeCastListRow[] {
  const itemPool = pool.itemId !== undefined;
  return pool.spellIds
    .map((id) => {
      const cost = pool.costBySpell[id] ?? 1;
      return {
        id,
        level: spellIndex.get(id)?.level ?? 0,
        name: localizeSrd("spell", id, "name", locale),
        nameEn: srdEn("spell", id, "name"),
        cost,
        affordable: !itemPool || pool.remaining >= cost,
      };
    })
    .filter((r) => matchesSearch(query, r.name, r.nameEn))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((r) => ({
      id: r.id,
      name: r.name,
      level: r.level,
      cost: r.cost,
      affordable: r.affordable,
    }));
}
