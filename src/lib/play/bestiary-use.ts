/**
 * Whether a character needs the bestiary at the table: a familiar, a self-form drawn
 * from the bestiary (True Polymorph, Shapechange), or a spell that raises or calls a
 * creature (Animate Dead, Planar Ally). The bestiary is not in the offline install,
 * so the cockpit warms it while online for these characters. Polymorph's forms are
 * the Beasts table, which is. Corpus-free: it reads spell facts only.
 */
import { getSpellById } from "@/data/spells";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { FIND_FAMILIAR_SPELL_ID } from "@/lib/familiar-ids";
import { SELF_FORM_SPELL_IDS, selfFormRule } from "@/lib/polymorph";
import type { CharacterDoc } from "@/types/character";

export function usesBestiary(
  doc: CharacterDoc,
  alwaysPrepared: Iterable<string> = aggregateCharacterGrants(doc.character, doc.session)
    .alwaysPrepared
): boolean {
  if (doc.session.familiar) return true;
  const spellIds = new Set<string>(alwaysPrepared);
  for (const ref of doc.character.spells) if ("srdId" in ref) spellIds.add(ref.srdId);
  for (const id of spellIds) {
    if (id === FIND_FAMILIAR_SPELL_ID) return true;
    if (SELF_FORM_SPELL_IDS.includes(id) && selfFormRule(id).pool === "bestiary")
      return true;
    const spell = getSpellById(id);
    if (spell?.bestiaryPick || spell?.summonedMonsters?.options.length) return true;
  }
  return false;
}
