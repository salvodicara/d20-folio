import { describe, it, expect } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { levelUp, getAverageHpGain } from "@/lib/level-up";
import {
  emptyAsiChoice,
  isAsiChoiceComplete,
  applyAsiToScores,
} from "@/lib/level-up-choices";
import { emptySwapChoice, isSwapIncomplete, applySpellSwap } from "@/lib/spell-swap";
import { getClassTable } from "@/data/classes";
import { totalLevel } from "@/lib/classes";
import type { CharacterData, SrdSpellRef } from "@/types/character";

/**
 * Creates a minimal CharacterData for testing level-up logic. R4 — accepts the
 * legacy single-class override keys (`class`/`subclass`/`level`) for test ergonomics
 * and folds them into the `classes[]` source of truth (id-first; `class` is lower-
 * cased to its id). Pass `classes` directly for a multiclass case.
 */
function mockCharData(
  overrides?: Partial<CharacterData> & {
    class?: string;
    subclass?: string;
    level?: number;
  }
): CharacterData {
  const { class: cls, subclass, level, classes, ...rest } = overrides ?? {};
  const resolvedClasses = classes ?? [
    {
      classId: (cls ?? "Fighter").toLowerCase(),
      ...(subclass ? { subclassId: subclass } : {}),
      level: level ?? 3,
    },
  ];
  return {
    name: assertNonEmptyString("Test Hero"),
    quote: "",
    race: asRaceId("human"),
    classes: resolvedClasses,
    background: "soldier",
    alignment: asAlignmentId("neutral-good"),
    playerName: "Tester",
    speed: "30 ft",
    ac: 16,
    armorNote: "Chain Mail",
    hp: { max: 28 },
    hitDieType: 10,
    languageIds: ["common", "elvish"],
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
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    savingThrows: ["STR", "CON"],
    skills: { athletics: "proficient", perception: "proficient" },
    spellcasting: null,
    spellSlots: [],
    spells: [],
    weapons: [],
    equipment: [],
    features: [{ srdId: "fighter-fighting-style" }, { srdId: "fighter-second-wind" }],
    combatAlgorithm: [],
    customConditions: [],
    sidebar: [],
    ...rest,
  };
}

