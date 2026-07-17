/**
 * Mechanics-accuracy fix batch — magic items (M02, M25), from the
 * wikidot-vs-`src/data` mechanics audit.
 *
 *   M02 — the no-op generic +1/+2/+3 Weapon/Armor/Shield rows are deleted
 *         (the correctly-modeled `*-plus-N` split rows already cover the
 *         family, wired through the same grant seam).
 *   M25 — Ioun Stone's flat rarity corrected ("common" matched no real tier;
 *         "rare" is its lowest actual tier).
 *
 * M27 (Rod of the Pact Keeper / Wand of the War Mage +2/+3 tiers) and M30
 * (Belt of Dwarvenkind Resilience) are pinned alongside their siblings in
 * `tests/unit/aggregated-grants.table.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { getMagicItem } from "@/data/magic-items";
import { evaluateGrants, type GrantSource } from "@/lib/grants";

describe("M02 — generic +1/+2/+3 Weapon/Armor/Shield no-ops removed", () => {
  it.each(["weapon-1-2-or-3", "armor-1-2-or-3", "shield-1-2-or-3"])(
    "%s no longer exists in the magic-item catalog",
    (id) => {
      expect(getMagicItem(id)).toBeUndefined();
    }
  );

  it("the +2/+3 armor/shield siblings carry a working AC bonus (Rare/Very-Rare tiers)", () => {
    const cases: ReadonlyArray<readonly [string, number]> = [
      ["armor-plus-2", 2],
      ["armor-plus-3", 3],
      ["shield-plus-2", 2],
      ["shield-plus-3", 3],
    ];
    for (const [id, amount] of cases) {
      const source: GrantSource = { id, grants: getMagicItem(id)?.grants ?? [] };
      expect(evaluateGrants([source]).acBonus, id).toBe(amount);
    }
  });
});

describe("M25 — Belt of Giant Strength / Ioun Stone rarity", () => {
  it("belt-of-giant-strength keeps its already-correct 'rare' (Hill) floor", () => {
    expect(getMagicItem("belt-of-giant-strength")?.rarity).toBe("rare");
  });

  it("ioun-stone rarity is 'rare' (its lowest actual tier), not 'common' (no tier)", () => {
    expect(getMagicItem("ioun-stone")?.rarity).toBe("rare");
  });
});
