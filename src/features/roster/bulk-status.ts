/**
 * setCharactersStatus — the feature-layer helper behind the roster's bulk
 * Retire / Restore actions (owner 2026-06-07).
 *
 * Unlike delete, a status change touches only the character's OWN aggregate (no
 * cross-aggregate campaign concern — a retired/restored character keeps its party
 * membership), so this is a thin fan-out over the engine primitive
 * `updateCharacter`. It lives in the feature layer (not `lib`) purely so the
 * bulk-actions hook stays a presentation concern and this stays unit-testable
 * against a mocked firestore. `updateCharacter` self-guards `DEV_BYPASS_AUTH`
 * (it early-returns), so this is a safe no-op in the local preview.
 *
 * Failures are isolated per-character (`allSettled`) so one bad write never aborts
 * the rest — the caller reports the changed/failed tally.
 */

import { updateCharacter } from "@/lib/firestore";
import type { CharacterDoc } from "@/types/character";

/** Outcome of a bulk status change: how many of the requested ids actually flipped. */
export interface BulkStatusResult {
  /** Characters whose status was updated. */
  changed: number;
  /** Characters whose update threw (left at their previous status). */
  failed: number;
}

/**
 * Set `status` on every one of `ids` (de-duplicated), concurrently.
 *
 * @param uid    The signed-in owner's uid.
 * @param ids    The character document ids to update.
 * @param status The target lifecycle status (e.g. "retired" / "active").
 */
export async function setCharactersStatus(
  uid: string,
  ids: readonly string[],
  status: CharacterDoc["status"]
): Promise<BulkStatusResult> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { changed: 0, failed: 0 };
  const results = await Promise.allSettled(
    unique.map((id) => updateCharacter(uid, id, { status }))
  );
  const changed = results.filter((r) => r.status === "fulfilled").length;
  return { changed, failed: unique.length - changed };
}