describe("level-up engine", () => {
  describe("levelUp — basic", () => {
    it("increments level", () => {
      const char = mockCharData({ level: 3 });
      const { updatedCharacter } = levelUp(char);
      expect(totalLevel(updatedCharacter)).toBe(4);
    });

    it("can target a specific level", () => {
      const char = mockCharData({ level: 3 });
      const { updatedCharacter } = levelUp(char, 5);
      expect(totalLevel(updatedCharacter)).toBe(5);
    });

    it("throws for invalid level (below 2)", () => {
      const char = mockCharData({ level: 1 });
      expect(() => levelUp(char, 1)).toThrow();
    });

    it("throws for level above 20", () => {
      const char = mockCharData({ level: 19 });
      expect(() => levelUp(char, 21)).toThrow();
    });

    it("throws when target level is not higher than current", () => {
      const char = mockCharData({ level: 5 });
      expect(() => levelUp(char, 3)).toThrow();
    });
  });

  describe("levelUp — HP increase", () => {
    it("increases HP by average + CON modifier for d10 fighter", () => {
      // d10 average = 6, CON 14 → +2 modifier → gain 8
      const char = mockCharData({ level: 3, hp: { max: 28 }, hitDieType: 10 });
      const { updatedCharacter, changes } = levelUp(char);
      expect(updatedCharacter.hp.max).toBe(36); // 28 + 8
      const hpChange = changes.find((c) => c.type === "hp");
      expect(hpChange).toBeDefined();
      // Honest breakdown: die +6, CON +2 → +8 total → newMax 36.
      expect(hpChange?.description).toContain("d10=6");
      expect(hpChange?.description).toContain("CON +2");
      expect(hpChange?.description).toContain("36 max");
    });

    it("increases HP by average + CON modifier for d6 wizard", () => {
      // d6 average = 4, CON 10 → +0 modifier → gain 4
      const char = mockCharData({
        classes: [{ classId: "wizard", level: 2 }],
        hp: { max: 10 },
        hitDieType: 6,
        abilityScores: { STR: 8, DEX: 14, CON: 10, INT: 18, WIS: 12, CHA: 10 },
      });
      const { updatedCharacter } = levelUp(char);
      expect(updatedCharacter.hp.max).toBe(14); // 10 + 4
    });

    it("minimum HP gain is 1 even with negative CON", () => {
      // d6 average = 4, CON 6 → -2 modifier → gain max(1, 4-2) = 2
      const char = mockCharData({
        classes: [{ classId: "wizard", level: 2 }],
        hp: { max: 4 },
        hitDieType: 6,
        abilityScores: { STR: 8, DEX: 14, CON: 6, INT: 18, WIS: 12, CHA: 10 },
      });
      const { updatedCharacter } = levelUp(char);
      expect(updatedCharacter.hp.max).toBe(6); // 4 + max(1, 4-2) = 4+2 = 6
    });

    it("guarantees at least 1 HP even with very low CON", () => {
      // d4 average = 3, CON 3 → -4 modifier → gain max(1, 3-4) = 1
      const char = mockCharData({
        classes: [{ classId: "artificer", level: 2 }],
        hp: { max: 2 },
        hitDieType: 8,
        abilityScores: { STR: 8, DEX: 14, CON: 3, INT: 18, WIS: 12, CHA: 10 },
      });
      const { updatedCharacter } = levelUp(char);
      // d8 avg=5, CON -4, max(1, 5-4)=1
      expect(updatedCharacter.hp.max).toBe(3); // 2 + 1
    });
  });

  describe("levelUp — proficiency bonus", () => {
    it("reports proficiency bonus increase at level 5", () => {
      // PB goes from +2 (level 4) to +3 (level 5)
      const char = mockCharData({ level: 4 });
      const { changes } = levelUp(char);
      const pbChange = changes.find((c) => c.type === "proficiency");
      expect(pbChange).toBeDefined();
      expect(pbChange?.description).toContain("+3");
    });

    it("does not report proficiency bonus when unchanged", () => {
      // PB stays at +2 for levels 2-4
      const char = mockCharData({ level: 2 });
      const { changes } = levelUp(char);
      const pbChange = changes.find((c) => c.type === "proficiency");
      expect(pbChange).toBeUndefined();
    });
  });

  describe("levelUp — spell slots", () => {
    it("updates wizard spell slots at level 3", () => {
      const char = mockCharData({
        classes: [{ classId: "wizard", level: 2 }],
        hitDieType: 6,
        hp: { max: 10 },
        spellSlots: [{ level: 1, total: 3 }],
        abilityScores: { STR: 8, DEX: 14, CON: 10, INT: 18, WIS: 12, CHA: 10 },
      });
      const { updatedCharacter, changes } = levelUp(char);
      // At wizard level 3: 4 1st, 2 2nd
      expect(updatedCharacter.spellSlots).toEqual([
        { level: 1, total: 4 },
        { level: 2, total: 2 },
      ]);
      const slotChange = changes.find((c) => c.type === "spellSlots");
      expect(slotChange).toBeDefined();
    });

    it("preserves pactMagic flag for warlock", () => {
      const char = mockCharData({
        classes: [{ classId: "warlock", level: 2 }],
        hitDieType: 8,
        hp: { max: 13 },
        spellSlots: [{ level: 1, total: 2, pactMagic: true }],
        abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 12, CHA: 18 },
      });
      const { updatedCharacter } = levelUp(char);
      // All warlock slots should have pactMagic
      for (const slot of updatedCharacter.spellSlots) {
        expect(slot.pactMagic).toBe(true);
      }
    });

    it("does not change spell slots for non-casters", () => {
      const char = mockCharData({ level: 3, spellSlots: [] });
      const { updatedCharacter } = levelUp(char);
      expect(updatedCharacter.spellSlots).toEqual([]);
    });
  });

  describe("levelUp — auto-add features", () => {
    it("adds class features for new level", () => {
      // Fighter L4→L5 grants real base features (Extra Attack, Tactical Shift),
      // so the auto-add path is exercised unconditionally — unlike L3→L4, which
      // grants only an ASI and zero features.
      const char = mockCharData({ level: 4 });
      const { updatedCharacter, changes } = levelUp(char);
      const ids = updatedCharacter.features
        .filter((f): f is { srdId: string } => "srdId" in f)
        .map((f) => f.srdId);
      expect(ids).toContain("fighter-extra-attack");
      const featureChange = changes.find((c) => c.type === "feature");
      expect(featureChange).toBeDefined();
      expect(featureChange?.description).toContain("New features:");
    });

    it("does not add duplicate features", () => {
      const char = mockCharData({
        level: 1,
        features: [{ srdId: "fighter-fighting-style" }, { srdId: "fighter-second-wind" }],
      });
      const { updatedCharacter } = levelUp(char);
      // Verify no duplicates
      const srdIds = updatedCharacter.features
        .filter((f): f is { srdId: string } => "srdId" in f)
        .map((f) => f.srdId);
      const uniqueIds = new Set(srdIds);
      expect(srdIds.length).toBe(uniqueIds.size);
    });

    it("skips subclass features when subclass does not match", () => {
      const char = mockCharData({
        classes: [{ classId: "wizard", subclassId: "school-of-evocation", level: 2 }],
        hitDieType: 6,
        hp: { max: 10 },
        features: [],
        abilityScores: { STR: 8, DEX: 14, CON: 10, INT: 18, WIS: 12, CHA: 10 },
      });
      const { updatedCharacter } = levelUp(char);
      // Should not add features for other subclasses
      const srdIds = updatedCharacter.features
        .filter((f): f is { srdId: string } => "srdId" in f)
        .map((f) => f.srdId);
      const otherSubclassFeatures = srdIds.filter(
        (id) => id.includes("diviner") || id.includes("abjurer")
      );
      expect(otherSubclassFeatures.length).toBe(0);
    });
  });

  describe("levelUp — checklist", () => {
    it("generates ASI checklist item at ASI level", () => {
      // Fighter gets ASI at level 4
      const char = mockCharData({ level: 3 });
      const { updatedCharacter } = levelUp(char);
      if (getClassTable("fighter")?.levels.find((l) => l.level === 4)?.asi) {
        expect(updatedCharacter.levelUpChecklist).not.toBeNull();
        const asiItem = updatedCharacter.levelUpChecklist?.find((c) =>
          c.text.toLowerCase().includes("ability score")
        );
        expect(asiItem).toBeDefined();
        expect(asiItem?.done).toBe(false);
      }
    });

    it("generates subclass choice item at subclass level", () => {
      // Fighter gets subclass at level 3
      const char = mockCharData({ level: 2, subclass: "" });
      const { updatedCharacter } = levelUp(char);
      const subItem = updatedCharacter.levelUpChecklist?.find((c) =>
        c.text.toLowerCase().includes("subclass")
      );
      expect(subItem).toBeDefined();
    });

    it("does not generate subclass item if already chosen", () => {
      const char = mockCharData({ level: 2, subclass: "champion" });
      const { updatedCharacter } = levelUp(char);
      const subItem = updatedCharacter.levelUpChecklist?.find((c) =>
        c.text.toLowerCase().includes("subclass")
      );
      expect(subItem).toBeUndefined();
    });

    it("returns null checklist when no items needed", () => {
      // Fighter L1→L2: no ASI (asi only at 4/6/8/12/14/16/19), subclass at L3,
      // no base-class spell/cantrip learning → checklist must be null.
      const char = mockCharData({ level: 1 });
      const { updatedCharacter } = levelUp(char, 2);
      expect(updatedCharacter.levelUpChecklist).toBeNull();
    });
  });

  describe("levelUp — does not mutate original", () => {
    it("original CharacterData is unchanged", () => {
      const char = mockCharData({ level: 3, hp: { max: 28 } });
      const originalHp = char.hp.max;
      const originalLevel = totalLevel(char);
      const originalFeatureCount = char.features.length;
      levelUp(char);
      expect(char.hp.max).toBe(originalHp);
      expect(totalLevel(char)).toBe(originalLevel);
      expect(char.features.length).toBe(originalFeatureCount);
    });
  });
});

