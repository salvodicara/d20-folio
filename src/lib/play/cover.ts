/**
 * Pure play transition for cover: light one cover level (dropping any other) until
 * the given turn edge, or clear it. The character in, the next session out.
 */
import {
  COVER_STATES,
  coverStateKey,
  litCoverLevel,
  type CoverStateLevel,
} from "@/lib/cover-states";
import type { CharacterDoc, SessionState } from "@/types/character";
import { setActiveState } from "./states";

export type CoverUntil = { round: number; phase: "turn-start" | "turn-end" };

/**
 * Set the lit cover level (null clears it), or null when it already is. `until`
 * is the owner-turn edge the cover ends at; without one (no fight running) it
 * stays until tapped off.
 */
export function setCover(
  doc: CharacterDoc,
  level: CoverStateLevel | null,
  until: CoverUntil | undefined
): SessionState | null {
  if (litCoverLevel(doc.session) === level) return null;
  let session = doc.session;
  for (const state of COVER_STATES) {
    const key = state.grant.activeKey;
    // Cover declares no round countdown, so the lit round is never read.
    session =
      setActiveState({ ...doc, session }, key, state.level === level, 0) ?? session;
  }
  if (level === null || !until) return session;
  return {
    ...session,
    effectBoundaries: {
      ...(session.effectBoundaries ?? {}),
      [coverStateKey(level)]: { round: until.round, phase: until.phase },
    },
  };
}
