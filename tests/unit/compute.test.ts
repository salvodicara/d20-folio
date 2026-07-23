import { describe, it, expect } from "vitest";
import { asProficiencyToken as tok } from "@/lib/proficiency-tokens";
import {
  abilityModifier,
  proficiencyBonus,
  spellSaveDC,
  spellAttackBonus,
  weaponAttackBonus,
  savingThrowBonus,
  skillBonus,
  passiveScore,
  passiveAdvantageStep,
  buildPassiveBreakdown,
  heavyWeaponDisadvantage,
  pointBuyCost,
  totalPointBuyCost,
  hitDieAverage,
  previewShortRestHeal,
  calculateMaxHP,
  skillAbility,
  isWeaponProficient,
  resolveWeaponAttackStat,
  hasWeaponMastery,
  computeAC,
  computeACDetailed,
  characterHasFeat,
  computeInitiative,
  clampExhaustion,
  exhaustionPenalty,
  attacksPerAction,
  tableExtraAttacksAtLevel,
  maxTableExtraAttacks,
  isArmorProficient,
  concentrationSaveDc,
  carryingCapacity,
  jumpDistance,
  unarmedStrikeSaveDc,
  featureSaveDc,
  effectiveSpellSaveDc,
  effectiveSpellAttackBonus,
  ALL_SKILLS,
} from "@/lib/compute";
import { getClassTable } from "@/data/classes";
import { breakdownTotal } from "@/lib/value-breakdown";
import { litText } from "@/lib/loc-text";
import type { AcFormula, AdvantageClause } from "@/lib/grants";
import type { SrdEquipmentData } from "@/data/types";
import type { SrdEquipmentRef, CustomEquipment } from "@/types/character";

describe("abilityModifier", () => {
  it("calculates correct modifier for score 10", () => {
    expect(abilityModifier(10)).toBe(0);
  });

  it("calculates correct modifier for score 1", () => {
    expect(abilityModifier(1)).toBe(-5);
  });

  it("calculates correct modifier for score 20", () => {
    expect(abilityModifier(20)).toBe(5);
  });

  it("calculates correct modifier for score 8", () => {
    expect(abilityModifier(8)).toBe(-1);
  });

  it("calculates correct modifier for score 14", () => {
    expect(abilityModifier(14)).toBe(2);
  });

  it("calculates correct modifier for score 15", () => {
    expect(abilityModifier(15)).toBe(2);
  });

  it("calculates correct modifier for score 11", () => {
    expect(abilityModifier(11)).toBe(0);
  });
});

describe("proficiencyBonus", () => {
  it("returns +2 for levels 1-4", () => {
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(2)).toBe(2);
    expect(proficiencyBonus(3)).toBe(2);
    expect(proficiencyBonus(4)).toBe(2);
  });

  it("returns +3 for levels 5-8", () => {
    expect(proficiencyBonus(5)).toBe(3);
    expect(proficiencyBonus(6)).toBe(3);
    expect(proficiencyBonus(7)).toBe(3);
    expect(proficiencyBonus(8)).toBe(3);
  });

  it("returns +4 for levels 9-12", () => {
    expect(proficiencyBonus(9)).toBe(4);
    expect(proficiencyBonus(12)).toBe(4);
  });

  it("returns +5 for levels 13-16", () => {
    expect(proficiencyBonus(13)).toBe(5);
    expect(proficiencyBonus(16)).toBe(5);
  });

  it("returns +6 for levels 17-20", () => {
    expect(proficiencyBonus(17)).toBe(6);
    expect(proficiencyBonus(20)).toBe(6);
  });
});

describe("spellSaveDC", () => {
  it("calculates DC = 8 + PB + ability mod", () => {
    // Level 1 (PB=2), CHA 16 (mod +3) → 8 + 2 + 3 = 13
    expect(spellSaveDC(1, 16)).toBe(13);
  });

  it("calculates DC at higher levels", () => {
    // Level 5 (PB=3), WIS 18 (mod +4) → 8 + 3 + 4 = 15
    expect(spellSaveDC(5, 18)).toBe(15);
  });

  it("uses override when provided", () => {
    expect(spellSaveDC(1, 16, 15)).toBe(15);
  });

  it("ignores override when null", () => {
    expect(spellSaveDC(1, 16, null)).toBe(13);
  });
});

describe("spellAttackBonus", () => {
  it("calculates PB + ability mod", () => {
    // Level 1 (PB=2), CHA 16 (mod +3) → 2 + 3 = 5
    expect(spellAttackBonus(1, 16)).toBe(5);
  });

  it("uses override when provided", () => {
    expect(spellAttackBonus(1, 16, 7)).toBe(7);
  });
});

describe("effectiveSpellSaveDc / effectiveSpellAttackBonus (SSOT seam)", () => {
  // These fold the override-gated casting bump in ONE place. The guard asserts
  // each is IDENTICAL to the `spellSaveDC(...) + (override != null ? 0 : bump)`
  // composition every call site previously inlined (golden rule 6) — across the
  // no-override, with-bump, and override-pins-the-whole-number cases.
  const cases = [
    { level: 1, score: 16, bump: 0, override: null, ex: 0, pb: null },
    { level: 5, score: 18, bump: 2, override: null, ex: 0, pb: null },
    { level: 9, score: 20, bump: 3, override: null, ex: 2, pb: null },
    { level: 5, score: 18, bump: 2, override: 17, ex: 1, pb: null }, // override wins
    { level: 11, score: 14, bump: 1, override: null, ex: 0, pb: 5 }, // PB override
  ] as const;

  it.each(cases)(
    "DC matches spellSaveDC + gated bump (%o)",
    ({ level, score, bump, override, pb }) => {
      expect(effectiveSpellSaveDc(level, score, bump, override, pb)).toBe(
        spellSaveDC(level, score, override, pb) + (override != null ? 0 : bump)
      );
    }
  );

  it.each(cases)(
    "attack matches spellAttackBonus + gated bump (%o)",
    ({ level, score, bump, override, ex, pb }) => {
      expect(effectiveSpellAttackBonus(level, score, bump, override, ex, pb)).toBe(
        spellAttackBonus(level, score, override, ex, pb) + (override != null ? 0 : bump)
      );
    }
  );
});

describe("featureSaveDc (SSOT seam)", () => {
  // The generic feature DC (8 + PB + ability mod). Mirrors unarmedStrikeSaveDc
  // (which fixes STR); a STR-scored feature DC must equal it for every level.
  it.each([1, 5, 9, 13, 17])("equals 8 + PB + ability mod at level %i", (level) => {
    // STR 16 (mod +3) → unarmedStrikeSaveDc; an arbitrary ability score path.
    expect(featureSaveDc(level, 16)).toBe(unarmedStrikeSaveDc(16, level));
    expect(featureSaveDc(level, 14)).toBe(
      8 + proficiencyBonus(level) + abilityModifier(14)
    );
  });

  it("honors a PB override", () => {
    expect(featureSaveDc(5, 18, 6)).toBe(8 + 6 + abilityModifier(18));
  });
});

describe("weaponAttackBonus", () => {
  it("calculates PB + ability mod when proficient", () => {
    // Level 3 (PB=2), STR 16 (mod +3), proficient → 2 + 3 = 5
    expect(weaponAttackBonus(3, 16, true)).toBe(5);
  });

  it("calculates only ability mod when not proficient", () => {
    // Level 3, STR 16 (mod +3), not proficient → 0 + 3 = 3
    expect(weaponAttackBonus(3, 16, false)).toBe(3);
  });

  it("uses override when provided", () => {
    expect(weaponAttackBonus(3, 16, true, 8)).toBe(8);
  });
});

describe("savingThrowBonus", () => {
  it("calculates ability mod + PB when proficient", () => {
    // DEX 14 (mod +2), level 5 (PB=3), proficient → 2 + 3 = 5
    expect(savingThrowBonus(14, 5, true)).toBe(5);
  });

  it("calculates only ability mod when not proficient", () => {
    // DEX 14 (mod +2), level 5, not proficient → 2
    expect(savingThrowBonus(14, 5, false)).toBe(2);
  });
});

