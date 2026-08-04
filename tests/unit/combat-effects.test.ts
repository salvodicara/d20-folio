import { describe, expect, it } from "vitest";
import {
  activeRollModeAdjustments,
  currentHpDeltaForEffect,
  endedEffectSuccessor,
  effectsForTarget,
  foldCombatEffectOps,
  healingBlockedByEffects,
  effectsByActorSource,
  expiredCombatEffects,
  maxHpDeltaForEffect,
  markedTargetForActor,
  resolvePersistentDamage,
  speedAdjustmentByEffects,
  turnBoundaryAfter,
} from "@/lib/combat-effects";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";
import { evaluateGrants } from "@/lib/grants";
import { resolveCombatEffectGrantSources } from "@/lib/resolve-grant-sources";
import { NO_DEFENSES } from "@/lib/damage-intake";

function effect(
  id: string,
  overrides: Partial<ActiveCombatEffect> = {}
): ActiveCombatEffect {
  return {
    id,
    actor: { kind: "monster", combatantId: "caster" },
    target: { kind: "monster", combatantId: "target" },
    source: { kind: "spell", id: "heroism", actionId: "spell-heroism" },
    payload: { kind: "grant-group", activeKey: "spell-heroism" },
    duration: {
      kind: "concentration",
      actorId: "caster",
      sourceId: "heroism",
    },
    ...overrides,
  };
}

function apply(id: string, value = effect(id)): CombatEffectOp {
  return { id: `apply-${id}`, kind: "apply", effect: value };
}