describe("levelUp — scaling features", () => {
  it("logs the Bardic Inspiration die upgrade to d8 at level 5 WITHOUT baking a trackerOverride", () => {
    const char = mockCharData({
      classes: [{ classId: "bard", level: 4 }],
      hitDieType: 8,
      features: [{ srdId: "bard-bardic-inspiration" }],
    });
    const { updatedCharacter, changes } = levelUp(char, 5);

    const biFeature = updatedCharacter.features.find(
      (f) => !("custom" in f) && "srdId" in f && f.srdId === "bard-bardic-inspiration"
    );
    expect(biFeature).toBeDefined();
    // The die now scales purely via the tracker's `levels[]` at render — the
    // level-up engine must NOT write trackerOverrides.die (that clobbered the
    // user's manual die override and re-stuck on every level-up).
    if (biFeature && !("custom" in biFeature)) {
      expect(biFeature.trackerOverrides?.die).toBeUndefined();
    }
    // The informational changelog still reports the upgrade.
    const scalingChange = changes.find(
      (c) => c.type === "scaling" && c.description.includes("d8")
    );
    expect(scalingChange).toBeDefined();
  });

  it("does NOT clobber a user's manual Bardic Inspiration die override on level-up", () => {
    const char = mockCharData({
      classes: [{ classId: "bard", level: 4 }],
      hitDieType: 8,
      // Player has manually overridden the die (e.g. a homebrew variant).
      features: [{ srdId: "bard-bardic-inspiration", trackerOverrides: { die: "d20" } }],
    });
    const { updatedCharacter } = levelUp(char, 5);
    const bi = updatedCharacter.features.find(
      (f) => !("custom" in f) && f.srdId === "bard-bardic-inspiration"
    );
    if (bi && !("custom" in bi)) {
      // The override is preserved — level-up no longer rewrites it to d8.
      expect(bi.trackerOverrides?.die).toBe("d20");
    }
  });

  it("logs Extra Attack upgrade for Fighter at level 5", () => {
    const char = mockCharData({ class: "Fighter", level: 4 });
    const { changes } = levelUp(char, 5);
    const extraAttackChange = changes.find(
      (c) => c.type === "scaling" && c.description.toLowerCase().includes("attack")
    );
    expect(extraAttackChange).toBeDefined();
  });

  it("logs Sneak Attack dice increase for Rogue", () => {
    const char = mockCharData({ class: "Rogue", level: 2, hitDieType: 8 });
    const { changes } = levelUp(char, 3);
    const sneakChange = changes.find(
      (c) => c.type === "scaling" && c.description.toLowerCase().includes("sneak attack")
    );
    expect(sneakChange).toBeDefined();
  });

  it("logs Martial Arts die upgrade for Monk at level 5", () => {
    const char = mockCharData({ class: "Monk", level: 4, hitDieType: 8 });
    const { changes } = levelUp(char, 5);
    const martialChange = changes.find(
      (c) => c.type === "scaling" && c.description.toLowerCase().includes("martial arts")
    );
    expect(martialChange).toBeDefined();
  });

  it("logs cantrip damage scaling for a SINGLE-CLASS Wizard at level 5 (regression: Wizard/Cleric carry no classSpecific, which used to early-return the whole scaling pass)", () => {
    // Wizard (and, since M11 removed its dead channelDivinityUses, Cleric) never
    // populate classSpecific at ANY level. applyScalingFeatures used to gate its
    // ENTIRE body — including this classSpecific-independent cantrip-scale
    // check — behind `if (!levelData?.classSpecific) return`, so a single-class
    // Wizard silently never got this changelog entry. Fixed by defaulting
    // spec/prevSpec to {} instead of early-returning.
    const char = mockCharData({
      classes: [{ classId: "wizard", level: 4 }],
      spells: [{ srdId: "fire-bolt" }],
    });
    const { changes } = levelUp(char, 5);
    const scale = changes.find((c) => c.i18nKey === "levelUp.scaling.cantripScale");
    expect(scale).toBeDefined();
    expect(scale?.i18nArgs?.level).toBe(5);
  });

  it("respects hpGain override option (raw die value — CON added by engine)", () => {
    // Bug-fix regression: hpGain is the RAW die roll. CON is added by the
    // level-up engine. Previously the override path silently dropped CON,
    // making a manual roll under-grant HP vs the average path.
    const char = mockCharData({ level: 3, hitDieType: 10, hp: { max: 28 } });
    // Rolled a 10 on d10 with CON 14 (+2) → +12 HP total → max 40.
    const { updatedCharacter } = levelUp(char, 4, { hpGain: 10 });
    expect(updatedCharacter.hp.max).toBe(40);
  });

  it("hpGain override does not silently drop the CON modifier (regression)", () => {
    // Specifically guards against the pre-fix bug where rolling 5 on a d10
    // with +2 CON only granted +5 HP instead of +7.
    const char = mockCharData({ level: 3, hitDieType: 10, hp: { max: 28 } });
    const { updatedCharacter } = levelUp(char, 4, { hpGain: 5 });
    expect(updatedCharacter.hp.max).toBe(35); // 28 + max(1, 5 + 2)
  });

  it("hpGain override honors the min-1 floor when CON is very negative", () => {
    // Rolled 1 on a d6 wizard with CON 3 (mod -4) → max(1, 1 + -4) = 1.
    const char = mockCharData({
      classes: [{ classId: "wizard", level: 2 }],
      hp: { max: 4 },
      hitDieType: 6,
      abilityScores: { STR: 8, DEX: 14, CON: 3, INT: 18, WIS: 12, CHA: 10 },
    });
    const { updatedCharacter } = levelUp(char, 3, { hpGain: 1 });
    expect(updatedCharacter.hp.max).toBe(5); // 4 + 1 (min)
  });
});

