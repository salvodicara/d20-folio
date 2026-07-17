/**
 * Magic-item compendium filter — independent rarity / type axes (D36).
 *
 * The owner reported the combined "All" as confusing: one shared "All" chip spanned
 * BOTH rarity and type, so picking a type (e.g. "Rod") turned "All" off and read as
 * "Rod deselected All". The fix splits the facet into TWO independent groups, each
 * with its own "All" (initial null) and its own predicate. P9 added a third
 * independent axis, `attunement` (§2.5 discovery). This pins that:
 *   • there are exactly three filter groups: `rarity`, `type`, `attunement`;
 *   • each defaults to "no filter" (null);
 *   • each predicate gates ONLY its own axis (so the page/modal ANDs them, but the
 *     "All"s never interfere).
 */

import { describe, it, expect } from "vitest";
import { magicItemSpec } from "@/features/compendium/picker";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import type { PickerCtx } from "@/features/compendium/picker";

const ctx = { locale: "en", character: null } as unknown as PickerCtx;

describe("magic-item filter axes (D36)", () => {
  function group(id: string) {
    const g = magicItemSpec.filters.find((f) => f.id === id);
    if (!g) throw new Error(`magic-item filter group "${id}" missing`);
    return g;
  }
  const rarity = group("rarity");
  const type = group("type");
  const attunement = group("attunement");

  it("exposes three independent facet groups: rarity, type, attunement", () => {
    expect(magicItemSpec.filters).toHaveLength(3);
    expect(magicItemSpec.filters.map((f) => f.id).sort()).toEqual([
      "attunement",
      "rarity",
      "type",
    ]);
  });

  it("each axis defaults to 'no filter' (its own All)", () => {
    expect(rarity.initial).toBeNull();
    expect(type.initial).toBeNull();
    expect(attunement.initial).toBeNull();
  });

  it("the rarity predicate gates ONLY rarity (type untouched)", () => {
    const rare = SRD_MAGIC_ITEMS.find((i) => i.rarity === "rare");
    const notRare = SRD_MAGIC_ITEMS.find((i) => i.rarity !== "rare");
    expect(rare && notRare).toBeTruthy();
    if (!rare || !notRare) return;
    // null = All → everything passes.
    expect(rarity.predicate(rare, null, ctx, {})).toBe(true);
    expect(rarity.predicate(notRare, null, ctx, {})).toBe(true);
    // "rare" → only rare items pass; type is irrelevant.
    expect(rarity.predicate(rare, "rare", ctx, {})).toBe(true);
    expect(rarity.predicate(notRare, "rare", ctx, {})).toBe(false);
  });

  it("the type predicate gates ONLY type (rarity untouched)", () => {
    const rod = SRD_MAGIC_ITEMS.find((i) => i.type === "rod");
    const notRod = SRD_MAGIC_ITEMS.find((i) => i.type !== "rod");
    expect(rod && notRod).toBeTruthy();
    if (!rod || !notRod) return;
    expect(type.predicate(rod, null, ctx, {})).toBe(true);
    expect(type.predicate(rod, "rod", ctx, {})).toBe(true);
    expect(type.predicate(notRod, "rod", ctx, {})).toBe(false);
  });
});
