/**
 * ⌘K results: grouped under one heading per kind, the best hit's group first, and the
 * arrow keys walking them in reading order, wrapping at both ends.
 */
import { describe, expect, it } from "vitest";

import type { SearchKind } from "@/domains/search/global-search";
import { moveHighlight, paletteView } from "@/domains/search/palette-view";
import type { SearchHit } from "@/domains/search/search-index";

const hit = (kind: SearchKind, id: string): SearchHit => ({
  entry: {
    kind,
    id,
    label: id,
    action: { kind: "explain" },
    names: [id],
  },
  match: "prefix",
  matched: id,
});

describe("paletteView", () => {
  it("groups by kind, the best hit's group first, each in rank order", () => {
    const view = paletteView([
      hit("compendium", "fireball"),
      hit("character", "lyra"),
      hit("compendium", "fire-bolt"),
    ]);
    expect(view.groups.map((g) => g.kind)).toEqual(["compendium", "character"]);
    expect(view.groups[0]?.hits.map((h) => h.entry.id)).toEqual([
      "fireball",
      "fire-bolt",
    ]);
    expect(view.flat.map((h) => h.entry.id)).toEqual(["fireball", "fire-bolt", "lyra"]);
  });

  it("no hits, no groups", () => {
    expect(paletteView([])).toEqual({ groups: [], flat: [] });
  });
});

describe("moveHighlight", () => {
  it("starts at the first row going down and the last going up", () => {
    expect(moveHighlight(-1, 3, 1)).toBe(0);
    expect(moveHighlight(-1, 3, -1)).toBe(2);
  });
  it("wraps at both ends", () => {
    expect(moveHighlight(2, 3, 1)).toBe(0);
    expect(moveHighlight(0, 3, -1)).toBe(2);
  });
  it("an empty list has no highlight", () => {
    expect(moveHighlight(0, 0, 1)).toBe(-1);
  });
});
