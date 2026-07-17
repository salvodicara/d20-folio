import { describe, it, expect } from "vitest";
import { COVER_REFERENCE } from "@/data/cover";

/** M8 — Authoritative-values guard for the Cover reference data. */
describe("COVER_REFERENCE (M8)", () => {
  it("lists exactly the three 2024 cover levels", () => {
    expect(COVER_REFERENCE.map((c) => c.id)).toEqual(["half", "three-quarters", "total"]);
  });

  it("Half Cover grants +2 AC and +2 DEX saves", () => {
    const half = COVER_REFERENCE.find((c) => c.id === "half");
    expect(half?.acBonus).toBe(2);
    expect(half?.dexSaveBonus).toBe(2);
  });

  it("Three-Quarters Cover grants +5 AC and +5 DEX saves", () => {
    const tq = COVER_REFERENCE.find((c) => c.id === "three-quarters");
    expect(tq?.acBonus).toBe(5);
    expect(tq?.dexSaveBonus).toBe(5);
  });

  it("Total Cover yields null bonuses (can't be targeted directly)", () => {
    const total = COVER_REFERENCE.find((c) => c.id === "total");
    expect(total?.acBonus).toBeNull();
    expect(total?.dexSaveBonus).toBeNull();
  });

  it("every entry has a bilingual name + summary", () => {
    for (const c of COVER_REFERENCE) {
      expect(c.name.en).toBeTruthy();
      expect(c.name.it).toBeTruthy();
      expect(c.summary.en).toBeTruthy();
      expect(c.summary.it).toBeTruthy();
    }
  });
});
