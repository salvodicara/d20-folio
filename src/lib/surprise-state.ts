/**
 * Surprise as a one-tap state (SRD 5.2.1 "Initiative": a combatant surprised by
 * combat starting has Disadvantage on their Initiative roll). The player lights it
 * by the initiative entry; it nets into the roll like any other Disadvantage (the
 * edit-mode override still wins) and the end of the encounter clears it. Its words
 * live in the `rule` catalogue under `state.surprised`.
 */
import type { GrantSource } from "@/lib/grants";
import type { Grant } from "@/lib/grant-schema";
import { srdText, type LocText } from "@/lib/loc-text";

const REF = { kind: "rule", key: "state.surprised" } as const;
const NAME: LocText = srdText(REF.kind, REF.key, "name");

export const SURPRISE_STATE: Extract<Grant, { type: "while-active" }> = {
  type: "while-active",
  activeKey: "surprised",
  grants: [{ type: "disadvantage-on", rollType: "initiative", vs: "initiative" }],
};

/** The lit Surprise state as a grant source; off, it contributes nothing. */
export function resolveSurpriseStateSources(
  activeKeys: ReadonlySet<string>
): GrantSource[] {
  return activeKeys.has(SURPRISE_STATE.activeKey)
    ? [{ id: SURPRISE_STATE.activeKey, ref: REF, label: NAME, grants: [SURPRISE_STATE] }]
    : [];
}

export function isSurprised(session: {
  activeFeatures?: ReadonlyArray<string>;
}): boolean {
  return (session.activeFeatures ?? []).includes(SURPRISE_STATE.activeKey);
}

/** The name behind the Surprise key, for log lines and labels. */
export function surpriseStateName(key: string): LocText | undefined {
  return key === SURPRISE_STATE.activeKey ? NAME : undefined;
}
