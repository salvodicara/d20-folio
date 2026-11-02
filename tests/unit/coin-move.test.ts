/**
 * Putting coins in or taking them out of the shared chest: the ledger row the write
 * records. A take never takes more than the chest holds (golden rule 20: the amount can
 * never be invalid); nothing to move is no move at all.
 */
import { describe, expect, it } from "vitest";

import { coinMove } from "@/domains/treasury/coin-move";

const chest = { pp: 0, gp: 12, ep: 0, sp: 3, cp: 0 };
const now = new Date(2026, 10, 2, 21, 0);

describe("coinMove", () => {
  it("putting in records the amount, the coin, who and the trimmed note", () => {
    expect(
      coinMove(chest, {
        mode: "in",
        amount: 30,
        currency: "gp",
        note: " loot ",
        by: "u1",
        at: now,
      })
    ).toEqual({
      amount: 30,
      currency: "gp",
      type: "add",
      note: "loot",
      by: "u1",
      at: now,
    });
  });

  it("taking out never takes more than the chest holds", () => {
    expect(
      coinMove(chest, {
        mode: "out",
        amount: 10,
        currency: "sp",
        note: "",
        by: "u1",
        at: now,
      })
    ).toMatchObject({
      amount: 3,
      type: "remove",
    });
  });

  it("nothing to move is no move", () => {
    expect(
      coinMove(chest, {
        mode: "out",
        amount: 5,
        currency: "pp",
        note: "",
        by: "u1",
        at: now,
      })
    ).toBeNull();
    expect(
      coinMove(chest, {
        mode: "in",
        amount: 0,
        currency: "gp",
        note: "",
        by: "u1",
        at: now,
      })
    ).toBeNull();
    expect(
      coinMove(chest, {
        mode: "in",
        amount: 2.5,
        currency: "gp",
        note: "",
        by: "u1",
        at: now,
      })
    ).toMatchObject({ amount: 2 });
  });
});
