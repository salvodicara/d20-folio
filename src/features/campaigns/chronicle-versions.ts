/**
 * Chronicle version history (D27) — pure helpers for the "restore a previous
 * revision" affordance, kept Firebase-free so they unit-test in isolation.
 *
 * A revision snapshot is taken whenever a member SAVES a real change to the shared
 * chronicle. Because each snapshot is a full copy of the text, an unbounded history
 * would blow the Firestore 1 MB document ceiling — so `capVersions` bounds the list
 * by BOTH a count and a total-bytes budget (oldest dropped first), keeping at least
 * the most recent one. The owner's brief: "store the last few revisions to restore
 * (mind Firebase limits → cap it)."
 */

import type { ChronicleVersion } from "@/types/campaign";

/** Default ceilings: at most 10 revisions, and ~200 KB of snapshot text total. */
export const MAX_VERSIONS = 10;
const MAX_VERSION_BYTES = 200_000;

/**
 * Trim a newest-first version list to the count + byte budget. Oldest revisions
 * are dropped first; the newest is always kept even if it alone exceeds the byte
 * budget (a single huge revision is still worth one restore point).
 */
export function capVersions(
  versions: ChronicleVersion[],
  maxCount: number = MAX_VERSIONS,
  maxBytes: number = MAX_VERSION_BYTES
): ChronicleVersion[] {
  let kept = versions.slice(0, Math.max(1, maxCount));
  let total = kept.reduce((sum, v) => sum + v.textSnapshot.length, 0);
  while (kept.length > 1 && total > maxBytes) {
    const last = kept[kept.length - 1];
    if (!last) break;
    total -= last.textSnapshot.length;
    kept = kept.slice(0, -1);
  }
  return kept;
}

/**
 * Prepend a snapshot of the just-replaced text to the history (newest first),
 * then cap. A no-op snapshot (empty or unchanged prior text) is skipped — there's
 * nothing meaningful to restore to.
 */
export function pushVersion(
  versions: ChronicleVersion[],
  snapshot: ChronicleVersion
): ChronicleVersion[] {
  if (snapshot.textSnapshot.trim() === "") return capVersions(versions);
  if (versions[0]?.textSnapshot === snapshot.textSnapshot) return capVersions(versions);
  return capVersions([snapshot, ...versions]);
}

/**
 * Whether committing `next` over `prev` removes a large part of the chronicle —
 * the signal for a "you're about to wipe a lot of the story" confirm. True when
 * the text goes from non-empty to empty, or loses more than `lossFraction` (default
 * 40%) of its characters.
 */
export function isLargeReduction(
  prev: string,
  next: string,
  lossFraction = 0.4
): boolean {
  const before = prev.trim().length;
  if (before === 0) return false;
  const after = next.trim().length;
  if (after === 0) return true;
  return after < before * (1 - lossFraction);
}
