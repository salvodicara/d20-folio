import type { ActiveCombatEffect, CombatantRef } from "@/types/combat-effect";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCombatantRef(value: unknown): value is CombatantRef {
  if (!isRecord(value) || !isString(value.combatantId)) return false;
  if (value.kind === "monster") {
    return (
      value.tokenIndex === undefined ||
      (typeof value.tokenIndex === "number" &&
        Number.isInteger(value.tokenIndex) &&
        value.tokenIndex >= 0)
    );
  }
  return value.kind === "pc" && isString(value.memberUid) && isString(value.characterId);
}

function isCombatEffectDuration(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "encounter") return true;
  if (value.kind === "concentration") {
    return isString(value.actorId) && isString(value.sourceId);
  }
  return (
    value.kind === "turn-boundary" &&
    isString(value.combatantId) &&
    typeof value.round === "number" &&
    Number.isFinite(value.round) &&
    (value.phase === "turn-start" || value.phase === "turn-end")
  );
}

/** The one defensive parser for an effect occurrence, shared by campaign and
 * per-character combat-state IO. */
export function isActiveCombatEffect(value: unknown): value is ActiveCombatEffect {
  if (!isRecord(value)) return false;
  const source = value.source;
  const payload = value.payload;
  const validPayload =
    isRecord(payload) &&
    ((payload.kind === "condition" && isString(payload.conditionId)) ||
      (isString(payload.activeKey) &&
        ((payload.kind === "grant-group" &&
          (payload.phase === undefined ||
            payload.phase === "active" ||
            payload.phase === "aftereffect")) ||
          (payload.kind === "target-mark" &&
            (payload.scope === "marked" ||
              payload.scope === "cursed" ||
              payload.scope === "vowed")))));
  const validBindings =
    value.bindings === undefined ||
    (isRecord(value.bindings) &&
      (value.bindings.spellcastingModifier === undefined ||
        (typeof value.bindings.spellcastingModifier === "number" &&
          Number.isFinite(value.bindings.spellcastingModifier))));
  const validApplied =
    value.applied === undefined ||
    (isRecord(value.applied) &&
      (value.applied.currentHpDelta === undefined ||
        (typeof value.applied.currentHpDelta === "number" &&
          Number.isFinite(value.applied.currentHpDelta))));
  return (
    isString(value.id) &&
    isCombatantRef(value.actor) &&
    isCombatantRef(value.target) &&
    isRecord(source) &&
    (source.kind === "spell" || source.kind === "feature") &&
    isString(source.id) &&
    isString(source.actionId) &&
    (source.castLevel === undefined ||
      (typeof source.castLevel === "number" &&
        Number.isFinite(source.castLevel) &&
        source.castLevel > 0)) &&
    validPayload &&
    validBindings &&
    validApplied &&
    isCombatEffectDuration(value.duration)
  );
}

export function conformActiveCombatEffects(value: unknown): ActiveCombatEffect[] {
  return Array.isArray(value) ? value.filter(isActiveCombatEffect) : [];
}
