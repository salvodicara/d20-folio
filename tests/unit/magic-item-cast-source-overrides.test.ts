import { describe, expect, it } from "vitest";
import { getMagicItem } from "@/data/magic-items";
import type { Grant } from "@/lib/grants";

type ItemCastGrant = Extract<Grant, { type: "free-cast-spell" | "free-cast-from-list" }>;

function itemCastGrants(itemId: string): ItemCastGrant[] {
  const item = getMagicItem(itemId);
  if (!item) throw new Error(`missing item fixture ${itemId}`);
  const out: ItemCastGrant[] = [];
  const visit = (grants: ReadonlyArray<Grant>): void => {
    for (const grant of grants) {
      if (grant.type === "choice-grant-bundle") {
        for (const option of grant.options) visit(option.grants);
      } else if (
        grant.type === "free-cast-spell" ||
        grant.type === "free-cast-from-list"
      ) {
        out.push(grant);
      }
    }
  };
  visit(item.grants ?? []);
  return out;
}

describe("magic-item cast-source overrides", () => {
  it.each([
    ["circlet-of-blasting", { attackBonus: 5 }],
    ["cloak-of-arachnida", { saveDC: 13 }],
    ["eyes-of-charming", { saveDC: 13 }],
    ["medallion-of-thoughts", { saveDC: 13 }],
    ["trident-of-fish-command", { saveDC: 15 }],
    ["wand-of-web", { saveDC: 13 }],
    ["wand-of-polymorph", { saveDC: 15 }],
    ["wand-of-fireballs", { saveDC: 15 }],
    ["wand-of-lightning-bolts", { saveDC: 15 }],
  ] as const)("%s declares its fixed-cast profile", (itemId, expected) => {
    expect(itemCastGrants(itemId)).toHaveLength(1);
    expect(itemCastGrants(itemId)[0]?.castOverrides).toEqual(expected);
  });

  it.each([
    ["cube-of-force", 17, 1],
    ["ring-of-elemental-command", 18, 4],
  ] as const)(
    "%s applies DC %i to all %i item-cast pools",
    (itemId, saveDC, poolCount) => {
      const grants = itemCastGrants(itemId);
      expect(grants).toHaveLength(poolCount);
      expect(grants.every((grant) => grant.castOverrides?.saveDC === saveDC)).toBe(true);
    }
  );
});
