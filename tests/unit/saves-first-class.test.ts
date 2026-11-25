/**
 * #1366 — the 2024 rule: only the class taken at character level 1 (`classes[0]`,
 * the convention #1324 uses for the first-level hit-die maximum) grants its saving
 * throw proficiencies. A class added by multiclassing grants only the subset its
 * multiclass table lists, and that subset has no saving throws. Not the
 * highest-level class.
 * SRD classes only, so the pack-free build runs the same cases.
 */
import { describe, it, expect } from "vitest";
import {
  minimizeCharacter,
  rehydrateCharacter,
  type MinimalCharacter,
} from "@/lib/character-minimal";
import { reconcileBuildChoices } from "@/lib/reconcile-build";
import { levelUp } from "@/lib/level-up";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { AbilityCode } from "@/data/types";
import type { CharacterData, ClassEntry } from "@/types/character";

const WIZARD_SAVES: AbilityCode[] = ["INT", "WIS"];
const FIGHTER_SAVES: AbilityCode[] = ["STR", "CON"];

const sorted = (saves: readonly AbilityCode[]) => [...saves].sort();

/** A full character on the given classes, every other field from the mock. */
function character(classes: ClassEntry[], savingThrows: AbilityCode[]): CharacterData {
  return { ...MOCK_CHARACTER.character, classes, savingThrows };
}

/** The saves a stored minimal document with no `savingThrows` rehydrates to. */
function derivedSaves(classes: ClassEntry[]): AbilityCode[] {
  const min = minimizeCharacter(character(classes, [])) as Record<string, unknown>;
  delete min.savingThrows;
  return sorted(rehydrateCharacter(min as MinimalCharacter).savingThrows);
}

const WIZARD_1_FIGHTER_5: ClassEntry[] = [
  { classId: "wizard", level: 1 },
  { classId: "fighter", level: 5 },
];

describe("saving throws — the first class grants them, on save and reload", () => {
  it("Wizard 1 then Fighter 5 has INT and WIS saves, not STR and CON", () => {
    expect(derivedSaves(WIZARD_1_FIGHTER_5)).toEqual(sorted(WIZARD_SAVES));
  });

  it("Fighter 1 then Wizard 5 has STR and CON saves", () => {
    expect(
      derivedSaves([
        { classId: "fighter", level: 1 },
        { classId: "wizard", level: 5 },
      ])
    ).toEqual(sorted(FIGHTER_SAVES));
  });

  it("a stored Wizard 1 / Fighter 5 with INT and WIS saves stores no saves and reloads them", () => {
    const c = character(WIZARD_1_FIGHTER_5, WIZARD_SAVES);
    const min = minimizeCharacter(c);
    expect("savingThrows" in min).toBe(false);
    expect(sorted(rehydrateCharacter(min).savingThrows)).toEqual(sorted(WIZARD_SAVES));
  });

  it("a hand-set save list that differs from the first class is kept", () => {
    const c = character(WIZARD_1_FIGHTER_5, FIGHTER_SAVES);
    const min = minimizeCharacter(c);
    expect(min.savingThrows).toEqual(FIGHTER_SAVES);
    expect(rehydrateCharacter(min).savingThrows).toEqual(FIGHTER_SAVES);
  });

  it("a second class that overtakes the first after a save does not move the saves", () => {
    // Saved at Wizard 1 / Fighter 1 (the saves equal the derived ones and drop),
    // then the Fighter levels past the Wizard.
    const tie = character(
      [
        { classId: "wizard", level: 1 },
        { classId: "fighter", level: 1 },
      ],
      WIZARD_SAVES
    );
    const min = minimizeCharacter(tie);
    expect("savingThrows" in min).toBe(false);
    const later = { ...min, classes: WIZARD_1_FIGHTER_5 };
    expect(sorted(rehydrateCharacter(later).savingThrows)).toEqual(sorted(WIZARD_SAVES));
  });

  // Pins: a tie and a single class read the same under both rules.
  it("a tie keeps the first entry: Wizard 2 / Fighter 2 has INT and WIS", () => {
    expect(
      derivedSaves([
        { classId: "wizard", level: 2 },
        { classId: "fighter", level: 2 },
      ])
    ).toEqual(sorted(WIZARD_SAVES));
  });

  it("a single class is unchanged: Fighter 5 has STR and CON", () => {
    expect(derivedSaves([{ classId: "fighter", level: 5 }])).toEqual(
      sorted(FIGHTER_SAVES)
    );
  });
});

