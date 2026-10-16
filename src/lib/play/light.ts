/**
 * Pure play transition for light: light one level (dropping the other), or clear
 * it. It holds until tapped off or the encounter ends (`endFightSituations`). The
 * character in, the next session out.
 */
import {
  LIGHT_LEVELS,
  lightStateKey,
  litLightLevel,
  type LightLevel,
} from "@/lib/light-states";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import type { CharacterDoc, SessionState } from "@/types/character";
import { setActiveState } from "./states";

/** Set the lit light level (null clears it), or null when it already is. */
export function setLight(
  doc: CharacterDoc,
  level: LightLevel | null
): SessionState | null {
  if (litLightLevel(doc.session) === level) return null;
  let session = doc.session;
  for (const each of LIGHT_LEVELS) {
    // Light declares no round countdown, so the lit round is never read.
    session =
      setActiveState({ ...doc, session }, lightStateKey(each), each === level, 0) ??
      session;
  }
  return session;
}

/** The sheet's Darkvision range in feet: a hand-set range wins over the grants. */
export function sheetDarkvisionFt(doc: CharacterDoc): number {
  return (
    doc.character.senseRangeOverrides?.darkvision ??
    aggregateCharacterGrants(doc.character, doc.session).darkvisionFt
  );
}
