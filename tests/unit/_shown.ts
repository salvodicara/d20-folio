/**
 * What the sheet shows for a character (scores, AC, speeds), derived the way the
 * app derives it. A form is a layer (M2): its numbers are read here, not from the
 * stored build.
 */
import type { AbilityCode } from "@/types/ability";
import type { CharacterDoc } from "@/types/character";
import { deriveCharacter } from "@/lib/views/derive-character";

export function shown(doc: CharacterDoc) {
  const sheet = deriveCharacter(doc);
  return {
    scores: Object.fromEntries(
      Object.entries(sheet.abilities).map(([id, a]) => [id, a.score])
    ) as Record<AbilityCode, number>,
    ac: sheet.ac,
    walk: sheet.walkingSpeedFt,
    speed: (kind: string) => sheet.speeds.find((s) => s.kind === kind)?.rangeFt,
  };
}
