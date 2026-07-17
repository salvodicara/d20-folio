/**
 * Unit tests for the Metamagic picker helpers (M1).
 */

import { describe, it, expect } from "vitest";
import { srd } from "../_harness/loc";
import {
  isMetamagicPlaceholder,
  metamagicPicksAtLevel,
  listMetamagicOptions,
} from "@/lib/metamagic-pick";

describe("isMetamagicPlaceholder", () => {
  it("recognises sorcerer-metamagic", () => {
    expect(isMetamagicPlaceholder("sorcerer-metamagic")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isMetamagicPlaceholder("sorcerer-font-of-magic")).toBe(false);
    expect(isMetamagicPlaceholder("")).toBe(false);
  });
});

describe("metamagicPicksAtLevel", () => {
  it("returns 2 at the three grant levels (2/10/17)", () => {
    expect(metamagicPicksAtLevel(2)).toBe(2);
    expect(metamagicPicksAtLevel(10)).toBe(2);
    expect(metamagicPicksAtLevel(17)).toBe(2);
  });

  it("returns 0 for every other level", () => {
    for (const lvl of [1, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 18, 19, 20]) {
      expect(metamagicPicksAtLevel(lvl)).toBe(0);
    }
  });
});

describe("listMetamagicOptions", () => {
  const list = listMetamagicOptions();

  it("returns all 10 SRD 2024 metamagic options", () => {
    expect(list).toHaveLength(10);
    const ids = list.map((m) => m.id);
    expect(ids).toEqual([
      "careful-spell",
      "distant-spell",
      "empowered-spell",
      "extended-spell",
      "heightened-spell",
      "quickened-spell",
      "seeking-spell",
      "subtle-spell",
      "transmuted-spell",
      "twinned-spell",
    ]);
  });

  it("every option has a bilingual name + non-zero cost", () => {
    for (const m of list) {
      expect(srd("metamagic", m.id, "name", "en")).toBeTruthy();
      expect(srd("metamagic", m.id, "name", "it")).toBeTruthy();
      expect(m.cost).toBeGreaterThanOrEqual(1);
    }
  });

  it("Heightened + Quickened cost 2 SP; the rest cost 1 SP (per 2024 PHB)", () => {
    const costs: Record<string, number> = Object.fromEntries(
      list.map((m) => [m.id, m.cost])
    );
    expect(costs["heightened-spell"]).toBe(2);
    expect(costs["quickened-spell"]).toBe(2);
    expect(costs["careful-spell"]).toBe(1);
    expect(costs["twinned-spell"]).toBe(1);
  });
});
