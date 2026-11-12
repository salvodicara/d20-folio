/**
 * A cantrip replaced after a Long Rest (High Elf, SRD 5.2.1 Elven Lineage: "Whenever
 * you finish a Long Rest, you can replace that cantrip with a different cantrip from
 * the Wizard spell list"). The grant carries `longRestSwap`; the pick lives in the
 * session's option choices (`grantBundleChoices`) under its key, so nothing new is
 * stored, and with no pick the cantrip is the grant's own. The Long Rest offers the
 * swap; applying it also drops a stored copy of the old cantrip (creation wrote the
 * lineage's always-prepared spells into the list). Headless.
 */
import { spells as allSpells } from "@/data/spells";
import { totalLevel } from "@/lib/classes";
import { resolveEffectiveSpells } from "@/lib/expanded-spells";
import type { Grant } from "@/lib/grants";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import type { CharacterDoc } from "@/types/character";

/** The High Elf's pick key (data: the lineage's Prestidigitation grant). */
export const HIGH_ELF_CANTRIP_KEY = "high-elf-cantrip";

export interface RestCantripSwap {
  /** The feature, trait or lineage that grants the cantrip. */
  sourceId: string;
  choiceKey: string;
  /** The grant's own cantrip (Prestidigitation). */
  base: string;
  /** The cantrip now. */
  current: string;
  /** The cantrips it may become: the list's, not already known, not the current. */
  options: string[];
}

type SwapGrant = Extract<Grant, { type: "always-prepared-spell" }> & {
  longRestSwap: NonNullable<
    Extract<Grant, { type: "always-prepared-spell" }>["longRestSwap"]
  >;
};

/** Every cantrip the character may replace at a Long Rest, with its options. */
export function restCantripSwaps(doc: CharacterDoc): RestCantripSwap[] {
  const { character, session } = doc;
  const choices = session.grantBundleChoices ?? {};
  const level = totalLevel(character);
  const found: Array<{ sourceId: string; grant: SwapGrant }> = [];
  const visit = (grants: ReadonlyArray<Grant>, sourceId: string) => {
    for (const g of grants) {
      if (g.type === "always-prepared-spell" && g.longRestSwap) {
        if (g.minLevel == null || level >= g.minLevel)
          found.push({ sourceId, grant: g as SwapGrant });
      } else if (g.type === "choice-grant-bundle") {
        const chosen = g.options.find((o) => o.id === choices[g.bundleKey]);
        if (chosen) visit(chosen.grants, sourceId);
      }
    }
  };
  for (const src of resolveAllGrantSources(character, session.itemResources)) {
    visit(src.grants ?? [], src.id);
  }
  if (found.length === 0) return [];
  const known = new Set(
    resolveEffectiveSpells(character, session).flatMap((s) =>
      "custom" in s ? [] : [s.srdId]
    )
  );
  return found.map(({ sourceId, grant }) => {
    const { choiceKey, spellList } = grant.longRestSwap;
    const current = choices[choiceKey] ?? grant.spellId;
    return {
      sourceId,
      choiceKey,
      base: grant.spellId,
      current,
      options: allSpells
        .filter(
          (s) =>
            s.level === 0 &&
            s.classes.includes(spellList) &&
            s.id !== current &&
            (!known.has(s.id) || s.id === grant.spellId)
        )
        .map((s) => s.id),
    };
  });
}

/**
 * The character with the cantrip under `choiceKey` replaced by `spellId`. Back to the
 * grant's own cantrip clears the pick. A stored always-prepared copy of the replaced
 * cantrip is dropped (the new one is inferred from the grant). Unchanged when the key
 * isn't the character's or the spell isn't an option.
 */
export function applyRestCantripSwap(
  doc: CharacterDoc,
  choiceKey: string,
  spellId: string
): CharacterDoc {
  const row = restCantripSwaps(doc).find((r) => r.choiceKey === choiceKey);
  if (!row || row.current === spellId || !row.options.includes(spellId)) return doc;
  const rest = Object.fromEntries(
    Object.entries(doc.session.grantBundleChoices ?? {}).filter(([k]) => k !== choiceKey)
  );
  const grantBundleChoices =
    spellId === row.base ? rest : { ...rest, [choiceKey]: spellId };
  return {
    ...doc,
    character: {
      ...doc.character,
      spells: doc.character.spells.filter(
        (s) => "custom" in s || !(s.srdId === row.current && s.alwaysPrepared)
      ),
    },
    session: { ...doc.session, grantBundleChoices },
  };
}
