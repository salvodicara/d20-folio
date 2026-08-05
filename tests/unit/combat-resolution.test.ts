/**
 * combat-resolution — the shared SOLO/encounter resolution plan and deterministic
 * consequence math.
 *
 * Two shape signals drive it: `summary.instances > 1` (Magic Missile's darts, Scorching
 * Ray's rays — a multi-select attack capped at that count, Phase 2), and `summary.area`
 * (a Fireball-class burst — an UNBOUNDED multi-select SAVE declaration, Phase 3). The
 * `area` flag is what finally distinguishes an AoE save-spell (Fireball) from a
 * single-target save cantrip (Sacred Flame): both are `saveAbility` + `damage`, but only
 * the area one opens a multi-target save capture. Every other single-target action — a
 * weapon swing, a single-instance/save cantrip — stays single.
 *
 * The ENGINE's population of `summary.instances` (3 for Magic Missile / Scorching Ray,
 * ABSENT for Fireball) is proven upstream in `smart-tracker.test.ts` ("Magic Missile
 * carries instances=3…", "a single-roll spell carries NO instances"); here we pin the
 * DECISION that reads it. Blind spot: this suite builds minimal action fixtures rather
 * than resolving the full engine, so it cannot see a regression in that population —
 * that is the smart-tracker suite's job.
 */

import { describe, it, expect } from "vitest";
import {
  combatResolutionSpec,
  shouldResolveCombatAction,
  actionRiderConditions,
  combatDamageParts,
  resolveCombatDamage,
  resolveCombatDamagePackets,
  shouldResolveSoloAction,
} from "@/lib/combat-resolution";
import type { DamageDefenses } from "@/lib/damage-intake";
import type { ActionSummary, ResolvedAction } from "@/lib/smart-tracker";

/** A minimal {@link ResolvedAction} carrying only what the scope decision reads
 *  (`source` + `summary`); every other field is a benign default. */
function makeAction(
  source: ResolvedAction["source"],
  summary: ActionSummary
): ResolvedAction {
  return {
    id: `${source}-x`,
    name: source,
    nameLoc: { custom: source },
    type: "action",
    source,
    spellLevel: source === "spell" ? 1 : null,
    concentration: false,
    summary,
    costsSlot: false,
    pinned: false,
    defaultPinned: false,
  };
}

