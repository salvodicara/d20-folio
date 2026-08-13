import { describe, expect, it, vi } from "vitest";

import {
  applyCreatureDamage,
  applyDeathSaveOutcome,
  applyObjectDamage,
  clearTemporaryHitPoints,
  conformCreatureVitals,
  conformObjectVitals,
  grantTemporaryHitPoints,
  healCreature,
  killCreature,
  reduceCreatureToZeroHitPoints,
  repairObject,
  reviveCreature,
  stabilizeCreature,
  synchronizeCreatureHitPointMaximum,
  synchronizeObjectHitPointMaximum,
} from "@/lib/vitals";
import type { CreatureVitals } from "@/types/vitals";

const material = {
  characterId: "hero",
  kind: "character-play",
  uid: "user",
} as const;
const source = {
  occurrence: { material, occurrenceId: "ward" },
  ordinal: 1,
} as const;

function alive(current = 10, temporary = 0): CreatureVitals {
  return {
    hitPoints: {
      current,
      temporary: {
        current: temporary,
        sourceOccurrence: temporary === 0 ? null : source,
      },
    },
    zeroHitPoints: null,
  };
}

function dying(successes = 0, failures = 0, temporary = 0): CreatureVitals {
  return {
    hitPoints: {
      current: 0,
      temporary: {
        current: temporary,
        sourceOccurrence: temporary === 0 ? null : source,
      },
    },
    zeroHitPoints: { failures, kind: "dying", successes },
  };
}

describe("creature vitals persistence", () => {
  it("clones and freezes the one exact state", () => {
    const input = alive(8, 3);
    const result = conformCreatureVitals(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.hitPoints.temporary)).toBe(true);
  });

  it("rejects redundant contradictions and hostile shapes", () => {
    expect(
      conformCreatureVitals({ ...alive(), zeroHitPoints: { kind: "stable" } })
    ).toBeNull();
    expect(conformCreatureVitals({ ...dying(), zeroHitPoints: null })).toBeNull();
    expect(
      conformCreatureVitals({
        ...alive(),
        hitPoints: {
          current: 1,
          temporary: { current: 0, sourceOccurrence: source },
        },
      })
    ).toBeNull();
    expect(conformCreatureVitals({ ...alive(), legacyDeathSaves: {} })).toBeNull();
    expect(conformCreatureVitals(dying(3, 0))).toBeNull();
  });
});

describe("damage and zero hit points", () => {
  it("loses THP first, then HP, and derives one concentration DC", () => {
    const result = applyCreatureDamage(alive(12, 5), {
      amount: 13,
      criticalHit: false,
      maximumHitPoints: 20,
      zeroHitPointsPolicy: "dying",
    });
    expect(result).toMatchObject({
      after: {
        hitPoints: {
          current: 4,
          temporary: { current: 0, sourceOccurrence: null },
        },
        zeroHitPoints: null,
      },
      facts: {
        concentrationDifficultyClass: 10,
        damageTaken: 13,
        hitPointsLost: 8,
        temporaryHitPointsLost: 5,
      },
      status: "applied",
    });
    expect(
      applyCreatureDamage(alive(100), {
        amount: 61,
        criticalHit: false,
        maximumHitPoints: 100,
        zeroHitPointsPolicy: "dying",
      })
    ).toMatchObject({ facts: { concentrationDifficultyClass: 30 } });
  });

  it("enters the resolved dying/dead policy or remains at 1 on an ordinary drop", () => {
    for (const [zeroHitPointsPolicy, expectedVitals, remainedAtOne] of [
      [
        "dying",
        { current: 0, zero: { failures: 0, kind: "dying", successes: 0 } },
        false,
      ],
      ["dead", { current: 0, zero: { kind: "dead" } }, false],
      ["remain-at-one", { current: 1, zero: null }, true],
    ] as const) {
      expect(
        applyCreatureDamage(alive(5), {
          amount: 5,
          criticalHit: true,
          maximumHitPoints: 10,
          zeroHitPointsPolicy,
        })
      ).toMatchObject({
        after: {
          hitPoints: { current: expectedVitals.current },
          zeroHitPoints: expectedVitals.zero,
        },
        facts: {
          deathSaveFailuresAdded: 0,
          remainedAtOne,
          wouldDropToZero: true,
        },
      });
    }
  });

  it("applies massive damage only from overflow beyond THP and current HP", () => {
    expect(
      applyCreatureDamage(alive(8, 2), {
        amount: 21,
        criticalHit: false,
        maximumHitPoints: 12,
        zeroHitPointsPolicy: "dying",
      })
    ).toMatchObject({
      after: { zeroHitPoints: { failures: 0, kind: "dying", successes: 0 } },
      facts: { instantDeath: false, overflowDamage: 11 },
    });
    expect(
      applyCreatureDamage(alive(8, 2), {
        amount: 22,
        criticalHit: false,
        maximumHitPoints: 12,
        zeroHitPointsPolicy: "dying",
      })
    ).toMatchObject({
      after: { zeroHitPoints: { kind: "dead" } },
      facts: { becameDead: true, instantDeath: true, overflowDamage: 12 },
    });
  });

  it("damage at zero causes one/two failures even when THP absorbs it", () => {
    expect(
      applyCreatureDamage(dying(1, 0, 20), {
        amount: 4,
        criticalHit: false,
        maximumHitPoints: 10,
        zeroHitPointsPolicy: "dying",
      })
    ).toMatchObject({
      after: {
        hitPoints: { temporary: { current: 16 } },
        zeroHitPoints: { failures: 1, kind: "dying", successes: 1 },
      },
      facts: { deathSaveFailuresAdded: 1, hitPointsLost: 0 },
    });
    expect(
      applyCreatureDamage(dying(0, 1), {
        amount: 1,
        criticalHit: true,
        maximumHitPoints: 10,
        zeroHitPointsPolicy: "dying",
      })
    ).toMatchObject({
      after: { zeroHitPoints: { kind: "dead" } },
      facts: { deathSaveFailuresAdded: 2 },
    });
  });

  it("damage at zero equal to max kills regardless of remaining THP", () => {
    expect(
      applyCreatureDamage(dying(0, 0, 20), {
        amount: 10,
        criticalHit: false,
        maximumHitPoints: 10,
        zeroHitPointsPolicy: "dying",
      })
    ).toMatchObject({
      after: {
        hitPoints: { temporary: { current: 10 } },
        zeroHitPoints: { kind: "dead" },
      },
      facts: { instantDeath: true },
    });
  });
});

