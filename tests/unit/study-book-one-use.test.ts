/**
 * A manual or tome raises an ability once: "After you spend 48 hours … studying
 * the book's contents …, your <ability> score increases by 2, to a maximum of 30.
 * The manual then loses its magic, but regains it in a century." So every item
 * carrying a `permanent-ability-increase` declares one use whose depletion leaves
 * the copy nonmagical — the Study action spends it, and the same book can't be
 * studied twice. Cases come from the catalogue itself.
 */
import { describe, expect, it } from "vitest";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";

const books = SRD_MAGIC_ITEMS.filter((item) =>
  (item.grants ?? []).some((grant) => grant.type === "permanent-ability-increase")
);

describe("study books are one use, then nonmagical", () => {
  it("finds the manuals and tomes", () => {
    expect(books.length).toBeGreaterThanOrEqual(6);
  });

  it.each(books.map((item) => [item.id, item] as const))(
    "%s declares one use that leaves it nonmagical",
    (_id, item) => {
      const uses = (item.resources ?? []).filter((resource) => resource.id === "uses");
      expect(uses).toHaveLength(1);
      const [spec] = uses;
      expect(spec?.capacity).toEqual({ kind: "fixed", amount: 1 });
      expect(spec?.recoveries ?? []).toEqual([]);
      expect(spec?.onEmpty).toEqual({
        kind: "deterministic",
        outcomes: [{ kind: "set-item-disposition", disposition: "nonmagical" }],
      });
    }
  );
});
