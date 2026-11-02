import { describe, expect, it } from "vitest";

import {
  moveStillCurrent,
  planLoot,
  planPut,
  planTake,
  type ChestCollection,
  type ChestMove,
  type MoveContext,
} from "@/features/campaigns/chest";
import type { ChestItem, Pickup } from "@/types/campaign";

const ctx = (uid = "kaela"): MoveContext => {
  let n = 0;
  return { uid, now: 1000, newId: () => `id${++n}` };
};
const potion = { srdId: "potion-of-healing" };

/** The documents a move leaves, readable the way the undo check reads them. */
function after(move: ChestMove) {
  const docs = new Map<string, unknown>();
  for (const doc of move.created) docs.set(`${doc.collection}/${doc.id}`, doc.data);
  for (const change of move.changed) docs.set(`chest/${change.id}`, change.after);
  return {
    docs,
    read: (collection: ChestCollection, id: string) =>
      docs.get(`${collection}/${id}`) ?? null,
  };
}
const pickups = (move: ChestMove | null) =>
  (move?.created ?? [])
    .filter((d) => d.collection === "pickups")
    .map((d) => d.data as Pickup);

describe("putting in and taking out", () => {
  it("putting an item in makes a chest stack and a log line", () => {
    const move = planPut(ctx("brann"), {
      item: { custom: true, name: "Gemma" },
      quantity: 2,
    });
    expect(move?.created.map((d) => d.collection)).toEqual(["chest", "chestLog"]);
    expect(move?.created[0]?.data).toMatchObject({ quantity: 2, addedBy: "brann" });
  });

  it("nothing goes in below one", () => {
    expect(planPut(ctx(), { item: potion, quantity: 0 })).toBeNull();
  });

  it("taking part of a stack leaves the rest, and the taken part becomes the taker's pickup", () => {
    const stack: ChestItem = {
      id: "s1",
      item: potion,
      quantity: 3,
      addedBy: "brann",
      at: 1,
    };
    const move = planTake(ctx(), stack, { quantity: 1 });
    expect(move?.changed).toEqual([
      { id: "s1", before: stack, after: { ...stack, quantity: 2 } },
    ]);
    expect(pickups(move)).toMatchObject([
      { ownerUid: "kaela", item: potion, quantity: 1, reason: "take" },
    ]);
  });

  it("taking the whole stack empties it; taking more than there is takes nothing", () => {
    const stack: ChestItem = {
      id: "s1",
      item: potion,
      quantity: 1,
      addedBy: "brann",
      at: 1,
    };
    expect(planTake(ctx(), stack, { quantity: 1 })?.changed[0]?.after).toBeNull();
    expect(planTake(ctx(), stack, { quantity: 2 })).toBeNull();
    expect(planTake(ctx(), null, { quantity: 1 })).toBeNull();
  });
});

describe("loot", () => {
  const found = { coins: { gp: 100, sp: 7 }, items: [{ item: potion, quantity: 2 }] };

  it("«A me nello zaino»: one pickup for the coins, one per item, for the one handing out", () => {
    const move = planLoot(ctx(), { ...found, to: "me", sharers: ["kaela", "brann"] });
    expect(pickups(move)).toMatchObject([
      { ownerUid: "kaela", coins: { gp: 100, sp: 7 } },
      { ownerUid: "kaela", item: potion, quantity: 2 },
    ]);
    expect(move?.treasury).toBeUndefined();
  });

  it("«Alla cassa del gruppo»: coins to the treasury, items to the chest", () => {
    const move = planLoot(ctx(), { ...found, to: "chest", sharers: [] });
    expect(move?.treasury?.delta).toEqual({ gp: 100, sp: 7 });
    expect(move?.treasury?.entries.map((e) => [e.currency, e.amount, e.type])).toEqual([
      ["gp", 100, "add"],
      ["sp", 7, "add"],
    ]);
    expect(move?.created.filter((d) => d.collection === "chest")).toHaveLength(1);
  });

  it("«Dividi in parti uguali»: a named share each, the remainder and the items to the chest", () => {
    const move = planLoot(ctx(), {
      ...found,
      to: "split",
      sharers: ["kaela", "brann", "ozzy"],
    });
    expect(pickups(move)).toMatchObject([
      { ownerUid: "kaela", coins: { gp: 33, sp: 2 }, reason: "share" },
      { ownerUid: "brann", coins: { gp: 33, sp: 2 }, reason: "share" },
      { ownerUid: "ozzy", coins: { gp: 33, sp: 2 }, reason: "share" },
    ]);
    expect(move?.treasury?.delta).toEqual({ gp: 1, sp: 1 });
    expect(move?.created.filter((d) => d.collection === "chest")).toHaveLength(1);
  });

  it("a split too small for a share goes all to the chest", () => {
    const move = planLoot(ctx(), {
      coins: { cp: 2 },
      items: [],
      to: "split",
      sharers: ["a", "b", "c"],
    });
    expect(pickups(move)).toEqual([]);
    expect(move?.treasury?.delta).toEqual({ cp: 2 });
  });

  it("every loot move is one log line; nothing found is no move", () => {
    const move = planLoot(ctx(), { ...found, to: "split", sharers: ["a", "b"] });
    expect(move?.created.filter((d) => d.collection === "chestLog")).toHaveLength(1);
    expect(planLoot(ctx(), { coins: {}, items: [], to: "me", sharers: [] })).toBeNull();
  });
});

describe("whether a move can still be undone", () => {
  it("yes, while everything is as the move left it", () => {
    const move = planLoot(ctx(), {
      coins: { gp: 10 },
      items: [],
      to: "split",
      sharers: ["a", "b"],
    });
    if (!move) throw new Error("expected a move");
    expect(moveStillCurrent(move, after(move).read)).toBe(true);
  });

  it("no, once a share was collected into its owner's sheet", () => {
    const move = planLoot(ctx(), {
      coins: { gp: 10 },
      items: [],
      to: "split",
      sharers: ["a", "b"],
    });
    if (!move) throw new Error("expected a move");
    const { docs, read } = after(move);
    docs.delete(`pickups/${pickups(move)[0]?.id}`);
    expect(moveStillCurrent(move, read)).toBe(false);
  });

  it("no, once someone else took from the stack it changed", () => {
    const stack: ChestItem = {
      id: "s1",
      item: potion,
      quantity: 3,
      addedBy: "brann",
      at: 1,
    };
    const move = planTake(ctx(), stack, { quantity: 1 });
    if (!move) throw new Error("expected a move");
    const { docs, read } = after(move);
    docs.set("chest/s1", { ...stack, quantity: 1 });
    expect(moveStillCurrent(move, read)).toBe(false);
  });
});
