/**
 * A cast whose material component has a gp cost (SRD 5.2.1 "Material (M)": a
 * component with a cost must be provided; one the spell consumes is used up). The
 * cases come from the spell catalogue's own structured components (the same
 * `{ gp, consumed }` the spell card's "M: 300 gp, consumed" tag reads): a consumed
 * cost is offered as a coin deduction, a kept one is only a reminder.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { spells } from "@/data/spells";
import { activityFromSpell } from "@/lib/activities/from-spell";
import {
  castMaterialCost,
  goldSpendDelta,
  materialCostLogEvent,
  negateCurrencyDelta,
} from "@/lib/play/material-cost";
import { coinPrice } from "@/lib/coin-price";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

const purse = (coins: Partial<CharacterDoc["session"]["currency"]>) => ({
  pp: 0,
  gp: 0,
  ep: 0,
  sp: 0,
  cp: 0,
  ...coins,
});

describe("the catalogue's costly material components", () => {
  const priced = spells.filter((spell) => activityFromSpell(spell).cost.components?.gp);

  it("finds priced spells, both consumed and kept", () => {
    expect(priced.length).toBeGreaterThan(30);
    expect(castMaterialCost("revivify")).toEqual({
      spellId: "revivify",
      gp: 300,
      consumed: true,
    });
    expect(priced.some((spell) => !spell.components.consumed)).toBe(true);
  });

  it.each(spells.map((spell) => [spell.id, spell] as const))(
    "%s: the cast offers exactly its priced component",
    (_id, spell) => {
      const components = activityFromSpell(spell).cost.components;
      expect(castMaterialCost(spell.id)).toEqual(
        components?.gp
          ? { spellId: spell.id, gp: components.gp, consumed: !!components.consumed }
          : null
      );
    }
  );

  it("Gentle Repose consumes its 2 copper pieces (SRD 5.2.1)", () => {
    expect(castMaterialCost("gentle-repose")).toEqual({
      spellId: "gentle-repose",
      gp: 0.02,
      consumed: true,
    });
  });

  it("a custom or unknown spell has no cost", () => {
    expect(castMaterialCost(undefined)).toBeNull();
    expect(castMaterialCost("not-a-spell")).toBeNull();
  });
});

describe("paying gold from the purse", () => {
  it("pays from gold pieces first", () => {
    expect(goldSpendDelta(purse({ gp: 350, pp: 2 }), 300)).toEqual({ gp: -300 });
  });

  it("breaks platinum when the gold runs short, the change back as gold", () => {
    // 300 gp from 120 gp + 20 pp: 18 pp pay 180 gp exactly.
    expect(goldSpendDelta(purse({ gp: 120, pp: 20 }), 300)).toEqual({
      gp: -120,
      pp: -18,
    });
    // 25 gp from 5 gp + 3 pp: 2 pp (20 gp) cover the last 20 gp exactly.
    expect(goldSpendDelta(purse({ gp: 5, pp: 3 }), 25)).toEqual({ gp: -5, pp: -2 });
    // 26 gp from 5 gp + 3 pp: 3 pp (30 gp) for 21 gp → 9 gp change.
    expect(goldSpendDelta(purse({ gp: 5, pp: 3 }), 26)).toEqual({ gp: 4, pp: -3 });
  });

  it("not enough gold and platinum: nothing to deduct in one tap", () => {
    expect(goldSpendDelta(purse({ gp: 50, pp: 2, ep: 900, sp: 900 }), 100)).toBeNull();
  });

  it("a copper price is paid in copper, breaking silver when the copper runs short", () => {
    expect(goldSpendDelta(purse({ cp: 5, gp: 10 }), 0.02)).toEqual({ cp: -2 });
    // 2 cp from 1 cp + 5 sp: 1 sp (10 cp) for the last 1 cp → 9 cp change.
    expect(goldSpendDelta(purse({ cp: 1, sp: 5 }), 0.02)).toEqual({ cp: 8, sp: -1 });
    expect(goldSpendDelta(purse({ gp: 10 }), 0.02)).toBeNull();
  });

  it("names a price in its own coin", () => {
    expect(coinPrice(300)).toEqual({ amount: 300, coin: "gp" });
    expect(coinPrice(0.02)).toEqual({ amount: 2, coin: "cp" });
    expect(coinPrice(0.5)).toEqual({ amount: 5, coin: "sp" });
  });

  it("the undo puts back exactly what the tap took", () => {
    const delta = must(goldSpendDelta(purse({ gp: 5, pp: 3 }), 26));
    expect(negateCurrencyDelta(delta)).toEqual({ gp: -4, pp: 3 });
  });

  it("runs as a sheet event that only moves the named coins", () => {
    const doc: CharacterDoc = {
      ...MOCK_CHARACTER,
      session: { ...MOCK_CHARACTER.session, currency: purse({ gp: 5, pp: 3, sp: 7 }) },
    };
    const paid = must(
      applySheetEvent(doc, { kind: "adjust-currency", delta: { gp: 4, pp: -3 } })
    );
    expect(paid.session.currency).toEqual(purse({ gp: 9, pp: 0, sp: 7 }));
    expect(applySheetEvent(doc, { kind: "adjust-currency", delta: {} })).toBeNull();
  });

  it("logs as the coins spent on the spell", () => {
    expect(
      materialCostLogEvent({ spellId: "revivify", gp: 300, consumed: true })
    ).toEqual({
      kind: "rider-use",
      action: { srd: { kind: "spell", key: "revivify", field: "name" } },
      rider: { lit: { en: "300 gp", it: "300 mo" } },
      effect: "generic",
    });
    expect(
      materialCostLogEvent({ spellId: "gentle-repose", gp: 0.02, consumed: true })
    ).toMatchObject({ rider: { lit: { en: "2 cp", it: "2 mr" } } });
  });
});