describe("getAverageHpGain", () => {
  it("returns correct average for d10 with +2 CON", () => {
    // d10 average = 6, CON 14 = +2 → 6 + 2 = 8
    expect(getAverageHpGain(10, 14)).toBe(8);
  });
});

// ─── Inline Choice Helpers ────────────────────────────────────────────────────

describe("level-up inline choices", () => {
  describe("emptyAsiChoice", () => {
    it("returns default +2 mode with all nulls", () => {
      const c = emptyAsiChoice();
      expect(c.mode).toBe("plus2");
      expect(c.plusTwo).toBeNull();
      expect(c.plusOneA).toBeNull();
      expect(c.plusOneB).toBeNull();
      expect(c.featId).toBeNull();
    });
  });

  describe("isAsiChoiceComplete", () => {
    it("is incomplete when +2 mode with no stat selected", () => {
      expect(isAsiChoiceComplete(emptyAsiChoice())).toBe(false);
    });

    it("is complete when +2 mode with stat selected", () => {
      const c = { ...emptyAsiChoice(), plusTwo: "STR" as const };
      expect(isAsiChoiceComplete(c)).toBe(true);
    });

    it("is incomplete when +1+1 mode with only one stat", () => {
      const c = {
        ...emptyAsiChoice(),
        mode: "plus1_1" as const,
        plusOneA: "STR" as const,
      };
      expect(isAsiChoiceComplete(c)).toBe(false);
    });

    it("is incomplete when +1+1 mode with same stat twice", () => {
      const c = {
        ...emptyAsiChoice(),
        mode: "plus1_1" as const,
        plusOneA: "STR" as const,
        plusOneB: "STR" as const,
      };
      expect(isAsiChoiceComplete(c)).toBe(false);
    });

    it("is complete when +1+1 mode with two different stats", () => {
      const c = {
        ...emptyAsiChoice(),
        mode: "plus1_1" as const,
        plusOneA: "STR" as const,
        plusOneB: "DEX" as const,
      };
      expect(isAsiChoiceComplete(c)).toBe(true);
    });

    it("is incomplete when feat mode with no feat", () => {
      const c = { ...emptyAsiChoice(), mode: "feat" as const };
      expect(isAsiChoiceComplete(c)).toBe(false);
    });

    it("is complete when feat mode with feat chosen", () => {
      const c = { ...emptyAsiChoice(), mode: "feat" as const, featId: "alert" };
      expect(isAsiChoiceComplete(c)).toBe(true);
    });
  });

  describe("applyAsiToScores", () => {
    const baseScores = { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 };

    it("applies +2 to the chosen stat", () => {
      const c = { ...emptyAsiChoice(), plusTwo: "STR" as const };
      const result = applyAsiToScores(baseScores, c);
      expect(result.STR).toBe(18);
      expect(result.DEX).toBe(14); // unchanged
    });

    it("caps +2 at 20", () => {
      const scores = { ...baseScores, STR: 19 };
      const c = { ...emptyAsiChoice(), plusTwo: "STR" as const };
      const result = applyAsiToScores(scores, c);
      expect(result.STR).toBe(20);
    });

    it("applies +1/+1 to two different stats", () => {
      const c = {
        ...emptyAsiChoice(),
        mode: "plus1_1" as const,
        plusOneA: "STR" as const,
        plusOneB: "CON" as const,
      };
      const result = applyAsiToScores(baseScores, c);
      expect(result.STR).toBe(17);
      expect(result.CON).toBe(15);
      expect(result.DEX).toBe(14); // unchanged
    });

    it("caps +1/+1 at 20 for each stat", () => {
      const scores = { ...baseScores, STR: 20, CON: 19 };
      const c = {
        ...emptyAsiChoice(),
        mode: "plus1_1" as const,
        plusOneA: "STR" as const,
        plusOneB: "CON" as const,
      };
      const result = applyAsiToScores(scores, c);
      expect(result.STR).toBe(20); // already at max
      expect(result.CON).toBe(20);
    });

    it("returns unchanged scores for feat mode", () => {
      const c = { ...emptyAsiChoice(), mode: "feat" as const, featId: "alert" };
      const result = applyAsiToScores(baseScores, c);
      expect(result).toEqual(baseScores);
    });

    it("does not mutate original scores", () => {
      const original = { ...baseScores };
      const c = { ...emptyAsiChoice(), plusTwo: "STR" as const };
      applyAsiToScores(baseScores, c);
      expect(baseScores.STR).toBe(original.STR);
    });
  });
});

