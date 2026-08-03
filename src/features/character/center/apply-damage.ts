/**
 * apply-damage — the sheet's Firebase-free bridge to the campaign encounter write behind
 * the CombatResolver panel (auto-narrated combat — the source-of-truth flip, owner
 * 2026-08-02).
 *
 * When a player types the damage they rolled and confirms a HIT, that damage AUTO-APPLIES
 * to the target monster's HP on the shared campaign doc. The write itself is
 * {@link import("@/features/campaigns/campaign-io").applyDeclaredCombatEffects} (a narrow
 * cross-user dot-path transaction the rules' combat-effect grant
 * allows). This module reaches it through a DYNAMIC import — exactly like
 * {@link import("./turn-state").advanceSharedTurn} — so the sheet's STATIC graph (and its
 * unit tests) stay Firebase-free: the always-eager cockpit never pulls the campaign+engine
 * bundle just to render, and the pure panel stays trivially testable.
 *
 * Fire-and-forget: a failed write (offline / denied) is surfaced by the caller's toast and
 * logged here; the player's declaration already recorded the intent, and the DM's live
 * subscription reconciles the truth. NEVER throws.
 */

import type { DeclaredCombatEffect } from "@/features/campaigns/campaign-io";

/** Apply the reviewed damage/healing/condition batch through one dynamic campaign boundary. */
export async function applyDeclaredCombatEffects(
  campaignId: string,
  effects: ReadonlyArray<DeclaredCombatEffect>
): Promise<void> {
  const { applyDeclaredCombatEffects: apply } =
    await import("@/features/campaigns/campaign-io");
  await apply(campaignId, effects).catch((e: unknown) => {
    console.error("Declared combat-effect apply failed", e);
    throw e;
  });
}
