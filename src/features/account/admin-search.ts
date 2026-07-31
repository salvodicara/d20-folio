/**
 * admin-search — the admin console's OMNI-search matcher (owner-grilled,
 * 2026-07-31): one field finds USERS (name/email), CHARACTERS (name → the
 * owning user's row), and CAMPAIGNS (name → the DM's row). Every match
 * resolves to a USER row — the admin acts on users — carrying a `hint` that
 * says WHY the row matched when the reason isn't the user's own identity.
 *
 * Pure and stateless (bilingual accent-insensitive matching via the shared
 * `matchesSearch` seam) so the page stays a dispatcher and this logic is
 * unit-tested without React.
 */

import { matchesSearch } from "@/lib/search";
import type { AdminCampaignSummary } from "@/lib/dev-admin-fixture";

interface AdminSearchUser {
  uid: string;
  email: string;
  displayName: string;
}

/** Why a row matched beyond the user's own identity — rendered as a quiet chip. */
export interface AdminMatchHint {
  kind: "character" | "campaign";
  label: string;
}

/**
 * The character-name index is loaded LAZILY (one roster fetch per user, once,
 * only after the admin actually searches) — `null` means "not loaded yet":
 * user/campaign matches still resolve immediately and character matches join
 * when the index lands.
 */
/** name is the one field the matcher needs (structural — Firebase-free). */
export type AdminCharIndex = Record<string, { name: string }[]> | null;

/**
 * Resolve `query` to the set of visible user rows. Returns `null` for an
 * empty/whitespace query (= no filtering, show everyone), else a Map whose
 * keys are the visible uids and whose values are the match hint (or null when
 * the user's own name/email matched — no chip needed for the obvious).
 */
export function buildAdminMatches(
  query: string,
  users: AdminSearchUser[],
  campaigns: AdminCampaignSummary[] | null,
  charIndex: AdminCharIndex
): Map<string, AdminMatchHint | null> | null {
  const q = query.trim();
  if (!q) return null;
  const out = new Map<string, AdminMatchHint | null>();

  // 1) the user's own identity — the strongest match, no hint chip
  for (const u of users) {
    if (matchesSearch(q, u.displayName, u.email)) out.set(u.uid, null);
  }

  // 2) campaign name → the DM's row (the responsible party, deliberately not
  //    every member — members would drown the list for common campaign words)
  for (const c of campaigns ?? []) {
    if (!c.name || !c.dmUid || out.has(c.dmUid)) continue;
    if (matchesSearch(q, c.name)) {
      out.set(c.dmUid, { kind: "campaign", label: c.name });
    }
  }

  // 3) character name → the owning user's row
  if (charIndex) {
    for (const [uid, chars] of Object.entries(charIndex)) {
      if (out.has(uid)) continue;
      const hit = chars.find((ch) => matchesSearch(q, ch.name));
      if (hit) out.set(uid, { kind: "character", label: hit.name });
    }
  }

  return out;
}