describe("persistent combat effects", () => {
  it("folds idempotently and revokes an exact instance", () => {
    const first = apply("one");
    const operations: CombatEffectOp[] = [
      first,
      first,
      {
        id: "revoke-one",
        kind: "revoke",
        effectId: "one",
        actorId: "caster",
        targetId: "target",
      },
    ];
    expect(foldCombatEffectOps(operations)).toEqual([]);
  });

  it("does not stack equal sources or resurrect the superseded instance", () => {
    const operations: CombatEffectOp[] = [apply("older"), apply("newer")];
    expect(foldCombatEffectOps(operations).map((entry) => entry.id)).toEqual(["newer"]);

    operations.push({
      id: "revoke-newer",
      kind: "revoke",
      effectId: "newer",
      actorId: "caster",
      targetId: "target",
    });
    expect(foldCombatEffectOps(operations)).toEqual([]);
  });

  it("keeps different targets and sources independent", () => {
    const operations = [
      apply("one"),
      apply(
        "two",
        effect("two", {
          target: { kind: "monster", combatantId: "other" },
        })
      ),
      apply(
        "three",
        effect("three", {
          source: { kind: "spell", id: "haste", actionId: "spell-haste" },
          payload: { kind: "grant-group", activeKey: "spell-haste" },
        })
      ),
    ];
    expect(effectsForTarget(operations, "target")).toHaveLength(2);
    expect(effectsForTarget(operations, "other")).toHaveLength(1);
    expect(effectsByActorSource(operations, "caster", "heroism")).toHaveLength(2);
  });

  it("projects Chill Touch healing prevention and Ray of Frost speed loss generically", () => {
    const chill = effect("chill", {
      source: { kind: "spell", id: "chill-touch", actionId: "spell-chill-touch" },
      payload: { kind: "grant-group", activeKey: "spell-chill-touch" },
    });
    const frost = effect("frost", {
      source: { kind: "spell", id: "ray-of-frost", actionId: "spell-ray-of-frost" },
      payload: { kind: "grant-group", activeKey: "spell-ray-of-frost" },
    });
    expect(healingBlockedByEffects([chill, frost])).toBe(true);
    expect(speedAdjustmentByEffects([chill, frost])).toBe(-10);
  });

  it("keeps legacy grouped-monster tokens as distinct targets", () => {
    const first = effect("first", {
      target: { kind: "monster", combatantId: "goblins", tokenIndex: 0 },
    });
    const second = effect("second", {
      target: { kind: "monster", combatantId: "goblins", tokenIndex: 1 },
    });
    const operations = [apply("first", first), apply("second", second)];

    expect(foldCombatEffectOps(operations)).toHaveLength(2);
    expect(effectsForTarget(operations, "goblins", undefined, 0)).toEqual([first]);
    expect(effectsForTarget(operations, "goblins", undefined, 1)).toEqual([second]);
  });

  it("expires at the declared turn boundary", () => {
    const timed = effect("timed", {
      duration: {
        kind: "turn-boundary",
        combatantId: "target",
        round: 2,
        phase: "turn-end",
      },
    });
    const operations = [apply("timed", timed)];
    const base = {
      order: ["caster", "target", "other"],
      round: 2,
    } as const;

    expect(
      foldCombatEffectOps(operations, {
        ...base,
        currentCombatantId: "target",
        phase: "turn-start",
      })
    ).toHaveLength(1);
    expect(
      foldCombatEffectOps(operations, {
        ...base,
        currentCombatantId: "target",
        phase: "turn-end",
      })
    ).toEqual([]);
  });

  it("resolves relative boundaries against exact turn order and phase", () => {
    const position = {
      order: ["ally", "caster", "enemy"],
      round: 4,
      currentCombatantId: "ally",
      phase: "turn-start" as const,
    };
    expect(turnBoundaryAfter("caster", 1, "turn-start", position)).toEqual({
      kind: "turn-boundary",
      combatantId: "caster",
      round: 4,
      phase: "turn-start",
    });
    expect(
      turnBoundaryAfter("caster", 1, "turn-end", {
        ...position,
        currentCombatantId: "caster",
        phase: "turn-end",
      })
    ).toEqual({
      kind: "turn-boundary",
      combatantId: "caster",
      round: 5,
      phase: "turn-end",
    });
  });

  it("binds source values and cast-level scaling without reading recipient stats", () => {
    const heroism = effect("heroism-bound", {
      bindings: { spellcastingModifier: 4 },
    });
    const heroismAggregate = evaluateGrants(resolveCombatEffectGrantSources([heroism]));
    expect(heroismAggregate.startOfTurnRegen[0]?.amount).toBe("4");

    const aid = effect("aid-upcast", {
      source: {
        kind: "spell",
        id: "aid",
        actionId: "spell-aid",
        castLevel: 5,
      },
      payload: { kind: "grant-group", activeKey: "spell-aid" },
      duration: { kind: "encounter" },
    });
    expect(currentHpDeltaForEffect(aid)).toBe(20);
    expect(maxHpDeltaForEffect(aid)).toBe(20);
    const aidAggregate = evaluateGrants(resolveCombatEffectGrantSources([aid]));
    expect(aidAggregate.hpFlat).toBe(20);
  });

  it("resolves resistance, transfer, and a consumed zero-HP floor in one pass", () => {
    const bond = effect("bond", {
      actor: { kind: "monster", combatantId: "bond-source" },
      source: {
        kind: "spell",
        id: "warding-bond",
        actionId: "spell-warding-bond",
      },
      payload: { kind: "grant-group", activeKey: "spell-warding-bond" },
      duration: { kind: "encounter" },
    });
    const ward = effect("ward", {
      source: {
        kind: "spell",
        id: "death-ward",
        actionId: "spell-death-ward",
      },
      payload: { kind: "grant-group", activeKey: "spell-death-ward" },
      duration: { kind: "encounter" },
    });
    expect(
      resolvePersistentDamage([bond, ward], {
        currentHp: 8,
        tempHp: 3,
        incomingDamage: 30,
      })
    ).toEqual({
      targetDamage: 10,
      transfers: [
        {
          target: { kind: "monster", combatantId: "bond-source" },
          amount: 15,
          effectId: "bond",
        },
      ],
      consumedEffectIds: ["ward"],
    });

    expect(
      resolvePersistentDamage([bond], {
        currentHp: 20,
        tempHp: 0,
        incomingDamage: 9,
        damageType: "cold",
        damageSource: "spell",
        defenses: {
          ...NO_DEFENSES,
          resistances: new Set(["cold"]),
        },
      })
    ).toEqual({
      targetDamage: 4,
      transfers: [
        {
          target: { kind: "monster", combatantId: "bond-source" },
          amount: 4,
          effectId: "bond",
        },
      ],
      consumedEffectIds: [],
    });
  });

  it("consumes a zero-HP floor when its recipient starts at the floor", () => {
    const ward = effect("ward-at-one", {
      source: {
        kind: "spell",
        id: "death-ward",
        actionId: "spell-death-ward",
      },
      payload: { kind: "grant-group", activeKey: "spell-death-ward" },
      duration: { kind: "encounter" },
    });
    expect(
      resolvePersistentDamage([ward], {
        currentHp: 1,
        tempHp: 0,
        incomingDamage: 20,
      })
    ).toEqual({
      targetDamage: 0,
      transfers: [],
      consumedEffectIds: ["ward-at-one"],
    });
  });

  it("retargets marks by actor/source/scope and never resurrects the old target", () => {
    const mark = (id: string, targetId: string): ActiveCombatEffect =>
      effect(id, {
        actor: { kind: "monster", combatantId: "ranger" },
        target: { kind: "monster", combatantId: targetId },
        source: {
          kind: "spell",
          id: "hunters-mark",
          actionId: "spell-hunters-mark",
        },
        payload: {
          kind: "target-mark",
          activeKey: "spell-hunters-mark",
          scope: "marked",
        },
      });
    const operations: CombatEffectOp[] = [
      apply("old", mark("old", "goblin-1")),
      apply("new", mark("new", "goblin-2")),
      {
        id: "revoke-new",
        kind: "revoke",
        effectId: "new",
        actorId: "ranger",
        targetId: "goblin-2",
      },
    ];
    expect(markedTargetForActor(operations.slice(0, 2), "ranger", "marked")).toEqual({
      kind: "monster",
      combatantId: "goblin-2",
    });
    expect(markedTargetForActor(operations, "ranger", "marked")).toBeNull();
  });

  it("creates and expires a data-declared target-turn aftereffect", () => {
    const active = effect("haste", {
      source: { kind: "spell", id: "haste", actionId: "spell-haste" },
      payload: { kind: "grant-group", activeKey: "spell-haste" },
    });
    const position = {
      round: 3,
      currentCombatantId: "caster",
      phase: "turn-end" as const,
      order: ["caster", "target"],
    };
    const after = endedEffectSuccessor(active, position);
    expect(after?.duration).toEqual({
      kind: "turn-boundary",
      combatantId: "target",
      round: 3,
      phase: "turn-end",
    });
    if (!after) throw new Error("missing aftereffect");
    const aggregate = evaluateGrants(resolveCombatEffectGrantSources([after]));
    expect(aggregate.speedCapFt).toBe(0);
    expect(aggregate.turnEconomyBlocked).toBe(true);
    expect(
      expiredCombatEffects([apply("haste-after", after)], {
        ...position,
        currentCombatantId: "target",
      })
    ).toEqual([after]);
  });

  it("projects Vicious Mockery as one consumable attack Disadvantage", () => {
    const mockery = effect("mockery", {
      source: {
        kind: "spell",
        id: "vicious-mockery",
        actionId: "spell-vicious-mockery",
      },
      payload: { kind: "grant-group", activeKey: "spell-vicious-mockery" },
    });
    expect(activeRollModeAdjustments([mockery], "attack")).toEqual([
      {
        effect: mockery,
        sourceId: "vicious-mockery",
        rollType: "attack",
        mode: "disadvantage",
        consume: "next",
      },
    ]);
    expect(
      evaluateGrants(resolveCombatEffectGrantSources([mockery])).disadvantages
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "combat-effect:mockery",
          rollType: "attack",
          consume: "next",
        }),
      ])
    );
  });
});
