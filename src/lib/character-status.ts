/**
 * character-status — the single source of truth for "is this hero fallen?".
 *
 * That question was computed in TWO places that silently disagreed: the cockpit
 * death-save track read `session.deathFail >= 3`, while the roster card read only
 * `status === "dead"`. So a character who died IN PLAY (three failed death saves)
 * kept a living roster tile — the fallen-hero UI existed but nothing ever triggered
 * it from a real death (owner 2026-06-07). This pure helper is the ONE predicate
 * both surfaces route through, so they are identical by construction (golden rule
 * 6b — single source of truth).
 *
 * It DERIVES the fallen state instead of persisting a second copy. Ordinary
 * healing never clears a death verdict; the explicit manual HP/death-save
 * overrides remain the current recovery path until a typed revival mechanic owns
 * that transition. Likewise, only explicitly lowering Exhaustion below 6 clears
 * an Exhaustion death.
 *
 * Pure module (types only) — safe for CI-pure unit tests; no Firebase, no UI.
 */

import type { CharacterDoc, SessionState } from "@/types/character";

/** PHB 2024: three failed death saving throws and the character dies. */
export const DEATH_FAIL_LIMIT = 3;
/** Three successful death saves and the character stabilises. */
export const DEATH_SUCCESS_LIMIT = 3;
/** SRD "Exhaustion": a creature dies when its Exhaustion level reaches 6. */
export const EXHAUSTION_DEATH_LEVEL = 6;

/** Died in play — three failed death saves in the live session. */
export function diedInPlay(session: Pick<SessionState, "deathFail">): boolean {
  return session.deathFail >= DEATH_FAIL_LIMIT;
}

/** Died of Exhaustion — level 6 in the live session (SRD "Exhaustion"). */
export function diedOfExhaustion(session: Pick<SessionState, "exhaustion">): boolean {
  return session.exhaustion >= EXHAUSTION_DEATH_LEVEL;
}

/** Stabilised in play — three successful death saves in the live session. */
export function stabilisedInPlay(session: Pick<SessionState, "deathSucc">): boolean {
  return session.deathSucc >= DEATH_SUCCESS_LIMIT;
}

/**
 * A character is fallen if the roster lifecycle marks them dead (`status: "dead"`)
 * OR they died in play — three failed death saves OR Exhaustion level 6 (SRD
 * "Exhaustion"). The roster card and the cockpit both read this, so a death
 * anywhere (from any cause) shows everywhere.
 */
export function isCharacterDead(
  status: CharacterDoc["status"],
  session: Pick<SessionState, "deathFail" | "exhaustion">
): boolean {
  return status === "dead" || diedInPlay(session) || diedOfExhaustion(session);
}

/**
 * The shared eligibility gate for ordinary living-character activity. Healing,
 * rests, and movement all read this complement rather than inventing their own
 * partial definition of death.
 */
export function isCharacterAlive(
  status: CharacterDoc["status"],
  session: Pick<SessionState, "deathFail" | "exhaustion">
): boolean {
  return !isCharacterDead(status, session);
}

/** A rest can begin only while alive and above 0 HP (2024 Rest rules). */
export function canCharacterRest(
  status: CharacterDoc["status"],
  session: Pick<SessionState, "deathFail" | "exhaustion" | "hp">
): boolean {
  return session.hp.current >= 1 && isCharacterAlive(status, session);
}
