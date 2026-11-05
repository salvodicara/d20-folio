/**
 * The public rules of a magic item as an object (SRD 5.2.1 "Magic Items": "Most
 * magic items, other than Potions and Scrolls, have Resistance to all damage") and a
 * sentient item's conflict ("a Charisma saving throw" against 12 + the item's
 * Charisma modifier). Neither hides anything, so neither needs the DM's state.
 */
import { describe, expect, it } from "vitest";

import { damageToItem, sentientConflictDc } from "@/lib/item-overlays";

describe("damage to a magic item", () => {
  it("halves it, rounded down, on most magic items", () => {
    expect(damageToItem("cloak-of-protection", 10)).toBe(5);
    expect(damageToItem("cloak-of-protection", 7)).toBe(3);
  });

  it("a Potion or a Scroll takes it whole", () => {
    expect(damageToItem("potion-of-healing", 10)).toBe(10);
    expect(damageToItem("spell-scroll", 10)).toBe(10);
  });

  it("an item the catalogue doesn't know takes it whole", () => {
    expect(damageToItem("a-rock", 10)).toBe(10);
  });
});

describe("a sentient item's conflict", () => {
  it("is a save against 12 + the item's Charisma modifier", () => {
    expect(sentientConflictDc({ charisma: 16 })).toBe(15);
    expect(sentientConflictDc({ charisma: 9 })).toBe(11);
  });
});
