/**
 * Pure play transitions for the character's own conditions: the character in, the
 * next session out. WORLD-FIRST like the vitals: a condition the world can express is
 * booked (or ended) as a world occurrence and the commit mirrors the chips; a missing
 * or rejecting world keeps the legacy chip write alone.
 */
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import {
  planSelfConditionApply,
  planSelfConditionEnd,
} from "@/lib/mechanics-world-store";
import type { CharacterDoc, SessionState } from "@/types/character";
import { commitWorldCondition } from "./world-commit";

/**
 * Add a condition, or null when it is already on. The chip always lights: the mirror
 * only moves chips on an engine transition, and a world that still holds a condition
 * the DM's card removed sees none.
 */
export function addCondition(doc: CharacterDoc, condition: string): SessionState | null {
  if (doc.session.conditions.includes(condition)) return null;
  const engine = commitWorldCondition(doc, "condition-apply", (uid, world, id) =>
    planSelfConditionApply(doc, uid, world, condition, id)
  );
  const base = engine ? engine.session : doc.session;
  return base.conditions.includes(condition)
    ? base
    : { ...base, conditions: [...base.conditions, condition] };
}

/**
 * Remove a condition, or null when it is not on. A world-owned condition ends through
 * the kernel's end machinery (`worldActionId` is its undo pairing). Dropping Invisible
 * also forgets the hidden find-DC.
 */
export function removeCondition(
  doc: CharacterDoc,
  condition: string
): { session: SessionState; worldActionId: string | null } | null {
  if (!effectiveSessionConditions(doc.session).includes(condition)) return null;
  const engine = commitWorldCondition(doc, "condition-end", (uid, world, id) =>
    planSelfConditionEnd(doc, uid, world, condition, id)
  );
  const base = engine ? engine.session : doc.session;
  const clearsHiddenDc = condition === "invisible" && doc.session.hiddenDc !== undefined;
  return {
    session: {
      ...base,
      conditions: base.conditions.filter((c) => c !== condition),
      concentrationConditions: doc.session.concentrationConditions?.filter(
        (id) => id !== condition
      ),
      ...(clearsHiddenDc ? { hiddenDc: undefined } : {}),
    },
    worldActionId: engine?.actionId ?? null,
  };
}
