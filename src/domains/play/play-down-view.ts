/**
 * At 0 Hit Points and still alive (approved prototype x-play-down): the death saves so
 * far, and once Stable (three successes) the game minutes since (`stableMinutes`): after
 * 1d4 hours it regains 1 Hit Point, the table rolls. Standing, or dead: null.
 */
import { isCharacterAlive } from "@/lib/character-status";
import { stableMinutes } from "@/lib/play/time";
import type { CharacterDoc } from "@/types/character";

export interface PlayDownView {
  successes: number;
  failures: number;
  stable: boolean;
  /** Game minutes Stable, when the sheet knows. */
  stableMinutes: number | null;
}

export function playDownView(doc: CharacterDoc): PlayDownView | null {
  const { session } = doc;
  if (session.hp.current > 0 || !isCharacterAlive(doc.status, session)) return null;
  return {
    successes: session.deathSucc,
    failures: session.deathFail,
    stable: session.deathSucc >= 3,
    stableMinutes: stableMinutes(session) ?? null,
  };
}
