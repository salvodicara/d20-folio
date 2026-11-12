/**
 * A card's use counter. Carried copies (two vials of Basic Poison, three potions)
 * read as the inventory's "×2": the inventory knows how many are left, not how
 * many there were, so a "2/2" ratio would claim a total that does not exist. A
 * pool or tracker (Ki points, a Healer's Kit's ten uses) reads "left/total".
 */
import { describe, expect, it } from "vitest";
import { usesGloss } from "@/features/character/center/tabs/combat-card-helpers";

describe("usesGloss", () => {
  it("carried copies read ×N, before and after one is spent", () => {
    expect(usesGloss({ current: 2, total: 2, stock: true })).toBe("×2");
    expect(usesGloss({ current: 1, total: 1, stock: true })).toBe("×1");
  });

  it("a pool reads left/total, with its unit", () => {
    expect(usesGloss({ current: 7, total: 10 }, "uses")).toBe("7/10 uses");
    expect(usesGloss({ current: 2, total: 3 })).toBe("2/3");
  });
});
