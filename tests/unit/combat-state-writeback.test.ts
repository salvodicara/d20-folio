/**
 * `projectCombatState` — the fight's outcome written back onto the LEGACY personal
 * `combat/state` document (stage 6 design §5, D1).
 *
 * The contract under test is deliberately narrow: the combat trio (HP current/temp, conditions,
 * death saves) comes from the folded entity, and EVERY other field of the previous document —
 * `playState` above all — is preserved byte for byte. A regression here silently discards a
 * player's spell slots, trackers and inventory the moment they leave a table.
 */
import { describe, expect, it, vi } from "vitest";

// The module reaches `firebase/firestore` for the `updatedAt` sentinel alone. Mocked so this
// file stays Firebase-free in CI (tests/unit/pure-modules-guard.test.ts) and so the stamp is a
// value the assertions can name.
vi.mock("firebase/firestore", () => ({
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
}));

import { encodeLegacyWriteBack, projectCombatState } from "@/lib/combat-state-writeback";
import type { CombatState } from "@/types/combat-state";
import type { Effect, EffectPayload, Entity } from "@/lib/combat/types";
import { testEntity } from "@tests/unit/combat/__helpers__/entities";

function previous(): CombatState {
  return {
    hp: { current: 3, temp: 9 },
    conditions: ["poisoned"],
    bardicInspirationDie: "d8",
    heroicInspiration: true,
    initiativeRoll: 14,
    deathSaves: { successes: 1, failures: 2 },
    round: 4,
    recentActions: [{ id: "1", targetIds: ["monster-1"], outcome: "hit", round: 3 }],
    playState: { version: 1, state: { exhaustion: 2 } },
  };
}

function effect(id: string, target: string, payload: EffectPayload): Effect {
  return {
    id,
    source: { entity: "dm", mechanic: "m", action: "a", castLevel: null },
    target,
    payload,
    lifetime: { kind: "manual" },
    concentration: false,
  };
}

function condition(
  id: string,
  target: string,
  name: Extract<EffectPayload, { kind: "condition" }>["condition"]
): Effect {
  return effect(id, target, { kind: "condition", condition: name });
}

const pc: Entity = testEntity({
  id: "pc-marco",
  kind: "pc",
  hp: 17,
  maxHp: 24,
  tempHp: 4,
  deathSaves: { successes: 2, failures: 1 },
});

describe("projectCombatState", () => {
  it("takes HP, temp HP and death saves from the entity's vitals", () => {
    const next = projectCombatState(previous(), pc, []);
    expect(next.hp).toEqual({ current: 17, temp: 4 });
    expect(next.deathSaves).toEqual({ successes: 2, failures: 1 });
  });

  it("writes temp 0 when the entity holds no temporary hit points", () => {
    const next = projectCombatState(
      previous(),
      testEntity({ id: "pc-marco", hp: 5 }),
      []
    );
    expect(next.hp).toEqual({ current: 5, temp: 0 });
  });

  it("takes the conditions from the entity's own condition effects, sorted and deduplicated", () => {
    const next = projectCombatState(previous(), pc, [
      condition("e2", "pc-marco", "restrained"),
      condition("e1", "pc-marco", "prone"),
      condition("e3", "pc-marco", "prone"),
    ]);
    expect(next.conditions).toEqual(["prone", "restrained"]);
  });

  it("ignores effects on another entity and effects that are not conditions", () => {
    const next = projectCombatState(previous(), pc, [
      condition("e1", "ogre-1", "frightened"),
      effect("e2", "pc-marco", { kind: "standing", facts: { acBonus: 2 } }),
      effect("e3", "pc-marco", { kind: "temp-hp" }),
    ]);
    expect(next.conditions).toEqual([]);
  });

  it("preserves every other field of the previous document", () => {
    const before = previous();
    const next = projectCombatState(before, pc, []);
    expect(next.round).toBe(4);
    expect(next.playState).toEqual(before.playState);
    expect(next.recentActions).toEqual(before.recentActions);
    expect(next.initiativeRoll).toBe(14);
    expect(next.bardicInspirationDie).toBe("d8");
    expect(next.heroicInspiration).toBe(true);
  });

  it("does not mutate the previous document", () => {
    const before = previous();
    const snapshot = structuredClone(before);
    projectCombatState(before, pc, [condition("e1", "pc-marco", "prone")]);
    expect(before).toEqual(snapshot);
  });
});

describe("encodeLegacyWriteBack", () => {
  it("projects and then encodes through the document's one sanctioned encoder", () => {
    const data = encodeLegacyWriteBack(previous(), pc, [
      condition("e1", "pc-marco", "prone"),
    ]);
    expect(data).toMatchObject({
      hp: { current: 17, temp: 4 },
      conditions: ["prone"],
      deathSaves: { successes: 2, failures: 1 },
      round: 4,
      playState: { version: 1, state: { exhaustion: 2 } },
      // The stamp every other writer of this document emits.
      updatedAt: "SERVER_TIMESTAMP",
    });
  });

  it("refuses a state the read edge would then refuse forever, rather than writing it", () => {
    const { playState: _playState, ...orphan } = previous();
    void _playState;
    expect(() => encodeLegacyWriteBack(orphan as CombatState, pc, [])).toThrow(
      "Invalid combat play state: missing"
    );
    expect(() =>
      encodeLegacyWriteBack({ ...previous(), playState: { version: 2 } as never }, pc, [])
    ).toThrow(/Invalid combat play state/);
  });
});
