/**
 * A spell cast as a Reaction when you fail a D20 Test turns the d20 into a face (a
 * failed roll becomes a 20: `failedD20Becomes`). Offered on the saves the app records
 * (Concentration, death saves) while the character has the spell ready and a slot of
 * its level or higher. Pure.
 */
import { getSpellById } from "@/data/spells";
import { slotUsageKey } from "@/lib/cast-options";
import { homebrewSpellData } from "@/lib/homebrew-spells";
import type { HomebrewText } from "@/lib/homebrew-text";
import type { CharacterDoc } from "@/types/character";

export interface FailedD20Saver {
  /** The catalogue id, or the homebrew spell's `custom:<instanceId>` ref (named
   *  through `concentrationLabel`, as a held spell is). */
  spellId: string;
  /** A homebrew spell's own name (a catalogue spell is named by its id). */
  customName?: HomebrewText;
  /** The face the d20 becomes. */
  face: number;
  /** The lowest slot level it can be cast with now. */
  slotLevel: number;
}

/** The spells that can turn this character's failed d20 into a face, right now. */
export function failedD20Savers(doc: CharacterDoc): FailedD20Saver[] {
  const { character, session } = doc;
  const free = (level: number) => {
    const row = character.spellSlots.find((slot) => slot.level === level);
    const used = session.spellSlots[slotUsageKey({ level })]?.used ?? 0;
    return row !== undefined && row.total - used > 0;
  };
  return character.spells.flatMap((spell): FailedD20Saver[] => {
    const custom = "custom" in spell;
    if (!custom && !spell.prepared) return [];
    const data = custom ? homebrewSpellData(spell) : getSpellById(spell.srdId);
    if (!data?.failedD20Becomes) return [];
    const levels = character.spellSlots
      .map((slot) => slot.level)
      .filter((level) => level >= data.level && free(level))
      .sort((a, b) => a - b);
    const slotLevel = levels[0];
    if (slotLevel === undefined) return [];
    return [
      {
        spellId: custom ? `custom:${spell.instanceId}` : spell.srdId,
        ...(custom ? { customName: spell.name } : {}),
        face: data.failedD20Becomes,
        slotLevel,
      },
    ];
  });
}
