/**
 * Species batch 1 — Halfling Luck carries its rule. Cases come from the trait's
 * catalogue text (src/i18n/en/srd/races.json, `halfling.traits.luck`):
 * "When you roll a 1 on the d20 of a D20 Test, you can reroll the die, and you
 * must use the new roll."
 *
 *  - the trait declares a `d20-reroll` fact on face 1;
 *  - `d20RerollFor` answers "may this entered face be rerolled?" for any D20
 *    Test entry (checks, escape, saves): a 1 yes, any other face no;
 *  - the character's Death Save and Concentration save accept the rerolled face
 *    in place of the 1 ("you must use the new roll"), once per die, and refuse
 *    a reroll of any other face or for a character without the trait.
 */
import { describe, expect, it } from "vitest";
import enRaces from "@/i18n/en/srd/races.json";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import {
  concentrationSaveD20Context,
  d20RerollFor,
  deathSaveD20Context,
  resolveCharacterConcentrationSave,
  resolveCharacterDeathSave,
} from "@/lib/character-d20-tests";
import { evaluateGrants, type D20RerollClause } from "@/lib/grants";
import { MOCK_CHARACTER } from "@/lib/mock";
import { asRaceId } from "@/data/srd-names";
import type { CharacterDoc } from "@/types/character";
import type { PendingConcentrationSave } from "@/types/combat-state";

const LUCK = "race:halfling:luck";

function withRace(race: string): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    character: { ...MOCK_CHARACTER.character, race: asRaceId(race) },
    session: { ...MOCK_CHARACTER.session, exhaustion: 0 },
  };
}

const halfling = withRace("halfling");
const elf = withRace("elf");

describe("Halfling Luck — the catalogue text", () => {
  it("is the rule this batch encodes", () => {
    expect(
      (enRaces as Record<string, { description?: string }>)["halfling.traits.luck"]
        ?.description
    ).toBe(
      "When you roll a 1 on the d20 of a D20 Test, you can reroll the die, and you must use the new roll."
    );
  });
});

describe("Halfling Luck — the d20-reroll fact", () => {
  it("a halfling's aggregate carries one reroll on a natural 1", () => {
    const aggregate = aggregateCharacterGrants(halfling.character, halfling.session);
    expect(aggregate.d20Rerolls).toEqual([{ sourceId: LUCK, faces: [1] }]);
  });

  it("another species carries none", () => {
    expect(aggregateCharacterGrants(elf.character, elf.session).d20Rerolls).toEqual([]);
  });

  it("is a generic kind: any faces, any source", () => {
    const out = evaluateGrants([
      {
        id: "homebrew-lucky-2",
        name: { en: "x", it: "x" },
        grants: [{ type: "d20-reroll", faces: [1, 2] }],
      },
    ]);
    expect(out.d20Rerolls).toEqual([{ sourceId: "homebrew-lucky-2", faces: [1, 2] }]);
  });
});

describe("Halfling Luck — d20RerollFor, the entry-side question", () => {
  const rerolls: D20RerollClause[] = [{ sourceId: LUCK, faces: [1] }];
  it.each([
    [1, LUCK],
    [2, null],
    [10, null],
    [20, null],
  ])("an entered face of %i → %s", (face, expected) => {
    expect(d20RerollFor(rerolls, face)).toBe(expected);
  });

  it("without the trait, nothing is rerollable", () => {
    expect(d20RerollFor([], 1)).toBeNull();
  });
});

describe("Halfling Luck — Death Saves use the new roll", () => {
  it("the context carries the halfling's reroll", () => {
    expect(deathSaveD20Context(halfling).rerolls).toEqual([
      { sourceId: LUCK, faces: [1] },
    ]);
    expect(deathSaveD20Context(elf).rerolls).toEqual([]);
  });

  it("a 1 rerolled into a 15 is a success, not two failures", () => {
    const plain = resolveCharacterDeathSave(halfling, [1]);
    expect(plain.reviewedOutcome.deathSave?.failures).toBe(2);
    const lucky = resolveCharacterDeathSave(halfling, [1], [[15]]);
    expect(lucky.reviewedOutcome.status).toBe("success");
    expect(lucky.selectedNaturalFace).toBe(15);
    expect(lucky.reviewedOutcome.deathSave?.naturalOne).toBe(false);
  });

  it("the new roll must be used, even another 1 (one reroll per die)", () => {
    const again = resolveCharacterDeathSave(halfling, [1], [[1]]);
    expect(again.reviewedOutcome.deathSave?.failures).toBe(2);
    expect(() => resolveCharacterDeathSave(halfling, [1], [[1, 12]])).toThrow();
  });

  it("only a 1 can be rerolled, and only with the trait", () => {
    expect(() => resolveCharacterDeathSave(halfling, [2], [[15]])).toThrow();
    expect(() => resolveCharacterDeathSave(elf, [1], [[15]])).toThrow();
  });
});

describe("Halfling Luck — Concentration saves use the new roll", () => {
  const pending: PendingConcentrationSave = {
    id: "pending-1",
    damage: 10,
    difficultyClass: 10,
  } as PendingConcentrationSave;

  it("the context carries the reroll and the rerolled face decides the save", () => {
    expect(concentrationSaveD20Context(halfling, pending).rerolls).toEqual([
      { sourceId: LUCK, faces: [1] },
    ]);
    const lucky = resolveCharacterConcentrationSave(halfling, pending, [1], [[20]]);
    expect(lucky.selectedNaturalFace).toBe(20);
    expect(lucky.reviewedOutcome.status).toBe("success");
  });
});
