/**
 * Phase 5 parallel-validation test (A4).
 *
 * For every SRD magic item with a parseable AC bonus, the legacy
 * `parseMagicItemAcBonus` and the new declarative `evaluateGrants`
 * path must produce the same number.
 */

import { describe, it, expect } from "vitest";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { parseMagicItemAcBonus } from "@/lib/magic-item-utils";
import { evaluateGrants, type GrantSource } from "@/lib/grants";

describe("Phase 5 — Magic item AC bonus migration parity", () => {
  const itemsWithAcBonus = SRD_MAGIC_ITEMS.filter(
    (i) => parseMagicItemAcBonus(i) !== undefined
  );

  it("at least one magic item carries an AC bonus", () => {
    expect(itemsWithAcBonus.length).toBeGreaterThan(0);
  });

  for (const item of itemsWithAcBonus) {
    it(`${item.id}: declarative ac-bonus grant matches parseMagicItemAcBonus`, () => {
      const legacy = parseMagicItemAcBonus(item) ?? 0;
      const source: GrantSource = {
        id: item.id,

        grants: item.grants,
      };
      const declarative = evaluateGrants([source]).acBonus;
      expect(declarative).toBe(legacy);
    });
  }
});
