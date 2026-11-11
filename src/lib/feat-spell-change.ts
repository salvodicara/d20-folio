/**
 * A feat's Spell Change (Magic Initiate, SRD 5.2.1): whenever you gain a new level,
 * you can replace one of the spells you chose for the feat with a different spell
 * of the same level from the chosen spell list. Headless.
 *
 * The feat's leveled pick is the one it casts for free: its free-cast key names the
 * feat, so it is found on the sheet without guessing. The feat's cantrips carry no
 * such mark on stored characters, so they are not offered here yet.
 */
import { getFeat } from "@/data/feats";
import { spells as ALL_SPELLS } from "@/data/spells";
import {
  allowedSpellListsForSlot,
  pendingSpellChoicesForFeat,
} from "@/lib/feat-spell-choices";
import type { CustomSpell, SrdSpellRef } from "@/types/character";

type SpellEntry = SrdSpellRef | CustomSpell;

export interface FeatSpellChange {
  /** The feat's chosen leveled spell, as it is on the sheet. */
  spellId: string;
  /** What it may become: same level, same list, not already known. */
  pool: string[];
  /** The spell lists the feat draws from (Magic Initiate (Wizard): wizard). */
  lists: string[];
}

/** The feat's leveled pick and its replacements, or null when the sheet has none. */
export function featSpellChange(
  featId: string,
  spells: ReadonlyArray<SpellEntry>
): FeatSpellChange | null {
  const feat = getFeat(featId);
  const pick = spells.find(
    (s): s is SrdSpellRef => !("custom" in s) && s.freeCastSource?.sourceId === featId
  );
  if (!feat?.spellChangeOnLevelUp || !pick) return null;
  const slot = pendingSpellChoicesForFeat(feat).find((s) => s.kind === "spell");
  const level = ALL_SPELLS.find((s) => s.id === pick.srdId)?.level;
  if (!slot || level === undefined) return null;
  const lists = allowedSpellListsForSlot(slot);
  const known = new Set(spells.flatMap((s) => ("custom" in s ? [] : [s.srdId])));
  const pool = ALL_SPELLS.filter(
    (s) =>
      s.level === level &&
      !known.has(s.id) &&
      (!lists || s.classes.some((c) => (lists as ReadonlySet<string>).has(c)))
  ).map((s) => s.id);
  return { spellId: pick.srdId, pool, lists: lists ? [...lists] : [] };
}

/** Replace the feat's pick: the new spell keeps everything the feat gave the old one
 *  (always prepared, its casting ability, its free cast). */
export function applyFeatSpellChange(
  spells: ReadonlyArray<SpellEntry>,
  fromId: string,
  toId: string
): SpellEntry[] {
  return spells.map((s) =>
    "custom" in s || s.srdId !== fromId ? s : { ...s, srdId: toId }
  );
}

/** Every Spell Change the sheet offers: one per feat that has it and a pick on it. */
export function featSpellChanges(
  spells: ReadonlyArray<SpellEntry>
): Array<FeatSpellChange & { featId: string }> {
  const featIds = new Set(
    spells.flatMap((s) =>
      "custom" in s || !s.freeCastSource ? [] : [s.freeCastSource.sourceId]
    )
  );
  return [...featIds].flatMap((featId) => {
    const change = featSpellChange(featId, spells);
    return change ? [{ ...change, featId }] : [];
  });
}
