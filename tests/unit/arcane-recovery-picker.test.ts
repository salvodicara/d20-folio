import { describe, expect, it } from "vitest";

import { arcaneRecoveryPicker } from "@/lib/arcane-recovery";

// The SRD's own example: a 4th-level wizard recovers two slot levels in all
// (one 2nd or two 1sts), never a slot of 6th level or higher.
describe("arcaneRecoveryPicker", () => {
  const expended = [
    { level: 2, expended: 1 },
    { level: 1, expended: 2 },
    { level: 6, expended: 1 },
  ];

  it("offers the expended slots up to 5th, lowest first, within ⌈level/2⌉", () => {
    const p = arcaneRecoveryPicker(4, expended, {});
    expect(p.cap).toBe(2);
    expect(p.remaining).toBe(2);
    expect(p.rows).toEqual([
      { level: 1, expended: 2, count: 0, max: 2 },
      { level: 2, expended: 1, count: 0, max: 1 },
    ]);
    expect(p.slotLevels).toEqual([]);
  });

  it("a 2nd-level pick spends the whole budget, so no 1st fits", () => {
    const p = arcaneRecoveryPicker(4, expended, { 2: 1 });
    expect(p.remaining).toBe(0);
    expect(p.rows.map((r) => r.max)).toEqual([0, 1]);
    expect(p.slotLevels).toEqual([2]);
  });
});
