/**
 * A stat block's entries read from their print alone — the one way a monster
 * written as TEXT becomes structured data. Each entry is a name and its text; the
 * readers in `monster-print.ts` (the same ones the corpus guard pins the SRD
 * bestiary to) decide what kind of entry it is and the facts its print states:
 *
 *  - an attack line ("Melee Attack Roll: +6, reach 5 ft. Hit: …") is an attack
 *    with its to-hit, reach and range, damage and the conditions it gives;
 *  - a spellcasting line ("… using Charisma as the spellcasting ability …: At
 *    Will: …. 1/Day: …") is spellcasting, its tiers as spell ids;
 *  - a save line ("Dexterity Saving Throw: DC 13, …") is a save;
 *  - anything else is prose: a Multiattack's routine, damage with no roll, the
 *    attack it uses, how it moves the monster, what it breathes, a trait's fact.
 *
 * "(Recharge 5–6)" or "(3/Day)" on the name, or "(3/Day)" opening the text, is its
 * limit. Pure: text in, entries out.
 */
import type { MonsterEntry } from "@/data/types";

import {
  printedAttack,
  printedAutomaticDamage,
  printedBreathing,
  printedEntryHeader,
  printedMovement,
  printedMultiattack,
  printedPerformedEntry,
  printedSave,
  printedSpellcasting,
  printedTraitFact,
  printedUses,
  type PrintedEntryName,
} from "./monster-print";
import type { MonsterSection } from "./types";

/** One entry as printed: where it sits, its id, its name and its text. */
export interface PrintedSourceEntry {
  section: MonsterSection;
  id: string;
  name: string;
  text: string;
}

/** An entry without its id, kind by kind. */
type EntryBody = MonsterEntry extends infer Entry
  ? Entry extends MonsterEntry
    ? Omit<Entry, "id">
    : never
  : never;

/** The kind and opening facts of one entry, before its siblings are known. */
function openingOf(text: string): EntryBody | undefined {
  return printedAttack(text) ?? printedSpellcasting(text) ?? printedSave(text);
}

/** The prose facts of a narrative entry, read against the block's own entries. */
function narrativeOf(
  source: PrintedSourceEntry,
  name: string,
  names: ReadonlyArray<PrintedEntryName>
): Omit<Extract<MonsterEntry, { kind: "narrative" }>, "id"> {
  const { text } = source;
  if (/^Multiattack\b/.test(name)) {
    const multiattack = printedMultiattack(text, names);
    return { kind: "narrative", ...(multiattack ? { multiattack } : {}) };
  }
  const damage = safely(() => printedAutomaticDamage(text)) ?? [];
  const performs = printedPerformedEntry(text, names);
  const movement = printedMovement(text);
  const breathes = printedBreathing(text);
  const fact = source.section === "traits" ? printedTraitFact(text) : undefined;
  return {
    kind: "narrative",
    ...(fact ? { fact } : {}),
    ...(damage.length > 0 ? { damage } : {}),
    ...(performs ? { performs } : {}),
    ...(movement ? { movement } : {}),
    ...(breathes ? { breathes } : {}),
  };
}

/** A reader that names a word outside the closed vocabularies reads as nothing. */
function safely<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/**
 * Every entry of a stat block read from its print, in the order given. `siblings`
 * are the block's entries that are already structured (a homebrew block can mix
 * both): a Multiattack or a Pounce written as text can use them by name.
 */
export function printedEntries(
  sources: ReadonlyArray<PrintedSourceEntry>,
  siblings: ReadonlyArray<PrintedEntryName> = []
): Array<{ section: MonsterSection; entry: MonsterEntry }> {
  const read = sources.map((source) => {
    const header = printedEntryHeader(source.name);
    return { source, header, opening: safely(() => openingOf(source.text)) };
  });
  const names: PrintedEntryName[] = [
    ...siblings,
    ...read.map(({ source, opening }) => ({
      section: source.section,
      entryId: source.id,
      name: source.name,
      kind: opening?.kind ?? ("narrative" as const),
    })),
  ];
  return read.map(({ source, header, opening }) => {
    const uses = header.uses ?? printedUses(source.text);
    const limits = {
      ...(header.recharge ? { recharge: header.recharge } : {}),
      ...(uses ? { uses } : {}),
    };
    const body: EntryBody = opening ?? narrativeOf(source, header.name, names);
    // A one-spell cast limited per day ("Fog Cloud (1/Day)") is that spell's tier.
    if (body.kind === "spellcasting" && uses?.per === "day" && !body.perDay) {
      const { atWill = [], ...rest } = body;
      return {
        section: source.section,
        entry: {
          id: source.id,
          ...(header.recharge ? { recharge: header.recharge } : {}),
          ...rest,
          perDay: [{ count: uses.count, spellIds: atWill }],
        },
      };
    }
    return {
      section: source.section,
      entry: { id: source.id, ...limits, ...body },
    };
  });
}
