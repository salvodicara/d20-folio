/**
 * Buying and selling a catalogue item (SRD 5.2.1 "Coins" + "Selling Treasure"): the
 * list price comes off the purse with the change handed back, the way D&D Beyond and
 * Foundry dnd5e convert coins; selling ordinary equipment returns half its price. The
 * cases read the equipment catalogue's own prices, never a copy of them.
 */
import { describe, expect, it } from "vitest";
import { SRD_EQUIPMENT, getEquipment } from "@/data/equipment";
import {
  COIN_CP,
  coinParts,
  itemTradeLogEvent,
  paymentDelta,
  purchasePriceCp,
  purseCp,
  saleDelta,
  salePriceCp,
  sellOne,
  unsellOne,
} from "@/lib/play/purchase";
import { adjustCurrency } from "@/lib/play/material-cost";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

type Currency = CharacterDoc["session"]["currency"];

const purse = (coins: Partial<Currency>): Currency => ({
  pp: 0,
  gp: 0,
  ep: 0,
  sp: 0,
  cp: 0,
  ...coins,
});

function item(id: string) {
  const found = getEquipment(id);
  if (!found) throw new Error(`no catalogue item ${id}`);
  return found;
}

/** The purse after paying, through the same mover the store's adjust-currency uses. */
function paid(currency: Currency, priceCp: number): Currency | null {
  const delta = paymentDelta(currency, priceCp);
  if (!delta) return null;
  const session = { ...MOCK_CHARACTER.session, currency };
  return adjustCurrency(session, delta)?.currency ?? null;
}

describe("the catalogue price in copper", () => {
  it("counts each coin at its SRD value", () => {
    expect(COIN_CP).toEqual({ cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 });
  });

  it("reads Chain Mail, a Torch and a bundle of Arrows from the catalogue", () => {
    expect(purchasePriceCp(item("chain-mail"), 1)).toBe(
      item("chain-mail").cost.amount * COIN_CP[item("chain-mail").cost.unit]
    );
    expect(purchasePriceCp(item("chain-mail"), 1)).toBe(7500);
    expect(purchasePriceCp(item("torch"), 3)).toBe(3);
    // Arrows are sold by the bundle of 20: adding 20 costs the listed price once.
    const arrows = item("arrows");
    expect(arrows.bundleSize).toBe(20);
    expect(purchasePriceCp(arrows, 20)).toBe(
      arrows.cost.amount * COIN_CP[arrows.cost.unit]
    );
    expect(purchasePriceCp(arrows, 40)).toBe(
      2 * arrows.cost.amount * COIN_CP[arrows.cost.unit]
    );
  });

  it("prices every catalogue item, and none is free", () => {
    for (const entry of SRD_EQUIPMENT) {
      expect(purchasePriceCp(entry, entry.bundleSize ?? 1), entry.id).toBeGreaterThan(0);
    }
  });
});

describe("paying with change", () => {
  it("takes the price's own coin when there is enough of it", () => {
    expect(
      paymentDelta(purse({ gp: 340, sp: 22 }), purchasePriceCp(item("chain-mail"), 1))
    ).toEqual({
      gp: -75,
    });
  });

  it("breaks platinum when gold runs short and hands back the change in gold", () => {
    // 50 gp + 3 pp for 75 gp: all the gold, three platinum, 5 gp back.
    expect(
      paid(purse({ gp: 50, pp: 3 }), purchasePriceCp(item("chain-mail"), 1))
    ).toEqual(purse({ gp: 5 }));
  });

  it("pays a copper price by breaking silver, the change in copper", () => {
    // A Torch costs 1 cp; with only silver, one silver gives 9 cp back.
    expect(paid(purse({ sp: 2 }), purchasePriceCp(item("torch"), 1))).toEqual(
      purse({ sp: 1, cp: 9 })
    );
  });

  it("breaks gold for a silver price and keeps the smaller coins whole", () => {
    const rations = item("rations");
    expect(rations.cost).toEqual({ amount: 5, unit: "sp" });
    expect(paid(purse({ gp: 1, cp: 3 }), purchasePriceCp(rations, 1))).toEqual(
      purse({ sp: 5, cp: 3 })
    );
  });

  it("uses the smaller coins once the larger ones are spent", () => {
    // A Longsword (15 gp) from 10 gp, 4 ep and 30 sp: 10 gp, then 4 ep (2 gp), then 30 sp.
    expect(
      paid(purse({ gp: 10, ep: 4, sp: 30 }), purchasePriceCp(item("longsword"), 1))
    ).toEqual(purse({}));
    // With electrum to spare, the larger smaller coin goes first: 10 ep, the silver stays.
    expect(
      paid(purse({ gp: 10, ep: 20, sp: 100 }), purchasePriceCp(item("longsword"), 1))
    ).toEqual(purse({ ep: 10, sp: 100 }));
  });

  it("refuses when the whole purse is worth less than the price", () => {
    const price = purchasePriceCp(item("chain-mail"), 1);
    const short = purse({ gp: 70, ep: 5, sp: 22, cp: 8 });
    expect(purseCp(short)).toBeLessThan(price);
    expect(paymentDelta(short, price)).toBeNull();
  });

  it("never lets a coin go negative and keeps the value exact", () => {
    const start = purse({ pp: 1, gp: 2, ep: 3, sp: 4, cp: 5 });
    for (const entry of SRD_EQUIPMENT) {
      const price = purchasePriceCp(entry, entry.bundleSize ?? 1);
      const after = paid(start, price);
      if (purseCp(start) < price) {
        expect(after, entry.id).toBeNull();
        continue;
      }
      if (!after) throw new Error(`${entry.id}: affordable but unpaid`);
      for (const value of Object.values(after)) expect(value).toBeGreaterThanOrEqual(0);
      expect(purseCp(after), entry.id).toBe(purseCp(start) - price);
    }
  });
});

