/**
 * Invite-link helpers — the link is the ONE invite (the code IS the doc id).
 *
 * Sharing is consolidated to the LINK (`…/join/<CODE>`); the embedded `<CODE>` is the
 * campaign's document id, so the link carries the token and there is no separate
 * code to circulate. `inviteLinkFromCode` builds that link (the single builder, reused
 * by every share surface); `inviteCodeFromInput` is the inverse — it pulls the code
 * back out of a pasted link for the join io. A bare-code paste still resolves (silent
 * back-compat for any link shared before the de-dup), but the UI only advertises the
 * link.
 */

/** Build the shareable invite link for a campaign code (the code IS the doc id).
 *  SSR/test-safe: uses `window.location.origin` on the client, a bare path otherwise. */
export function inviteLinkFromCode(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/join/${code}`;
}

/** Pull the campaign code out of a pasted invite (a full LINK or — back-compat — a
 *  bare code), trimmed + UPPERCASED, so the join io gets the doc id either way. */
export function inviteCodeFromInput(raw: string): string {
  const trimmed = raw.trim();
  const fromLink = trimmed.match(/\/join\/([^/?#]+)/);
  const code = fromLink?.[1] ?? trimmed;
  return code.trim().toUpperCase();
}
