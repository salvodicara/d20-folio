/**
 * The treasury's items (owner direction 2026-10-23, row 15; answers 2026-10-24): every
 * item has exactly one owner, a character or the party chest, and changes hands only
 * through a logged move that can always be undone. A whole item moves as it is (no
 * longer worn or attuned by its new owner); part of a stack (3 of 10 arrows) starts a
 * new stack or joins one the receiver already has. Pure model, nothing wired.
 */
import { describe, expect, it } from "vitest";

import {
  applyItemMove,
  reverseItemMove,
  type ItemHoldings,
  type ItemMove,
  type TreasuryItem,
} from "@/lib/treasury-items";
import { ownerKey } from "@/lib/treasury";

const ana = { kind: "character", characterId: "ana" } as const;
const bo = { kind: "character", characterId: "bo" } as const;
const chest = { kind: "chest" } as const;
const meta = { by: "u1", at: 1000, note: "" };

const ring: TreasuryItem = {
  srdId: "ring-of-protection",
  instanceId: "ring-1",
  equipped: true,
  attuned: true,
  acBonus: 1,
};
const arrows: TreasuryItem = {
  srdId: "arrows",
  instanceId: "arrows-a",
  quantity: 10,
  tracked: true,
};
const boArrows: TreasuryItem = {
  srdId: "arrows",
  instanceId: "arrows-b",
  quantity: 5,
  tracked: true,
};

const start: ItemHoldings = {
  [ownerKey(ana)]: [ring, arrows],
  [ownerKey(bo)]: [boArrows],
};

function move(over: Partial<ItemMove>): ItemMove {
  return {
    id: "i1",
    from: ana,
    to: chest,
    instanceId: "ring-1",
    quantity: 1,
    ...meta,
    ...over,
  };
}

const itemsOf = (
  h: ItemHoldings | undefined,
  owner: typeof ana | typeof bo | typeof chest
) => h?.[ownerKey(owner)] ?? [];

describe("a whole item", () => {
  it("leaves its owner and arrives no longer worn or attuned", () => {
    const result = applyItemMove(start, move({}));
    expect(itemsOf(result?.holdings, ana).map((i) => i.instanceId)).toEqual(["arrows-a"]);
    const inChest = itemsOf(result?.holdings, chest);
    expect(inChest).toHaveLength(1);
    expect(inChest[0]).toMatchObject({
      srdId: "ring-of-protection",
      instanceId: "ring-1",
    });
    expect(inChest[0]?.equipped).toBeFalsy();
    expect(inChest[0]?.attuned).toBeFalsy();
  });

  it("its undo brings it back worn and attuned, as it was", () => {
    const result = applyItemMove(start, move({}));
    if (!result) throw new Error("no move");
    const undo = reverseItemMove(result.applied, "i2", meta);
    expect(undo).toMatchObject({ from: chest, to: ana, undoes: "i1" });
    const back = applyItemMove(result.holdings, undo);
    expect(itemsOf(back?.holdings, chest)).toEqual([]);
    expect(itemsOf(back?.holdings, ana).find((i) => i.instanceId === "ring-1")).toEqual(
      ring
    );
  });
});

describe("part of a stack", () => {
  it("starts a new stack at the receiver", () => {
    const result = applyItemMove(
      start,
      move({ to: chest, instanceId: "arrows-a", quantity: 3, splitAs: "arrows-c" })
    );
    expect(
      itemsOf(result?.holdings, ana).find((i) => i.instanceId === "arrows-a")?.quantity
    ).toBe(7);
    expect(itemsOf(result?.holdings, chest)).toEqual([
      { srdId: "arrows", instanceId: "arrows-c", quantity: 3, tracked: true },
    ]);
  });

  it("or joins the receiver's own stack of the same item", () => {
    const result = applyItemMove(
      start,
      move({ to: bo, instanceId: "arrows-a", quantity: 3, mergeInto: "arrows-b" })
    );
    expect(itemsOf(result?.holdings, bo)).toEqual([{ ...boArrows, quantity: 8 }]);
    expect(
      itemsOf(result?.holdings, ana).find((i) => i.instanceId === "arrows-a")?.quantity
    ).toBe(7);
  });

  it("its undo puts the arrows back in the stack they came from", () => {
    const split = applyItemMove(
      start,
      move({ to: bo, instanceId: "arrows-a", quantity: 3, mergeInto: "arrows-b" })
    );
    if (!split) throw new Error("no move");
    const back = applyItemMove(
      split.holdings,
      reverseItemMove(split.applied, "i2", meta)
    );
    expect(
      itemsOf(back?.holdings, ana).find((i) => i.instanceId === "arrows-a")?.quantity
    ).toBe(10);
    expect(itemsOf(back?.holdings, bo)).toEqual([boArrows]);
  });

  it("giving all of a stack into another's stack, then undoing, rebuilds the first", () => {
    const all = applyItemMove(
      start,
      move({ to: bo, instanceId: "arrows-a", quantity: 10, mergeInto: "arrows-b" })
    );
    if (!all) throw new Error("no move");
    expect(itemsOf(all.holdings, ana).map((i) => i.instanceId)).toEqual(["ring-1"]);
    const back = applyItemMove(all.holdings, reverseItemMove(all.applied, "i2", meta));
    expect(itemsOf(back?.holdings, ana).find((i) => i.instanceId === "arrows-a")).toEqual(
      arrows
    );
    expect(itemsOf(back?.holdings, bo)).toEqual([boArrows]);
  });
});

describe("loot and losses", () => {
  it("a found item comes in from outside, and its undo sends it back out", () => {
    const potion: TreasuryItem = {
      srdId: "potion-of-healing",
      instanceId: "pot-1",
      quantity: 2,
      tracked: true,
    };
    const found = applyItemMove(
      {},
      move({
        from: { kind: "found" },
        to: bo,
        instanceId: "pot-1",
        quantity: 2,
        item: potion,
      })
    );
    expect(itemsOf(found?.holdings, bo)).toEqual([potion]);
    if (!found) throw new Error("no move");
    const back = applyItemMove(
      found.holdings,
      reverseItemMove(found.applied, "i2", meta)
    );
    expect(itemsOf(back?.holdings, bo)).toEqual([]);
  });

  it("a sold or broken item leaves the party", () => {
    const result = applyItemMove(start, move({ to: { kind: "spent" } }));
    expect(itemsOf(result?.holdings, ana).map((i) => i.instanceId)).toEqual(["arrows-a"]);
  });
});

describe("a move that can't happen changes nothing", () => {
  it.each([
    ["an item the owner doesn't have", move({ instanceId: "nope" })],
    [
      "more than the stack holds",
      move({ instanceId: "arrows-a", quantity: 11, splitAs: "x" }),
    ],
    ["part of a stack with nowhere to go", move({ instanceId: "arrows-a", quantity: 3 })],
    [
      "a stack joined to a different item",
      move({ to: bo, instanceId: "ring-1", mergeInto: "arrows-b" }),
    ],
    [
      "an id the receiver already uses",
      move({ to: bo, instanceId: "arrows-a", quantity: 3, splitAs: "arrows-b" }),
    ],
    ["no quantity", move({ quantity: 0 })],
    [
      "found with no item",
      move({ from: { kind: "found" }, to: bo, instanceId: "pot-9" }),
    ],
  ])("%s", (_case, bad) => {
    expect(applyItemMove(start, bad)).toBeNull();
  });
});
