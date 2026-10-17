/**
 * Wish Stress as a one-tap state (2024 Wish: using it for anything but duplicating a
 * spell stresses the caster). Lit from the Wish follow-up on the turn meter, it shows
 * on the rail until a Long Rest ends it; each spell cast meanwhile reminds the caster
 * of 1d10 Necrotic damage per spell level. The Strength 3 for 2d4 days is the table's.
 * Its name lives in the `rule` catalogue under `state.wish-stress`.
 */
import type { GrantSource } from "@/lib/grants";
import type { Grant } from "@/lib/grant-schema";
import { srdText, type LocText } from "@/lib/loc-text";

const NAME: LocText = srdText("rule", "state.wish-stress", "name");

export const WISH_STRESS_STATE: Extract<Grant, { type: "while-active" }> = {
  type: "while-active",
  activeKey: "wish-stress",
  grants: [],
};

/** The lit Wish Stress state as a grant source; off, it contributes nothing. */
export function resolveWishStressStateSources(
  activeKeys: ReadonlySet<string>
): GrantSource[] {
  return activeKeys.has(WISH_STRESS_STATE.activeKey)
    ? [{ id: WISH_STRESS_STATE.activeKey, label: NAME, grants: [WISH_STRESS_STATE] }]
    : [];
}

export function isWishStressed(session: {
  activeFeatures?: ReadonlyArray<string>;
}): boolean {
  return (session.activeFeatures ?? []).includes(WISH_STRESS_STATE.activeKey);
}

/** The name behind the Wish Stress key, for labels. */
export function wishStressStateName(key: string): LocText | undefined {
  return key === WISH_STRESS_STATE.activeKey ? NAME : undefined;
}