describe("healing, THP, stabilization, and death saves", () => {
  it("heals to max, resets zero state, and never restores THP", () => {
    expect(
      healCreature(dying(2, 1, 4), { amount: 50, maximumHitPoints: 12 })
    ).toMatchObject({
      after: {
        hitPoints: { current: 12, temporary: { current: 4 } },
        zeroHitPoints: null,
      },
      facts: { requested: 50, restored: 12, revivedFromZero: true },
    });
    expect(healCreature(alive(12), { amount: 1, maximumHitPoints: 12 })).toMatchObject({
      status: "already-applied",
    });
  });

  it("keeps or replaces THP explicitly and clears only the matching source", () => {
    expect(
      grantTemporaryHitPoints(alive(), {
        amount: 9,
        decision: "keep",
        sourceOccurrence: null,
      })
    ).toEqual({ reason: "invalid-input", status: "rejected" });
    expect(
      grantTemporaryHitPoints(alive(10, 5), {
        amount: 9,
        decision: "keep",
        sourceOccurrence: null,
      })
    ).toMatchObject({ status: "already-applied" });
    const replaced = grantTemporaryHitPoints(alive(10, 5), {
      amount: 3,
      decision: "replace",
      sourceOccurrence: null,
    });
    expect(replaced).toMatchObject({
      after: { hitPoints: { temporary: { current: 3, sourceOccurrence: null } } },
      status: "applied",
    });
    expect(
      clearTemporaryHitPoints(alive(10, 5), {
        kind: "source",
        sourceOccurrence: {
          occurrence: { material, occurrenceId: "other" },
          ordinal: 1,
        },
      })
    ).toMatchObject({ status: "already-applied" });
    expect(
      clearTemporaryHitPoints(alive(10, 5), {
        kind: "source",
        sourceOccurrence: source,
      })
    ).toMatchObject({
      after: { hitPoints: { temporary: { current: 0, sourceOccurrence: null } } },
    });
  });

  it("stabilizes and applies every canonical death-save outcome", () => {
    expect(stabilizeCreature(dying(2, 1))).toMatchObject({
      after: { zeroHitPoints: { kind: "stable" } },
    });
    expect(applyDeathSaveOutcome(dying(2, 0), "success")).toMatchObject({
      after: { zeroHitPoints: { kind: "stable" } },
    });
    expect(applyDeathSaveOutcome(dying(0, 1), "critical-failure")).toMatchObject({
      after: { zeroHitPoints: { kind: "dead" } },
    });
    expect(applyDeathSaveOutcome(dying(1, 1, 3), "critical-success")).toMatchObject({
      after: {
        hitPoints: { current: 1, temporary: { current: 3 } },
        zeroHitPoints: null,
      },
    });
  });

  it("rejects malformed facts, dead healing, and fabricated randomness/time", () => {
    expect(
      applyCreatureDamage(alive(11), {
        amount: 1,
        criticalHit: false,
        maximumHitPoints: 10,
        zeroHitPointsPolicy: "dying",
      })
    ).toEqual({ reason: "maximum-conflict", status: "rejected" });
    expect(
      healCreature(
        {
          hitPoints: {
            current: 0,
            temporary: { current: 0, sourceOccurrence: null },
          },
          zeroHitPoints: { kind: "dead" },
        },
        { amount: 1, maximumHitPoints: 10 }
      )
    ).toEqual({ reason: "dead", status: "rejected" });
    expect(
      applyCreatureDamage(alive(), {
        amount: 1,
        criticalHit: false,
        maximumHitPoints: 10,
        onDropToZero: "dying",
        receipt: "legacy",
      })
    ).toEqual({ reason: "invalid-input", status: "rejected" });

    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("rolled internally");
    });
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("timestamped internally");
    });
    expect(applyDeathSaveOutcome(dying(), "success").status).toBe("applied");
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    random.mockRestore();
    now.mockRestore();
  });
});