describe("skillBonus", () => {
  it("returns ability mod only for no proficiency", () => {
    // DEX 14 (mod +2), level 3 → 2
    expect(skillBonus(14, 3, null)).toBe(2);
  });

  it("adds PB for proficient skills", () => {
    // DEX 14 (mod +2), level 3 (PB=2), proficient → 2 + 2 = 4
    expect(skillBonus(14, 3, "proficient")).toBe(4);
  });

  it("adds 2*PB for expertise", () => {
    // DEX 14 (mod +2), level 5 (PB=3), expertise → 2 + 6 = 8
    expect(skillBonus(14, 5, "expertise")).toBe(8);
  });

  it("adds floor(PB/2) for half proficiency", () => {
    // DEX 14 (mod +2), level 5 (PB=3), half → 2 + 1 = 3
    expect(skillBonus(14, 5, "halfProficiency")).toBe(3);
  });
});

describe("passiveScore", () => {
  it("calculates 10 + skill bonus", () => {
    // WIS 14 (mod +2), level 3 (PB=2), proficient → 10 + 4 = 14
    expect(passiveScore(14, 3, "proficient")).toBe(14);
  });

  it("calculates 10 + mod only for no proficiency", () => {
    // WIS 12 (mod +1), level 1, no proficiency → 10 + 1 = 11
    expect(passiveScore(12, 1, null)).toBe(11);
  });

  // AX exposure audit — a grant-derived ability-check bonus (Stone of Good
  // Luck +1, Otherworldly Glamour +WIS) threads into the passive identically
  // to the skill row (a passive is 10 + the same check modifier).
  it("adds the grant-derived check bonus", () => {
    // WIS 14 (mod +2), level 3 (PB=2), proficient, +1 check bonus → 15
    expect(passiveScore(14, 3, "proficient", 0, null, 1)).toBe(15);
  });

  // RA-16 — the SRD 2024 ±5 advantage/disadvantage step folds into the passive.
  it("folds the ±5 advantage/disadvantage step (RA-16)", () => {
    // WIS 14 (mod +2), level 3 (PB=2), proficient → 14; +5 advantage → 19
    expect(passiveScore(14, 3, "proficient", 0, null, 0, 5)).toBe(19);
    // −5 disadvantage → 9
    expect(passiveScore(14, 3, "proficient", 0, null, 0, -5)).toBe(9);
    // The new param defaults to 0 — behavior-preserving for every existing caller.
    expect(passiveScore(14, 3, "proficient")).toBe(14);
  });
});

describe("passiveAdvantageStep — RA-16", () => {
  const clause = (
    rollType: AdvantageClause["rollType"],
    vs: string
  ): AdvantageClause => ({
    sourceId: "x",
    rollType,
    vs,
    description: litText({ en: "a", it: "a" }),
  });

  it("Advantage on the matching check → +5", () => {
    expect(
      passiveAdvantageStep(
        { advantages: [clause("check", "perception")], disadvantages: [] },
        "perception"
      )
    ).toBe(5);
  });

  it("Disadvantage on the matching check → −5", () => {
    expect(
      passiveAdvantageStep(
        { advantages: [], disadvantages: [clause("check", "perception")] },
        "perception"
      )
    ).toBe(-5);
  });

  it("both advantage and disadvantage cancel → 0 (RAW)", () => {
    expect(
      passiveAdvantageStep(
        {
          advantages: [clause("check", "perception")],
          disadvantages: [clause("check", "perception")],
        },
        "perception"
      )
    ).toBe(0);
  });

  it("no clauses → 0", () => {
    expect(
      passiveAdvantageStep({ advantages: [], disadvantages: [] }, "perception")
    ).toBe(0);
  });

  it("a check-advantage on 'initiative' does not leak into perception (Sentinel Shield)", () => {
    expect(
      passiveAdvantageStep(
        { advantages: [clause("check", "initiative")], disadvantages: [] },
        "perception"
      )
    ).toBe(0);
  });

  it("a situational 'perception-sight' clause is not folded (scope decision)", () => {
    expect(
      passiveAdvantageStep(
        { advantages: [clause("check", "perception-sight")], disadvantages: [] },
        "perception"
      )
    ).toBe(0);
  });

  it("a perception advantage does not move a different passive (per-passive scope)", () => {
    expect(
      passiveAdvantageStep(
        { advantages: [clause("check", "perception")], disadvantages: [] },
        "insight"
      )
    ).toBe(0);
  });
});

describe("buildPassiveBreakdown — RA-16 step part", () => {
  it("adds an Advantage part that keeps the sum equal to the headline", () => {
    const parts = buildPassiveBreakdown("WIS", 14, 3, "proficient", 0, null, 0, 5);
    expect(parts).toContainEqual({ label: { term: "common.advantage" }, value: 5 });
    expect(breakdownTotal(parts)).toBe(passiveScore(14, 3, "proficient", 0, null, 0, 5));
  });

  it("adds a Disadvantage part for a −5 step", () => {
    const parts = buildPassiveBreakdown("WIS", 14, 3, "proficient", 0, null, 0, -5);
    expect(parts).toContainEqual({
      label: { term: "common.disadvantage" },
      value: -5,
    });
    expect(breakdownTotal(parts)).toBe(passiveScore(14, 3, "proficient", 0, null, 0, -5));
  });

  it("adds no step part when the step is 0", () => {
    const parts = buildPassiveBreakdown("WIS", 14, 3, "proficient", 0, null, 0, 0);
    const terms = parts.flatMap((p) => ("term" in p.label ? [p.label.term] : []));
    expect(terms).not.toContain("common.advantage");
    expect(terms).not.toContain("common.disadvantage");
  });
});

describe("heavyWeaponDisadvantage — RA-17", () => {
  // A full six-ability record; only STR (melee) / DEX (ranged) are read.
  const scores = (str: number, dex: number) => ({
    STR: str,
    DEX: dex,
    CON: 10,
    INT: 10,
    WIS: 10,
    CHA: 10,
  });

  it("Heavy MELEE weapon: Disadvantage iff STR < 13", () => {
    expect(heavyWeaponDisadvantage(true, false, scores(8, 20))).toBe(true);
    expect(heavyWeaponDisadvantage(true, false, scores(12, 20))).toBe(true);
    // Boundary — "less than 13": STR 13 clears it.
    expect(heavyWeaponDisadvantage(true, false, scores(13, 20))).toBe(false);
    expect(heavyWeaponDisadvantage(true, false, scores(14, 20))).toBe(false);
  });

  it("Heavy RANGED weapon: Disadvantage iff DEX < 13", () => {
    expect(heavyWeaponDisadvantage(true, true, scores(20, 12))).toBe(true);
    expect(heavyWeaponDisadvantage(true, true, scores(20, 13))).toBe(false);
  });

  it("reads the RELEVANT ability only (melee=STR, ranged=DEX)", () => {
    // Ranged ignores a low STR.
    expect(heavyWeaponDisadvantage(true, true, scores(8, 16))).toBe(false);
    // Melee ignores a low DEX.
    expect(heavyWeaponDisadvantage(true, false, scores(16, 8))).toBe(false);
  });

  it("a non-Heavy weapon never triggers, whatever the scores", () => {
    expect(heavyWeaponDisadvantage(false, false, scores(8, 8))).toBe(false);
    expect(heavyWeaponDisadvantage(false, true, scores(8, 8))).toBe(false);
  });
});

