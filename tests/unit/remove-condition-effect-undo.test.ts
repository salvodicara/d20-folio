/**
 * Removing a condition that only a solo condition effect holds (a stored
 * `combat/state` occurrence, no chip), then undoing it, brings the condition back:
 * the effects are restored before the session, so the restored session is projected
 * with them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({}));

import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { sessionToPlayStateV1 } from "@/lib/session-state-codec";
import { useCharacterStore } from "@/stores/characterStore";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import { makeCharacterDoc } from "./_helpers";

const held = (): string[] => {
  const session = useCharacterStore.getState().character?.session;
  return session ? effectiveSessionConditions(session) : [];
};

const effect: ActiveCombatEffect = {
  id: "hold-1",
  actor: { kind: "monster", combatantId: "mage" },
  target: { kind: "pc", combatantId: "self", memberUid: "u1", characterId: "c1" },
  source: { kind: "spell", id: "hold-person", actionId: "hold-person" },
  payload: { kind: "condition", conditionId: "paralyzed" },
  duration: { kind: "encounter" },
};

beforeEach(() => {
  useCharacterStore.getState().setCharacter(null);
  const doc = makeCharacterDoc({ classId: "fighter", level: 3 });
  doc.id = "c1";
  useCharacterStore.setState({ readonly: false, loading: false, error: null });
  useCharacterStore.getState().setCharacter(doc);
  useCharacterStore.getState().hydrateCombatState({
    hp: { current: doc.session.hp.current, temp: 0 },
    conditions: [],
    initiativeRoll: null,
    deathSaves: { successes: 0, failures: 0 },
    round: 1,
    activeEffects: [effect],
    playState: sessionToPlayStateV1(doc.session),
  });
});

describe("removeConditionSilent on an effect-held condition", () => {
  it("removes it, and its undo brings the condition and its effect back", () => {
    expect(held()).toContain("paralyzed");
    const undo = useCharacterStore.getState().removeConditionSilent("paralyzed");
    expect(held()).not.toContain("paralyzed");
    undo?.();
    expect(useCharacterStore.getState().combatLegacyActiveEffects).toEqual([effect]);
    expect(held()).toContain("paralyzed");
  });
});
