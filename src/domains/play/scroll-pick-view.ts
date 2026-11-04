/**
 * «Quale incantesimo è su questa pergamena?» (Spell Scroll, #652): the spells a scroll
 * may hold, found by name; the ones on the reader's class lists first (only those can
 * be read without a check), then by level and name.
 */
import { spells } from "@/data/spells";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { casterClassAbilities } from "@/lib/spell-owning-class";
import type { CharacterDoc } from "@/types/character";

export interface ScrollSpellChoice {
  id: string;
  name: string;
  level: number;
  onList: boolean;
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function scrollPickView(
  doc: CharacterDoc,
  query: string,
  locale: Locale,
  limit = 30
): ScrollSpellChoice[] {
  const lists = new Set(casterClassAbilities(doc.character).map((c) => c.spellListId));
  const q = fold(query.trim());
  return spells
    .map((spell) => ({
      id: spell.id,
      name: localizeSrd("spell", spell.id, "name", locale),
      level: spell.level,
      onList: spell.classes.some((c) => lists.has(c)),
    }))
    .filter((s) => (q ? fold(s.name).includes(q) : s.onList))
    .sort(
      (a, b) =>
        Number(b.onList) - Number(a.onList) ||
        a.level - b.level ||
        a.name.localeCompare(b.name, locale)
    )
    .slice(0, limit);
}
