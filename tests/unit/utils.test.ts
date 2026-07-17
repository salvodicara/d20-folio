import { describe, it, expect } from "vitest";
import {
  cn,
  slugify,
  formatModifier,
  formatSpeed,
  speedToLocaleValue,
  speedFromLocaleValue,
  formatRange,
  idToHue,
  clampNumber,
  scaleCantripDice,
  spellInstanceCount,
  scaleUpcastDice,
  pickDiceByLevel,
} from "@/lib/utils";
import { ALIGNMENTS, isStandardAlignment } from "@/lib/lore-utils";

describe("clampNumber (#30 shared numeric validator)", () => {
  it("clamps into [min, max]", () => {
    expect(clampNumber(50, 1, 30)).toBe(30);
    expect(clampNumber(-5, 1, 30)).toBe(1);
    expect(clampNumber(17, 1, 30)).toBe(17);
  });
  it("uses the generous defaults when no bounds given", () => {
    expect(clampNumber(9999999)).toBe(9999);
    expect(clampNumber(-9999999)).toBe(-999);
  });
  it("falls back to min for non-finite input (NaN guard)", () => {
    expect(clampNumber(NaN, 0, 10)).toBe(0);
    expect(clampNumber(Infinity, 0, 10)).toBe(10);
  });
});

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    const condition = Math.random() > 2; // always false, but not statically known
    expect(cn("foo", condition ? "bar" : undefined, "baz")).toBe("foo baz");
  });

  it("merges tailwind conflicts", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

describe("slugify", () => {
  it("slugifies basic text", () => {
    expect(slugify("Cure Wounds")).toBe("cure-wounds");
  });

  it("handles special characters", () => {
    expect(slugify("Hunter's Mark")).toBe("hunters-mark");
  });
});

describe("formatModifier", () => {
  it("formats positive modifiers", () => {
    expect(formatModifier(2)).toBe("+2");
  });

  it("formats negative modifiers", () => {
    expect(formatModifier(-1)).toBe("-1");
  });

  it("formats zero", () => {
    expect(formatModifier(0)).toBe("+0");
  });
});

describe("formatRange", () => {
  it("abbreviates EN 'feet' to 'ft'", () => {
    expect(formatRange("60 feet", "en")).toBe("60 ft");
    expect(formatRange("5 feet", "en")).toBe("5 ft");
  });

  it("abbreviates EN 'foot' to 'ft'", () => {
    expect(formatRange("1 foot", "en")).toBe("1 ft");
  });

  it("keeps non-distance EN ranges verbatim", () => {
    expect(formatRange("Self", "en")).toBe("Self");
    expect(formatRange("Touch", "en")).toBe("Touch");
    expect(formatRange("Sight", "en")).toBe("Sight");
    expect(formatRange("Unlimited", "en")).toBe("Unlimited");
  });

  it("does not touch already-hyphenated foot qualifiers", () => {
    // "Self (15-foot cube)" — the hyphenated compound is left alone.
    expect(formatRange("Self (15-foot cube)", "en")).toBe("Self (15-foot cube)");
  });

  it("leaves IT 'metri' strings as-is (the conversion is already stored)", () => {
    expect(formatRange("18 metri", "it")).toBe("18 metri");
    expect(formatRange("Contatto", "it")).toBe("Contatto");
  });
});

describe("formatSpeed", () => {
  it("formats 30 in EN as '30 ft'", () => {
    expect(formatSpeed("30", "en")).toBe("30 ft");
  });

  it("formats 30 in IT as '9 m'", () => {
    expect(formatSpeed("30", "it")).toBe("9 m");
  });

  it("formats numeric input", () => {
    expect(formatSpeed(25, "en")).toBe("25 ft");
  });

  it("formats 25 in IT as '7,5 m'", () => {
    expect(formatSpeed(25, "it")).toBe("7,5 m");
  });

  it("returns original string for non-numeric", () => {
    expect(formatSpeed("fast", "en")).toBe("fast");
  });

  it("applies exhaustion speed reduction (−5 ft/level) in EN", () => {
    // 30 − 5×2 = 20 ft
    expect(formatSpeed("30", "en", 2)).toBe("20 ft");
  });

  it("applies exhaustion speed reduction before locale conversion in IT", () => {
    // 30 − 5×1 = 25 ft → 7,5 m
    expect(formatSpeed("30", "it", 1)).toBe("7,5 m");
  });

  it("floors effective speed at 0 and clamps exhaustion to 6", () => {
    // 20 ft, 6 levels → 20 − 30 = −10 → floored to 0
    expect(formatSpeed("20", "en", 6)).toBe("0 ft");
    expect(formatSpeed("20", "en", 99)).toBe("0 ft");
  });

  it("applies a flat extra reduction (heavy-armor Strength penalty)", () => {
    // 30 − 10 = 20 ft
    expect(formatSpeed("30", "en", 0, 10)).toBe("20 ft");
  });

  it("stacks exhaustion and armor reductions", () => {
    // 30 − 5×1 − 10 = 15 ft
    expect(formatSpeed("30", "en", 1, 10)).toBe("15 ft");
  });
});

describe("speedToLocaleValue", () => {
  it("EN: returns feet as-is", () => {
    expect(speedToLocaleValue("30", "en")).toBe("30");
  });

  it("IT: converts feet to metres", () => {
    expect(speedToLocaleValue("30", "it")).toBe("9");
  });

  it("IT: handles 25 feet → 7,5 metres", () => {
    expect(speedToLocaleValue("25", "it")).toBe("7,5");
  });

  it("IT: handles 60 feet → 18 metres", () => {
    expect(speedToLocaleValue("60", "it")).toBe("18");
  });

  it("returns original for non-numeric", () => {
    expect(speedToLocaleValue("varies", "en")).toBe("varies");
  });
});

describe("speedFromLocaleValue", () => {
  it("EN: keeps feet as-is", () => {
    expect(speedFromLocaleValue("30", "en")).toBe("30");
  });

  it("IT: converts 9 metres to 30 feet", () => {
    expect(speedFromLocaleValue("9", "it")).toBe("30");
  });

  it("IT: converts 7,5 metres to 25 feet (comma decimal)", () => {
    expect(speedFromLocaleValue("7,5", "it")).toBe("25");
  });

  it("IT: converts 18 metres to 60 feet", () => {
    expect(speedFromLocaleValue("18", "it")).toBe("60");
  });

  it("IT: rounds to nearest 5 feet", () => {
    // 10m → 10/0.3 = 33.33... → rounds to 35
    expect(speedFromLocaleValue("10", "it")).toBe("35");
  });

  it("returns original for non-numeric", () => {
    expect(speedFromLocaleValue("fast", "it")).toBe("fast");
  });
});

// ─── ALIGNMENTS / isStandardAlignment ────────────────────────────────────────

describe("ALIGNMENTS", () => {
  it("has exactly 10 entries", () => {
    expect(ALIGNMENTS).toHaveLength(10);
  });

  it("contains the 9 standard D&D alignments plus Unaligned", () => {
    expect(ALIGNMENTS).toContain("Lawful Good");
    expect(ALIGNMENTS).toContain("True Neutral");
    expect(ALIGNMENTS).toContain("Chaotic Evil");
    expect(ALIGNMENTS).toContain("Unaligned");
  });

  it("has no duplicates", () => {
    expect(new Set(ALIGNMENTS).size).toBe(ALIGNMENTS.length);
  });
});

describe("isStandardAlignment", () => {
  it("returns true for standard alignment strings", () => {
    expect(isStandardAlignment("Lawful Good")).toBe(true);
    expect(isStandardAlignment("Chaotic Neutral")).toBe(true);
    expect(isStandardAlignment("Unaligned")).toBe(true);
  });

  it("returns false for non-standard strings", () => {
    expect(isStandardAlignment("Neutral")).toBe(false);
    expect(isStandardAlignment("chaotic good")).toBe(false); // case-sensitive
    expect(isStandardAlignment("")).toBe(false);
    expect(isStandardAlignment("Random String")).toBe(false);
  });
});

describe("idToHue", () => {
  it("returns a number in 0–359 range", () => {
    const hue = idToHue("abc123");
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });

  it("is deterministic — same id always yields the same hue", () => {
    expect(idToHue("char-xyz-001")).toBe(idToHue("char-xyz-001"));
  });

  it("produces distinct hues for different ids (collision check across a sample)", () => {
    const ids = ["char-a", "char-b", "char-c", "xyz-001", "abc-999"];
    const hues = ids.map(idToHue);
    // All values within range
    hues.forEach((h) => {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    });
    // Not all the same (extremely unlikely to collide for these inputs)
    const unique = new Set(hues);
    expect(unique.size).toBeGreaterThan(1);
  });

  it("handles empty string without throwing", () => {
    expect(() => idToHue("")).not.toThrow();
    const hue = idToHue("");
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });
});

describe("scaleCantripDice (S12 — 2024 cantrip damage scaling)", () => {
  it("scales the die COUNT at character levels 5/11/17 (1d10 → 1/2/3/4 d10)", () => {
    expect(scaleCantripDice("1d10", 1)).toBe("1d10");
    expect(scaleCantripDice("1d10", 4)).toBe("1d10");
    expect(scaleCantripDice("1d10", 5)).toBe("2d10");
    expect(scaleCantripDice("1d10", 10)).toBe("2d10");
    expect(scaleCantripDice("1d10", 11)).toBe("3d10");
    expect(scaleCantripDice("1d10", 16)).toBe("3d10");
    expect(scaleCantripDice("1d10", 17)).toBe("4d10");
    expect(scaleCantripDice("1d10", 20)).toBe("4d10");
  });

  it("preserves the die FACE, only multiplying the count", () => {
    expect(scaleCantripDice("1d6", 11)).toBe("3d6");
    expect(scaleCantripDice("1d8", 17)).toBe("4d8");
    expect(scaleCantripDice("1d12", 5)).toBe("2d12");
  });

  it("ignores the stored count and resolves from level (cantrips always start at 1)", () => {
    // Defensive: even a malformed "2d6" stored base resolves to the level tier.
    expect(scaleCantripDice("2d6", 1)).toBe("1d6");
  });

  it("returns a non-NdM string / undefined unchanged", () => {
    expect(scaleCantripDice(undefined, 11)).toBeUndefined();
    expect(scaleCantripDice("1d4+1", 11)).toBe("1d4+1"); // multi-instance form left as-is
    expect(scaleCantripDice("", 11)).toBe("");
  });
});

describe("spellInstanceCount (S12b — multi-instance spell dice)", () => {
  // fail-before: without the `instances` shape the helper does not exist; a
  // single-roll spell returns null (the surfaces show the bare die).
  const magicMissile = { level: 1, instances: 3, instancesPerUpcast: 1 };
  const scorchingRay = { level: 2, instances: 3, instancesPerUpcast: 1 };

  it("returns the base instance count when cast at the spell's own level", () => {
    expect(spellInstanceCount(magicMissile)).toBe(3); // 3 darts at L1
    expect(spellInstanceCount(scorchingRay)).toBe(3); // 3 rays at L2
  });

  it("adds one instance per slot level above the spell's own (upcast)", () => {
    expect(spellInstanceCount(magicMissile, 2)).toBe(4); // +1 dart at L2
    expect(spellInstanceCount(magicMissile, 5)).toBe(7); // +4 darts at L5
    expect(spellInstanceCount(scorchingRay, 3)).toBe(4); // +1 ray at L3
    expect(spellInstanceCount(scorchingRay, 6)).toBe(7); // +4 rays at L6
  });

  it("never drops below the base count for a below-level cast", () => {
    expect(spellInstanceCount(magicMissile, 0)).toBe(3);
  });

  it("treats a missing per-upcast bump as zero", () => {
    expect(spellInstanceCount({ level: 1, instances: 2 }, 4)).toBe(2);
  });

  it("returns null for a single-roll spell (no `instances`)", () => {
    expect(spellInstanceCount({ level: 3 })).toBeNull();
  });
});

describe("scaleUpcastDice (S12c — leveled damage spell upcast scaling)", () => {
  // fail-before: before the field+helper, the surfaces showed the BASE dice at
  // EVERY slot level (Fireball read "8d6" cast at 3rd, 5th, OR 9th). The helper
  // scales the dice COUNT by the per-slot increment for the chosen cast level.
  const fireball = { level: 3, damageDice: "8d6", damageDicePerUpcast: "1d6" };
  const lightningBolt = { level: 3, damageDice: "8d6", damageDicePerUpcast: "1d6" };

  it("returns the base dice when cast at the spell's own level", () => {
    expect(scaleUpcastDice(fireball, 3)).toBe("8d6"); // 8d6 at 3rd
    expect(scaleUpcastDice(fireball)).toBe("8d6"); // default castLevel = base
  });

  it("adds the increment dice per slot level above the spell's own", () => {
    expect(scaleUpcastDice(fireball, 5)).toBe("10d6"); // +2d6 at 5th
    expect(scaleUpcastDice(fireball, 9)).toBe("14d6"); // +6d6 at 9th
    expect(scaleUpcastDice(lightningBolt, 4)).toBe("9d6"); // +1d6 at 4th
  });

  it("multiplies a multi-die increment (Vitriolic Sphere +2d4/level)", () => {
    const vitriolic = { level: 4, damageDice: "10d4", damageDicePerUpcast: "2d4" };
    expect(scaleUpcastDice(vitriolic, 6)).toBe("14d4"); // +2×2d4 at 6th
  });

  it("preserves a flat tail on the base dice (Disintegrate 10d6+40)", () => {
    const disintegrate = { level: 6, damageDice: "10d6+40", damageDicePerUpcast: "3d6" };
    expect(scaleUpcastDice(disintegrate, 6)).toBe("10d6+40");
    expect(scaleUpcastDice(disintegrate, 7)).toBe("13d6+40"); // +3d6, +40 kept
  });

  it("never scales below the base for a below-level cast", () => {
    expect(scaleUpcastDice(fireball, 1)).toBe("8d6");
  });

  it("returns the base dice unchanged when the spell does not scale", () => {
    // A ray-count spell (Magic Missile) scales its instance COUNT, not its dice —
    // it carries no `damageDicePerUpcast`, so the dice are returned verbatim.
    const magicMissile = { level: 1, damageDice: "1d4+1" };
    expect(scaleUpcastDice(magicMissile, 5)).toBe("1d4+1");
    expect(spellInstanceCount({ level: 1, instances: 3, instancesPerUpcast: 1 }, 5)).toBe(
      7
    );
  });

  it("returns the base dice when faces differ or dice are unparseable (guard)", () => {
    // A defensive guard — the backfill enforces matched faces, but a mismatched
    // increment must not silently produce a nonsense formula.
    expect(
      scaleUpcastDice({ level: 3, damageDice: "8d6", damageDicePerUpcast: "1d8" }, 5)
    ).toBe("8d6");
    expect(scaleUpcastDice({ level: 3, damageDicePerUpcast: "1d6" }, 5)).toBeUndefined();
  });
});

describe("pickDiceByLevel (S12b — level-keyed dice, shared aura/form-attack/action)", () => {
  // The Stars Archer/Chalice die: 1d8 from L3, 2d8 from L10 (Twinkling).
  const stars = { 3: "1d8", 10: "2d8" } as const;

  it("returns the highest threshold ≤ level", () => {
    expect(pickDiceByLevel(stars, 3)).toBe("1d8");
    expect(pickDiceByLevel(stars, 9)).toBe("1d8");
    expect(pickDiceByLevel(stars, 10)).toBe("2d8");
    expect(pickDiceByLevel(stars, 20)).toBe("2d8");
  });

  it("returns undefined below the first threshold or with no map (caller floors)", () => {
    expect(pickDiceByLevel(stars, 2)).toBeUndefined();
    expect(pickDiceByLevel(undefined, 10)).toBeUndefined();
  });
});
