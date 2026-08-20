import type { CombatEffectLifetime } from "@/data/types";
import type {
  ActiveCombatEffect,
  CombatantRef,
  CombatEffectOp,
} from "@/types/combat-effect";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCombatantRef(value: unknown): value is CombatantRef {
  if (!isRecord(value) || !isString(value.combatantId)) return false;
  if (value.kind === "monster") {
    return Object.keys(value).every((key) => key === "kind" || key === "combatantId");
  }
  return (
    value.kind === "pc" &&
    isString(value.memberUid) &&
    isString(value.characterId) &&
    Object.keys(value).every(
      (key) =>
        key === "kind" ||
        key === "combatantId" ||
        key === "memberUid" ||
        key === "characterId"
    )
  );
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

function isCombatEffectLifetime(value: unknown): value is CombatEffectLifetime {
  if (!isRecord(value)) return false;
  if (value.kind === "source-end" || value.kind === "manual") return true;
  if (value.kind === "phase-end") return isString(value.phaseId);
  if (value.kind === "turn-boundary") {
    return (
      (value.subject === "source" || value.subject === "target") &&
      (value.phase === "turn-start" || value.phase === "turn-end") &&
      Number.isSafeInteger(value.offsetTurns) &&
      (value.offsetTurns as number) >= 0
    );
  }
  return (
    value.kind === "elapsed" &&
    Number.isSafeInteger(value.amount) &&
    (value.amount as number) > 0 &&
    (value.unit === "round" ||
      value.unit === "minute" ||
      value.unit === "hour" ||
      value.unit === "day")
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
  // Stored occurrences written by the deleted effect-program runtime carried a
  // `programOwner` mutation identity (and `program-standing` payloads). Nothing
  // produces or executes them anymore, so a remnant is dropped at this read
  // boundary instead of projecting a rule no runtime owns.
  const notLegacyProgramOwned = value.programOwner === undefined;
  const validAuthoredLifetime =
    value.authoredLifetime === undefined ||
    isCombatEffectLifetime(value.authoredLifetime);
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
    notLegacyProgramOwned &&
    validAuthoredLifetime &&
    validBindings &&
    validApplied &&
    isCombatEffectDuration(value.duration)
  );
}

export function conformActiveCombatEffects(value: unknown): ActiveCombatEffect[] {
  return Array.isArray(value) ? value.filter(isActiveCombatEffect) : [];
}

/** Structural normalization for one untrusted ledger entry. Causal validation
 * remains history-dependent and belongs to the occurrence fold. */
export function conformCombatEffectOp(value: unknown): CombatEffectOp | null {
  if (!isRecord(value) || !isString(value.id)) return null;
  if (value.kind === "apply") {
    return isActiveCombatEffect(value.effect)
      ? { id: value.id, kind: "apply", effect: value.effect }
      : null;
  }
  if (
    !isString(value.effectId) ||
    !isString(value.actorId) ||
    !isString(value.targetId)
  ) {
    return null;
  }
  if (value.kind === "revoke") {
    return {
      id: value.id,
      kind: "revoke",
      effectId: value.effectId,
      actorId: value.actorId,
      targetId: value.targetId,
    };
  }
  if (
    value.kind !== "set-active" ||
    !isString(value.expectedHeadOpId) ||
    typeof value.active !== "boolean"
  ) {
    return null;
  }
  return {
    id: value.id,
    kind: "set-active",
    effectId: value.effectId,
    actorId: value.actorId,
    targetId: value.targetId,
    expectedHeadOpId: value.expectedHeadOpId,
    active: value.active,
  };
}
