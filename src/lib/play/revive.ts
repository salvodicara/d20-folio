/**
 * Bringing a dead character back (Revivify, Raise Dead, Resurrection): the character
 * in, the revived one out. The death's own record (`session.death`, game minutes
 * since) says whether a spell still reaches it.
 */
import { isCharacterAlive } from "@/lib/character-status";
import type { CharacterDoc } from "@/types/character";
import { setHp } from "./vitals";

/**
 * Revive with `hitPoints` (never above the maximum): death saves and Unconscious
 * clear, the death record goes, and a roster death ends. Null for a living character.
 */
export function reviveCharacter(
  doc: CharacterDoc,
  hitPoints: number
): CharacterDoc | null {
  if (isCharacterAlive(doc.status, doc.session)) return null;
  const living: CharacterDoc = {
    ...doc,
    ...(doc.status === "dead" ? { status: "active" as const } : {}),
    // From 0 with three failures, setHp is a fresh rise: its reset clears them.
    session: { ...doc.session, hp: { ...doc.session.hp, current: 0 }, death: undefined },
  };
  const { death: _gone, ...session } = setHp(living, Math.max(1, hitPoints));
  void _gone;
  return { ...living, session };
}

/** Whether a reviving spell reaches the character: alive (nothing to do), or dead
 *  within the spell's window, past it, or for a time the sheet never recorded. */
export type ReviveEligibility =
  | { kind: "alive" }
  | { kind: "dead"; minutesSince: number; within: boolean }
  | { kind: "dead"; within: null }
  /** Turned to dust (Disintegrate): only a spell that brings back dust can. */
  | { kind: "dust" };

export function reviveEligibility(
  doc: CharacterDoc,
  withinMinutes: number | undefined,
  fromDust = false
): ReviveEligibility {
  if (isCharacterAlive(doc.status, doc.session)) return { kind: "alive" };
  if (doc.session.death?.disintegrated && !fromDust) return { kind: "dust" };
  const since = doc.session.death?.minutesSince;
  if (since === undefined || withinMinutes === undefined)
    return { kind: "dead", within: null };
  return { kind: "dead", minutesSince: since, within: since <= withinMinutes };
}
