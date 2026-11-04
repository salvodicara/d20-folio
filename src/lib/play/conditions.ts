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
import { potionStatesGiving } from "@/lib/potion-states";
import type { CharacterDoc, SessionState } from "@/types/character";
import { endFormIfDue } from "./forms";
import { endStateKeys } from "./states";
import { commitWorldCondition } from "./world-commit";

/**
 * Add a condition, or null when it is already on. The chip always lights: the mirror
 * only moves chips on an engine transition, and a world that still holds a condition
 * the DM's card removed sees none. A form that ends on the condition ends with it.
 */
export function addCondition(
  doc: CharacterDoc,
  condition: string,
  worldActionId?: string,
  /** The combatant that caused it, when known (M3: Frightened's source). */
  sourceId?: string
): SessionState | null {
  if (doc.session.conditions.includes(condition)) return null;
  const engine = commitWorldCondition(
    doc,
    "condition-apply",
    (uid, world, id) => planSelfConditionApply(doc, uid, world, condition, id),
    worldActionId
  );
  const base = engine ? engine.session : doc.session;
  const chipped = base.conditions.includes(condition)
    ? base
    : { ...base, conditions: [...base.conditions, condition] };
  const next = sourceId
    ? {
        ...chipped,
        conditionSources: { ...chipped.conditionSources, [condition]: sourceId },
      }
    : chipped;
  // Incapacitated ends a form whose rule ends on it (Wild Shape).
  return endFormIfDue(doc, next);
}

/**
 * Remove a condition, or null when it is not on. A world-owned condition ends through
 * the kernel's end machinery (`worldActionId` is its undo pairing). Dropping Invisible
 * also forgets the hidden find-DC.
 */
export function removeCondition(
  doc: CharacterDoc,
  condition: string,
  givenActionId?: string
): { session: SessionState; worldActionId: string | null } | null {
  if (!effectiveSessionConditions(doc.session).includes(condition)) return null;
  const engine = commitWorldCondition(
    doc,
    "condition-end",
    (uid, world, id) => planSelfConditionEnd(doc, uid, world, condition, id),
    givenActionId
  );
  // Removing a chip ends that chip only: being found ends a Hide, not the Potion of
  // Invisibility running under it. With no chip of its own, the condition comes from
  // a lit potion state, which ends with it.
  const ownChip = doc.session.conditions.includes(condition);
  const base = endStateKeys(
    engine ? engine.session : doc.session,
    ownChip ? [] : potionStatesGiving(doc.session.activeFeatures ?? [], condition)
  );
  const clearsHiddenDc = condition === "invisible" && doc.session.hiddenDc !== undefined;
  return {
    session: {
      ...base,
      conditions: base.conditions.filter((c) => c !== condition),
      concentrationConditions: doc.session.concentrationConditions?.filter(
        (id) => id !== condition
      ),
      ...(clearsHiddenDc ? { hiddenDc: undefined } : {}),
      ...forgetChipSource(base, condition),
    },
    worldActionId: engine?.actionId ?? null,
  };
}

/** A removed chip forgets its source and the table's answer about it. */
function forgetChipSource(
  session: SessionState,
  condition: string
): Pick<SessionState, "conditionSources" | "seesSource"> {
  const key = `condition:${condition}`;
  const out: Pick<SessionState, "conditionSources" | "seesSource"> = {};
  if (session.conditionSources && condition in session.conditionSources) {
    out.conditionSources = withoutKey(session.conditionSources, condition);
  }
  if (session.seesSource && key in session.seesSource) {
    out.seesSource = withoutKey(session.seesSource, key);
  }
  return out;
}

function withoutKey<V>(record: Record<string, V>, key: string): Record<string, V> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

/** The table answers whether the character sees a condition instance's source;
 *  `null` forgets the answer. Null when nothing changes. */
export function setSeesSource(
  doc: CharacterDoc,
  key: string,
  sees: boolean | null
): SessionState | null {
  const current = doc.session.seesSource ?? {};
  if ((current[key] ?? null) === sees) return null;
  const next = sees === null ? withoutKey(current, key) : { ...current, [key]: sees };
  return { ...doc.session, seesSource: next };
}