describe("characterHasFeat", () => {
  it("detects a feat via the Human origin feat slug", () => {
    expect(characterHasFeat("alert", { humanOriginFeat: "alert" })).toBe(true);
  });

  it("detects a feat via the background feat slug", () => {
    expect(characterHasFeat("alert", { bgFeat: "alert" })).toBe(true);
  });

  it("detects a feat via a feature ref in the features array", () => {
    expect(
      characterHasFeat("alert", { features: [{ srdId: "alert" }, { srdId: "lucky" }] })
    ).toBe(true);
  });

  it("ignores custom features (no srdId)", () => {
    expect(
      characterHasFeat("alert", {
        features: [
          {
            custom: true,
            title: "Homebrew",
            emoji: "✨",
            source: "",
            tags: [],
            contentBlocks: [],
          },
        ],
      })
    ).toBe(false);
  });

  it("returns false when the feat is absent everywhere", () => {
    expect(
      characterHasFeat("alert", {
        humanOriginFeat: "lucky",
        bgFeat: "tough",
        features: [{ srdId: "crafter" }],
      })
    ).toBe(false);
  });

  it("returns false for empty origin object", () => {
    expect(characterHasFeat("alert", {})).toBe(false);
  });
});

describe("computeInitiative", () => {
  it("returns DEX modifier when no Alert feat", () => {
    // DEX 16 → mod +3
    expect(computeInitiative(16, 2, false)).toBe(3);
  });

  it("adds Proficiency Bonus when the character has Alert (2024 Initiative Proficiency)", () => {
    // DEX 16 → +3, PB +2 → +5
    expect(computeInitiative(16, 2, true)).toBe(5);
  });

  it("respects a higher Proficiency Bonus at high levels with Alert", () => {
    // DEX 18 → +4, PB +6 → +10
    expect(computeInitiative(18, 6, true)).toBe(10);
  });

  it("handles negative DEX modifier with no Alert", () => {
    // DEX 8 → -1
    expect(computeInitiative(8, 2, false)).toBe(-1);
  });
});

describe("pointBuyCost", () => {
  it("returns 0 for score 8", () => {
    expect(pointBuyCost(8)).toBe(0);
  });

  it("returns 5 for score 13", () => {
    expect(pointBuyCost(13)).toBe(5);
  });

  it("returns 7 for score 14", () => {
    expect(pointBuyCost(14)).toBe(7);
  });

  it("returns 9 for score 15", () => {
    expect(pointBuyCost(15)).toBe(9);
  });

  it("returns -1 for invalid scores", () => {
    expect(pointBuyCost(7)).toBe(-1);
    expect(pointBuyCost(16)).toBe(-1);
  });
});

describe("totalPointBuyCost", () => {
  it("calculates sum of all scores", () => {
    const scores = { STR: 8, DEX: 15, CON: 14, INT: 10, WIS: 12, CHA: 13 };
    // 0 + 9 + 7 + 2 + 4 + 5 = 27
    expect(totalPointBuyCost(scores)).toBe(27);
  });
});

describe("hitDieAverage", () => {
  it("returns correct averages", () => {
    expect(hitDieAverage(6)).toBe(4);
    expect(hitDieAverage(8)).toBe(5);
    expect(hitDieAverage(10)).toBe(6);
    expect(hitDieAverage(12)).toBe(7);
  });
});

describe("previewShortRestHeal (M6)", () => {
  it("returns zeros when no dice are spent", () => {
    expect(previewShortRestHeal({ diceSpent: 0, hitDie: 8, conMod: 2 })).toEqual({
      min: 0,
      avg: 0,
      max: 0,
      perDieAvg: 0,
    });
  });

  it("d8 + CON +2: 1 die → min 3, max 10, avg 7", () => {
    expect(previewShortRestHeal({ diceSpent: 1, hitDie: 8, conMod: 2 })).toEqual({
      min: 3,
      avg: 7,
      max: 10,
      perDieAvg: 7,
    });
  });

  it("d10 + CON +0: 3 dice scale linearly: min 3, avg 18, max 30", () => {
    expect(previewShortRestHeal({ diceSpent: 3, hitDie: 10, conMod: 0 })).toEqual({
      min: 3,
      avg: 18,
      max: 30,
      perDieAvg: 6,
    });
  });

  it("min-1-per-die floor: d4 + CON -3 still gives ≥1 per die", () => {
    const r = previewShortRestHeal({ diceSpent: 4, hitDie: 4, conMod: -3 });
    // perDieMin = max(1, 1 + -3) = 1; perDieAvg = max(1, 3 + -3) = 1; perDieMax = max(1, 4 + -3) = 1
    expect(r.min).toBe(4);
    expect(r.avg).toBe(4);
    expect(r.max).toBe(4);
    expect(r.perDieAvg).toBe(1);
  });

  it("d12 + CON +4 (Barbarian): 2 dice → min 10, avg 22, max 32", () => {
    expect(previewShortRestHeal({ diceSpent: 2, hitDie: 12, conMod: 4 })).toEqual({
      min: 10,
      avg: 22,
      max: 32,
      perDieAvg: 11,
    });
  });

  it("negative dice count clamps to zero", () => {
    expect(previewShortRestHeal({ diceSpent: -1, hitDie: 8, conMod: 0 })).toEqual({
      min: 0,
      avg: 0,
      max: 0,
      perDieAvg: 0,
    });
  });
});

describe("calculateMaxHP", () => {
  it("calculates level 1 HP correctly", () => {
    // d8 + CON 14 (mod +2) = 8 + 2 = 10
    expect(calculateMaxHP(8, 14, 1)).toBe(10);
  });

  it("calculates multi-level HP correctly", () => {
    // Level 5, d8, CON 14 (mod +2)
    // Level 1: 8 + 2 = 10
    // Levels 2-5: 4 * (5 + 2) = 28
    // Total: 10 + 28 = 38
    expect(calculateMaxHP(8, 14, 5)).toBe(38);
  });

  it("minimum HP is 1", () => {
    // d6 + CON 3 (mod -4) → 6 - 4 = 2 at level 1
    expect(calculateMaxHP(6, 3, 1)).toBe(2);
    // But with very low CON and high level, ensure minimum 1
    expect(calculateMaxHP(6, 1, 1)).toBe(1);
  });

  it("applies the +1 HP floor PER LEVEL, not globally (RAW 2024 PHB p.21)", () => {
    // d6, CON 1 (mod −5), level 5 should NOT regress to 1 — RAW guarantees
    // ≥1 HP each level. Old global-floor math gave (1 + 4×(−1)) clamped to 1.
    // New RAW-correct math: max(1, 6−5) + 4 × max(1, 4−5) = 1 + 4×1 = 5.
    expect(calculateMaxHP(6, 1, 5)).toBe(5);
    // d10, CON 6 (mod −2), level 3: max(1, 10−2) + 2 × max(1, 6−2)
    //                              = 8 + 2 × 4 = 16
    expect(calculateMaxHP(10, 6, 3)).toBe(16);
    // d4, CON 1 (mod −5), level 10: max(1, 4−5)=1 + 9 × max(1, 3−5)=9×1 = 10
    expect(calculateMaxHP(4, 1, 10)).toBe(10);
  });
});

describe("skillAbility", () => {
  // SSOT guard (golden rule 6): skillAbility DERIVES from ALL_SKILLS — assert it
  // agrees with the catalog for every one of the 18 skills (no hand-enumerated
  // copy to drift), table-driven over the single source of truth.
  it.each(ALL_SKILLS.map((s) => [s.id, s.ability] as const))(
    "%s → %s (matches ALL_SKILLS)",
    (id, ability) => {
      expect(skillAbility(id)).toBe(ability);
    }
  );

  it("falls back to STR for an unknown skill id", () => {
    expect(skillAbility("not-a-skill")).toBe("STR");
  });
});

