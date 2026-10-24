/**
 * An item activation that strains you on a reuse (Ring of X-ray Vision: "Whenever
 * you use the ring again before taking a Long Rest, you must succeed on a DC 15
 * Constitution saving throw or gain 1 Exhaustion level"). The activation declares
 * the save (`activation.reuseSave`); lighting its state counts a use in a session
 * tracker entry no tracker row owns, which a Long Rest wipes and a Short Rest keeps,
 * so the count needs no rest code of its own. Pure: the character in, a value out.
 */
import { getMagicItem } from "@/data/magic-items";
import type { Grant } from "@/lib/grant-schema";
import type { CharacterDoc, SessionState } from "@/types/character";
import { setExhaustion } from "./vitals";

type WhileActive = Extract<Grant, { type: "while-active" }>;

/** The save a reuse costs. */
export type ReuseSave = NonNullable<NonNullable<WhileActive["activation"]>["reuseSave"]>;

/** The session tracker entry that counts an activation's uses since a Long Rest. */
export function activationUsesKey(activeKey: string): string {
  return `uses:${activeKey}`;
}

/**
 * The reuse save an owned item declares for this state key (the authored key, or
 * the per-copy `<copy>:<authored>` form), or null when none does.
 */
export function declaredReuseSave(
  doc: CharacterDoc,
  activeKey: string
): ReuseSave | null {
  for (const ref of doc.character.equipment) {
    if (!("srdId" in ref)) continue;
    for (const grant of getMagicItem(ref.srdId)?.grants ?? []) {
      if (grant.type !== "while-active" || !grant.activation?.reuseSave) continue;
      if (activeKey === grant.activeKey || activeKey.endsWith(`:${grant.activeKey}`)) {
        return grant.activation.reuseSave;
      }
    }
  }
  return null;
}

/** How many times the state was lit since the last Long Rest. */
export function activationUses(doc: CharacterDoc, activeKey: string): number {
  return doc.session.trackers[activationUsesKey(activeKey)]?.used ?? 0;
}

/**
 * The session with one more use counted, when lighting `activeKey` is a use an
 * item's reuse save watches; the same session otherwise.
 */
export function countActivationUse(doc: CharacterDoc, activeKey: string): SessionState {
  if (!declaredReuseSave(doc, activeKey)) return doc.session;
  const key = activationUsesKey(activeKey);
  return {
    ...doc.session,
    trackers: {
      ...doc.session.trackers,
      [key]: { used: activationUses(doc, activeKey) + 1 },
    },
  };
}

/** The save the latest use costs (every use after the first), or null. */
export function reuseSaveDue(doc: CharacterDoc, activeKey: string): ReuseSave | null {
  if (activationUses(doc, activeKey) < 2) return null;
  return declaredReuseSave(doc, activeKey);
}

/**
 * Book the save's result: a failure gains the declared Exhaustion levels (through
 * the world-first Exhaustion write); a success changes nothing (null).
 */
export function resolveReuseSave(
  doc: CharacterDoc,
  save: ReuseSave,
  passed: boolean
): SessionState | null {
  if (passed) return null;
  return setExhaustion(doc, doc.session.exhaustion + save.exhaustion);
}
