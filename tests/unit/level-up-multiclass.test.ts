/**
 * R4 — multiclass level-up: advancing a CHOSEN class, source attribution on every
 * change, multiclass spell slots, PB from total level, and the "add a class" path.
 */
import { describe, expect, it } from "vitest";
import { levelUp } from "@/lib/level-up";
import { levelUpChangeSource } from "@/lib/views/level-up-view";
import { buildScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import type { CharacterData } from "@/types/character";
import { totalLevel, primaryClassId } from "@/lib/classes";

function spec(key: string) {
  const s = DEV_SCENARIOS[key];
  if (!s) throw new Error(`scenario ${key} missing`);
  return s;
}

const multiclassChar = (): CharacterData =>
  buildScenario(spec("wizard-cleric-multiclass")).character;

describe("levelUp — multiclass advancing a chosen class", () => {
  it("advances the named class's entry and keeps the others", () => {
    const char = multiclassChar(); // Wizard 5 / Cleric 3 (total 8)
    const { updatedCharacter } = levelUp(char, totalLevel(char) + 1, {
      advanceClassId: "cleric",
    });
    const byId = Object.fromEntries(
      updatedCharacter.classes.map((c) => [c.classId, c.level])
    );
    expect(byId.wizard).toBe(5); // unchanged
    expect(byId.cleric).toBe(4); // advanced
    expect(totalLevel(updatedCharacter)).toBe(9); // total
  });

  it("defaults to advancing the PRIMARY class when none is named", () => {
    const char = multiclassChar();
    const { updatedCharacter } = levelUp(char, totalLevel(char) + 1);
    const byId = Object.fromEntries(
      updatedCharacter.classes.map((c) => [c.classId, c.level])
    );
    // Wizard (5) is the highest-level → primary → advances to 6.
    expect(byId.wizard).toBe(6);
    expect(byId.cleric).toBe(3);
  });

  it("PB comes from TOTAL level, not any single class", () => {
    // A char at total level 8 (PB +3) advancing to 9 stays +3 (PB tier is 9→+4 at 9?).
    // total 8 → +3, total 9 → +4: confirm the change is keyed on the total.
    const char = multiclassChar();
    const { changes } = levelUp(char, 9, { advanceClassId: "cleric" });
    const pb = changes.find((c) => c.type === "proficiency");
    expect(pb?.i18nArgs?.pb).toBe(4); // total level 9 → PB +4
    // The PB change is a total-level event: no source class attribution.
    expect(pb?.sourceClassId).toBeUndefined();
  });

  it("tags every non-PB change with the advancing class for source attribution", () => {
    const char = multiclassChar();
    const { changes } = levelUp(char, totalLevel(char) + 1, { advanceClassId: "cleric" });
    const nonPb = changes.filter((c) => c.type !== "proficiency");
    expect(nonPb.length).toBeGreaterThan(0);
    for (const ch of nonPb) {
      expect(ch.sourceClassId).toBe("cleric");
      expect(ch.sourceClassLevel).toBe(4);
      // The view resolves it to a localized "Cleric 4" badge.
      expect(levelUpChangeSource(ch, "en")).toBe("Cleric 4");
      expect(levelUpChangeSource(ch, "it")).toBe("Chierico 4");
    }
  });

  it("recomputes shared spell slots from the multiclass table after the advance", () => {
    const char = multiclassChar(); // Wizard 5 / Cleric 3 → caster level 8
    const { updatedCharacter } = levelUp(char, totalLevel(char) + 1, {
      advanceClassId: "cleric",
    });
    // Wizard 5 / Cleric 4 → caster level 9 → [4,3,3,3,1].
    const shared = updatedCharacter.spellSlots.filter((s) => !s.pactMagic);
    expect(shared).toEqual([
      { level: 1, total: 4 },
      { level: 2, total: 3 },
      { level: 3, total: 3 },
      { level: 4, total: 3 },
      { level: 5, total: 1 },
    ]);
  });
});

describe("levelUp — cantrip damage scaling keys on TOTAL character level (RAW 2024)", () => {
  it("fires when the TOTAL level hits a milestone even though no class level does", () => {
    // Wizard 8 / Cleric 2 → total 10 → 11 (milestone); class levels move 2→3.
    const char = multiclassChar();
    char.classes = [
      { classId: "wizard", subclassId: "evoker", level: 8 },
      { classId: "cleric", subclassId: "life-domain", level: 2 },
    ];
    const { changes } = levelUp(char, 11, { advanceClassId: "cleric" });
    const scale = changes.find((c) => c.i18nKey === "levelUp.scaling.cantripScale");
    expect(scale).toBeDefined();
    expect(scale?.i18nArgs?.level).toBe(11);
  });

  it("does NOT fire when only a CLASS level hits a milestone (total level doesn't)", () => {
    // Wizard 4 / Cleric 2 → total 6 → 7, advancing Wizard to CLASS level 5.
    // The pre-fix code keyed the milestone on the class level and wrongly fired.
    const char = multiclassChar();
    char.classes = [
      { classId: "wizard", subclassId: "evoker", level: 4 },
      { classId: "cleric", subclassId: "life-domain", level: 2 },
    ];
    const { changes } = levelUp(char, 7, { advanceClassId: "wizard" });
    expect(
      changes.find((c) => c.i18nKey === "levelUp.scaling.cantripScale")
    ).toBeUndefined();
  });
});

describe("levelUp — 'add a class' (a class the character doesn't have yet)", () => {
  it("appends a new one-level entry for the new class", () => {
    const char = multiclassChar(); // Wizard 5 / Cleric 3
    const { updatedCharacter } = levelUp(char, totalLevel(char) + 1, {
      advanceClassId: "fighter",
    });
    const fighter = updatedCharacter.classes.find((c) => c.classId === "fighter");
    expect(fighter?.level).toBe(1);
    expect(totalLevel(updatedCharacter)).toBe(9);
  });
});

describe("levelUp — single-class users see NO new friction", () => {
  it("a single-class advance is byte-equivalent to the old behavior (one entry, level = total)", () => {
    const cleric = buildScenario(spec("life-cleric")).character; // Cleric 5
    const { updatedCharacter } = levelUp(cleric, 6);
    expect(updatedCharacter.classes).toEqual([
      { classId: "cleric", subclassId: "life-domain", level: 6 },
    ]);
    expect(totalLevel(updatedCharacter)).toBe(6);
    expect(primaryClassId(updatedCharacter)).toBe("cleric");
  });
});
