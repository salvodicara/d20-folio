/** `lib/play/cast-payment`: what a use costs and whether the character can pay it now. */
import { describe, expect, it } from "vitest";
import {
  actionPaymentAffordable,
  actionWithCost,
  bareActionSpend,
  castItemPayment,
  castOptionAffordable,
  castOptionExpendsSpellSlot,
  castOptionSpends,
  metamagicAffordable,
  metamagicCost,
  paymentAffordable,
  SORCERY_POINTS_TRACKER_ID,
  trackerAffordable,
  type CastCommitOption,
} from "@/lib/play/cast-payment";
import { resolveTrackers, type ResolvedAction } from "@/lib/smart-tracker";
import type { SessionState } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const warlockWizard = (spellSlots: SessionState["spellSlots"] = {}) =>
  makeCharacterDoc(
    {
      classId: "wizard",
      level: 5,
      spellSlots: [
        { level: 1, total: 4 },
        { level: 3, total: 2 },
        { level: 3, total: 1, pactMagic: true },
      ],
    },
    { spellSlots }
  );

const sorcerer = (used: number) => {
  const doc = makeCharacterDoc({
    classId: "sorcerer",
    level: 5,
    features: [{ srdId: SORCERY_POINTS_TRACKER_ID }],
  });
  return {
    ...doc,
    session: { ...doc.session, trackers: { [SORCERY_POINTS_TRACKER_ID]: { used } } },
  };
};

const action = (over: Partial<ResolvedAction> = {}) =>
  ({ id: "a", costsSlot: false, ...over }) as ResolvedAction;

describe("castOptionExpendsSpellSlot", () => {
  it("a slot row spends a slot, a ritual does not, a free cast only when it says so", () => {
    expect(castOptionExpendsSpellSlot({ level: 1, remaining: 1, total: 1 })).toBe(true);
    expect(castOptionExpendsSpellSlot({ kind: "ritual", level: 1 })).toBe(false);
    const free = {
      kind: "free-cast",
      sourceId: "s",
      sourceName: "S",
      level: 1,
      remaining: 1,
      total: 1,
      cost: 1,
      recovery: "long",
    } as unknown as CastCommitOption & { kind: "free-cast" };
    expect(castOptionExpendsSpellSlot(free)).toBe(false);
    expect(castOptionExpendsSpellSlot({ ...free, expendsSpellSlot: true as const })).toBe(
      true
    );
  });
});

describe("actionWithCost", () => {
  const priced = action({
    costsSlot: true,
    slotLevel: 2,
    costTracker: "x",
    trackerCost: 3,
  });

  it("a slot alternative replaces the primary cost", () => {
    const next = actionWithCost(priced, { kind: "spell-slot", minLevel: 3 } as never);
    expect(next).toMatchObject({ costsSlot: true, slotLevel: 3, costTracker: undefined });
  });

  it("a tracker alternative costs its amount, 1 by default", () => {
    expect(
      actionWithCost(priced, { kind: "tracker", trackerId: "ki" } as never)
    ).toMatchObject({
      costsSlot: false,
      costTracker: "ki",
      trackerCost: 1,
      costTrackerIsPool: false,
    });
  });

  it("a cost-free alternative clears every cost", () => {
    expect(actionWithCost(priced, { kind: "none" } as never)).toMatchObject({
      costsSlot: false,
      slotLevel: undefined,
      costTracker: undefined,
      trackerCost: undefined,
    });
  });
});

describe("slots", () => {
  it("a slot payment needs an open slot at or above its minimum level", () => {
    const doc = warlockWizard({ "3": { used: 2 }, "pact-3": { used: 1 } });
    const none = new Map();
    expect(
      paymentAffordable(doc, none, { kind: "spell-slot", minLevel: 1 } as never)
    ).toBe(true);
    expect(
      paymentAffordable(doc, none, { kind: "spell-slot", minLevel: 2 } as never)
    ).toBe(false);
  });

  it("each pool is checked against its own counter", () => {
    const doc = warlockWizard({ "3": { used: 2 } });
    expect(castOptionAffordable(doc, { level: 3, remaining: 0, total: 2 })).toBe(false);
    expect(
      castOptionAffordable(doc, { level: 3, remaining: 1, total: 1, pactMagic: true })
    ).toBe(true);
  });

  it("a bare slot cost draws from the normal pool first", () => {
    expect(
      actionPaymentAffordable(
        warlockWizard({ "3": { used: 2 } }),
        action({ costsSlot: true, slotLevel: 3 })
      )
    ).toBe(false);
    expect(actionPaymentAffordable(warlockWizard(), action({ costsSlot: true }))).toBe(
      false
    );
  });

  it("a ritual is always affordable", () => {
    expect(
      castOptionAffordable(warlockWizard({ "1": { used: 4 } }), {
        kind: "ritual",
        level: 1,
      })
    ).toBe(true);
  });
});

