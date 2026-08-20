/**
 * S9 — the item→multi-spell-pool ACTION bridge + the resolved pool (engine facts).
 *
 * A charged multi-spell item (Wand of Binding/Fear, Ring of Animal Influence, Staff
 * of Charming) surfaces ONE Play-board pool-picker card per physical copy, with
 * stable catalogue attribution kept separate from its runtime source id. The card
 * is gated on the SAME equipped/attuned rule as every other item effect, and
 * `resolveFreeCastFromList` resolves the shared pool with a
 * per-spell `costBySpell` (variable for the wands, uniform-1 for the ring/staff).
 * The picker render + disable behavior is pinned by `divine-intervention-modal.test.tsx`;
 * the end-to-end debit/undo by `item-pool-cast.test.tsx`.
 */
import { describe, it, expect } from "vitest";
import { resolveActions, resolveFreeCastFromList } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";
import type { CharacterDoc, SrdEquipmentRef } from "@/types/character";

function wielderOf(refs: SrdEquipmentRef[]): CharacterDoc {
  return makeCharacterDoc({ classId: "fighter", level: 5, equipment: refs });
}

function setCharges(
  doc: CharacterDoc,
  itemId: string,
  instanceId: string,
  capacity: number,
  current: number
): void {
  doc.session.itemResources = {
    [instanceId]: {
      itemId,
      instanceId,
      revision: 0,
      resources: { charges: { capacity, current, disabled: false } },
      disposition: "magical",
      causalHead: null,
    },
  };
}

const poolCards = (doc: CharacterDoc) =>
  resolveActions(doc).filter((a) => a.id.startsWith("item-cast-"));

describe("S9 — item-pool cast action bridge", () => {
  it("emits ONE pool-picker card per equipped, attuned multi-spell item", () => {
    const doc = wielderOf([
      {
        srdId: "wand-of-binding",
        instanceId: "wand-binding-copy",
        equipped: true,
        attuned: true,
        quantity: 1,
      },
    ]);
    const cards = poolCards(doc);
    expect(cards).toHaveLength(1);
    const [card] = cards;
    expect(card?.id).toBe("item-cast-magic-item:wand-binding-copy");
    expect(card?.costTracker).toBeUndefined();
    expect(card?.resourcePayment).toEqual({
      kind: "item-resource",
      itemId: "wand-of-binding",
      instanceId: "wand-binding-copy",
      resourceId: "charges",
      key: "item:wand-binding-copy:charges",
    });
    expect(card?.castPoolSourceId).toBe("magic-item:wand-binding-copy");
    expect(card?.castPoolItemId).toBe("wand-of-binding");
    expect(card?.type).toBe("action");
    expect(card?.costsSlot).toBe(false);
    // The charge pool is the card's uses chip (7 charges, none spent yet).
    expect(card?.summary.uses).toEqual({ current: 7, total: 7, isPool: true });
  });

  it("emits NO card when the attunement-required item is equipped but NOT attuned", () => {
    const doc = wielderOf([
      {
        srdId: "wand-of-binding",
        instanceId: "unattuned-wand",
        equipped: true,
        attuned: false,
        quantity: 1,
      },
    ]);
    expect(poolCards(doc)).toHaveLength(0);
  });

  it("emits NO card when the item is unequipped", () => {
    const doc = wielderOf([
      {
        srdId: "wand-of-binding",
        instanceId: "unequipped-wand",
        equipped: false,
        attuned: true,
        quantity: 1,
      },
    ]);
    expect(poolCards(doc)).toHaveLength(0);
  });

  it("Ring of Animal Influence needs NO attunement — equipped alone surfaces the card", () => {
    const doc = wielderOf([
      {
        srdId: "ring-of-animal-influence",
        instanceId: "animal-ring-copy",
        equipped: true,
        quantity: 1,
      },
    ]);
    const cards = poolCards(doc);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: "item-cast-magic-item:animal-ring-copy",
      resourcePayment: {
        kind: "item-resource",
        itemId: "ring-of-animal-influence",
        instanceId: "animal-ring-copy",
        resourceId: "charges",
        key: "item:animal-ring-copy:charges",
      },
    });
  });

  it("resolveFreeCastFromList resolves the Wand of Binding pool with VARIABLE per-spell costs", () => {
    // 3 charges spent → 4 remain: Hold Person (2) affordable, Hold Monster (5) not.
    const doc = wielderOf([
      {
        srdId: "wand-of-binding",
        instanceId: "binding-pool-copy",
        equipped: true,
        attuned: true,
        quantity: 1,
      },
    ]);
    setCharges(doc, "wand-of-binding", "binding-pool-copy", 7, 4);
    const pools = resolveFreeCastFromList(doc);
    expect(pools).toHaveLength(1);
    const [pool] = pools;
    expect(pool?.itemId).toBe("wand-of-binding");
    expect(pool?.payment).toEqual({
      kind: "item-resource",
      itemId: "wand-of-binding",
      instanceId: "binding-pool-copy",
      resourceId: "charges",
      key: "item:binding-pool-copy:charges",
    });
    expect(pool?.recovery).toEqual({
      kind: "item-resource",
      triggers: [{ kind: "dawn" }],
    });
    expect(pool?.charges).toBe(7);
    expect(pool?.remaining).toBe(4);
    expect(pool?.castOverrides).toEqual({ saveDC: 17 });
    expect(pool?.costBySpell).toEqual({ "hold-monster": 5, "hold-person": 2 });
    expect([...(pool?.spellIds ?? [])].sort()).toEqual(["hold-monster", "hold-person"]);
  });

  it("resolveFreeCastFromList gives a UNIFORM-1 costBySpell for the Staff of Charming pool", () => {
    const doc = wielderOf([
      {
        srdId: "staff-of-charming",
        instanceId: "charming-staff-copy",
        equipped: true,
        attuned: true,
        quantity: 1,
      },
    ]);
    const pool = resolveFreeCastFromList(doc).find(
      (candidate) => candidate.itemId === "staff-of-charming"
    );
    expect(pool?.payment).toEqual({
      kind: "item-resource",
      itemId: "staff-of-charming",
      instanceId: "charming-staff-copy",
      resourceId: "charges",
      key: "item:charming-staff-copy:charges",
    });
    expect(pool?.recovery).toEqual({
      kind: "item-resource",
      triggers: [{ kind: "dawn" }],
    });
    expect(pool?.charges).toBe(10);
    expect(pool?.costBySpell).toEqual({
      "charm-person": 1,
      command: 1,
      "comprehend-languages": 1,
    });
  });
});