describe("isWeaponProficient", () => {
  it("returns true for a simple weapon when class has simple-weapons", () => {
    expect(
      isWeaponProficient(
        "simple",
        "dagger",
        "melee",
        ["Finesse", "Light"],
        [tok("simple-weapons")]
      )
    ).toBe(true);
  });

  it("returns true for a martial weapon when class has martial-weapons", () => {
    expect(
      isWeaponProficient(
        "martial",
        "longsword",
        "melee",
        ["Versatile (1d10)"],
        [tok("simple-weapons"), tok("martial-weapons")]
      )
    ).toBe(true);
  });

  it("returns false for a martial weapon when class only has simple-weapons", () => {
    expect(
      isWeaponProficient(
        "martial",
        "longsword",
        "melee",
        ["Versatile (1d10)"],
        [tok("simple-weapons")]
      )
    ).toBe(false);
  });

  it("returns true for a weapon-type group token matched against the srdId", () => {
    // Bard has `longswords` — matches the weapon whose stable id is `longsword`.
    expect(
      isWeaponProficient(
        "martial",
        "longsword",
        "melee",
        [],
        [tok("simple-weapons"), tok("longswords"), tok("rapiers")]
      )
    ).toBe(true);
  });

  it("matches a plural group token to a singular srdId (hand-crossbows → hand-crossbow)", () => {
    expect(
      isWeaponProficient(
        "martial",
        "hand-crossbow",
        "ranged",
        [],
        [tok("simple-weapons"), tok("hand-crossbows")]
      )
    ).toBe(true);
  });

  it("returns false for a weapon not in the class proficiencies", () => {
    expect(
      isWeaponProficient(
        "martial",
        "greatsword",
        "melee",
        ["Heavy", "Two-Handed"],
        [
          tok("daggers"),
          tok("darts"),
          tok("slings"),
          tok("quarterstaffs"),
          tok("light-crossbows"),
        ]
      )
    ).toBe(false);
  });

  it("handles the Monk martial proficiency (Finesse or Light)", () => {
    const monkProfs = [tok("simple-weapons"), tok("martial-weapons-finesse-or-light")];
    // Shortsword has Light
    expect(
      isWeaponProficient(
        "martial",
        "shortsword",
        "melee",
        ["Finesse", "Light"],
        monkProfs
      )
    ).toBe(true);
    // Rapier has Finesse
    expect(isWeaponProficient("martial", "rapier", "melee", ["Finesse"], monkProfs)).toBe(
      true
    );
    // Greatsword has neither
    expect(
      isWeaponProficient(
        "martial",
        "greatsword",
        "melee",
        ["Heavy", "Two-Handed"],
        monkProfs
      )
    ).toBe(false);
  });

  it("handles the Artificer martial-ranged-weapons token (martial + ranged only)", () => {
    const profs = [tok("simple-weapons"), tok("martial-ranged-weapons")];
    // A martial RANGED weapon is covered.
    expect(isWeaponProficient("martial", "longbow", "ranged", [], profs)).toBe(true);
    // A martial MELEE weapon is NOT.
    expect(isWeaponProficient("martial", "longsword", "melee", [], profs)).toBe(false);
  });

  it("a manifested weapon (no srdId) only matches tier/property tokens", () => {
    // No srdId → group tokens never apply; the tier still does.
    expect(
      isWeaponProficient("simple", undefined, "melee", ["Light"], [tok("simple-weapons")])
    ).toBe(true);
    expect(
      isWeaponProficient("martial", undefined, "melee", [], [tok("longswords")])
    ).toBe(false);
  });
});

describe("resolveWeaponAttackStat", () => {
  // The ONE attack-stat authority shared by the Combat carried-weapon row,
  // manifested weapons, AND the Inventory weapon row (golden rule 6).
  const scores = (over: Partial<Record<string, number>> = {}) => ({
    STR: 10,
    DEX: 10,
    CON: 10,
    INT: 10,
    WIS: 10,
    CHA: 10,
    ...over,
  });
  const stat = (args: {
    weaponType?: "melee" | "ranged";
    properties?: string[];
    scoreOver?: Partial<Record<string, number>>;
    weaponAttackAbilities?: ReadonlyArray<{
      ability: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
      magicOnly: boolean;
      weaponScope?: "monk-melee";
    }>;
    isMonkMelee?: boolean;
  }) =>
    resolveWeaponAttackStat({
      weaponType: args.weaponType,
      properties: args.properties ?? [],
      scores: scores(args.scoreOver),
      weaponAttackAbilities: args.weaponAttackAbilities ?? [],
      isMonkMelee: args.isMonkMelee ?? false,
    });

  it("returns DEX for ranged weapons", () => {
    expect(
      stat({
        weaponType: "ranged",
        properties: ["Ammunition (Range 80/320; Bolt)"],
        scoreOver: { STR: 14, DEX: 16 },
      })
    ).toBe("DEX");
  });

  it("returns STR for melee weapons without Finesse", () => {
    expect(
      stat({
        weaponType: "melee",
        properties: ["Two-Handed", "Heavy"],
        scoreOver: { STR: 16, DEX: 14 },
      })
    ).toBe("STR");
  });

  it("returns DEX for Finesse weapons when DEX > STR", () => {
    expect(
      stat({
        weaponType: "melee",
        properties: ["Finesse", "Light"],
        scoreOver: { STR: 12, DEX: 16 },
      })
    ).toBe("DEX");
  });

  it("returns STR for Finesse weapons when STR > DEX", () => {
    expect(
      stat({
        weaponType: "melee",
        properties: ["Finesse", "Light"],
        scoreOver: { STR: 18, DEX: 14 },
      })
    ).toBe("STR");
  });

  it("returns DEX for Finesse when the MODIFIERS tie (prefers DEX even if STR score higher)", () => {
    // STR 19 / DEX 18 both yield +4 — the modifier tie resolves to DEX, matching
    // the Combat row (the previous score-based `>=` would have picked STR here).
    expect(
      stat({
        weaponType: "melee",
        properties: ["Finesse", "Light"],
        scoreOver: { STR: 19, DEX: 18 },
      })
    ).toBe("DEX");
  });

  it("handles undefined weapon type (defaults to STR)", () => {
    expect(stat({ scoreOver: { STR: 14, DEX: 16 } })).toBe("STR");
  });

  it("applies the Monk Martial-Arts DEX swap on a Monk weapon when DEX > STR", () => {
    // A Quarterstaff (Monk weapon) with the monk-melee DEX swap → DEX, matching
    // the Combat Play card (the bug this fix closes for the Inventory row).
    expect(
      stat({
        weaponType: "melee",
        scoreOver: { STR: 12, DEX: 16 },
        weaponAttackAbilities: [
          { ability: "DEX", magicOnly: false, weaponScope: "monk-melee" },
        ],
        isMonkMelee: true,
      })
    ).toBe("DEX");
  });

  it("does NOT apply the monk-melee swap to a non-Monk weapon", () => {
    // A Greatsword the Monk carries is not a Monk weapon → STR stays.
    expect(
      stat({
        weaponType: "melee",
        scoreOver: { STR: 16, DEX: 18 },
        weaponAttackAbilities: [
          { ability: "DEX", magicOnly: false, weaponScope: "monk-melee" },
        ],
        isMonkMelee: false,
      })
    ).toBe("STR");
  });
});

describe("hasWeaponMastery", () => {
  it("returns true for Fighter", () => {
    expect(hasWeaponMastery("fighter")).toBe(true);
    expect(hasWeaponMastery("Fighter")).toBe(true);
  });

  it("returns true for Barbarian", () => {
    expect(hasWeaponMastery("barbarian")).toBe(true);
  });

  it("returns true for Paladin", () => {
    expect(hasWeaponMastery("paladin")).toBe(true);
  });

  it("returns true for Ranger", () => {
    expect(hasWeaponMastery("ranger")).toBe(true);
  });

  it("returns true for Rogue", () => {
    expect(hasWeaponMastery("rogue")).toBe(true);
  });

  it("returns false for Wizard", () => {
    expect(hasWeaponMastery("wizard")).toBe(false);
  });

  it("returns false for Bard", () => {
    expect(hasWeaponMastery("bard")).toBe(false);
  });

  it("returns false for Cleric", () => {
    expect(hasWeaponMastery("cleric")).toBe(false);
  });
});

