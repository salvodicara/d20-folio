/**
 * A death or Concentration save with what the player adds after the roll (2024 rules): a held Bardic
 * Inspiration die adds its face, and the die is spent in the same step; a paid
 * Advantage (a Luck Point) takes the higher of two faces and spends the Luck Point.
 * One undo takes the save and the payment back together.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { BARDIC_INSPIRATION_DIE_SOURCE } from "@/lib/character-d20-tests";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

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

describe("death save with a post-roll use", () => {
  it("adds the held Bardic Inspiration die and spends it, undone together", () => {
    const doc = makeCharacterDoc(
      {},
      { hp: { current: 0, temp: 0 }, bardicInspirationDie: "d8" }
    );
    useCharacterStore.getState().setCharacter(doc);
    const commit = useCharacterStore.getState().commitDeathSave([7], {
      enteredModifierFaces: { [BARDIC_INSPIRATION_DIE_SOURCE]: [5] },
    });
    expect(commit?.result.total).toBe(12);
    expect(commit?.result.reviewedOutcome.status).toBe("success");
    const after = useCharacterStore.getState().character;
    expect(after?.session.bardicInspirationDie ?? "").toBe("");
    expect(after?.session.deathSucc).toBe(1);

    expect(commit?.undo()).toBe(true);
    const back = useCharacterStore.getState().character;
    expect(back?.session.bardicInspirationDie).toBe("d8");
    expect(back?.session.deathSucc).toBe(0);
  });

  it("without the die the same face fails, and nothing is spent", () => {
    const doc = makeCharacterDoc(
      {},
      { hp: { current: 0, temp: 0 }, bardicInspirationDie: "d8" }
    );
    useCharacterStore.getState().setCharacter(doc);
    const commit = useCharacterStore.getState().commitDeathSave([7]);
    expect(commit?.result.reviewedOutcome.status).toBe("failure");
    expect(useCharacterStore.getState().character?.session.bardicInspirationDie).toBe(
      "d8"
    );
  });
});

describe("Concentration save with a post-roll use", () => {
  it("adds the held Bardic Inspiration die and spends it, undone together", () => {
    const doc = makeCharacterDoc(
      { abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } },
      { hp: { current: 20, temp: 0 }, concentration: "bless", bardicInspirationDie: "d8" }
    );
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.getState().queueConcentrationSaveForDamage(10);
    const pending = useCharacterStore.getState().combatPendingConcentrationSaves[0];
    if (!pending) throw new Error("no pending save");
    const commit = useCharacterStore
      .getState()
      .commitPendingConcentrationSave(pending, [6], undefined, {
        enteredModifierFaces: { [BARDIC_INSPIRATION_DIE_SOURCE]: [5] },
      });
    expect(commit?.result.total).toBe(14);
    expect(commit?.result.reviewedOutcome.status).toBe("success");
    const after = useCharacterStore.getState().character;
    expect(after?.session.concentration).toBe("bless");
    expect(after?.session.bardicInspirationDie ?? "").toBe("");

    expect(commit?.undo()).toBe(true);
    expect(useCharacterStore.getState().character?.session.bardicInspirationDie).toBe(
      "d8"
    );
  });
});