describe("non-damage zero HP, maximum changes, death, and revival", () => {
  it("drops to zero without consuming THP or fabricating damage", () => {
    expect(
      reduceCreatureToZeroHitPoints(alive(8, 6), {
        maximumHitPoints: 10,
        zeroHitPointsPolicy: "dying",
      })
    ).toMatchObject({
      after: {
        hitPoints: { current: 0, temporary: { current: 6 } },
        zeroHitPoints: { failures: 0, kind: "dying", successes: 0 },
      },
    });
  });

  it("kills explicitly and treats repeat execution as idempotent", () => {
    const killed = killCreature(alive(8, 6));
    expect(killed).toMatchObject({
      after: {
        hitPoints: { current: 0, temporary: { current: 6 } },
        zeroHitPoints: { kind: "dead" },
      },
      status: "applied",
    });
    if (killed.status !== "applied") throw new Error("expected applied kill");
    expect(killCreature(killed.after)).toMatchObject({ status: "already-applied" });
  });

  it("clamps to a changed maximum and dies exactly when that maximum is 0", () => {
    expect(
      synchronizeCreatureHitPointMaximum(alive(12), { maximumHitPoints: 7 })
    ).toMatchObject({
      after: { hitPoints: { current: 7 }, zeroHitPoints: null },
      facts: { currentHitPoints: 7, maximumReachedZero: false, previousHitPoints: 12 },
    });
    expect(
      synchronizeCreatureHitPointMaximum(alive(12, 4), { maximumHitPoints: 0 })
    ).toMatchObject({
      after: {
        hitPoints: { current: 0, temporary: { current: 4 } },
        zeroHitPoints: { kind: "dead" },
      },
    });
  });

  it("revives only the dead, caps restored HP, and preserves extant THP", () => {
    const corpse = killCreature(alive(8, 6));
    if (corpse.status !== "applied") throw new Error("expected corpse");
    expect(
      reviveCreature(corpse.after, { hitPoints: 100, maximumHitPoints: 14 })
    ).toMatchObject({
      after: {
        hitPoints: { current: 14, temporary: { current: 6 } },
        zeroHitPoints: null,
      },
      facts: { requested: 100, restored: 14 },
    });
    expect(reviveCreature(alive(), { hitPoints: 1, maximumHitPoints: 10 })).toEqual({
      reason: "not-dead",
      status: "rejected",
    });
  });
});

describe("object hit points", () => {
  it("has one exact HP-only state and derives destruction from zero", () => {
    expect(conformObjectVitals({ hitPoints: { current: 9 } })).toEqual({
      hitPoints: { current: 9 },
    });
    expect(
      conformObjectVitals({ destroyed: false, hitPoints: { current: 9 } })
    ).toBeNull();
    expect(conformObjectVitals({ hitPoints: { current: -1 } })).toBeNull();
  });

  it("damages to a zero floor and reports destruction once", () => {
    expect(
      applyObjectDamage(
        { hitPoints: { current: 7 } },
        { amount: 20, maximumHitPoints: 7 }
      )
    ).toMatchObject({
      after: { hitPoints: { current: 0 } },
      facts: { destroyed: true, hitPointsLost: 7 },
      status: "applied",
    });
    expect(
      applyObjectDamage({ hitPoints: { current: 0 } }, { amount: 1, maximumHitPoints: 7 })
    ).toMatchObject({ status: "already-applied" });
  });

  it("repairs up to maximum and can restore a destroyed object explicitly", () => {
    expect(
      repairObject({ hitPoints: { current: 0 } }, { amount: 50, maximumHitPoints: 12 })
    ).toMatchObject({
      after: { hitPoints: { current: 12 } },
      facts: { requested: 50, restored: 12, restoredFromDestroyed: true },
    });
    expect(
      repairObject({ hitPoints: { current: 13 } }, { amount: 1, maximumHitPoints: 12 })
    ).toEqual({ reason: "maximum-conflict", status: "rejected" });
  });

  it("clamps an object after a maximum change without inventing repair or damage", () => {
    expect(
      synchronizeObjectHitPointMaximum(
        { hitPoints: { current: 12 } },
        { maximumHitPoints: 7 }
      )
    ).toMatchObject({
      after: { hitPoints: { current: 7 } },
      facts: {
        currentHitPoints: 7,
        destroyedByMaximumChange: false,
        previousHitPoints: 12,
      },
      status: "applied",
    });
    expect(
      synchronizeObjectHitPointMaximum(
        { hitPoints: { current: 7 } },
        { maximumHitPoints: 0 }
      )
    ).toMatchObject({
      after: { hitPoints: { current: 0 } },
      facts: { destroyedByMaximumChange: true },
    });
  });
});