describe("the other class-derived fields keep the highest-level class", () => {
  it("the hit die stays the headline class's die (first-level HP reads each class table)", () => {
    const min = minimizeCharacter(character(WIZARD_1_FIGHTER_5, WIZARD_SAVES)) as Record<
      string,
      unknown
    >;
    delete min.hitDieType;
    expect(rehydrateCharacter(min as MinimalCharacter).hitDieType).toBe(10);
  });

  it("the spellcasting block follows the casting class, not a non-caster first class", () => {
    const min = minimizeCharacter(
      character(
        [
          { classId: "fighter", level: 1 },
          { classId: "wizard", level: 5 },
        ],
        FIGHTER_SAVES
      )
    ) as Record<string, unknown>;
    delete min.spellcasting;
    expect(rehydrateCharacter(min as MinimalCharacter).spellcasting?.ability).toBe("INT");
  });
});

describe("saving throws — a Bio build edit keeps the first class's saves", () => {
  it("Wizard 1 / Fighter 5: changing the Fighter to a Rogue keeps INT and WIS", () => {
    const prev = character(WIZARD_1_FIGHTER_5, WIZARD_SAVES);
    const next = reconcileBuildChoices(prev, {
      ...prev,
      classes: [
        { classId: "wizard", level: 1 },
        { classId: "rogue", level: 5 },
      ],
    });
    expect(sorted(next.savingThrows)).toEqual(sorted(WIZARD_SAVES));
  });

  it("Wizard 3 / Fighter 2: a level edit that makes the Fighter highest keeps INT and WIS", () => {
    const prev = character(
      [
        { classId: "wizard", level: 3 },
        { classId: "fighter", level: 2 },
      ],
      WIZARD_SAVES
    );
    const next = reconcileBuildChoices(prev, {
      ...prev,
      classes: [
        { classId: "wizard", level: 3 },
        { classId: "fighter", level: 4 },
      ],
    });
    expect(sorted(next.savingThrows)).toEqual(sorted(WIZARD_SAVES));
  });

  it("changing the first class takes the new first class's saves", () => {
    const prev = character(WIZARD_1_FIGHTER_5, WIZARD_SAVES);
    const next = reconcileBuildChoices(prev, {
      ...prev,
      classes: [
        { classId: "rogue", level: 1 },
        { classId: "fighter", level: 5 },
      ],
    });
    expect(sorted(next.savingThrows)).toEqual(sorted(["DEX", "INT"]));
  });
});

describe("the class order is the order the levels were taken", () => {
  it("a level in a new class appends its entry after the first class", () => {
    const c = character([{ classId: "wizard", level: 1 }], WIZARD_SAVES);
    const { updatedCharacter } = levelUp(c, 2, { advanceClassId: "fighter" });
    expect(updatedCharacter.classes.map((e) => e.classId)).toEqual(["wizard", "fighter"]);
    expect(sorted(updatedCharacter.savingThrows)).toEqual(sorted(WIZARD_SAVES));
  });

  it("minimize and rehydrate keep the order when a later class is higher", () => {
    const round = rehydrateCharacter(
      minimizeCharacter(character(WIZARD_1_FIGHTER_5, WIZARD_SAVES))
    );
    expect(round.classes.map((e) => e.classId)).toEqual(["wizard", "fighter"]);
  });
});