// ─── Spell Swap Helpers ───────────────────────────────────────────────────────

describe("emptySwapChoice", () => {
  it("returns both null", () => {
    const c = emptySwapChoice();
    expect(c.removeId).toBeNull();
    expect(c.replaceId).toBeNull();
  });
});

describe("isSwapIncomplete", () => {
  it("both null → complete (skip)", () => {
    expect(isSwapIncomplete({ removeId: null, replaceId: null })).toBe(false);
  });

  it("both set → complete (apply swap)", () => {
    expect(isSwapIncomplete({ removeId: "fireball", replaceId: "ice-storm" })).toBe(
      false
    );
  });

  it("removeId set but replaceId null → incomplete", () => {
    expect(isSwapIncomplete({ removeId: "fireball", replaceId: null })).toBe(true);
  });

  it("removeId null but replaceId set → incomplete", () => {
    expect(isSwapIncomplete({ removeId: null, replaceId: "ice-storm" })).toBe(true);
  });
});

// ─── canSwapSpell Class Table Flags ──────────────────────────────────────────

describe("canSwapSpell class table flags", () => {
  const knownCasters = ["bard", "sorcerer", "warlock", "ranger"];
  const nonSwapCasters = [
    "wizard",
    "cleric",
    "druid",
    "paladin",
    "fighter",
    "barbarian",
    "monk",
    "rogue",
  ];

  it.each(knownCasters)("%s has canSwapSpell: true", (classId) => {
    const table = getClassTable(classId);
    expect(table?.canSwapSpell).toBe(true);
  });

  it.each(nonSwapCasters)("%s does NOT have canSwapSpell", (classId) => {
    const table = getClassTable(classId);
    expect(table?.canSwapSpell).toBeFalsy();
  });
});

