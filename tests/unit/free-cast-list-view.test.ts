import { describe, expect, it } from "vitest";

import type { FreeCastFromListPool } from "@/lib/smart-tracker";
import { freeCastListRows } from "@/lib/views/free-cast-list-view";

// A charged item at 4 charges: Hold Monster costs 5 (closed), Hold Person 2 (open).
const pool: FreeCastFromListPool = {
  sourceId: "item-1",
  itemId: "wand-of-binding",
  trackerId: "item-1",
  spellIds: ["hold-monster", "hold-person"],
  maxSpellLevel: 5,
  recovery: { kind: "tracker", rest: "long" },
  charges: 7,
  remaining: 4,
  costBySpell: { "hold-monster": 5, "hold-person": 2 },
};

describe("freeCastListRows", () => {
  it("lists lowest level first, with each spell's charge cost against the pool", () => {
    expect(freeCastListRows(pool, "en", "")).toEqual([
      { id: "hold-person", name: "Hold Person", level: 2, cost: 2, affordable: true },
      { id: "hold-monster", name: "Hold Monster", level: 5, cost: 5, affordable: false },
    ]);
  });

  it("finds a spell by its English name in an Italian session", () => {
    expect(freeCastListRows(pool, "it", "hold person").map((r) => r.id)).toEqual([
      "hold-person",
    ]);
  });
});