describe("selling at half price", () => {
  it("returns half the list price of one item, in gold, silver and copper", () => {
    // Chain Mail 75 gp → 37 gp 5 sp.
    expect(salePriceCp(item("chain-mail"))).toBe(3750);
    expect(saleDelta(salePriceCp(item("chain-mail")))).toEqual({ gp: 37, sp: 5 });
  });

  it("sells one piece of a bundle, rounded down to the copper", () => {
    // One Arrow of a 1 gp bundle of 20 is 5 cp; half is 2.5, so 2 cp.
    const arrows = item("arrows");
    expect(salePriceCp(arrows)).toBe(
      Math.floor((arrows.cost.amount * COIN_CP[arrows.cost.unit]) / 20 / 2)
    );
    expect(saleDelta(salePriceCp(arrows))).toEqual({ cp: 2 });
  });

  it("gives nothing for a sale worth less than a copper", () => {
    expect(salePriceCp(item("torch"))).toBe(0);
    expect(saleDelta(0)).toBeNull();
  });
});

describe("the coins a price names, and its log line", () => {
  it("splits a copper total into gold, silver and copper", () => {
    expect(coinParts(3750)).toEqual([
      { amount: 37, coin: "gp" },
      { amount: 5, coin: "sp" },
    ]);
    expect(coinParts(7500)).toEqual([{ amount: 75, coin: "gp" }]);
    expect(coinParts(9)).toEqual([{ amount: 9, coin: "cp" }]);
  });

  it("logs the item by its catalogue id and the coins as a number", () => {
    expect(itemTradeLogEvent("buy", "chain-mail", 7500)).toEqual({
      kind: "item-trade",
      trade: "buy",
      item: { srd: { kind: "equipment", key: "chain-mail", field: "name" } },
      cp: 7500,
    });
  });
});

describe("selling one item off the sheet", () => {
  const doc = (
    equipment: CharacterDoc["character"]["equipment"],
    weapons: CharacterDoc["character"]["weapons"] = []
  ): CharacterDoc => ({
    ...MOCK_CHARACTER,
    character: { ...MOCK_CHARACTER.character, equipment, weapons },
    session: { ...MOCK_CHARACTER.session, currency: purse({ gp: 1 }), itemResources: {} },
  });

  it("drops the last one and adds half its price to the purse", () => {
    const sale = sellOne(
      doc([{ srdId: "chain-mail", equipped: true }]),
      "equipment",
      0,
      getEquipment
    );
    if (!sale) throw new Error("no sale");
    expect(sale.itemId).toBe("chain-mail");
    expect(sale.cp).toBe(salePriceCp(item("chain-mail")));
    expect(sale.doc.character.equipment).toEqual([]);
    // 1 gp + 37 gp 5 sp.
    expect(sale.doc.session.currency).toEqual(purse({ gp: 38, sp: 5 }));
  });

  it("takes one piece off a stack and leaves the rest", () => {
    // A Longsword lists 15 gp: one sells for 7 gp 5 sp.
    const sale = sellOne(
      doc([], [{ srdId: "longsword", quantity: 2 }]),
      "weapons",
      0,
      getEquipment
    );
    expect(sale?.doc.character.weapons).toEqual([{ srdId: "longsword", quantity: 1 }]);
    expect(sale?.doc.session.currency).toEqual(purse({ gp: 8, sp: 5 }));
  });

  it("undoing the sale puts back the item, its counters and the coins", () => {
    const start = doc([
      { srdId: "rope", quantity: 1 },
      { srdId: "chain-mail", equipped: true, instanceId: "chain-1" },
    ]);
    const counters = { itemId: "chain-mail", instanceId: "chain-1" } as never;
    start.session.itemResources = { "chain-1": counters };
    const sale = sellOne(start, "equipment", 1, getEquipment);
    if (!sale) throw new Error("no sale");
    expect(sale.doc.session.itemResources).toEqual({});
    const back = unsellOne(sale.doc, sale);
    expect(back.character.equipment).toEqual(start.character.equipment);
    expect(back.session.currency).toEqual(start.session.currency);
    expect(back.session.itemResources).toEqual(start.session.itemResources);
  });

  it("does not sell a homebrew item, an unpriced magic item, or a worthless one", () => {
    expect(
      sellOne(
        doc([{ custom: true, name: "Lucky stone", instanceId: "stone-1" }]),
        "equipment",
        0,
        getEquipment
      )
    ).toBeNull();
    expect(
      sellOne(doc([{ srdId: "bag-of-holding" }]), "equipment", 0, getEquipment)
    ).toBeNull();
    // A Torch lists 1 cp: half of it is no coin at all.
    expect(
      sellOne(doc([{ srdId: "torch", quantity: 4 }]), "equipment", 0, getEquipment)
    ).toBeNull();
  });
});