// ─── Spell Swap Apply Logic ───────────────────────────────────────────────────

describe("spell swap application logic", () => {
  it("removes the old spell and adds the new one", () => {
    const spells: CharacterData["spells"] = [
      { srdId: "cure-wounds" },
      { srdId: "shield-of-faith" },
    ];
    const result = applySpellSwap(spells, "cure-wounds", "healing-word");
    const ids = result
      .filter((s): s is SrdSpellRef => !("custom" in s))
      .map((s) => s.srdId);
    expect(ids).not.toContain("cure-wounds");
    expect(ids).toContain("healing-word");
    expect(ids).toContain("shield-of-faith");
    expect(result).toHaveLength(2);
  });

  it("preserves custom spells during swap", () => {
    const spells: CharacterData["spells"] = [
      { srdId: "cure-wounds" },
      {
        custom: true,
        name: "Homebrew Bolt",
        level: 2,
        school: "evocation",
        castingTime: "1 action",
        range: "60 ft",
        components: { v: true, s: false, m: false },
        duration: "Instantaneous",
        concentration: false,
        description: "Custom spell.",
      },
    ];
    const result = applySpellSwap(spells, "cure-wounds", "healing-word");
    expect(result).toHaveLength(2);
    const customSpell = result.find((s) => "custom" in s);
    expect(customSpell).toBeDefined();
  });

  it("preserves other SRD spells when swapping one", () => {
    const spells: CharacterData["spells"] = [
      { srdId: "spell-a" },
      { srdId: "spell-b" },
      { srdId: "spell-c" },
    ];
    const result = applySpellSwap(spells, "spell-b", "spell-d");
    const ids = result
      .filter((s): s is SrdSpellRef => !("custom" in s))
      .map((s) => s.srdId);
    expect(ids).toContain("spell-a");
    expect(ids).not.toContain("spell-b");
    expect(ids).toContain("spell-c");
    expect(ids).toContain("spell-d");
    expect(result).toHaveLength(3);
  });
});

