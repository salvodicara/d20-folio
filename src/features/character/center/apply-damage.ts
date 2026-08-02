/**
 * apply-damage — the sheet's Firebase-free bridge to the campaign encounter write behind
 * the AttackDeclaration panel (auto-narrated combat — the source-of-truth flip, owner
 * 2026-08-02).
 *
 * When a player types the damage they rolled and confirms a HIT, that damage AUTO-APPLIES
 * to the target monster's HP on the shared campaign doc. The write itself is
 * {@link import("@/features/campaigns/campaign-io").applyDeclaredDamage} (a narrow
 * cross-user dot-path transaction the `firestore.rules` `memberAppliesDamage()` grant
 * allows). This module reaches it through a DYNAMIC import — exactly like
 * {@link import("./turn-state").advanceSharedTurn} — so the sheet's STATIC graph (and its
 * unit tests) stay Firebase-free: the always-eager cockpit never pulls the campaign+engine
 * bundle just to render, and the pure panel stays trivially testable.
 *
 * Fire-and-forget: a failed write (offline / denied) is surfaced by the caller's toast and
 * logged here; the player's declaration already recorded the intent, and the DM's live
 * subscription reconciles the truth. NEVER throws.
 */

import type { DeclaredHit } from "@/features/campaigns/campaign-io";

/**
 * Apply the player's declared per-target damage to the encounter's monster HP. `hits`
 * carries one entry per struck target (the id + the typed damage). Resolves when the
 * write lands; rejects on failure so the caller can toast — but the internal `.catch`
 * guarantees a rejection is always logged even when the caller ignores the promise.
 */
export async function applyDeclaredDamage(
  campaignId: string,
  hits: ReadonlyArray<DeclaredHit>
): Promise<void> {
  const { applyDeclaredDamage: apply } = await import("@/features/campaigns/campaign-io");
  await apply(campaignId, hits).catch((e: unknown) => {
    console.error("Declared-damage apply failed", e);
    throw e;
  });
}