describe("computeAC", () => {
  // Helper to create a mock SRD resolver
  const mockSrd: Record<string, SrdEquipmentData> = {
    "leather-armor": {
      id: "leather-armor",
      category: "armor",
      cost: { amount: 10, unit: "gp" },
      ac: { base: 11, dexBonus: true },
      armorCategory: "light",
      source: "SRD",
    },
    "chain-mail": {
      id: "chain-mail",
      category: "armor",
      cost: { amount: 75, unit: "gp" },
      ac: { base: 16, dexBonus: false },
      armorCategory: "heavy",
      source: "SRD",
    },
    "half-plate-armor": {
      id: "half-plate-armor",
      category: "armor",
      cost: { amount: 750, unit: "gp" },
      ac: { base: 15, dexBonus: true, maxDex: 2 },
      armorCategory: "medium",
      source: "SRD",
    },
    shield: {
      id: "shield",
      category: "armor",
      cost: { amount: 10, unit: "gp" },
      ac: { base: 2, dexBonus: false },
      armorCategory: "shield",
      source: "SRD",
    },
  };
  const resolve = (id: string) => mockSrd[id];
  // computeAC now takes the full ability-score map; build one with the given DEX.
  const scores = (dex: number) => ({
    STR: 10,
    DEX: dex,
    CON: 10,
    INT: 10,
    WIS: 10,
    CHA: 10,
  });

  it("returns 10 + DEX mod with no armor (DEX 14 → AC 12)", () => {
    expect(computeAC([], scores(14), resolve)).toBe(12);
  });

  it("returns 10 + DEX mod with no equipped items", () => {
    const eq: SrdEquipmentRef[] = [{ srdId: "leather-armor" }]; // not equipped
    expect(computeAC(eq, scores(14), resolve)).toBe(12);
  });

  it("light armor: base + full DEX (leather, DEX 16 → 11+3=14)", () => {
    const eq: SrdEquipmentRef[] = [{ srdId: "leather-armor", equipped: true }];
    expect(computeAC(eq, scores(16), resolve)).toBe(14);
  });

  it("heavy armor: base only, no DEX (chain mail, DEX 16 → 16)", () => {
    const eq: SrdEquipmentRef[] = [{ srdId: "chain-mail", equipped: true }];
    expect(computeAC(eq, scores(16), resolve)).toBe(16);
  });

  it("medium armor: base + DEX capped at 2 (half plate, DEX 18 → 15+2=17)", () => {
    const eq: SrdEquipmentRef[] = [{ srdId: "half-plate-armor", equipped: true }];
    expect(computeAC(eq, scores(18), resolve)).toBe(17);
  });

  it("medium armor with low DEX: uses actual DEX (half plate, DEX 12 → 15+1=16)", () => {
    const eq: SrdEquipmentRef[] = [{ srdId: "half-plate-armor", equipped: true }];
    expect(computeAC(eq, scores(12), resolve)).toBe(16);
  });

  it("shield adds +2 to no armor (DEX 14 → 10+2+2=14)", () => {
    const eq: SrdEquipmentRef[] = [{ srdId: "shield", equipped: true }];
    expect(computeAC(eq, scores(14), resolve)).toBe(14);
  });

  it("leather armor + shield (DEX 14 → 11+2+2=15)", () => {
    const eq: SrdEquipmentRef[] = [
      { srdId: "leather-armor", equipped: true },
      { srdId: "shield", equipped: true },
    ];
    expect(computeAC(eq, scores(14), resolve)).toBe(15);
  });

  it("SRD ref acBonus stacks on top (Cloak of Protection +1 over leather → 16) (MAGIC-ITEMS)", () => {
    const eq: SrdEquipmentRef[] = [
      { srdId: "leather-armor", equipped: true },
      // Treat the (otherwise resolves-to-undefined) cloak as a per-character
      // acBonus carrier — verifies the SRD branch honors the new field. The
      // cloak requires attunement, so it must be attuned for the +1 to apply.
      { srdId: "cloak-of-protection", equipped: true, acBonus: 1, attuned: true },
    ];
    // 11 (leather base) + 2 (DEX 14) + 1 (cloak) = 14
    expect(computeAC(eq, scores(14), resolve)).toBe(14);
  });

  it("multiple SRD acBonus items stack (Ring +1 + Cloak +1 over leather → 15)", () => {
    const eq: SrdEquipmentRef[] = [
      { srdId: "leather-armor", equipped: true },
      { srdId: "ring-of-protection", equipped: true, acBonus: 1, attuned: true },
      { srdId: "cloak-of-protection", equipped: true, acBonus: 1, attuned: true },
    ];
    // 11 + 2 + 1 + 1 = 15
    expect(computeAC(eq, scores(14), resolve)).toBe(15);
  });

  it("SRD acBonus only counts when equipped", () => {
    const eq: SrdEquipmentRef[] = [
      { srdId: "leather-armor", equipped: true },
      { srdId: "ring-of-protection", acBonus: 1 }, // NOT equipped
    ];
    // 11 + 2 = 13
    expect(computeAC(eq, scores(14), resolve)).toBe(13);
  });

  it("custom armor works (homebrew +1 leather: base 12, light, DEX 14 → 14)", () => {
    const eq: CustomEquipment[] = [
      {
        custom: true,
        name: "+1 Leather Armor",
        equipped: true,
        ac: { base: 12, dexBonus: true },
        armorCategory: "light",
      },
    ];
    expect(computeAC(eq, scores(14), resolve)).toBe(14);
  });

  it("custom shield works (+1 shield: base 3)", () => {
    const eq: CustomEquipment[] = [
      {
        custom: true,
        name: "+1 Shield",
        equipped: true,
        ac: { base: 3, dexBonus: false },
        armorCategory: "shield",
      },
    ];
    expect(computeAC(eq, scores(14), resolve)).toBe(15); // 10+2+3
  });

  it("acBonus from Ring of Protection stacks", () => {
    const eq: Array<SrdEquipmentRef | CustomEquipment> = [
      { srdId: "leather-armor", equipped: true },
      { custom: true, name: "Ring of Protection", equipped: true, acBonus: 1 },
    ];
    expect(computeAC(eq, scores(14), resolve)).toBe(14); // 11+2+1
  });

  it("multiple acBonus items stack", () => {
    const eq: Array<SrdEquipmentRef | CustomEquipment> = [
      { srdId: "leather-armor", equipped: true },
      { srdId: "shield", equipped: true },
      { custom: true, name: "Ring of Protection", equipped: true, acBonus: 1 },
      { custom: true, name: "Cloak of Protection", equipped: true, acBonus: 1 },
    ];
    // 11 + 2(DEX) + 2(shield) + 1 + 1 = 17
    expect(computeAC(eq, scores(14), resolve)).toBe(17);
  });

  it("unequipped items do not contribute", () => {
    const eq: Array<SrdEquipmentRef | CustomEquipment> = [
      { srdId: "chain-mail", equipped: false },
      { srdId: "shield" }, // no equipped field = not equipped
      { custom: true, name: "Ring of Protection", acBonus: 1 },
    ];
    expect(computeAC(eq, scores(14), resolve)).toBe(12); // 10 + 2 (no armor)
  });

  // --- Edge cases reported by user ---

  it("Paladin fixture shape: plate armor + shield = 20 (DEX 10)", () => {
    // Paladin with plate (18, no DEX) + shield (+2) = 20
    const eq: SrdEquipmentRef[] = [
      { srdId: "plate-armor", equipped: true },
      { srdId: "shield", equipped: true },
    ];
    mockSrd["plate-armor"] = {
      id: "plate-armor",
      category: "armor",
      cost: { amount: 1500, unit: "gp" },
      ac: { base: 18, dexBonus: false },
      armorCategory: "heavy",
      source: "SRD",
    };
    expect(computeAC(eq, scores(10), resolve)).toBe(20);
  });

  it("Paladin fixture shape: plate + shield + misc gear equipped doesn't break AC", () => {
    // All equipment marked equipped on import — non-armor items shouldn't affect AC
    const eq: Array<SrdEquipmentRef | CustomEquipment> = [
      { srdId: "plate-armor", equipped: true },
      { srdId: "shield", equipped: true },
      { custom: true, name: "Explorer's Pack", equipped: true },
      { custom: true, name: "Holy Symbol", equipped: true },
      { custom: true, name: "Rope (50 ft)", equipped: true },
    ];
    expect(computeAC(eq, scores(10), resolve)).toBe(20);
  });

  it("Coralino: leather armor + DEX 16 = 14", () => {
    // Bard with leather (11 + DEX) and DEX 16 (+3) = 14
    const eq: SrdEquipmentRef[] = [{ srdId: "leather-armor", equipped: true }];
    expect(computeAC(eq, scores(16), resolve)).toBe(14);
  });

  it("Coralino: leather + misc gear equipped doesn't break AC", () => {
    const eq: Array<SrdEquipmentRef | CustomEquipment> = [
      { srdId: "leather-armor", equipped: true },
      { custom: true, name: "Lute", equipped: true },
      { custom: true, name: "Diplomat's Pack", equipped: true },
    ];
    expect(computeAC(eq, scores(16), resolve)).toBe(14);
  });

  it("multiple armors equipped: picks best effective AC (order independent)", () => {
    // leather (11+3=14) and chain mail (16) both equipped — chain mail wins
    const eq: SrdEquipmentRef[] = [
      { srdId: "leather-armor", equipped: true },
      { srdId: "chain-mail", equipped: true },
    ];
    expect(computeAC(eq, scores(16), resolve)).toBe(16);
  });

  it("multiple armors: order reversed still picks best", () => {
    // Same as above but reversed order — result must be identical
    const eq: SrdEquipmentRef[] = [
      { srdId: "chain-mail", equipped: true },
      { srdId: "leather-armor", equipped: true },
    ];
    expect(computeAC(eq, scores(16), resolve)).toBe(16);
  });

  it("high DEX char: unarmored (10+5=15) beats medium armor (12+2=14)", () => {
    // DEX 20 (+5): unarmored = 15, hide armor = 12+2=14 → unarmored wins
    const eq: SrdEquipmentRef[] = [{ srdId: "hide-armor", equipped: true }];
    mockSrd["hide-armor"] = {
      id: "hide-armor",
      category: "armor",
      cost: { amount: 10, unit: "gp" },
      ac: { base: 12, dexBonus: true, maxDex: 2 },
      armorCategory: "medium",
      source: "SRD",
    };
    // hide armor: 12+2=14, unarmored: 10+5=15 → picks 15
    expect(computeAC(eq, scores(20), resolve)).toBe(15);
  });

  it("plate + shield + Ring of Protection + Cloak of Protection = 22", () => {
    const eq: Array<SrdEquipmentRef | CustomEquipment> = [
      { srdId: "plate-armor", equipped: true },
      { srdId: "shield", equipped: true },
      { custom: true, name: "Ring of Protection", equipped: true, acBonus: 1 },
      { custom: true, name: "Cloak of Protection", equipped: true, acBonus: 1 },
    ];
    // 18 + 2(shield) + 1 + 1 = 22
    expect(computeAC(eq, scores(10), resolve)).toBe(22);
  });

  it("best shield wins when multiple shields equipped", () => {
    const eq: Array<SrdEquipmentRef | CustomEquipment> = [
      { srdId: "leather-armor", equipped: true },
      { srdId: "shield", equipped: true }, // +2
      {
        custom: true,
        name: "+1 Shield",
        equipped: true,
        ac: { base: 3, dexBonus: false },
        armorCategory: "shield",
      }, // +3
    ];
    // leather: 11+2=13, shield: max(2,3)=3 → 13+3=16
    expect(computeAC(eq, scores(14), resolve)).toBe(16);
  });

  // ── Unarmored Defense (H4) ────────────────────────────────────────────────
  it("Barbarian Unarmored Defense: 10 + DEX + CON with no armor", () => {
    const ab = { STR: 14, DEX: 14, CON: 16, INT: 10, WIS: 10, CHA: 10 };
    // 10 + 2 (DEX) + 3 (CON) = 15
    expect(computeAC([], ab, resolve, [{ srdId: "barbarian-unarmored-defense" }])).toBe(
      15
    );
  });

  it("Monk Unarmored Defense: 10 + DEX + WIS with no armor", () => {
    const ab = { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 16, CHA: 10 };
    // 10 + 3 (DEX) + 3 (WIS) = 16
    expect(computeAC([], ab, resolve, [{ srdId: "monk-unarmored-defense" }])).toBe(16);
  });

  it("Unarmored Defense still adds a shield bonus", () => {
    const ab = { STR: 14, DEX: 14, CON: 16, INT: 10, WIS: 10, CHA: 10 };
    const eq: CustomEquipment[] = [
      {
        custom: true,
        name: "Shield",
        equipped: true,
        armorCategory: "shield",
        ac: { base: 2, dexBonus: false },
      },
    ];
    // 10 + 2 + 3 = 15, + shield 2 = 17
    expect(computeAC(eq, ab, resolve, [{ srdId: "barbarian-unarmored-defense" }])).toBe(
      17
    );
  });

  it("Unarmored Defense is suppressed when body armor is worn", () => {
    const ab = { STR: 14, DEX: 14, CON: 18, INT: 10, WIS: 10, CHA: 10 };
    const eq: SrdEquipmentRef[] = [{ srdId: "leather-armor", equipped: true }];
    // armor wins: leather 11 + DEX 2 = 13 (CON ignored)
    expect(computeAC(eq, ab, resolve, [{ srdId: "barbarian-unarmored-defense" }])).toBe(
      13
    );
  });

  it("no Unarmored Defense feature → plain 10 + DEX", () => {
    const ab = { STR: 10, DEX: 14, CON: 18, INT: 10, WIS: 18, CHA: 18 };
    expect(computeAC([], ab, resolve)).toBe(12);
  });

  // ── AC BREAKDOWN (issue #27-style tip; the named owner request 2026-06-13) ──
  describe("computeACDetailed — the per-source breakdown parts", () => {
    it("leather + shield: exact labelled parts, sum === AC (15)", () => {
      const eq: SrdEquipmentRef[] = [
        { srdId: "leather-armor", equipped: true },
        { srdId: "shield", equipped: true },
      ];
      const { ac, parts } = computeACDetailed(eq, scores(14), resolve);
      expect(ac).toBe(15);
      expect(parts).toEqual([
        { label: { term: "equipment.armor" }, value: 11 },
        { label: { ability: "DEX" }, value: 2 },
        { label: { term: "equipment.shield" }, value: 2 },
      ]);
      expect(breakdownTotal(parts)).toBe(ac);
    });

    it("no armor: base 10 + DEX (shows an explicit +0 DEX at DEX 10)", () => {
      const { ac, parts } = computeACDetailed([], scores(10), resolve);
      expect(ac).toBe(10);
      expect(parts).toEqual([
        { label: { term: "breakdown.base" }, value: 10 },
        { label: { ability: "DEX" }, value: 0 },
      ]);
    });

    it("medium armor caps DEX and flags it (half-plate, DEX 18 → 15 + capped 2)", () => {
      const eq: SrdEquipmentRef[] = [{ srdId: "half-plate-armor", equipped: true }];
      const { ac, parts } = computeACDetailed(eq, scores(18), resolve);
      expect(ac).toBe(17);
      expect(parts).toEqual([
        { label: { term: "equipment.armor" }, value: 15 },
        { label: { ability: "DEX" }, value: 2, note: { term: "breakdown.ac.capped" } },
      ]);
    });

    it("heavy armor: no DEX row at all (chain mail → just the 16 base)", () => {
      const eq: SrdEquipmentRef[] = [{ srdId: "chain-mail", equipped: true }];
      const { ac, parts } = computeACDetailed(eq, scores(16), resolve);
      expect(ac).toBe(16);
      expect(parts).toEqual([{ label: { term: "equipment.armor" }, value: 16 }]);
    });

    // F4 — exact-PARTS regressions for every AC label branch (a label swap that
    // leaves the AC sum unchanged ships green without these). One per branch.

    it("magic-item bonus: leather + Cloak of Protection +1 → the magic part", () => {
      const eq: SrdEquipmentRef[] = [
        { srdId: "leather-armor", equipped: true },
        { srdId: "cloak-of-protection", equipped: true, acBonus: 1, attuned: true },
      ];
      // 11 (armor) + 2 (DEX 14) + 1 (magic) = 14.
      const { ac, parts } = computeACDetailed(eq, scores(14), resolve);
      expect(ac).toBe(14);
      expect(parts).toEqual([
        { label: { term: "equipment.armor" }, value: 11 },
        { label: { ability: "DEX" }, value: 2 },
        { label: { term: "breakdown.ac.magic" }, value: 1 },
      ]);
      expect(breakdownTotal(parts)).toBe(ac);
    });

    it("feature-flat bonus: a non-item AC bonus → the featureBonus part", () => {
      // aggregateAcBonus 1 with no item bonus → a +1 feature flat (Defense
      // fighting style / a pack species' flat AC trait).
      const { ac, parts } = computeACDetailed([], scores(14), resolve, [], 0, 1);
      // 10 (base) + 2 (DEX) + 1 (feature) = 13.
      expect(ac).toBe(13);
      expect(parts).toEqual([
        { label: { term: "breakdown.base" }, value: 10 },
        { label: { ability: "DEX" }, value: 2 },
        { label: { term: "breakdown.featureBonus" }, value: 1 },
      ]);
      expect(breakdownTotal(parts)).toBe(ac);
    });

    it("Barbarian Unarmored Defense: 10 + DEX + CON, DEX not double-listed", () => {
      const ab = { STR: 14, DEX: 14, CON: 16, INT: 10, WIS: 10, CHA: 10 };
      const { ac, parts } = computeACDetailed([], ab, resolve, [
        { srdId: "barbarian-unarmored-defense" },
      ]);
      // 10 + 2 (DEX) + 3 (CON) = 15; the formula owns its abilities, so there is
      // exactly ONE DEX row (emitted in formula order), never a standalone +DEX.
      expect(ac).toBe(15);
      expect(parts).toEqual([
        { label: { term: "breakdown.base" }, value: 10 },
        { label: { ability: "DEX" }, value: 2 },
        { label: { ability: "CON" }, value: 3 },
      ]);
      expect(breakdownTotal(parts)).toBe(ac);
    });

    it("Monk Unarmored Defense: 10 + DEX + WIS, DEX not double-listed", () => {
      const ab = { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 16, CHA: 10 };
      const { ac, parts } = computeACDetailed([], ab, resolve, [
        { srdId: "monk-unarmored-defense" },
      ]);
      // 10 + 3 (DEX) + 3 (WIS) = 16.
      expect(ac).toBe(16);
      expect(parts).toEqual([
        { label: { term: "breakdown.base" }, value: 10 },
        { label: { ability: "DEX" }, value: 3 },
        { label: { ability: "WIS" }, value: 3 },
      ]);
      expect(breakdownTotal(parts)).toBe(ac);
    });

    it("Wild-Shape form AC: the form's self-contained formula parts replace the body", () => {
      const ab = { STR: 10, DEX: 18, CON: 14, INT: 10, WIS: 18, CHA: 10 };
      // Circle of the Moon Circle Forms: AC = 13 + WIS while in a form, taken as
      // the MAX over the body's normal AC (here 10 + 4 DEX = 14). Form = 13 + 4 = 17.
      const formForms: AcFormula[] = [
        {
          sourceId: "druid-moon-circle-forms",
          base: 13,
          bonuses: ["WIS"],
          condition: "while-active",
          shieldBonus: 0,
          activeKey: "druid-moon-circle-forms",
        },
      ];
      const { ac, parts } = computeACDetailed([], ab, resolve, [], 0, 0, formForms);
      expect(ac).toBe(17);
      expect(parts).toEqual([
        { label: { term: "breakdown.ac.formBase" }, value: 13 },
        { label: { ability: "WIS" }, value: 4 },
      ]);
      expect(breakdownTotal(parts)).toBe(ac);
    });

    it("F7 — worn armor BEATEN by high DEX reads 'Base 10', not 'Armor 10'", () => {
      // Hide (medium, base 12, maxDex 2) → effective 14; 10 + DEX 5 = 15 wins, so
      // the default base stays and the part must be labelled `breakdown.base`.
      mockSrd["hide-armor"] = {
        id: "hide-armor",
        category: "armor",
        cost: { amount: 10, unit: "gp" },
        ac: { base: 12, dexBonus: true, maxDex: 2 },
        armorCategory: "medium",
        source: "SRD",
      };
      const eq: SrdEquipmentRef[] = [{ srdId: "hide-armor", equipped: true }];
      const { ac, parts } = computeACDetailed(eq, scores(20), resolve);
      expect(ac).toBe(15);
      expect(parts).toEqual([
        { label: { term: "breakdown.base" }, value: 10 },
        { label: { ability: "DEX" }, value: 5 },
      ]);
      expect(breakdownTotal(parts)).toBe(ac);
    });
  });
});

