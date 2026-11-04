/**
 * Recovering expended spell slots (edge-case family M12): a budget of combined slot
 * levels (Arcane Recovery: half the Wizard level, none of 6th+) or a number of slots
 * (a spell: "up to two slots, none above 2nd; 3rd from a 6–7 slot, 4th from 8+").
 */
import { describe, expect, it } from "vitest";

import { arcaneRecoveryPicker } from "@/lib/arcane-recovery";
import {
  recoverableSlots,
  slotRecoveryRuleForCast,
  validSlotRecovery,
} from "@/lib/play/slot-recovery";
import type { Scalar } from "@/lib/scalar";

const expended = [
  { level: 1, expended: 3 },
  { level: 2, expended: 2 },
  { level: 3, expended: 1 },
];

// The spell's table: 2nd-level slots below a 6th-level cast, 3rd at 6–7, 4th at 8+.
const maxSlotLevel: Scalar = {
  kind: "table" as const,
  input: { kind: "binding" as const, bindingId: "cast.level" },
  below: { kind: "fixed" as const, value: 2 },
  rows: [
    { atLeast: 6, value: { kind: "fixed" as const, value: 3 } },
    { atLeast: 8, value: { kind: "fixed" as const, value: 4 } },
  ],
};

describe("recoverableSlots", () => {
  it("a count of slots: up to two, none above the cap", () => {
    const pick = recoverableSlots({ count: 2, maxSlotLevel: 2 }, expended, { 1: 1 });
    expect(pick.budget).toEqual({ kind: "slots", cap: 2, remaining: 1 });
    expect(pick.rows.map((r) => [r.level, r.max])).toEqual([
      [1, 2],
      [2, 1],
    ]);
    expect(pick.slotLevels).toEqual([1]);
  });

  it("a budget of levels behaves as Arcane Recovery always has", () => {
    const pick = recoverableSlots({ totalLevels: 3, maxSlotLevel: 5 }, expended, {
      2: 1,
    });
    expect(pick.budget).toEqual({ kind: "levels", cap: 3, remaining: 1 });
    expect(arcaneRecoveryPicker(5, expended, { 2: 1 })).toMatchObject({
      cap: 3,
      remaining: 1,
      slotLevels: [2],
    });
  });

  it("validates a plan against the rule", () => {
    expect(validSlotRecovery({ count: 2, maxSlotLevel: 2 }, [2, 1])).toBe(true);
    expect(validSlotRecovery({ count: 2, maxSlotLevel: 2 }, [1, 1, 1])).toBe(false);
    expect(validSlotRecovery({ count: 2, maxSlotLevel: 2 }, [3])).toBe(false);
    expect(validSlotRecovery({ totalLevels: 3, maxSlotLevel: 5 }, [2, 2])).toBe(false);
  });
});

describe("slotRecoveryRuleForCast", () => {
  it("reads the slot cap off the cast level, and one more slot per upcast", () => {
    const effect = { kind: "recover-slots" as const, count: 2, maxSlotLevel };
    expect(slotRecoveryRuleForCast(effect, 5, 5)).toEqual({ count: 2, maxSlotLevel: 2 });
    expect(slotRecoveryRuleForCast(effect, 7, 5)).toEqual({ count: 2, maxSlotLevel: 3 });
    expect(slotRecoveryRuleForCast(effect, 9, 5)).toEqual({ count: 2, maxSlotLevel: 4 });
    expect(slotRecoveryRuleForCast({ ...effect, perUpcast: 1 }, 7, 5)).toEqual({
      count: 4,
      maxSlotLevel: 3,
    });
  });
});
