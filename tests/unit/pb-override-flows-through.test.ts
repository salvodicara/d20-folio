/**
 * Regression: every D20-Test math helper now honors a manual
 * `proficiencyBonusOverride`.
 *
 * Before this pass each helper hard-coded `proficiencyBonus(level)` and
 * silently dropped the override, so a player who raised PB by hand would
 * still see un-bumped spell save DCs, spell attack bonuses, weapon
 * attacks, saves, skills, and passive scores.
 *
 * The pure-function fix added a `pbOverride` tail parameter; this test
 * pins the math at a level / override pair where the two PBs differ so a
 * future refactor that drops the parameter trips the gate immediately.
 */
import { describe, expect, it } from "vitest";
import {
  effectiveProficiencyBonus,
  passiveScore,
  proficiencyBonus,
  savingThrowBonus,
  skillBonus,
  spellAttackBonus,
  spellSaveDC,
  weaponAttackBonus,
} from "@/lib/compute";

// Level 3 → table PB +2. Override +5 is deliberately outside the table to
// guarantee every helper's output shifts when the override flows through.
const LEVEL = 3;
const PB_OVERRIDE = 5;
const ABILITY = 18; // mod +4
const NO_OVERRIDE = undefined;

describe("proficiencyBonusOverride flows through every D20-Test helper", () => {
  it("effectiveProficiencyBonus returns the override when supplied", () => {
    expect(effectiveProficiencyBonus(LEVEL)).toBe(proficiencyBonus(LEVEL));
    expect(effectiveProficiencyBonus(LEVEL, PB_OVERRIDE)).toBe(PB_OVERRIDE);
    // null and undefined both fall through to the level-derived PB
    expect(effectiveProficiencyBonus(LEVEL, null)).toBe(proficiencyBonus(LEVEL));
  });

  it("spellSaveDC: 8 + PB-override + ability mod", () => {
    expect(spellSaveDC(LEVEL, ABILITY, NO_OVERRIDE, PB_OVERRIDE)).toBe(8 + 5 + 4);
    // Sanity: without override = old behaviour
    expect(spellSaveDC(LEVEL, ABILITY)).toBe(8 + 2 + 4);
  });

  it("spellAttackBonus: PB-override + ability mod (no exhaustion)", () => {
    expect(spellAttackBonus(LEVEL, ABILITY, NO_OVERRIDE, 0, PB_OVERRIDE)).toBe(5 + 4);
    expect(spellAttackBonus(LEVEL, ABILITY)).toBe(2 + 4);
  });

  it("weaponAttackBonus: PB-override + ability mod when proficient", () => {
    expect(weaponAttackBonus(LEVEL, ABILITY, true, NO_OVERRIDE, 0, PB_OVERRIDE)).toBe(
      5 + 4
    );
    // When NOT proficient, override has no effect (PB contributes 0)
    expect(weaponAttackBonus(LEVEL, ABILITY, false, NO_OVERRIDE, 0, PB_OVERRIDE)).toBe(4);
  });

  it("savingThrowBonus: PB-override added when proficient", () => {
    expect(savingThrowBonus(ABILITY, LEVEL, true, NO_OVERRIDE, 0, PB_OVERRIDE)).toBe(
      5 + 4
    );
    expect(savingThrowBonus(ABILITY, LEVEL, false, NO_OVERRIDE, 0, PB_OVERRIDE)).toBe(4);
  });

  it("skillBonus: proficient / expertise / half all use PB-override", () => {
    // proficient: mod + PB
    expect(skillBonus(ABILITY, LEVEL, "proficient", NO_OVERRIDE, 0, PB_OVERRIDE)).toBe(
      4 + 5
    );
    // expertise: mod + 2*PB
    expect(skillBonus(ABILITY, LEVEL, "expertise", NO_OVERRIDE, 0, PB_OVERRIDE)).toBe(
      4 + 10
    );
    // half: mod + floor(PB/2) — floor(5/2) = 2
    expect(
      skillBonus(ABILITY, LEVEL, "halfProficiency", NO_OVERRIDE, 0, PB_OVERRIDE)
    ).toBe(4 + 2);
    // no proficiency: PB ignored regardless of override
    expect(skillBonus(ABILITY, LEVEL, null, NO_OVERRIDE, 0, PB_OVERRIDE)).toBe(4);
  });

  it("passiveScore: 10 + skillBonus(...with PB-override...)", () => {
    expect(passiveScore(ABILITY, LEVEL, "proficient", 0, PB_OVERRIDE)).toBe(10 + 4 + 5);
    expect(passiveScore(ABILITY, LEVEL, null, 0, PB_OVERRIDE)).toBe(10 + 4);
  });

  it("explicit field-level override still beats the PB-override", () => {
    // The "override the result entirely" field (spellSaveDC's `override`) wins
    // over the PB-override. PB-override is a baseline, not a final answer.
    expect(spellSaveDC(LEVEL, ABILITY, 99, PB_OVERRIDE)).toBe(99);
    expect(spellAttackBonus(LEVEL, ABILITY, 99, 0, PB_OVERRIDE)).toBe(99);
    expect(savingThrowBonus(ABILITY, LEVEL, true, 99, 0, PB_OVERRIDE)).toBe(99);
    expect(skillBonus(ABILITY, LEVEL, "proficient", 99, 0, PB_OVERRIDE)).toBe(99);
  });
});