describe("combatResolutionSpec — target shape and outcome", () => {
  it("defers recurring-only damage until the active-spell row is used", () => {
    const cast = makeAction("spell", {
      damage: "2d6",
      resolveOnCast: false,
      recurrence: "bonus-action-move",
    });
    expect(shouldResolveCombatAction(cast)).toBe(false);
    expect(
      shouldResolveCombatAction({
        ...cast,
        summary: { ...cast.summary, recurringUse: true },
      })
    ).toBe(true);
  });
  it("a weapon swing is always single-target (cap 1)", () => {
    expect(
      combatResolutionSpec(makeAction("weapon", { damage: "1d8+3" })).targetCap
    ).toBe(1);
  });

  it("a single-target save cantrip is single-target (no instances/area → cap 1)", () => {
    // Sacred Flame's shape: a save + damage, NO instances, NO area.
    expect(
      combatResolutionSpec(makeAction("spell", { saveDC: 15, damage: "1d8" })).targetCap
    ).toBe(1);
  });

  it("a multi-instance spell caps at its instance count (Magic Missile 3, Scorching Ray 3)", () => {
    expect(
      combatResolutionSpec(makeAction("spell", { damage: "1d4+1", instances: 3 }))
        .targetCap
    ).toBe(3);
    expect(
      combatResolutionSpec(makeAction("spell", { damage: "2d6", instances: 3 })).targetCap
    ).toBe(3);
  });

  it("models a one-roll bonus as one fixed component, never as every instance", () => {
    const parts = combatDamageParts(
      makeAction("spell", {
        damage: "1d4+1",
        damageType: "force",
        instances: 3,
        oneRollDamageBonus: 4,
      })
    );
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ id: "primary", formula: "1d4+1" });
    expect(parts[1]).toMatchObject({
      id: "one-roll-bonus",
      target: "one-roll",
      fixedAmount: 4,
    });
  });

  it("preserves a damage rider's per-hit type choice as a resolvable component", () => {
    const parts = combatDamageParts(
      makeAction("weapon", {
        damage: "1d12+3",
        damageType: "slashing",
        extraDamage: [
          {
            dice: "1d6+1",
            damageType: "radiant",
            damageTypeChoices: ["radiant", "necrotic"],
            oncePerTurn: true,
            sourceName: "Divine Fury",
          },
        ],
      })
    );
    expect(parts[1]).toMatchObject({
      id: "extra-0",
      formula: "1d6+1",
      damageTypes: ["radiant", "necrotic"],
      typeMode: "choice",
      sourceName: "Divine Fury",
    });
  });

  it("instances of 1 (or 0) is treated as single-target (never < 1)", () => {
    expect(combatResolutionSpec(makeAction("spell", { instances: 1 })).targetCap).toBe(1);
  });

  it("an AREA save spell is UNBOUNDED (Fireball class — cap Infinity)", () => {
    expect(
      combatResolutionSpec(makeAction("spell", { saveDC: 15, damage: "8d6", area: true }))
        .targetCap
    ).toBe(Infinity);
  });

  it("models group healing without treating one shared roll as separate rolls", () => {
    const spec = combatResolutionSpec(
      makeAction("spell", {
        healing: "2d4+4",
        targeting: { affinity: "ally", maxTargets: 6, sharedAmount: true },
      })
    );
    expect(spec).toMatchObject({
      targetCap: 6,
      targetAffinity: "ally",
      hasHealing: true,
      sharedAmount: true,
    });
  });

  it("preserves an explicit any-creature target affinity", () => {
    expect(
      combatResolutionSpec(
        makeAction("spell", {
          targeting: { affinity: "any", maxTargets: 1 },
          conditionApplication: { options: ["invisible"], on: "automatic" },
        })
      ).targetAffinity
    ).toBe("any");
  });

  it("resolves a held-die grant in encounters but keeps another-creature grants manual in solo", () => {
    const inspiration = makeAction("feature", {
      grantedDie: { kind: "bardic-inspiration", die: "d6" },
      targeting: { affinity: "ally", maxTargets: 1, excludeSelf: true },
    });
    expect(combatResolutionSpec(inspiration)).toMatchObject({
      hasGrantedDie: true,
      targetAffinity: "ally",
      excludeSelf: true,
      targetCap: 1,
    });
    expect(shouldResolveCombatAction(inspiration)).toBe(true);
    expect(shouldResolveSoloAction(inspiration)).toBe(false);
  });

  it("resolves a non-stacking Heroic Inspiration grant through the same ally target seam", () => {
    const inspiration = makeAction("feature", {
      grantsHeroicInspiration: true,
      targeting: { affinity: "ally", maxTargets: 2, excludeSelf: true },
    });
    expect(combatResolutionSpec(inspiration)).toMatchObject({
      hasHeroicInspiration: true,
      targetAffinity: "ally",
      excludeSelf: true,
      targetCap: 2,
    });
    expect(shouldResolveCombatAction(inspiration)).toBe(true);
    expect(shouldResolveSoloAction(inspiration)).toBe(false);
  });

  it("routes stabilization through the shared ally resolver in solo and encounters", () => {
    const stabilize = makeAction("feature", {
      stabilize: true,
      targeting: { affinity: "ally", maxTargets: 1 },
    });
    expect(combatResolutionSpec(stabilize)).toMatchObject({
      stabilizes: true,
      targetAffinity: "ally",
      targetCap: 1,
    });
    expect(shouldResolveCombatAction(stabilize)).toBe(true);
    expect(shouldResolveSoloAction(stabilize)).toBe(true);
  });

  it("routes observed incoming damage through the self resolver", () => {
    const deflect = makeAction("feature", {
      damageReduction: {
        dice: "1d10",
        bonus: 6,
        damageTypes: ["bludgeoning", "piercing", "slashing"],
      },
      targeting: { affinity: "self", maxTargets: 1 },
    });
    expect(combatResolutionSpec(deflect)).toMatchObject({
      kind: "automatic",
      targetAffinity: "self",
      targetCap: 1,
      hasDamage: true,
      damageReduction: { dice: "1d10", bonus: 6 },
    });
    expect(shouldResolveCombatAction(deflect)).toBe(true);
    expect(shouldResolveSoloAction(deflect)).toBe(true);
  });

  it("plans a target-bound standing grant by catalogue reference", () => {
    const action: ResolvedAction = {
      ...makeAction("spell", {}),
      id: "spell-warding-bond",
      spellId: "warding-bond",
      slotLevel: 3,
      concentration: true,
      standingEffect: {
        sourceId: "warding-bond",
        activeKey: "spell-warding-bond",
        targetAffinity: "ally",
        excludeSelf: true,
        maxRounds: 10,
      },
    };

    expect(combatResolutionSpec(action)).toMatchObject({
      targetAffinity: "ally",
      excludeSelf: true,
      targetCap: 1,
      standingEffect: {
        source: {
          kind: "spell",
          id: "warding-bond",
          actionId: "spell-warding-bond",
          castLevel: 3,
        },
        payload: { kind: "grant-group", activeKey: "spell-warding-bond" },
        lifetime: { concentration: true, maxRounds: 10 },
      },
    });
    expect(shouldResolveCombatAction(action)).toBe(true);
    expect(shouldResolveSoloAction(action)).toBe(false);
  });

  it("models a distributed healing pool independently from target count", () => {
    const spec = combatResolutionSpec(
      makeAction("spell", {
        healing: "700",
        healingPool: 700,
        targeting: { affinity: "ally" },
      })
    );
    expect(spec.targetCap).toBe(Infinity);
    expect(spec.effectPool).toBe(700);
    expect(spec.sharedAmount).toBe(false);
  });

  it("models full healing without asking for a rolled amount", () => {
    expect(
      combatResolutionSpec(
        makeAction("spell", { healingMode: "full", targeting: { affinity: "ally" } })
      )
    ).toMatchObject({ hasHealing: true, healingMode: "full", targetAffinity: "ally" });
  });

  it("keeps a condition-only save as a real deterministic resolution", () => {
    expect(
      combatResolutionSpec(
        makeAction("spell", {
          saveAbility: "WIS",
          conditionApplication: {
            options: ["frightened"],
            on: "failed-save",
          },
        })
      )
    ).toMatchObject({
      kind: "save",
      targetCap: 1,
      conditionApplication: {
        options: ["frightened"],
        on: "failed-save",
      },
    });
  });

  it("keeps save-only table effects targetable without inventing a condition", () => {
    expect(
      combatResolutionSpec(
        makeAction("spell", {
          saveAbility: "WIS",
          area: true,
        })
      )
    ).toMatchObject({
      kind: "save",
      targetCap: Infinity,
    });
  });

  it("models a distributed temporary-HP pool for allies", () => {
    expect(
      combatResolutionSpec(
        makeAction("spell", {
          tempHpPool: 120,
          targeting: { affinity: "ally", maxTargets: 6 },
        })
      )
    ).toMatchObject({
      hasTempHp: true,
      effectPool: 120,
      targetAffinity: "ally",
      targetCap: 6,
    });
  });
});

