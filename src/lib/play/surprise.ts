/**
 * Pure play transition for Surprise: light it or clear it. The character in, the
 * next session out.
 */
import { SURPRISE_STATE } from "@/lib/surprise-state";
import type { CharacterDoc, SessionState } from "@/types/character";
import { setActiveState } from "./states";

/** Light or clear Surprise, or null when it already is. */
export function setSurprised(doc: CharacterDoc, surprised: boolean): SessionState | null {
  // Surprise declares no round countdown, so the lit round is never read.
  return setActiveState(doc, SURPRISE_STATE.activeKey, surprised, 0);
}
