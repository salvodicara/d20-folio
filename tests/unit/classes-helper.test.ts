/**
 * R4 — the `classes[]` derivation seam (`src/lib/classes.ts`): the single source of
 * truth over the multiclass model. Asserts `getClasses`/`totalLevel`/
 * `primaryClassEntry`/`classEntryLevel`/`allEntryPicks` behave for single-class and
 * multiclass inputs, and that a malformed/empty array falls back to a non-empty
 * default. `classes[]` is the SOLE source of truth — the v2→v3 legacy single-class
 * synthesis was removed once the migration ran (task #24 part 2).
 */
import { describe, expect, it } from "vitest";
import {
  getClasses,
  totalLevel,
  primaryClassEntry,
  primaryClassName,
  primarySubclassName,
  classEntryLevel,
  allEntryPicks,
  isMulticlass,
} from "@/lib/classes";
import type { ClassEntry } from "@/types/character";

describe("getClasses — normalized, always non-empty", () => {
  it("returns the classes[] when present", () => {
    const c = { classes: [{ classId: "wizard", level: 5 }] };
    expect(getClasses(c)).toEqual([{ classId: "wizard", level: 5 }]);
  });

  it("normalizes a fractional level down to a valid integer ≥ 1", () => {
    expect(getClasses({ classes: [{ classId: "monk", level: 3.6 }] })).toEqual([
      { classId: "monk", level: 3 },
    ]);
  });

  it("carries the subclass id on the entry (display derives from it)", () => {
    expect(
      getClasses({ classes: [{ classId: "monk", subclassId: "mercy", level: 3 }] })
    ).toEqual([{ classId: "monk", subclassId: "mercy", level: 3 }]);
  });

  it("falls back to a single empty-id default entry when classes[] is wholly malformed", () => {
    const c = { classes: [{ classId: "", level: 0 }] as ClassEntry[] };
    expect(getClasses(c)).toEqual([{ classId: "", level: 1 }]);
  });

  it("falls back to the empty default when classes[] is absent", () => {
    expect(getClasses({})).toEqual([{ classId: "", level: 1 }]);
  });

  // B28 — `normalizeEntry` floors a class level at 1 but never capped it at 20,
  // so a malformed doc (hand-edited console write, or a bad multiclass sum) could
  // scale features past the legal maximum. Every level read through `getClasses`
  // must land in [1, 20], matching the codec's own import boundary.
  it.each([
    { level: 25, expected: 20, why: "caps an out-of-range level at the legal max" },
    { level: 20, expected: 20, why: "passes the legal max through unchanged" },
    { level: 1, expected: 1, why: "passes the legal min through unchanged" },
    { level: 0, expected: 1, why: "still floors a sub-1 level at 1" },
    { level: -5, expected: 1, why: "still floors a negative level at 1" },
  ])("clamps level $level to $expected — $why", ({ level, expected }) => {
    expect(getClasses({ classes: [{ classId: "wizard", level }] })).toEqual([
      { classId: "wizard", level: expected },
    ]);
  });
});

describe("totalLevel + primaryClassEntry", () => {
  const multi = {
    classes: [
      { classId: "wizard", level: 5 },
      { classId: "cleric", level: 3 },
    ],
  };
  it("totalLevel sums all entry levels", () => {
    expect(totalLevel(multi)).toBe(8);
    expect(totalLevel({ classes: [{ classId: "bard", level: 9 }] })).toBe(9);
  });
  it("primaryClassEntry is the highest-level entry", () => {
    expect(primaryClassEntry(multi).classId).toBe("wizard");
  });
  it("ties resolve to the FIRST entry (the class started in)", () => {
    const tie = {
      classes: [
        { classId: "fighter", level: 3 },
        { classId: "rogue", level: 3 },
      ],
    };
    expect(primaryClassEntry(tie).classId).toBe("fighter");
  });
  it("isMulticlass true only with >1 class", () => {
    expect(isMulticlass(multi)).toBe(true);
    expect(isMulticlass({ classes: [{ classId: "bard", level: 9 }] })).toBe(false);
  });
});

describe("display names derive from the primary entry's ids (store id, derive label)", () => {
  const wizCleric = {
    classes: [
      { classId: "wizard", subclassId: "evoker", level: 5 },
      { classId: "cleric", subclassId: "life-domain", level: 3 },
    ],
  };
  it("primaryClassName / primarySubclassName resolve the highest-level entry", () => {
    expect(primaryClassName(wizCleric)).toBe("Wizard");
    expect(primarySubclassName(wizCleric)).toBe("Evoker");
  });
});

describe("classEntryLevel + allEntryPicks", () => {
  const multi = {
    classes: [
      { classId: "warlock", level: 5, invocationChoices: ["agonizing-blast"] },
      { classId: "fighter", level: 3, weaponMasteries: ["longsword"] },
    ],
  };
  it("classEntryLevel returns a single class's level (0 when absent)", () => {
    expect(classEntryLevel(multi, "warlock")).toBe(5);
    expect(classEntryLevel(multi, "fighter")).toBe(3);
    expect(classEntryLevel(multi, "wizard")).toBe(0);
  });
  it("allEntryPicks flattens a pick kind across every entry (deduped)", () => {
    expect(allEntryPicks(multi, "invocationChoices")).toEqual(["agonizing-blast"]);
    expect(allEntryPicks(multi, "weaponMasteries")).toEqual(["longsword"]);
  });
});
