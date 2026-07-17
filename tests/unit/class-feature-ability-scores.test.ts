/**
 * L7 lever — class-feature `ability-score` grants auto-applied at level-up.
 *
 * 2024 RAW capstones that raise ability scores:
 *  - Barbarian L20 Primal Champion: +4 STR, +4 CON, max 25.
 *  - Monk L20 Body and Mind: +4 DEX, +4 WIS, max 25.
 *
 * These capstones are PROSE-FREE because the applier mirrors the hp-per-level
 * scan: it reads the `ability-score` grants on features GAINED at exactly the
 * target level, BAKES them into the stored `character.abilityScores` (per-grant
 * cap), and — when CON rises — bumps max HP retroactively. (Class-feature ASIs
 * never ride the render aggregate; the additive `itemAbilityScoreBonus` channel
 * is magic-item-only, so a baked class ASI can never double-count.)
 */
import { describe, it, expect } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { foldLegacyClass } from "./_helpers";
import { levelUp } from "@/lib/level-up";
import { getClassTable } from "@/data/classes";
import type { CharacterData } from "@/types/character";

function mk(
  overrides?: Partial<CharacterData> & {
    class?: string;
    classId?: string;
    subclass?: string;
    subclassId?: string;
    level?: number;
  }
): CharacterData {
  return {
    name: assertNonEmptyString("Test"),
    quote: "",
    race: asRaceId("human"),
    classes: [{ classId: "barbarian", level: 19 }],
    background: "",
    alignment: asAlignmentId(""),
    playerName: "",
    speed: "30",
    ac: 14,
    armorNote: "",
    hp: { max: 200 },
    hitDieType: 12,
    languageIds: [],
    customLanguages: [],
    toolProficiencyIds: [],
    customToolProficiencies: [],
    abilityBudget: 27,
    proficiencyBonusOverride: null,
    levelUpChecklist: null,
    backgroundAsi: {},
    humanOriginFeat: "",
    bgFeat: "",
    lore: {
      traits: "",
      ideals: "",
      bonds: "",
      flaws: "",
      backstory: "",
      age: "",
      height: "",
      weight: "",
      eyes: "",
      hair: "",
      skin: "",
    },
    abilityScores: { STR: 20, DEX: 14, CON: 18, INT: 10, WIS: 12, CHA: 8 },
    savingThrows: ["STR", "CON"],
    skills: {},
    spellcasting: null,
    spellSlots: [],
    spells: [],
    weapons: [],
    equipment: [],
    features: [],
    combatAlgorithm: [],
    customConditions: [],
    sidebar: [],
    ...foldLegacyClass(overrides, "barbarian"),
  };
}

describe("Barbarian L20 Primal Champion", () => {
  it("applies +4 STR and +4 CON (capped 25) on level 19 → 20", () => {
    const char = mk({
      classes: [{ classId: "barbarian", level: 19 }],
      abilityScores: { STR: 20, DEX: 14, CON: 18, INT: 10, WIS: 12, CHA: 8 },
    });
    const { updatedCharacter } = levelUp(char, 20);
    expect(updatedCharacter.abilityScores.STR).toBe(24); // 20 + 4
    expect(updatedCharacter.abilityScores.CON).toBe(22); // 18 + 4
  });

  it("caps at 25 — a STR-23 barbarian gains only +2 STR", () => {
    const char = mk({
      classes: [{ classId: "barbarian", level: 19 }],
      abilityScores: { STR: 23, DEX: 14, CON: 24, INT: 10, WIS: 12, CHA: 8 },
    });
    const { updatedCharacter } = levelUp(char, 20);
    expect(updatedCharacter.abilityScores.STR).toBe(25); // 23 + 4 → cap 25
    expect(updatedCharacter.abilityScores.CON).toBe(25); // 24 + 4 → cap 25
  });

  it("raising CON bumps max HP retroactively across all 20 levels", () => {
    // CON 18 (+4) → 22 (+6): +2 CON mod × 20 levels = +40 HP.
    const char = mk({
      classes: [{ classId: "barbarian", level: 19 }],
      hp: { max: 200 },
      abilityScores: { STR: 20, DEX: 14, CON: 18, INT: 10, WIS: 12, CHA: 8 },
    });
    const { updatedCharacter } = levelUp(char, 20);
    // applyHpIncrease adds the L20 die+CON first (using OLD CON +4), then the
    // capstone CON bump (+2 mod) adds 2×20=40 retroactively. Assert the
    // retroactive component landed: max grew by at least the 40 CON bump.
    expect(updatedCharacter.abilityScores.CON).toBe(22);
    expect(updatedCharacter.hp.max).toBeGreaterThanOrEqual(200 + 40);
  });
});

describe("Monk L20 Body and Mind", () => {
  it("applies +4 DEX and +4 WIS (capped 25) on level 19 → 20", () => {
    const char = mk({
      classes: [{ classId: "monk", level: 19 }],
      hitDieType: 8,
      abilityScores: { STR: 10, DEX: 20, CON: 14, INT: 10, WIS: 19, CHA: 8 },
    });
    const { updatedCharacter } = levelUp(char, 20);
    expect(updatedCharacter.abilityScores.DEX).toBe(24); // 20 + 4
    expect(updatedCharacter.abilityScores.WIS).toBe(23); // 19 + 4
  });
});

describe("non-capstone levels do not touch ability scores", () => {
  it("Barbarian 4 → 5 leaves scores unchanged", () => {
    const char = mk({
      classes: [{ classId: "barbarian", level: 4 }],
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    });
    const { updatedCharacter } = levelUp(char, 5);
    expect(updatedCharacter.abilityScores).toEqual({
      STR: 16,
      DEX: 14,
      CON: 14,
      INT: 10,
      WIS: 12,
      CHA: 8,
    });
  });
});

describe("monk capstone level placement (2024 RAW)", () => {
  it("Superior Defense is L18 and Body and Mind is L20", () => {
    const monk = getClassTable("monk");
    const l18 = monk?.levels.find((l) => l.level === 18)?.featureIds ?? [];
    const l20 = monk?.levels.find((l) => l.level === 20)?.featureIds ?? [];
    const l17 = monk?.levels.find((l) => l.level === 17)?.featureIds ?? [];
    expect(l18).toContain("monk-superior-defense");
    expect(l20).toContain("monk-body-and-mind");
    // L17 has no base-class feature in 2024.
    expect(l17).not.toContain("monk-superior-defense");
    expect(l17).not.toContain("monk-body-and-mind");
  });
});