describe("exhaustion (2024 rules)", () => {
  it("clampExhaustion bounds to 0-6 and floors", () => {
    expect(clampExhaustion(-3)).toBe(0);
    expect(clampExhaustion(0)).toBe(0);
    expect(clampExhaustion(3)).toBe(3);
    expect(clampExhaustion(6)).toBe(6);
    expect(clampExhaustion(9)).toBe(6);
    expect(clampExhaustion(2.9)).toBe(2);
    expect(clampExhaustion(NaN)).toBe(0);
  });

  it("exhaustionPenalty is −2 per level", () => {
    expect(exhaustionPenalty(0)).toBe(0);
    expect(exhaustionPenalty(1)).toBe(-2);
    expect(exhaustionPenalty(3)).toBe(-6);
    expect(exhaustionPenalty(6)).toBe(-12);
    expect(exhaustionPenalty(99)).toBe(-12); // clamped
  });

  it("default exhaustion=0 leaves all D20 functions unchanged", () => {
    expect(savingThrowBonus(14, 5, true)).toBe(savingThrowBonus(14, 5, true, null, 0));
    expect(skillBonus(14, 5, "proficient")).toBe(
      skillBonus(14, 5, "proficient", null, 0)
    );
    expect(spellAttackBonus(5, 16)).toBe(spellAttackBonus(5, 16, null, 0));
    expect(weaponAttackBonus(5, 16, true)).toBe(weaponAttackBonus(5, 16, true, null, 0));
    expect(computeInitiative(14, 3, false)).toBe(computeInitiative(14, 3, false, 0));
    expect(passiveScore(14, 3, "proficient")).toBe(passiveScore(14, 3, "proficient", 0));
  });

  it("subtracts 2×level from saving throws", () => {
    // STR 14 (+2), level 5 (PB +3), proficient = +5; with 2 exhaustion = +1
    expect(savingThrowBonus(14, 5, true, null, 2)).toBe(1);
  });

  it("subtracts 2×level from skill checks (including over an override)", () => {
    // proficient: +2 + PB(+3) = +5; 1 exhaustion → +3
    expect(skillBonus(14, 5, "proficient", null, 1)).toBe(3);
    // override of +9 with 3 exhaustion → +3
    expect(skillBonus(14, 5, "proficient", 9, 3)).toBe(3);
  });

  it("subtracts 2×level from spell + weapon attack rolls", () => {
    // level 5 (PB +3) + INT 16 (+3) = +6; 1 exhaustion → +4
    expect(spellAttackBonus(5, 16, null, 1)).toBe(4);
    // proficient weapon: PB +3 + STR 16 (+3) = +6; 2 exhaustion → +2
    expect(weaponAttackBonus(5, 16, true, null, 2)).toBe(2);
  });

  it("applies the penalty exactly once to passive scores (no double-count)", () => {
    // 10 + (WIS 14 +2 + PB +3 proficient = +5) = 15; 1 exhaustion → 13
    expect(passiveScore(14, 5, "proficient", 1)).toBe(13);
  });

  it("subtracts 2×level from initiative", () => {
    // DEX 14 (+2), no Alert; 2 exhaustion → −2
    expect(computeInitiative(14, 3, false, 2)).toBe(-2);
  });

  it("does NOT change spell save DC (enemy rolls, not a D20 Test of yours)", () => {
    // spellSaveDC has no exhaustion param — confirm signature is unchanged
    expect(spellSaveDC(5, 16)).toBe(14); // 8 + PB 3 + mod 3
  });
});