describe("combatResolutionSpec — every saving-throw action", () => {
  it("an area save spell resolves by a save", () => {
    expect(
      combatResolutionSpec(makeAction("spell", { saveDC: 15, damage: "8d6", area: true }))
        .kind
    ).toBe("save");
  });

  it("a single-target save cantrip resolves by a save too", () => {
    expect(
      combatResolutionSpec(makeAction("spell", { saveDC: 15, damage: "1d8" })).kind
    ).toBe("save");
  });

  it("a multi-instance attack and a weapon do NOT", () => {
    expect(
      combatResolutionSpec(makeAction("spell", { damage: "2d6", instances: 3 })).kind
    ).toBe("automatic");
    expect(combatResolutionSpec(makeAction("weapon", { damage: "1d8+3" })).kind).toBe(
      "attack"
    );
  });
});

describe("actionRiderConditions — modelled applied-condition riders (Phase 3)", () => {
  it("a Topple-mastery weapon carries the prone rider", () => {
    expect(
      actionRiderConditions(makeAction("weapon", { masteryDetail: { toppleDc: 13 } }))
    ).toEqual(["prone"]);
  });

  it("an action with no modelled condition rider carries none", () => {
    expect(actionRiderConditions(makeAction("weapon", { damage: "1d8+3" }))).toEqual([]);
    expect(
      actionRiderConditions(
        makeAction("spell", { saveDC: 15, damage: "8d6", area: true })
      )
    ).toEqual([]);
  });
});