// ─── preparedMax updated on level-up ─────────────────────────────────────────

describe("levelUp — preparedMax update", () => {
  it("updates spellcasting.preparedMax from class table on level-up (Bard)", () => {
    const bard = mockCharData({
      classes: [{ classId: "bard", level: 3 }],
      spellcasting: {
        ability: "CHA",
        preparedCaster: true,
        preparedMax: 6, // level 3 value
        saveDCOverride: null,
        attackBonusOverride: null,
      },
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 2 },
      ],
    });
    const { updatedCharacter } = levelUp(bard, 4);
    // Bard level 4 spellsKnown = 7
    expect(updatedCharacter.spellcasting?.preparedMax).toBe(7);
  });

  it("updates spellcasting.preparedMax for Wizard on level-up", () => {
    const wizard = mockCharData({
      classes: [{ classId: "wizard", level: 4 }],
      spellcasting: {
        ability: "INT",
        preparedCaster: true,
        preparedMax: 7, // level 4 value
        saveDCOverride: null,
        attackBonusOverride: null,
      },
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 3 },
      ],
    });
    const { updatedCharacter } = levelUp(wizard, 5);
    // Wizard level 5 spellsKnown = 9
    expect(updatedCharacter.spellcasting?.preparedMax).toBe(9);
  });

  it("does not crash for non-caster on level-up", () => {
    const fighter = mockCharData({ class: "Fighter", level: 3, spellcasting: null });
    const { updatedCharacter } = levelUp(fighter, 4);
    expect(updatedCharacter.spellcasting).toBeNull();
  });
});

// ─── Dwarven Toughness HP bonus ──────────────────────────────────────────────

describe("levelUp — Dwarven Toughness", () => {
  it("adds +1 HP per level for characters with dwarf-dwarven-toughness", () => {
    const dwarf = mockCharData({
      classes: [{ classId: "fighter", level: 3 }],
      hp: { max: 30 },
      hitDieType: 10,
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      features: [
        { srdId: "dwarf-dwarven-toughness" },
        { srdId: "fighter-fighting-style" },
      ],
    });
    const { updatedCharacter, changes } = levelUp(dwarf, 4);
    // Average d10 = 6, CON mod = +2, Dwarven Toughness = +1 → total = 9
    expect(updatedCharacter.hp.max).toBe(39);
    const hpChange = changes.find((c) => c.type === "hp");
    expect(hpChange?.description).toContain("Dwarven Toughness");
  });

  it("does NOT add bonus for characters without dwarf-dwarven-toughness", () => {
    const human = mockCharData({
      classes: [{ classId: "fighter", level: 3 }],
      hp: { max: 30 },
      hitDieType: 10,
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      features: [{ srdId: "fighter-fighting-style" }],
    });
    const { updatedCharacter } = levelUp(human, 4);
    // Average d10 = 6, CON mod = +2 → total = 8
    expect(updatedCharacter.hp.max).toBe(38);
  });
});

