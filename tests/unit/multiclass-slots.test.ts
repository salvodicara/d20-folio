/**
 * R4 — the 2024 Multiclass Spellcaster slot table. Table-driven over full / half /
 * third / Pact-Magic combos. Single-class reduces to the class table's own slots;
 * multiclass uses the combined caster level (half-casters ROUND UP per 2024 RAW —
 * "Half your levels (round up) in the Paladin and Ranger classes") + separate
 * Pact Magic.
 */
import { describe, expect, it } from "vitest";
import {
  casterLevelContribution,
  multiclassCasterLevel,
  computeMulticlassSpellSlots,
} from "@/lib/multiclass-slots";
import type { ClassEntry } from "@/types/character";

const entry = (classId: string, level: number, subclassId?: string): ClassEntry => ({
  classId,
  level,
  ...(subclassId ? { subclassId } : {}),
});

describe("multiclass-slots — caster-level contribution per class (2024 RAW)", () => {
  const cases: Array<[string, ClassEntry, number]> = [
    ["full caster (wizard 5) → 5", entry("wizard", 5), 5],
    ["full caster (bard 9) → 9", entry("bard", 9), 9],
    ["half caster (paladin 5) → ceil(5/2)=3 (2024 rounds UP)", entry("paladin", 5), 3],
    ["half caster (paladin 1) → 1 (a 2024 L1 paladin casts)", entry("paladin", 1), 1],
    ["half caster (ranger 7) → ceil(7/2)=4", entry("ranger", 7), 4],
    ["half caster (artificer 1) → ceil(1/2)=1", entry("artificer", 1), 1],
    ["half caster (artificer 5) → 3", entry("artificer", 5), 3],
    ["warlock 5 → 0 (Pact Magic excluded)", entry("warlock", 5), 0],
    ["non-caster (barbarian 6) → 0", entry("barbarian", 6), 0],
    [
      "third caster (EK fighter 6) → floor(6/3)=2",
      entry("fighter", 6, "eldritch-knight"),
      2,
    ],
    ["third caster (AT rogue 9) → 3", entry("rogue", 9, "arcane-trickster"), 3],
    ["base fighter (no EK) → 0", entry("fighter", 6, "champion"), 0],
  ];
  it.each(cases)("%s", (_label, e, expected) => {
    expect(casterLevelContribution(e)).toBe(expected);
  });
});

describe("multiclass-slots — combined caster level + slots", () => {
  it("wizard 5 / cleric 3 → caster level 8 → the full-table row 8 slots", () => {
    const classes = [entry("wizard", 5, "evoker"), entry("cleric", 3, "life-domain")];
    expect(multiclassCasterLevel(classes)).toBe(8);
    // Caster level 8 on the multiclass (full-caster) table = [4,3,3,2].
    expect(computeMulticlassSpellSlots(classes)).toEqual([
      { level: 1, total: 4 },
      { level: 2, total: 3 },
      { level: 3, total: 3 },
      { level: 4, total: 2 },
    ]);
  });

  it("paladin 6 / sorcerer 4 → 3 + 4 = caster level 7", () => {
    const classes = [entry("paladin", 6), entry("sorcerer", 4)];
    expect(multiclassCasterLevel(classes)).toBe(7);
    // Caster level 7 = [4,3,3,1].
    expect(computeMulticlassSpellSlots(classes)).toEqual([
      { level: 1, total: 4 },
      { level: 2, total: 3 },
      { level: 3, total: 3 },
      { level: 4, total: 1 },
    ]);
  });

  it("paladin 5 / wizard 3 → ceil(5/2)+3 = caster level 6 (the round-UP case)", () => {
    // Pre-fix (2014 floor) this read caster level 5 — one row short on the table.
    const classes = [entry("paladin", 5), entry("wizard", 3)];
    expect(multiclassCasterLevel(classes)).toBe(6);
    expect(computeMulticlassSpellSlots(classes)).toEqual([
      { level: 1, total: 4 },
      { level: 2, total: 3 },
      { level: 3, total: 3 },
    ]);
  });

  it("a lone half-caster's MULTICLASS contribution rounds UP (2024 RAW)", () => {
    // Paladin 3 contributes ceil(3/2)=2 caster levels → table row 2 = [3].
    expect(multiclassCasterLevel([entry("paladin", 3)])).toBe(2);
    expect(computeMulticlassSpellSlots([entry("paladin", 3)])).toEqual([
      { level: 1, total: 3 },
    ]);
  });
});

describe("multiclass-slots — Warlock Pact Magic stacks SEPARATELY", () => {
  it("sorcerer 3 / warlock 2 → shared L1–2 slots + a separate Pact slot", () => {
    const classes = [entry("sorcerer", 3), entry("warlock", 2, "fiend-patron")];
    // Sorcerer 3 → caster level 3 shared slots = [4,2]; Warlock 2 → 2 pact slots @ L1.
    const slots = computeMulticlassSpellSlots(classes);
    expect(slots).toContainEqual({ level: 1, total: 4 });
    expect(slots).toContainEqual({ level: 2, total: 2 });
    // The Pact Magic pool is a distinct entry flagged pactMagic.
    expect(slots).toContainEqual({ level: 1, total: 2, pactMagic: true });
  });

  it("pure warlock 5 → only Pact Magic (2 slots @ L3), no shared slots", () => {
    const slots = computeMulticlassSpellSlots([entry("warlock", 5)]);
    expect(slots).toEqual([{ level: 3, total: 2, pactMagic: true }]);
  });
});
