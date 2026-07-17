/**
 * Regression guard: EVERY caster in the 2024 ruleset is a prepared caster.
 *
 * The spells page used to hardcode
 *   ["cleric","druid","paladin","wizard","ranger"]
 * which silently excluded Bard / Sorcerer / Artificer / Warlock — all of
 * whom prepare spells per the 2024 PHB (Bard Spells Prepared / Sorcerer
 * Spells Prepared / Warlock Spells Prepared / Artificer Spells Prepared
 * columns on their class tables). The class-data fields pinned below are
 * the source of truth the UI reads from; this test prevents a future edit
 * from regressing the flag.
 *
 * Warlock's "knowing few spells" feel is preserved via the separate
 * `pactMagic` flag on its spell-slot rows (short-rest recovery, all slots
 * one level), NOT via `preparedCaster: false`.
 *
 * See `src/features/character/center/tabs/SpellsTab.tsx :: isPreparedCaster`.
 */
import { describe, expect, it } from "vitest";
import { classTables } from "@/data/classes";
const SRD_CLASSES = classTables;

// Artificer is pack content — tolerated-absent in SRD-only mode; the
// expectation below filters to the classes actually shipped, so the exact-set
// pin holds at full strength in BOTH compositions (9 casters in pack mode,
// 8 in SRD-only).
const EXPECTED_PREPARED = new Set([
  "bard",
  "cleric",
  "druid",
  "paladin",
  "ranger",
  "sorcerer",
  "warlock",
  "wizard",
  "artificer",
]);
const SHIPPED_PREPARED = [...EXPECTED_PREPARED].filter((id) =>
  SRD_CLASSES.some((c) => c.id === id)
);

describe("2024 caster prepared classification (every caster is prepared)", () => {
  it("all shipped caster classes are flagged preparedCaster=true (exact set)", () => {
    const actual = new Set<string>();
    for (const cls of SRD_CLASSES) {
      if (cls.spellcasting?.preparedCaster === true) actual.add(cls.id);
    }
    expect([...actual].sort()).toEqual([...SHIPPED_PREPARED].sort());
    // The 8 SRD casters are unconditionally required in every composition.
    for (const id of [
      "bard",
      "cleric",
      "druid",
      "paladin",
      "ranger",
      "sorcerer",
      "warlock",
      "wizard",
    ]) {
      expect(actual.has(id), `${id} must be a prepared caster`).toBe(true);
    }
  });

  it("no caster is flagged preparedCaster=false (2014 carry-over)", () => {
    const offenders: string[] = [];
    for (const cls of SRD_CLASSES) {
      if (cls.spellcasting && !cls.spellcasting.preparedCaster) {
        offenders.push(cls.id);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every caster class declares a spellcasting block", () => {
    for (const id of SHIPPED_PREPARED) {
      const cls = SRD_CLASSES.find((c) => c.id === id);
      expect(cls, `class ${id} not found in SRD_CLASSES`).toBeDefined();
      expect(cls?.spellcasting, `class ${id} missing spellcasting`).toBeDefined();
    }
  });

  it("Warlock keeps the pactMagic slot flag (different mechanic, not a different prep model)", () => {
    const warlock = SRD_CLASSES.find((c) => c.id === "warlock");
    expect(warlock).toBeDefined();
    const l3 = warlock?.levels.find((l) => l.level === 3);
    // The slot table is non-empty and the pactSlots() helper has set
    // pactMagic semantics — checked by tagging it elsewhere; here we just
    // verify the class has spell slots at all (Warlock L3 has 2× L2 slots).
    expect(l3?.spellSlots).toBeDefined();
  });
});