describe("attacksPerAction (Extra Attack)", () => {
  const fighter = getClassTable("fighter");
  const barbarian = getClassTable("barbarian");
  const wizard = getClassTable("wizard");
  // attacksPerAction now takes a PRE-RESOLVED class-table extra (per-class
  // own-level resolution lives in tableExtraAttacksAtLevel / maxTableExtraAttacks),
  // so the table contribution is resolved at the call site.
  const fighterExtra = (lvl: number) => tableExtraAttacksAtLevel(fighter, lvl);

  it("Fighter scales via class table: 1 → 2 → 3 → 4", () => {
    expect(attacksPerAction(fighterExtra(1))).toBe(1);
    expect(attacksPerAction(fighterExtra(5))).toBe(2);
    expect(attacksPerAction(fighterExtra(11))).toBe(3);
    expect(attacksPerAction(fighterExtra(20))).toBe(4);
  });

  it("other martials get 2 via the extra-attack GRANT aggregate (not feature-id substrings)", () => {
    // The count flows through `aggregate.extraAttacks` (Barbarian has no table
    // extraAttacks key — it's a grant), NOT a scan of `features`.
    expect(
      attacksPerAction(tableExtraAttacksAtLevel(barbarian, 5), { extraAttacks: 1 })
    ).toBe(2);
    // before level 5 (feature/grant not gained yet) → 1
    expect(attacksPerAction(tableExtraAttacksAtLevel(barbarian, 4))).toBe(1);
  });

  it("non-martials make a single attack", () => {
    expect(attacksPerAction(tableExtraAttacksAtLevel(wizard, 20))).toBe(1);
  });

  it("unknown / undefined class table contributes 0 extra (never crashes)", () => {
    expect(attacksPerAction(tableExtraAttacksAtLevel(undefined, 5))).toBe(1);
  });

  // ── Multiclass: Extra Attack NEVER stacks; each class resolves at its OWN
  //    level via the class table, max wins — never the primary class read at the
  //    total character level (the enforce-sweep multiclass-blindness fix). ──────
  describe("maxTableExtraAttacks (multiclass, RAW non-stacking)", () => {
    const getTable = getClassTable;

    it("Fighter 5 / Wizard 5 makes 2 attacks (Fighter's +1 at Fighter level 5), NOT 3", () => {
      // The buggy path read the Fighter table at TOTAL level 10 → +2 → 3 attacks.
      const extra = maxTableExtraAttacks(
        [
          { classId: "fighter", level: 5 },
          { classId: "wizard", level: 5 },
        ],
        getTable
      );
      expect(extra).toBe(1);
      expect(attacksPerAction(extra)).toBe(2);
    });

    it("Fighter 11 / Barbarian 5 → Fighter's +2 wins (MAX, never +2+1)", () => {
      // Barbarian's Extra Attack is a grant (no table key) — table max is Fighter's.
      const extra = maxTableExtraAttacks(
        [
          { classId: "fighter", level: 11 },
          { classId: "barbarian", level: 5 },
        ],
        getTable
      );
      expect(extra).toBe(2);
      expect(attacksPerAction(extra, { extraAttacks: 1 })).toBe(3);
    });

    it("single-class Fighter 11 reduces to the table value at its own level", () => {
      expect(maxTableExtraAttacks([{ classId: "fighter", level: 11 }], getTable)).toBe(2);
    });

    it("Wizard 10 / Cleric 10 (no martial) → 0 table extra → 1 attack", () => {
      const extra = maxTableExtraAttacks(
        [
          { classId: "wizard", level: 10 },
          { classId: "cleric", level: 10 },
        ],
        getTable
      );
      expect(extra).toBe(0);
      expect(attacksPerAction(extra)).toBe(1);
    });
  });
});