describe("shouldResolveCombatAction — which commits open the resolver", () => {
  it("a weapon swing opens it (Phase 1)", () => {
    expect(shouldResolveCombatAction(makeAction("weapon", { damage: "1d8" }))).toBe(true);
  });

  it("a multi-target action opens it (Phase 2)", () => {
    expect(
      shouldResolveCombatAction(makeAction("spell", { damage: "1d4+1", instances: 3 }))
    ).toBe(true);
  });

  it("an area save spell opens it (Phase 3)", () => {
    expect(
      shouldResolveCombatAction(
        makeAction("spell", { saveDC: 15, damage: "8d6", area: true })
      )
    ).toBe(true);
  });

  it("a single-target save spell opens it (Vicious Mockery regression)", () => {
    expect(
      shouldResolveCombatAction(makeAction("spell", { saveDC: 15, damage: "1d8" }))
    ).toBe(true);
  });

  it("a condition-curing spell opens it and defaults to ally targets", () => {
    const cure = makeAction("spell", {
      conditionRemoval: { options: ["poisoned"], max: 1 },
    });
    expect(shouldResolveCombatAction(cure)).toBe(true);
    expect(combatResolutionSpec(cure).targetAffinity).toBe("ally");
  });

  it("a consumable-producing spell does not pretend to heal on cast", () => {
    const goodberry = makeAction("spell", {
      healing: "1",
      healingMode: "consumable",
    });
    expect(combatResolutionSpec(goodberry).hasHealing).toBe(false);
    expect(shouldResolveCombatAction(goodberry)).toBe(false);
  });

  it("a feature with no target-facing modeled consequence stays one-tap", () => {
    expect(shouldResolveCombatAction(makeAction("feature", { die: "d6" }))).toBe(false);
  });

  it("opens SOLO only for consequences the app can apply to the current hero", () => {
    expect(
      shouldResolveSoloAction(
        makeAction("feature", { healApply: { dice: "1d10", bonus: 5 } })
      )
    ).toBe(true);
    const selfHeal = makeAction("feature", {
      healApply: { dice: "1d6", bonus: 3 },
      targeting: { affinity: "self", maxTargets: 1 },
    });
    expect(combatResolutionSpec(selfHeal).targetAffinity).toBe("self");
    expect(shouldResolveSoloAction(selfHeal)).toBe(true);
    expect(
      shouldResolveSoloAction(
        makeAction("spell", { tempHpApply: { dice: "2d4", bonus: 4 } })
      )
    ).toBe(true);
    expect(shouldResolveSoloAction(makeAction("weapon", { damage: "1d8+3" }))).toBe(
      false
    );
    expect(
      shouldResolveSoloAction(
        makeAction("spell", {
          targeting: { affinity: "ally", maxTargets: 1 },
          conditionApplication: { options: ["invisible"], on: "automatic" },
        })
      )
    ).toBe(true);
  });
});

