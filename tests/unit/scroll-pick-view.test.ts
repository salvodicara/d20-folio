/**
 * The spells a Spell Scroll may hold, for «Quale incantesimo è su questa pergamena?»:
 * with nothing typed, the reader's own lists; typed, any spell by its name (accents
 * aside), the reader's first.
 */
import { describe, expect, it } from "vitest";
import { scrollPickView } from "@/domains/play/scroll-pick-view";
import { MOCK_CHARACTER } from "@/lib/mock";

describe("scrollPickView", () => {
  it("nothing typed: only the spells on the reader's lists, by level", () => {
    const view = scrollPickView(MOCK_CHARACTER, "", "it", 500);
    expect(view.length).toBeGreaterThan(20);
    expect(view.every((s) => s.onList)).toBe(true);
    expect(view.map((s) => s.level)).toEqual(
      [...view.map((s) => s.level)].sort((a, b) => a - b)
    );
  });

  it("typed: any spell whose name holds it, the reader's lists first", () => {
    const view = scrollPickView(MOCK_CHARACTER, "palla", "it");
    expect(view.map((s) => s.id)).toContain("fireball");
    expect(view.find((s) => s.id === "fireball")?.onList).toBe(false);
  });

  it("accents don't matter", () => {
    expect(scrollPickView(MOCK_CHARACTER, "velocita", "it").map((s) => s.id)).toContain(
      "haste"
    );
  });
});
