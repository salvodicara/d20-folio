/**
 * formatArmorAcValue — the read-only armor AC fact (owner 2026-06-08: "show useful
 * stuff e.g. the AC of an armor"). Pins the formula display per armor category.
 */
import { describe, it, expect } from "vitest";
import { formatArmorAcValue } from "@/lib/armor-display";

// A minimal t: resolves the two keys the formatter uses; echoes anything else.
const t = (key: string, opts?: Record<string, unknown>): string => {
  if (key === "abilities.DEX_short") return "DEX";
  if (key === "equipment.acMaxDex") return `max ${String(opts?.n)}`;
  return key;
};

describe("formatArmorAcValue", () => {
  it("heavy armor → a flat number (no DEX)", () => {
    expect(formatArmorAcValue({ base: 18, dexBonus: false }, "heavy", t)).toBe("18");
  });

  it("light armor → base + DEX (uncapped)", () => {
    expect(formatArmorAcValue({ base: 11, dexBonus: true }, "light", t)).toBe("11 + DEX");
  });

  it("medium armor → base + DEX (max N)", () => {
    expect(formatArmorAcValue({ base: 14, dexBonus: true, maxDex: 2 }, "medium", t)).toBe(
      "14 + DEX (max 2)"
    );
  });

  it("shield → a flat bonus", () => {
    expect(formatArmorAcValue({ base: 2, dexBonus: false }, "shield", t)).toBe("+2");
  });
});
