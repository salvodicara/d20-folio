/**
 * A die on another creature's roll, as a Reaction (Cutting Words, SRD 5.2.1 College
 * of Lore): "When a creature that you can see within 60 feet of yourself makes a
 * damage roll or succeeds on an ability check or attack roll, you can take a
 * Reaction to expend one use of your Bardic Inspiration; roll your Bardic
 * Inspiration die, and subtract the number rolled from the creature's roll." The
 * app never rolls: the sheet names the die (the Bardic Inspiration die by Bard
 * level), what it does and to which roll, and spends the Reaction and the use.
 */
import { describe, expect, it } from "vitest";

import { rollReactionOf, rollReactionPlan } from "@/lib/play/roll-reactions";
import { resolveActions } from "@/lib/smart-tracker";

import { makeCharacterDoc } from "./_helpers";

const lore = (level: number) =>
  makeCharacterDoc({
    classes: [{ classId: "bard", subclassId: "college-of-lore", level }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 16 },
    features: [
      { srdId: "bard-bardic-inspiration" },
      { srdId: "bard-lore-cutting-words" },
    ],
  });

const cuttingWords = (level: number) => {
  const action = resolveActions(lore(level), "combat").find((a) =>
    a.id.includes("bard-lore-cutting-words")
  );
  if (!action) throw new Error("no Cutting Words");
  return action;
};

describe("Cutting Words", () => {
  it("subtracts the Bardic Inspiration die from another creature's roll", () => {
    expect(rollReactionOf(cuttingWords(3))).toEqual({
      kind: "die",
      die: "1d6",
      operations: ["subtract"],
      rolls: ["attack", "check", "damage"],
      whose: "other",
      timing: "before-outcome",
    });
  });

  it("the die grows with the Bard level", () => {
    expect(rollReactionOf(cuttingWords(5))).toMatchObject({ die: "1d8" });
    expect(rollReactionOf(cuttingWords(10))).toMatchObject({ die: "1d10" });
    expect(rollReactionOf(cuttingWords(15))).toMatchObject({ die: "1d12" });
  });

  it("the plan names the die, what it does and to which roll", () => {
    const reaction = rollReactionOf(cuttingWords(5));
    if (!reaction) throw new Error("no reaction");
    expect(
      rollReactionPlan(reaction, {
        roll: "attack",
        target: { id: "m-ogre", name: "Ogre" },
      })
    ).toEqual({
      die: "1d8",
      operation: "subtract",
      roll: "attack",
      target: { id: "m-ogre", name: "Ogre" },
    });
  });

  it("a roll the reaction can't touch has no plan", () => {
    const reaction = rollReactionOf(cuttingWords(5));
    if (!reaction) throw new Error("no reaction");
    expect(rollReactionPlan(reaction, { roll: "save" })).toBeNull();
  });

  it("an action without a roll effect has none", () => {
    const dodge = resolveActions(lore(3), "combat").find((a) => a.id === "base-dodge");
    expect(dodge && rollReactionOf(dodge)).toBeNull();
  });
});
