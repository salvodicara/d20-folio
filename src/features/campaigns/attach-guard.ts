/**
 * attach-guard — the pure D9 (one-campaign-per-character) gate, extracted so the
 * race-closing decision is unit-pinned WITHOUT the Firebase-coupled attach seam
 * (`campaign-io.attachMemberCharacter`).
 *
 * D9 was enforced only by a client read-then-write pre-check, so two devices could
 * attach the SAME unattached hero to two DIFFERENT campaigns within the propagation
 * window (B07 — both reads found no "elsewhere" hit, both writes committed). The fix
 * records the claiming campaign on the CHARACTER doc (`attachedCampaignId`) and gates
 * the attach inside a transaction that re-reads that claim FRESH; this predicate is
 * the decision that transaction evaluates.
 */

/**
 * Would attaching a character that currently records `attachedCampaignId` to
 * `targetCampaignId` VIOLATE D9 (one campaign per character)? True ONLY when the
 * character is already claimed by a DIFFERENT campaign. An unclaimed character
 * (`null`/`undefined` — a fresh hero, or one detached everywhere) or a re-attach to
 * the SAME campaign (idempotent) is allowed.
 *
 * Evaluated on the FRESH character-doc read INSIDE the attach transaction, so
 * Firestore's optimistic-concurrency retry serializes two racing attaches: the first
 * commits the claim, the second's transaction re-runs, re-reads the now-claimed doc,
 * and this predicate returns `true` → the loser aborts. Pure.
 */
export function attachViolatesOneCampaign(
  attachedCampaignId: string | null | undefined,
  targetCampaignId: string
): boolean {
  return attachedCampaignId != null && attachedCampaignId !== targetCampaignId;
}