describe("resolveCombatDamage — typed deterministic consequences", () => {
  const defenses: DamageDefenses = {
    allDamageResistance: false,
    resistances: new Set(["fire"]),
    immunities: new Set(["cold"]),
    vulnerabilities: new Set(["radiant"]),
    sourceResistances: new Set(),
    flatReductions: [],
  };

  it("keeps simultaneous damage components separate for their own defenses", () => {
    const action = makeAction("spell", {
      damage: "2d10",
      damageType: "bludgeoning",
      secondaryDamage: { dice: "4d6", damageType: "cold" },
    });
    const [primary, secondary] = combatDamageParts(action);
    if (!primary || !secondary) throw new Error("missing damage fixture parts");
    const resolved = resolveCombatDamage(
      [
        { spec: primary, amount: 11, damageType: "bludgeoning" },
        { spec: secondary, amount: 14, damageType: "cold" },
      ],
      { attack: "hit", save: "failed-save" },
      "none",
      defenses
    );
    expect(resolved).toMatchObject({ rawTotal: 25, netTotal: 11 });
  });

  it("applies save-halving before resistance, per damage component", () => {
    const action = makeAction("spell", {
      damage: "8d6",
      damageType: "fire",
      saveAbility: "DEX",
    });
    const [part] = combatDamageParts(action);
    if (!part) throw new Error("missing damage fixture part");
    const resolved = resolveCombatDamage(
      [{ spec: part, amount: 25, damageType: "fire" }],
      { attack: "hit", save: "saved" },
      "half",
      defenses
    );
    expect(resolved).toMatchObject({ rawTotal: 12, netTotal: 6 });
  });

  it("applies Graze only on a miss and never asks the table for a die result", () => {
    const action = makeAction("weapon", {
      damage: "1d10+3",
      damageType: "slashing",
      masteryDetail: { grazeDamage: 3 },
    });
    const parts = combatDamageParts(action);
    expect(parts.find((part) => part.id === "graze")).toMatchObject({
      fixedAmount: 3,
      appliesOn: "miss",
    });
    const resolved = resolveCombatDamage(
      parts.map((part) => ({
        spec: part,
        amount: part.fixedAmount ?? 12,
        damageType: "slashing" as const,
      })),
      { attack: "miss", save: "failed-save" },
      "none"
    );
    expect(resolved.netTotal).toBe(3);
  });

  it("gates hybrid attack and save components independently", () => {
    const action = makeAction("spell", {
      attackBonus: 7,
      saveAbility: "DEX",
      damage: "1d10",
      damageType: "piercing",
      secondaryDamage: { dice: "2d6", damageType: "cold" },
    });
    const [attackPart, savePart] = combatDamageParts(action);
    if (!attackPart || !savePart) throw new Error("missing hybrid fixture parts");
    expect(attackPart.resolution).toBe("attack");
    expect(savePart.resolution).toBe("save");
    const resolved = resolveCombatDamage(
      [
        { spec: attackPart, amount: 8, damageType: "piercing" },
        { spec: savePart, amount: 7, damageType: "cold" },
      ],
      { attack: "miss", save: "failed-save" },
      "none"
    );
    expect(resolved).toMatchObject({ rawTotal: 7, netTotal: 7 });
  });

  it("resolves resistance per separate damage instance, including rounding", () => {
    const action = makeAction("spell", { damage: "2d6", damageType: "fire" });
    const [part] = combatDamageParts(action);
    if (!part) throw new Error("missing multi-instance fixture part");
    const resolved = resolveCombatDamage(
      [
        { spec: part, amount: 3, damageType: "fire" },
        { spec: part, amount: 3, damageType: "fire" },
      ],
      { attack: "hit", save: "failed-save" },
      "none",
      defenses
    );
    expect(resolved).toMatchObject({ rawTotal: 6, netTotal: 2 });
  });

  it("preserves ordered hit packets and binds a once-per-use rider to the first", () => {
    const action = makeAction("spell", {
      attackBonus: 7,
      damage: "1d6",
      damageType: "fire",
      secondaryDamage: { dice: "1d8", damageType: "radiant" },
    });
    const [primary, rider] = combatDamageParts(action);
    if (!primary || !rider) throw new Error("missing packet fixture parts");

    const packets = resolveCombatDamagePackets(
      [
        { spec: primary, amount: 3, damageType: "fire", instance: 0 },
        { spec: primary, amount: 5, damageType: "fire", instance: 1 },
        { spec: rider, amount: 4, damageType: "radiant" },
      ],
      { attack: "hit", save: "failed-save" },
      "none",
      defenses
    );

    expect(packets.map(({ rawTotal, netTotal }) => ({ rawTotal, netTotal }))).toEqual([
      { rawTotal: 7, netTotal: 9 },
      { rawTotal: 5, netTotal: 2 },
    ]);
  });
});
