/**
 * Halfling Luck on the saves the sheet takes in (SRD 5.2.1: "When you roll a 1 on
 * the d20 of a D20 Test, you can reroll the die, and you must use the new roll"). The
 * kernel already authorizes the reroll chain; these are the entries that offer it: a
 * Concentration save and a Death Saving Throw entered as a 1, then the new face.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useCharacterStore } from "@/stores/characterStore";
import { concentrationSaveD20Context } from "@/lib/character-d20-tests";
import { conc } from "./__helpers__/concentration";
import { buildScenario } from "@/lib/dev-scenarios";
import type { CharacterDoc } from "@/types/character";

/** A Halfling Cleric 5 (Luck from its species), at the given HP and Concentration. */
function halfling(session: {
  hp: { current: number; temp: number };
  concentration?: string;
}) {
  const doc = buildScenario({
    name: "Pip, Cleric",
    raceId: "halfling",
    classId: "cleric",
    level: 5,
    background: "acolyte",
    abilityScores: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 16, CHA: 12 },
    spells: [{ srdId: "bless", prepared: true }],
  });
  return {
    ...doc,
    session: { ...doc.session, ...session },
  } as CharacterDoc;
}

beforeEach(() => {
  useCharacterStore.setState({
    character: null,
    readonly: false,
    combatPersistence: null,
    parentPersistenceFlush: null,
    combatActiveEffects: [],
    combatPendingConcentrationSaves: [],
  });
});

describe("Halfling Luck rerolls a 1 the sheet takes in", () => {
  it("the Concentration save's context knows the 1 can be rerolled", () => {
    const doc = halfling({
      hp: { current: 100, temp: 0 },
      concentration: conc("bless"),
    });
    const context = concentrationSaveD20Context(doc, {
      id: "p",
      spell: conc("bless"),
      damage: 10,
      difficultyClass: 10,
    });
    expect(context.rerolls.some((r) => r.faces.includes(1))).toBe(true);
  });

  it("a Concentration save entered as a 1, rerolled to an 18, keeps the spell", () => {
    useCharacterStore.getState().setCharacter(
      halfling({
        hp: { current: 100, temp: 0 },
        concentration: conc("bless"),
      })
    );
    useCharacterStore.getState().applyDamage(10);
    const pending = useCharacterStore.getState().combatPendingConcentrationSaves[0];
    if (!pending) throw new Error("no save queued");
    const commit = useCharacterStore
      .getState()
      .commitPendingConcentrationSave(pending, [1], undefined, undefined, undefined, [
        [18],
      ]);
    expect(commit?.result.reviewedOutcome.status).toBe("success");
    expect(useCharacterStore.getState().character?.session.concentration).toBe(
      conc("bless")
    );
  });

  it("a Death Saving Throw entered as a 1, rerolled to a 15, is a success", () => {
    useCharacterStore.getState().setCharacter(halfling({ hp: { current: 0, temp: 0 } }));
    const commit = useCharacterStore
      .getState()
      .commitDeathSave([1], undefined, undefined, [[15]]);
    expect(commit?.result.reviewedOutcome.status).toBe("success");
  });
});