describe("trackers and Metamagic", () => {
  it("a tracker needs the uses left", () => {
    const full = sorcerer(0);
    const total =
      resolveTrackers(full).find((t) => t.id === SORCERY_POINTS_TRACKER_ID)?.total ?? 0;
    expect(total).toBeGreaterThan(1);
    expect(trackerAffordable(full, SORCERY_POINTS_TRACKER_ID, total)).toBe(true);
    expect(trackerAffordable(sorcerer(total - 1), SORCERY_POINTS_TRACKER_ID, 2)).toBe(
      false
    );
    expect(trackerAffordable(full, "no-such-tracker", 1)).toBe(false);
  });

  it("Metamagic costs the sum of its options, paid in Sorcery Points", () => {
    expect(metamagicCost(["quickened-spell", "twinned-spell"])).toBe(3);
    const total =
      resolveTrackers(sorcerer(0)).find((t) => t.id === SORCERY_POINTS_TRACKER_ID)
        ?.total ?? 0;
    expect(metamagicAffordable(sorcerer(total - 2), ["quickened-spell"])).toBe(true);
    expect(metamagicAffordable(sorcerer(total - 1), ["quickened-spell"])).toBe(false);
    expect(metamagicAffordable(warlockWizard(), [])).toBe(true);
  });

  it("an equipment cost needs the item on hand", () => {
    const doc = warlockWizard();
    expect(actionPaymentAffordable(doc, action({ costEquipment: "nothing-here" }))).toBe(
      false
    );
  });
});

describe("what a use spends", () => {
  it("a slot cast spends its slot from its own pool, then the Metamagic points", () => {
    expect(
      castOptionSpends(
        { kind: "slot", level: 3, remaining: 1, total: 1, pactMagic: true },
        ["quickened-spell"]
      )
    ).toEqual([
      { kind: "slot", level: 3, pactMagic: true },
      { kind: "tracker", trackerId: SORCERY_POINTS_TRACKER_ID, amount: 2 },
    ]);
  });

  it("a free cast spends its own tracker; an item-paid one and a ritual spend nothing here", () => {
    const free = {
      kind: "free-cast",
      sourceId: "fey-touched",
      sourceName: "Fey-Touched",
      level: 1,
      remaining: 1,
      total: 1,
      cost: 1,
      recovery: "long",
    } as unknown as CastCommitOption & { kind: "free-cast" };
    expect(castOptionSpends(free, [])).toEqual([
      { kind: "tracker", trackerId: "fey-touched", amount: 1 },
    ]);
    expect(
      castOptionSpends(
        { ...free, payment: { kind: "tracker", trackerId: "pool" } } as never,
        []
      )
    ).toEqual([{ kind: "tracker", trackerId: "pool", amount: 1 }]);
    expect(
      castOptionSpends({ ...free, payment: { kind: "item-resource" } } as never, [])
    ).toEqual([]);
    expect(castOptionSpends({ kind: "ritual", level: 1 }, [])).toEqual([]);
  });

  it("a bare slot cost draws from the normal pool when there is one, else Pact", () => {
    const slots = warlockWizard().character.spellSlots;
    expect(bareActionSpend(slots, action({ costsSlot: true, slotLevel: 3 }))).toEqual({
      kind: "slot",
      level: 3,
      pactMagic: false,
    });
    const pactOnly = slots.filter((s) => s.pactMagic);
    expect(bareActionSpend(pactOnly, action({ costsSlot: true, slotLevel: 3 }))).toEqual({
      kind: "slot",
      level: 3,
      pactMagic: true,
    });
  });

  it("a bare tracker cost spends the chosen amount, else its own, else 1", () => {
    expect(bareActionSpend([], action({ costTracker: "ki" }))).toEqual({
      kind: "tracker",
      trackerId: "ki",
      amount: 1,
    });
    expect(
      bareActionSpend([], action({ costTracker: "ki", trackerCost: 2 }))
    ).toMatchObject({ amount: 2 });
    expect(
      bareActionSpend([], action({ costTracker: "ki", trackerCost: 2 }), 5)
    ).toMatchObject({ amount: 5 });
    expect(bareActionSpend([], action({ costEquipment: "potion" }))).toBeNull();
  });
});

describe("castItemPayment", () => {
  const item = {
    kind: "item-resource",
    itemId: "wand",
    resourceId: "charges",
    key: "k",
  } as const;

  it("a free cast drawn from an item pays its cost with that item", () => {
    const option = {
      kind: "free-cast",
      sourceId: "wand",
      sourceName: "Wand",
      level: 1,
      remaining: 3,
      total: 7,
      cost: 2,
      recovery: "dawn",
      payment: item,
    } as unknown as CastCommitOption;
    expect(castItemPayment(action(), option)).toEqual({
      payment: item,
      amount: 2,
      label: "Wand",
    });
  });

  it("any other configured cast pays no item, even when the bare action would", () => {
    expect(
      castItemPayment(action({ resourcePayment: item as never }), {
        kind: "slot",
        level: 1,
        remaining: 1,
        total: 1,
      })
    ).toBeNull();
  });

  it("a bare action pays its own item cost, 1 unit by default", () => {
    expect(
      castItemPayment(action({ name: "Zap", resourcePayment: item as never }))
    ).toEqual({
      payment: item,
      amount: 1,
      label: "Zap",
    });
    expect(castItemPayment(action())).toBeNull();
  });
});