describe("isArmorProficient (M3 gate)", () => {
  it("matches proficiency tokens against the normalised armor category", () => {
    // Bard 2024 has `light-armor` — matches the 'light' category
    expect(isArmorProficient("light", [tok("light-armor")])).toBe(true);
    // Druid has `medium-armor-non-metal` — still matches 'medium' (prefix)
    expect(isArmorProficient("medium", [tok("medium-armor-non-metal")])).toBe(true);
    // `shields-non-metal` → shield
    expect(isArmorProficient("shield", [tok("shields-non-metal")])).toBe(true);
    // Wizard has [] — not proficient with anything
    expect(isArmorProficient("light", [])).toBe(false);
    // Heavy vs Light/Medium class → false
    expect(isArmorProficient("heavy", [tok("light-armor"), tok("medium-armor")])).toBe(
      false
    );
  });

  it("treats missing armorCategory as not-gated (e.g. non-armor item)", () => {
    expect(isArmorProficient(undefined, [])).toBe(true);
  });
});

// A4 Phase 8 — deriveSenses and deriveResistances DELETED. The grants
// pipeline is the single source of truth; see grants-darkvision-parity
// and grants-resistance-parity for the data-quality guards.

describe("concentrationSaveDc (H6)", () => {
  it("DC = max(10, ⌊damage/2⌋)", () => {
    expect(concentrationSaveDc(0)).toBe(0);
    expect(concentrationSaveDc(1)).toBe(10);
    expect(concentrationSaveDc(12)).toBe(10);
    expect(concentrationSaveDc(20)).toBe(10);
    expect(concentrationSaveDc(21)).toBe(10);
    expect(concentrationSaveDc(22)).toBe(11);
    expect(concentrationSaveDc(50)).toBe(25);
  });

  it("returns 0 for non-positive damage", () => {
    expect(concentrationSaveDc(-5)).toBe(0);
    expect(concentrationSaveDc(NaN)).toBe(0);
  });
});

describe("Batch I — carrying capacity / jump / unarmed-strike DC (derived stats)", () => {
  it("carrying capacity = STR×15 carry, STR×30 push/drag/lift", () => {
    expect(carryingCapacity(15)).toEqual({ carry: 225, pushDragLift: 450 });
    expect(carryingCapacity(8)).toEqual({ carry: 120, pushDragLift: 240 });
  });

  it("jump distance: long = STR score, high = 3 + STR mod (min 0)", () => {
    expect(jumpDistance(16)).toEqual({ long: 16, high: 6 }); // +3 mod → 3+3
    expect(jumpDistance(10)).toEqual({ long: 10, high: 3 }); // +0 mod → 3+0
    expect(jumpDistance(6)).toEqual({ long: 6, high: 1 }); // -2 mod → 3-2
    expect(jumpDistance(1).high).toBe(0); // 3 + (-5) clamps to 0
  });

  it("unarmed-strike Grapple/Shove DC = 8 + STR mod + PB", () => {
    // STR 16 (+3), level 5 (PB +3) → 8 + 3 + 3 = 14
    expect(unarmedStrikeSaveDc(16, 5)).toBe(14);
    // PB override respected
    expect(unarmedStrikeSaveDc(16, 5, 5)).toBe(16);
  });
});
