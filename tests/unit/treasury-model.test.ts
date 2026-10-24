/**
 * The treasury model (owner direction 2026-10-23, row 15): every coin has exactly
 * one owner, a character or the party chest. Found loot goes to me, to the chest, or
 * is split; every move is a logged record and no total is ever overwritten by hand;
 * the campaign's treasury is a view, the sum of what its owners hold. Pure model:
 * nothing is stored or wired yet (design note: docs/architecture/treasury.md).
 */
import { describe, expect, it } from "vitest";

import {
  applyMove,
  campaignHoldings,
  emptyPurse,
  lootMoves,
  ownerKey,
  type Holdings,
  type TreasuryMove,
} from "@/lib/treasury";

const ana = { kind: "character", characterId: "ana" } as const;
const bo = { kind: "character", characterId: "bo" } as const;
const chest = { kind: "chest" } as const;
const meta = { by: "u1", at: 1000, note: "Goblin cave" };

function holdings(
  entries: [typeof ana | typeof bo | typeof chest, Partial<Record<string, number>>][]
): Holdings {
  return Object.fromEntries(
    entries.map(([owner, coins]) => [ownerKey(owner), { ...emptyPurse(), ...coins }])
  );
}

describe("found loot", () => {
  it("goes all to me, or all to the chest", () => {
    expect(lootMoves({ gp: 30 }, { to: ana }, "m1", meta)).toEqual([
      {
        id: "m1",
        from: { kind: "found" },
        to: ana,
        coins: { ...emptyPurse(), gp: 30 },
        ...meta,
      },
    ]);
    expect(lootMoves({ gp: 30 }, { to: chest }, "m1", meta)[0]?.to).toEqual(chest);
  });

  it("splits each coin evenly; what doesn't divide goes to the chest, nothing is lost", () => {
    const moves = lootMoves({ gp: 31, sp: 5 }, { split: [ana, bo] }, "m1", meta);
    const byOwner = Object.fromEntries(
      moves.map((m) => [ownerKey(m.to as typeof ana), m.coins])
    );
    expect(byOwner[ownerKey(ana)]).toMatchObject({ gp: 15, sp: 2 });
    expect(byOwner[ownerKey(bo)]).toMatchObject({ gp: 15, sp: 2 });
    expect(byOwner[ownerKey(chest)]).toMatchObject({ gp: 1, sp: 1 });
    expect(moves.map((m) => m.id)).toEqual(["m1-0", "m1-1", "m1-2"]);
  });

  it("a split with no leftover writes no chest move", () => {
    const moves = lootMoves({ gp: 30 }, { split: [ana, bo] }, "m1", meta);
    expect(moves.map((m) => m.to)).toEqual([ana, bo]);
  });
});

describe("a move", () => {
  it("takes coins from one owner and gives them to another", () => {
    const move: TreasuryMove = {
      id: "m2",
      from: ana,
      to: chest,
      coins: { ...emptyPurse(), gp: 10 },
      ...meta,
    };
    const after = applyMove(holdings([[ana, { gp: 15 }]]), move);
    expect(after?.[ownerKey(ana)]?.gp).toBe(5);
    expect(after?.[ownerKey(chest)]?.gp).toBe(10);
  });

  it("can't take more than the owner holds: nothing moves", () => {
    const move: TreasuryMove = {
      id: "m3",
      from: ana,
      to: bo,
      coins: { ...emptyPurse(), gp: 20 },
      ...meta,
    };
    expect(applyMove(holdings([[ana, { gp: 15 }]]), move)).toBeNull();
  });

  it("spending sends coins out of the party; found coins come in from outside", () => {
    const spend: TreasuryMove = {
      id: "m4",
      from: chest,
      to: { kind: "spent" },
      coins: { ...emptyPurse(), gp: 4 },
      ...meta,
    };
    const after = applyMove(holdings([[chest, { gp: 4 }]]), spend);
    expect(after?.[ownerKey(chest)]?.gp).toBe(0);
    const [found] = lootMoves({ cp: 7 }, { to: bo }, "m5", meta);
    if (!found) throw new Error("no move");
    expect(applyMove({}, found)?.[ownerKey(bo)]?.cp).toBe(7);
  });

  it("a move of nothing, or of a negative amount, is refused", () => {
    const base = { id: "m6", from: ana, to: bo, ...meta };
    expect(
      applyMove(holdings([[ana, { gp: 5 }]]), { ...base, coins: emptyPurse() })
    ).toBeNull();
    expect(
      applyMove(holdings([[ana, { gp: 5 }]]), {
        ...base,
        coins: { ...emptyPurse(), gp: -3 },
      })
    ).toBeNull();
  });
});

describe("the campaign's treasury is a view", () => {
  it("the chest, each member's purse, and their sum", () => {
    const view = campaignHoldings(
      holdings([
        [chest, { gp: 10 }],
        [ana, { gp: 5, sp: 3 }],
        [bo, { pp: 1 }],
      ])
    );
    expect(view.chest).toMatchObject({ gp: 10 });
    expect(view.members.map((m) => m.characterId).sort()).toEqual(["ana", "bo"]);
    expect(view.total).toEqual({ pp: 1, gp: 15, ep: 0, sp: 3, cp: 0 });
  });
});
