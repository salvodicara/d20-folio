/**
 * Unit tests for H7 — subclass expanded-spell helpers.
 */

import { describe, it, expect } from "vitest";
import {
  getExpandedSpellsAtLevel,
  getExpandedSpellsThroughLevel,
  injectExpandedSpells,
} from "@/lib/expanded-spells";
import type { SrdSpellRef, CustomSpell } from "@/types/character";

describe("getExpandedSpellsAtLevel", () => {
  it("returns the Life Domain L3 expansion exactly (2024)", () => {
    expect(getExpandedSpellsAtLevel("cleric", "life-domain", 3)).toEqual([
      "aid",
      "bless",
      "cure-wounds",
      "lesser-restoration",
    ]);
  });

  // (The War Domain pin — a pack subclass — lives in
  // `content-pack/tests/unit/expanded-spells.pack.test.ts`.)

  it("returns [] for a level with no expansion threshold", () => {
    expect(getExpandedSpellsAtLevel("cleric", "life-domain", 4)).toEqual([]);
  });

  it("returns [] for an unknown class or subclass", () => {
    expect(getExpandedSpellsAtLevel("cleric", "phantom-domain", 3)).toEqual([]);
    expect(getExpandedSpellsAtLevel("bogus", "life-domain", 3)).toEqual([]);
    expect(getExpandedSpellsAtLevel("", "", 3)).toEqual([]);
  });
});

// (The M60 Druid Circle + M57 non-Devotion Paladin oath pins — pack
// subclasses — live in `content-pack/tests/unit/expanded-spells.pack.test.ts`.)

describe("Paladin oath expanded spells (M57)", () => {
  it("Oath of Devotion grants Protection from Evil and Good + Shield of Faith at L3", () => {
    expect(getExpandedSpellsAtLevel("paladin", "oath-of-devotion", 3)).toEqual([
      "protection-from-evil-and-good",
      "shield-of-faith",
    ]);
  });
});

describe("getExpandedSpellsThroughLevel", () => {
  it("collects everything at or below the level", () => {
    // L5 hits both the L3 and L5 thresholds for Life Domain.
    expect(getExpandedSpellsThroughLevel("cleric", "life-domain", 5).sort()).toEqual(
      [
        "aid",
        "bless",
        "cure-wounds",
        "lesser-restoration",
        "mass-healing-word",
        "revivify",
      ].sort()
    );
  });

  it("returns [] when the character is below the first threshold", () => {
    expect(getExpandedSpellsThroughLevel("cleric", "life-domain", 1)).toEqual([]);
    expect(getExpandedSpellsThroughLevel("cleric", "life-domain", 2)).toEqual([]);
  });

  it("walks all four thresholds (L3/L5/L7/L9) cumulatively", () => {
    expect(getExpandedSpellsThroughLevel("cleric", "life-domain", 9).sort()).toEqual(
      [
        "aid",
        "aura-of-life",
        "bless",
        "cure-wounds",
        "death-ward",
        "greater-restoration",
        "lesser-restoration",
        "mass-cure-wounds",
        "mass-healing-word",
        "revivify",
      ].sort()
    );
  });
});

describe("injectExpandedSpells", () => {
  const cure: SrdSpellRef = { srdId: "cure-wounds", prepared: true };
  const custom: CustomSpell = {
    custom: true,
    name: "Heal Friend",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "Touch",
    components: { v: true, s: false, m: false },
    duration: "Instant",
    concentration: false,
    description: "",
  };

  it("appends new SRD refs flagged prepared", () => {
    const out = injectExpandedSpells([cure], ["bless"]);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ srdId: "bless", prepared: true, alwaysPrepared: true });
  });

  it("skips ids already present as SRD ref", () => {
    const out = injectExpandedSpells([cure], ["cure-wounds", "bless"]);
    expect(out.map((s) => ("custom" in s ? s.name : s.srdId))).toEqual([
      "cure-wounds",
      "bless",
    ]);
  });

  it("preserves custom spells", () => {
    const out = injectExpandedSpells([custom], ["bless"]);
    expect(out[0]).toBe(custom);
    expect(out[1]).toEqual({ srdId: "bless", prepared: true, alwaysPrepared: true });
  });

  it("returns a shallow copy when ids is empty", () => {
    const input = [cure];
    const out = injectExpandedSpells(input, []);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it("dedupes within the ids list", () => {
    const out = injectExpandedSpells([], ["bless", "bless"]);
    expect(out).toEqual([{ srdId: "bless", prepared: true, alwaysPrepared: true }]);
  });

  it("A2 — every injected ref carries alwaysPrepared so the prepared-count helper can exclude it", () => {
    const out = injectExpandedSpells([], ["bless", "cure-wounds", "guiding-bolt"]);
    expect(out).toHaveLength(3);
    for (const ref of out) {
      expect("custom" in ref).toBe(false);
      if (!("custom" in ref)) {
        expect(ref.alwaysPrepared).toBe(true);
        expect(ref.prepared).toBe(true);
      }
    }
  });
});