// ─── Tough feat HP bonus (H8) ────────────────────────────────────────────────

describe("levelUp — Tough feat (H8)", () => {
  it("adds +2 HP per level for characters with Tough as humanOriginFeat", () => {
    const human = mockCharData({
      classes: [{ classId: "fighter", level: 3 }],
      hp: { max: 30 },
      hitDieType: 10,
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      humanOriginFeat: "tough",
      features: [{ srdId: "fighter-fighting-style" }],
    });
    const { updatedCharacter, changes } = levelUp(human, 4);
    // Average d10 = 6, CON +2, Tough +2 → 10 per level → 30 + 10 = 40
    expect(updatedCharacter.hp.max).toBe(40);
    expect(changes.find((c) => c.type === "hp")?.description).toContain("Tough +2");
  });

  it("adds +2 when Tough is the background feat", () => {
    const human = mockCharData({
      classes: [{ classId: "fighter", level: 3 }],
      hp: { max: 30 },
      hitDieType: 10,
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      bgFeat: "tough",
    });
    const { updatedCharacter } = levelUp(human, 4);
    expect(updatedCharacter.hp.max).toBe(40);
  });

  // (The feature-taken path resolves the feat through FEATS_BY_ID, so it needs
  // the pack-shipped Tough feat data — that pin lives in
  // `content-pack/tests/unit/level-up.pack.test.ts`.)

  it("Tough stacks with Dwarven Toughness (+3 per level)", () => {
    const dwarf = mockCharData({
      classes: [{ classId: "fighter", level: 3 }],
      hp: { max: 30 },
      hitDieType: 10,
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      humanOriginFeat: "tough",
      features: [{ srdId: "dwarf-dwarven-toughness" }],
    });
    const { updatedCharacter } = levelUp(dwarf, 4);
    // 30 + (6 avg + 2 CON + 1 Dwarven + 2 Tough) = 41
    expect(updatedCharacter.hp.max).toBe(41);
  });
});

// ─── Subclass spell checklist hint ───────────────────────────────────────────

describe("levelUp — subclass spell checklist", () => {
  it("adds subclass spell hint for Paladin at level 5 with a subclass", () => {
    const paladin = mockCharData({
      classes: [{ classId: "paladin", subclassId: "Oath of Devotion", level: 4 }],
      features: [],
      spellcasting: {
        ability: "CHA",
        preparedCaster: true,
        preparedMax: 5,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
      spellSlots: [{ level: 1, total: 3 }],
    });
    const { updatedCharacter } = levelUp(paladin, 5);
    const item = updatedCharacter.levelUpChecklist?.find(
      (c) => c.i18nKey === "levelUp.checklistSubclassSpells"
    );
    expect(item).toBeDefined();
    expect(item?.done).toBe(false);
  });

  it("does NOT add subclass spell hint at non-spell levels", () => {
    const paladin = mockCharData({
      classes: [{ classId: "paladin", subclassId: "Oath of Devotion", level: 5 }],
      features: [],
      spellcasting: {
        ability: "CHA",
        preparedCaster: true,
        preparedMax: 6,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 2 },
      ],
    });
    const { updatedCharacter } = levelUp(paladin, 6);
    const item = updatedCharacter.levelUpChecklist?.find(
      (c) => c.i18nKey === "levelUp.checklistSubclassSpells"
    );
    expect(item).toBeUndefined();
  });

  it("does NOT add subclass spell hint when no subclass chosen yet", () => {
    const paladin = mockCharData({
      classes: [{ classId: "paladin", level: 2 }],
      features: [],
      spellcasting: {
        ability: "CHA",
        preparedCaster: true,
        preparedMax: 3,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
      spellSlots: [{ level: 1, total: 2 }],
    });
    const { updatedCharacter } = levelUp(paladin, 3);
    const item = updatedCharacter.levelUpChecklist?.find(
      (c) => c.i18nKey === "levelUp.checklistSubclassSpells"
    );
    expect(item).toBeUndefined();
  });
});
