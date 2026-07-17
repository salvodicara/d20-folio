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
 * It DERIVES the fallen state instead of persisting a second copy: a character is
 * revived by healing from 0 HP, which already resets their death saves
 * (`characterStore`), so the derived state clears automatically — no stored
 * `status` flag to keep in sync, nothing to forget on revive (golden rule 2 —
 * declare the least, infer the rest).
 *
 * Pure module (types only) — safe for CI-pure unit tests; no Firebase, no UI.
 */

import type { CharacterDoc, SessionState } from "@/types/character";

/** PHB 2024: three failed death saving throws and the character dies. */
export const DEATH_FAIL_LIMIT = 3;
/** Three successful death saves and the character stabilises. */
export const DEATH_SUCCESS_LIMIT = 3;

/** Died in play — three failed death saves in the live session. */
export function diedInPlay(session: Pick<SessionState, "deathFail">): boolean {
  return session.deathFail >= DEATH_FAIL_LIMIT;
}

/** Stabilised in play — three successful death saves in the live session. */
export function stabilisedInPlay(session: Pick<SessionState, "deathSucc">): boolean {
  return session.deathSucc >= DEATH_SUCCESS_LIMIT;
}

/**
 * A character is fallen if the roster lifecycle marks them dead (`status: "dead"`)
 * OR they died in play (three failed death saves). The roster card and the cockpit
 * both read this, so a death anywhere shows everywhere.
 */
export function isCharacterDead(
  status: CharacterDoc["status"],
  session: Pick<SessionState, "deathFail">
): boolean {
  return status === "dead" || diedInPlay(session);
}
