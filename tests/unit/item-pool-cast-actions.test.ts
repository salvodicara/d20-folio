/**
 * S9 — the item→multi-spell-pool ACTION bridge + the resolved pool (engine facts).
 *
 * A charged multi-spell item (Wand of Binding/Fear, Ring of Animal Influence, Staff
 * of Charming) surfaces ONE Play-board pool-picker card (`item-cast-<itemId>`,
 * `costTracker = <itemId>`) — gated on the SAME equipped/attuned rule as every other
 * item effect — and `resolveFreeCastFromList` resolves the shared pool with a
 * per-spell `costBySpell` (variable for the wands, uniform-1 for the ring/staff).
 * The picker render + disable behavior is pinned by `divine-intervention-modal.test.tsx`;
 * the end-to-end debit/undo by `item-pool-cast.test.tsx`.
 */
import { describe, it, expect } from "vitest";
import {
  resolveActions,
  resolveFreeCastFromList,
  freeCastItemChargeMax,
} from "@/lib/smart-tracker";
import { getMagicItem } from "@/data/magic-items";
import { makeCharacterDoc } from "./_helpers";
import type { CharacterDoc, SrdEquipmentRef } from "@/types/character";

function wielderOf(refs: SrdEquipmentRef[], used?: Record<string, number>): CharacterDoc {
  const doc = makeCharacterDoc({ classId: "fighter", level: 5, equipment: refs });
  if (used) doc.session.trackers = { ...doc.session.trackers, ...mapUsed(used) };
  return doc;
}
function mapUsed(u: Record<string, number>): Record<string, { used: number }> {
  const out: Record<string, { used: number }> = {};
  for (const [k, v] of Object.entries(u)) out[k] = { used: v };
  return out;
}

const poolCards = (doc: CharacterDoc) =>
  resolveActions(doc).filter((a) => a.id.startsWith("item-cast-"));

describe("S9 — item-pool cast action bridge", () => {
  it("emits ONE pool-picker card per equipped, attuned multi-spell item", () => {
    const doc = wielderOf([
      { srdId: "wand-of-binding", equipped: true, attuned: true, quantity: 1 },
    ]);
    const cards = poolCards(doc);
    expect(cards).toHaveLength(1);
    const [card] = cards;
    expect(card?.id).toBe("item-cast-wand-of-binding");
    expect(card?.costTracker).toBe("wand-of-binding");
    expect(card?.type).toBe("action");
    expect(card?.costsSlot).toBe(false);
    // The charge pool is the card's uses chip (7 charges, none spent yet).
    expect(card?.summary.uses).toEqual({ current: 7, total: 7, isPool: true });
  });

  it("emits NO card when the attunement-required item is equipped but NOT attuned", () => {
    const doc = wielderOf([
      { srdId: "wand-of-binding", equipped: true, attuned: false, quantity: 1 },
    ]);
    expect(poolCards(doc)).toHaveLength(0);
  });

  it("emits NO card when the item is unequipped", () => {
    const doc = wielderOf([
      { srdId: "wand-of-binding", equipped: false, attuned: true, quantity: 1 },
    ]);
    expect(poolCards(doc)).toHaveLength(0);
  });

  it("Ring of Animal Influence needs NO attunement — equipped alone surfaces the card", () => {
    const doc = wielderOf([
      { srdId: "ring-of-animal-influence", equipped: true, quantity: 1 },
    ]);
    const cards = poolCards(doc);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.id).toBe("item-cast-ring-of-animal-influence");
  });

  it("resolveFreeCastFromList resolves the Wand of Binding pool with VARIABLE per-spell costs", () => {
    // 3 charges spent → 4 remain: Hold Person (2) affordable, Hold Monster (5) not.
    const doc = wielderOf(
      [{ srdId: "wand-of-binding", equipped: true, attuned: true, quantity: 1 }],
      { "wand-of-binding": 3 }
    );
    const pools = resolveFreeCastFromList(doc);
    expect(pools).toHaveLength(1);
    const [pool] = pools;
    expect(pool?.trackerId).toBe("wand-of-binding");
    expect(pool?.charges).toBe(7);
    expect(pool?.remaining).toBe(4);
    expect(pool?.costBySpell).toEqual({ "hold-monster": 5, "hold-person": 2 });
    expect([...(pool?.spellIds ?? [])].sort()).toEqual(["hold-monster", "hold-person"]);
  });

  it("resolveFreeCastFromList gives a UNIFORM-1 costBySpell for the Staff of Charming pool", () => {
    const doc = wielderOf([
      { srdId: "staff-of-charming", equipped: true, attuned: true, quantity: 1 },
    ]);
    const pool = resolveFreeCastFromList(doc).find(
      (p) => p.trackerId === "staff-of-charming"
    );
    expect(pool?.charges).toBe(10);
    expect(pool?.costBySpell).toEqual({
      "charm-person": 1,
      command: 1,
      "comprehend-languages": 1,
    });
  });

  it("freeCastItemChargeMax reads a free-cast-from-list pool's chargesPerRest", () => {
    expect(freeCastItemChargeMax(getMagicItem("wand-of-binding")?.grants)).toBe(7);
    expect(freeCastItemChargeMax(getMagicItem("staff-of-charming")?.grants)).toBe(10);
    expect(freeCastItemChargeMax(getMagicItem("ring-of-animal-influence")?.grants)).toBe(
      3
    );
  });
});
