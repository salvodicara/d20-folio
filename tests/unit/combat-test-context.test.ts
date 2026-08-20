import { describe, expect, it } from "vitest";
import {
  composeCombatAttackContext,
  defaultCombatAttackTableFacts,
  evaluateEnteredCombatD20Test,
  type CombatAttackTableFacts,
} from "@/lib/combat-test-context";

function compose(
  overrides: Partial<Parameters<typeof composeCombatAttackContext>[0]> = {},
  table: Partial<CombatAttackTableFacts> = {}
) {
  return composeCombatAttackContext({
    testId: "longbow:target:0",
    actorId: "hero",
    targetId: "target",
    attackBonus: 7,
    criticalThreshold: 20,
    baseArmorClass: 15,
    attackMode: "ranged",
    actorConditions: [],
    targetConditions: [],
    table: { ...defaultCombatAttackTableFacts("ranged"), ...table },
    ...overrides,
  });
}

function resolve(
  composed: ReturnType<typeof composeCombatAttackContext>,
  faces: readonly number[],
  manualOutcome?: "success" | "failure"
) {
  const result = evaluateEnteredCombatD20Test(composed.context, {
    faces,
    ...(manualOutcome
      ? { manualOutcome, manualOutcomeSourceId: "review:table-ruling" }
      : {}),
  });
  if (!result) throw new Error("expected the composed attack context to resolve");
  return result;
}

describe("combat attack table context", () => {
  it("adds cover to authoritative AC and lets one explicit source ignore it", () => {
    const covered = compose({}, { cover: "three-quarters" });
    expect(covered).toMatchObject({
      baseArmorClass: 15,
      effectiveArmorClass: 20,
      coverBonus: 5,
    });
    expect(resolve(covered, [12]).outcome.status).toBe("failure");

    const ignored = compose(
      {},
      { cover: "three-quarters", coverIgnoredBySourceId: "sharpshooter" }
    );
    expect(ignored).toMatchObject({ effectiveArmorClass: 15, coverBonus: 0 });
    expect(ignored.facts).toContainEqual({
      sourceId: "table:cover:ignored:sharpshooter",
      effect: "cover-ignored",
    });
  });

  it("makes total cover and beyond range ineligible without accepting an override", () => {
    const totalCover = compose({}, { cover: "total" });
    expect(totalCover.context.resolution).toMatchObject({
      kind: "ineligible",
      reasonId: "total-cover",
    });
    expect(resolve(totalCover, []).outcome.status).toBe("ineligible");

    const beyond = compose({}, { rangeBand: "beyond", cover: "total" });
    expect(beyond.context.resolution).toMatchObject({ reasonId: "beyond-range" });
  });

  it("nets unseen creatures, long range, nearby threats, and live external modes", () => {
    const context = compose(
      {
        externalModeAdjustments: [
          { sourceId: "reckless", mode: "advantage" },
          { sourceId: "ward", mode: "disadvantage" },
        ],
      },
      {
        attackerCanSeeTarget: false,
        targetCanSeeAttacker: false,
        rangeBand: "long",
        rangedThreatenedWithinFiveFeet: true,
      }
    );
    expect(context.context.rollRules.advantageSourceIds).toHaveLength(2);
    expect(context.context.rollRules.disadvantageSourceIds).toHaveLength(4);
    expect(resolve(context, [11]).review.mode).toBe("cancelled");
  });

  it("honors Invisible only when the other creature cannot see it", () => {
    const seenAttacker = compose({ actorConditions: ["invisible"] });
    expect(seenAttacker.context.rollRules.advantageSourceIds).toEqual([]);

    const unseenAttacker = compose(
      { actorConditions: ["invisible"] },
      { targetCanSeeAttacker: false }
    );
    expect(unseenAttacker.context.rollRules.advantageSourceIds).toEqual([
      "condition:actor:invisible:unseen-attacker",
    ]);

    const seenInvisibleTarget = compose({ targetConditions: ["invisible"] });
    expect(seenInvisibleTarget.context.rollRules.disadvantageSourceIds).toEqual([]);
    const unseenInvisibleTarget = compose(
      { targetConditions: ["invisible"] },
      { attackerCanSeeTarget: false }
    );
    expect(unseenInvisibleTarget.context.rollRules.disadvantageSourceIds).toEqual([
      "condition:target:invisible:unseen",
    ]);
  });

  it("applies actor condition clauses including Grappled and Frightened exceptions", () => {
    const constrained = compose({
      actorConditions: [
        "blinded",
        "poisoned",
        "prone",
        "restrained",
        "grappled",
        "frightened",
      ],
    });
    expect(constrained.context.rollRules.disadvantageSourceIds).toHaveLength(6);

    const exceptions = compose(
      { actorConditions: ["grappled", "frightened"] },
      { targetIsGrappler: true, frighteningSourceInSight: false }
    );
    expect(exceptions.context.rollRules.disadvantageSourceIds).toEqual([]);
  });

  it("applies every relational target advantage and nets Prone by exact distance", () => {
    const targetConditions = [
      "blinded",
      "paralyzed",
      "petrified",
      "restrained",
      "stunned",
      "unconscious",
      "prone",
    ];
    const nearby = compose({ targetConditions }, { targetWithinFiveFeet: true });
    expect(nearby.context.rollRules.advantageSourceIds).toHaveLength(7);
    expect(nearby.context.rollRules.disadvantageSourceIds).toEqual([]);

    const distant = compose(
      { targetConditions: ["prone"] },
      { targetWithinFiveFeet: false }
    );
    expect(distant.context.rollRules.advantageSourceIds).toEqual([]);
    expect(distant.context.rollRules.disadvantageSourceIds).toEqual([
      "condition:target:prone:beyond-5-feet",
    ]);
  });

  it("forces a critical only on a nearby hit against Paralyzed or Unconscious", () => {
    const nearby = compose(
      { targetConditions: ["paralyzed", "unconscious"] },
      { targetWithinFiveFeet: true }
    );
    expect(resolve(nearby, [8, 14]).outcome).toMatchObject({
      hit: true,
      critical: true,
      naturalCritical: false,
      appliedAutomaticCriticalSourceIds: [
        "condition:target:paralyzed:critical-within-5-feet",
        "condition:target:unconscious:critical-within-5-feet",
      ],
    });

    const distant = compose(
      { targetConditions: ["paralyzed"] },
      { targetWithinFiveFeet: false }
    );
    expect(resolve(distant, [14, 8]).outcome).toMatchObject({
      hit: true,
      critical: false,
    });
  });

  it("preserves natural-one misses, expanded critical ranges, and attributed overrides", () => {
    const context = compose({ criticalThreshold: 19 });
    expect(resolve(context, [1]).outcome).toMatchObject({
      hit: false,
      naturalOne: true,
    });
    expect(resolve(context, [19]).outcome).toMatchObject({
      hit: true,
      critical: true,
      naturalCritical: true,
    });
    expect(resolve(context, [2], "success").outcome).toMatchObject({
      status: "success",
      basis: "table-override",
      hit: true,
      critical: false,
    });
  });

  it("marks an incapacitated attacker ineligible before any physical roll", () => {
    for (const condition of [
      "incapacitated",
      "paralyzed",
      "petrified",
      "stunned",
      "unconscious",
    ]) {
      const context = compose({ actorConditions: [condition] });
      expect(context.context.resolution).toMatchObject({
        kind: "ineligible",
        reasonId: "actor-incapacitated",
      });
      expect(resolve(context, []).review.mode).toBe("not-rolled");
    }
  });
});
