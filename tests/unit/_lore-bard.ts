/**
 * A College of Lore Bard 9 as it was saved before Magical Discoveries were marked:
 * its two discoveries (Fireball from the Wizard list, Spirit Guardians from the
 * Cleric list) sit as ordinary prepared spells, next to a Bard-list spell. The
 * build owes nothing else (4 cantrips, 4 Expertise skills), so the discoveries are
 * the only owed choice.
 */
import { asRaceId } from "@/data/srd-names";
import type { CharacterDoc, ClassEntry, SrdSpellRef } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

export const DISCOVERIES = "bard-lore-additional-magical-secrets";

export const CANTRIPS: SrdSpellRef[] = [
  { srdId: "vicious-mockery" },
  { srdId: "minor-illusion" },
  { srdId: "mage-hand" },
  { srdId: "message" },
];

export function loreBardDoc(
  spells: SrdSpellRef[] = [
    { srdId: "healing-word", prepared: true },
    { srdId: "fireball", prepared: true },
    { srdId: "spirit-guardians", prepared: true },
  ],
  entry: Partial<ClassEntry> = {}
): CharacterDoc {
  return makeCharacterDoc({
    race: asRaceId("dwarf"),
    classes: [{ classId: "bard", subclassId: "college-of-lore", level: 9, ...entry }],
    skills: {
      persuasion: "expertise",
      deception: "expertise",
      performance: "expertise",
      insight: "expertise",
    },
    spells: [...CANTRIPS, ...spells],
  });
}
