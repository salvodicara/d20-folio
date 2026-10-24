/**
 * Studying a manual or tome from the sheet (Manual of Bodily Health: "your
 * Constitution score increases by 2, to a maximum of 30… The manual then loses its
 * magic"): the score is written into the stored sheet, the copy spends its one use
 * and turns nonmagical, so it can't be studied twice; one undo puts both back.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const store = () => useCharacterStore.getState();

function reader(con = 14): CharacterDoc {
  const doc = makeCharacterDoc({
    classId: "fighter",
    level: 5,
    abilityScores: { STR: 16, DEX: 12, CON: con, INT: 10, WIS: 10, CHA: 8 },
    equipment: [
      { srdId: "manual-of-bodily-health", instanceId: "manual-1", quantity: 1 },
    ],
  });
  doc.id = `study-${Math.random().toString(36).slice(2)}`;
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
  return doc;
}

describe("studyItem", () => {
  beforeEach(() => useCharacterStore.setState({ character: null }));

  it("raises the score by 2 and the book loses its magic", () => {
    reader(14);
    const undo = store().studyItem("manual-1");
    expect(undo).not.toBeNull();
    const after = store().character;
    expect(after?.character.abilityScores.CON).toBe(16);
    expect(after?.session.itemResources?.["manual-1"]?.disposition).toBe("nonmagical");
  });

  it("a studied book can't be studied again", () => {
    reader(14);
    store().studyItem("manual-1");
    expect(store().studyItem("manual-1")).toBeNull();
    expect(store().character?.character.abilityScores.CON).toBe(16);
  });

  it("never past 30", () => {
    reader(29);
    store().studyItem("manual-1");
    expect(store().character?.character.abilityScores.CON).toBe(30);
  });

  it("one undo puts the score and the book's magic back", () => {
    reader(14);
    const undo = store().studyItem("manual-1");
    expect(undo?.()).toBe(true);
    const back = store().character;
    expect(back?.character.abilityScores.CON).toBe(14);
    expect(back?.session.itemResources?.["manual-1"]?.disposition ?? "magical").toBe(
      "magical"
    );
    // So it can be studied again.
    expect(store().studyItem("manual-1")).not.toBeNull();
  });

  it("an item that raises nothing, or isn't there, can't be studied", () => {
    reader(14);
    expect(store().studyItem("no-such-copy")).toBeNull();
    expect(store().character?.character.abilityScores.CON).toBe(14);
  });
});
