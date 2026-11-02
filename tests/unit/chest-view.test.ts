/**
 * The Tesoro tab's chest (approved prototypes camp-treasure + loot): what the loot window
 * promises before Confirm (read off the engine's own plan, so the preview and the move
 * never disagree), and «Chi ha preso cosa» with coins and items together, newest first.
 */
import { describe, expect, it } from "vitest";

import { lootSummary, treasuryAndChestHistory } from "@/domains/treasury/chest-view";
import { planLoot } from "@/features/campaigns/chest";
import type { ChestLogEntry, TreasuryLogEntry } from "@/types/campaign";

let id = 0;
const ctx = { uid: "u-dm", now: 0, newId: () => `id${++id}` };
const plan = (to: "me" | "chest" | "split", sharers: string[]) =>
  planLoot(ctx, {
    coins: { gp: 125, sp: 7 },
    items: [{ item: { custom: true, name: "Gem" }, quantity: 2 }],
    to,
    sharers,
  });

describe("lootSummary", () => {
  it("split: what each sharer gets, and the remainder and the items that stay in the chest", () => {
    expect(lootSummary(plan("split", ["a", "b", "c", "d"]))).toEqual({
      share: { gp: 31, sp: 1 },
      sharers: 4,
      toChest: { gp: 1, sp: 3 },
      itemsToChest: 2,
      toMe: null,
    });
  });

  it("to the chest: every coin and item stays there", () => {
    expect(lootSummary(plan("chest", ["a"]))).toMatchObject({
      share: null,
      toChest: { gp: 125, sp: 7 },
      itemsToChest: 2,
    });
  });

  it("to me: it all waits for my sheet", () => {
    expect(lootSummary(plan("me", []))).toMatchObject({
      toMe: { coins: { gp: 125, sp: 7 }, items: 2 },
      toChest: {},
      itemsToChest: 0,
    });
  });

  it("nothing found is nothing to confirm", () => {
    expect(lootSummary(null)).toBeNull();
  });
});

describe("treasuryAndChestHistory", () => {
  const coins: TreasuryLogEntry[] = [
    { amount: 5, currency: "gp", type: "add", note: "", by: "u1", at: new Date(3000) },
  ];
  const items: ChestLogEntry[] = [
    {
      id: "x",
      kind: "take",
      by: "u2",
      at: 5000,
      item: { custom: true, name: "Rope" },
      quantity: 1,
    },
    { id: "y", kind: "loot", by: "u1", at: 1000, to: "split", coins: { gp: 120 } },
  ];

  it("merges coin and item lines, newest first", () => {
    expect(
      treasuryAndChestHistory(coins, items, { u1: "Nico", u2: "Lu" }).map((l) => l.kind)
    ).toEqual(["take", "coins", "loot"]);
  });

  it("loot's coins show once: the loot line says it, the coin line it also wrote is not repeated", () => {
    const lootCoins: TreasuryLogEntry[] = [
      {
        amount: 120,
        currency: "gp",
        type: "add",
        note: "loot",
        by: "u1",
        at: new Date(1000),
      },
    ];
    expect(treasuryAndChestHistory(lootCoins, items, {}).map((l) => l.kind)).toEqual([
      "take",
      "loot",
    ]);
  });
});
