/**
 * Preparing a spell, the one rule every screen uses (the cockpit's Spells tab, the
 * Play screen's «Gestisci incantesimi»): a known spell flips prepared; a spell a
 * subclass always prepares (A2) can't be unprepared. Null when nothing changes.
 */
import type { CharacterDoc } from "@/types/character";

export function togglePrepared(doc: CharacterDoc, spellIdx: number): CharacterDoc | null {
  const spells = [...doc.character.spells];
  const ref = spells[spellIdx];
  if (!ref) return null;
  if (!("custom" in ref) && ref.alwaysPrepared === true) return null;
  spells[spellIdx] = { ...ref, prepared: !ref.prepared };
  return { ...doc, character: { ...doc.character, spells } };
}

/** Which class a shared prepared spell comes through (2024 multiclassing, its casting
 *  ability); choosing the same class again goes back to the automatic one. */
export function setViaClass(
  doc: CharacterDoc,
  spellIdx: number,
  classId: string
): CharacterDoc | null {
  const spells = [...doc.character.spells];
  const ref = spells[spellIdx];
  if (!ref || "custom" in ref) return null;
  const { viaClass, ...rest } = ref;
  spells[spellIdx] = viaClass === classId ? rest : { ...rest, viaClass: classId };
  return { ...doc, character: { ...doc.character, spells } };
}
