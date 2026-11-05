/**
 * What a damage tray sends to a sheet on another device (`rowDamageParts`): each type's
 * damage before defenses, so the write decides Resistance from the sheet as it stands
 * then. The tray's own number stands only when the hitter chose it on purpose: a
 * hand-picked multiplier, or the defense chip turned off.
 */
import { describe, expect, it } from "vitest";
import {
  initialTrayRow,
  rowDamageParts,
  setMultiplier,
  toggleDefense,
  toggleSaved,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import { NO_DEFENSES as DEFAULT_DAMAGE_DEFENSES } from "@/lib/damage-intake";

const slash = {
  effect: "damage",
  damageType: "slashing",
  targets: ["pc-bren"],
} as DamageTrayPlan;

describe("a row's damage before defenses, for another device to resolve", () => {
  it("a target with no defense the tray knew of: the whole hit, typed (the write may still halve it)", () => {
    expect(
      rowDamageParts(initialTrayRow(slash, "pc-bren"), slash, { total: 10 })
    ).toEqual([{ amount: 10, type: "slashing", delivery: "automatic" }]);
  });

  it("a known Resistance: the parts before it; the write halves", () => {
    const row = initialTrayRow(slash, "pc-bren", {
      ...DEFAULT_DAMAGE_DEFENSES,
      resistances: new Set(["slashing"]),
    });
    expect(row.multiplier).toBe("0.5");
    expect(rowDamageParts(row, slash, { total: 10 })?.[0]?.amount).toBe(10);
  });

  it("a save for half counts before defenses", () => {
    const plan = {
      ...slash,
      save: { ability: "DEX", dc: 14, onSave: "half" },
    } as DamageTrayPlan;
    const saved = toggleSaved(initialTrayRow(plan, "pc-bren"), plan);
    expect(rowDamageParts(saved, plan, { total: 10 })).toEqual([
      { amount: 5, type: "slashing", delivery: "save" },
    ]);
  });

  it("several types: each part with its type", () => {
    const plan = {
      ...slash,
      damageType: undefined,
      damageTypes: ["fire", "cold"],
    } as DamageTrayPlan;
    expect(
      rowDamageParts(initialTrayRow(plan, "pc-bren"), plan, {
        total: null,
        byType: { fire: 6, cold: 4 },
      })
    ).toEqual([
      { amount: 6, type: "fire", delivery: "automatic" },
      { amount: 4, type: "cold", delivery: "automatic" },
    ]);
  });

  it("the hitter's choice stands: a hand-picked multiplier, the defense chip turned off", () => {
    const row = initialTrayRow(slash, "pc-bren", {
      ...DEFAULT_DAMAGE_DEFENSES,
      resistances: new Set(["slashing"]),
    });
    expect(rowDamageParts(setMultiplier(row, "2"), slash, { total: 10 })).toBeNull();
    expect(rowDamageParts(toggleDefense(row, slash), slash, { total: 10 })).toBeNull();
  });
});
