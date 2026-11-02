/**
 * Early ends of a condition (edge-case family M3): one rule for every source that
 * says "for 1 minute or until it takes any damage", "repeats the save at the end of
 * each of its turns" or "ends if the grappler is Incapacitated".
 *
 * Corpus: Rogue Knock Out (rogue:main), Abjure Foes (paladin:main), Grappled 2024
 * (GLOSS; SAC #31).
 */
import { describe, expect, it } from "vitest";

import { conditionsEndingOn, type SourcedCondition } from "@/lib/condition-ends";
import { getSrdFeatureSource } from "@/lib/srd-feature-lookup";

const knockOut: SourcedCondition = {
  id: "ko",
  conditionId: "unconscious",
  targetId: "ogre",
  actorId: "rogue",
  saveDc: 15,
  ends: [
    { on: "target-damaged" },
    { on: "repeat-save", ability: "CON", at: "target-turn-end" },
  ],
};
const grapple: SourcedCondition = {
  id: "grab",
  conditionId: "grappled",
  targetId: "rogue",
  actorId: "ogre",
  ends: [{ on: "actor-incapacitated" }],
};
const plain: SourcedCondition = {
  id: "fear",
  conditionId: "frightened",
  targetId: "ogre",
  ends: [],
};
const all = [knockOut, grapple, plain];

describe("what ends a condition early", () => {
  it("damage to the target ends Knock Out, and only on that target", () => {
    expect(conditionsEndingOn(all, { kind: "damaged", targetId: "ogre" })).toEqual({
      ended: ["ko"],
      saves: [],
    });
    expect(conditionsEndingOn(all, { kind: "damaged", targetId: "rogue" }).ended).toEqual(
      []
    );
  });

  it("the end of the target's turn asks the repeat save, with the source's DC", () => {
    expect(conditionsEndingOn(all, { kind: "turn-end", combatantId: "ogre" })).toEqual({
      ended: [],
      saves: [
        {
          id: "ko",
          conditionId: "unconscious",
          targetId: "ogre",
          ability: "CON",
          dc: 15,
        },
      ],
    });
  });

  it("the grappler becoming Incapacitated ends its grapple", () => {
    expect(
      conditionsEndingOn(all, { kind: "incapacitated", combatantId: "ogre" }).ended
    ).toEqual(["grab"]);
  });

  it("a condition with no early end stays", () => {
    expect(
      conditionsEndingOn([plain], { kind: "damaged", targetId: "ogre" }).ended
    ).toEqual([]);
  });
});

describe("the catalogue declares the ends", () => {
  it("Knock Out: 1 minute, ends on damage, CON save at the end of each turn", () => {
    const source = getSrdFeatureSource("rogue-devious-strikes");
    const grants = source && "grants" in source ? (source.grants ?? []) : [];
    const knock = grants.find(
      (g) => g.type === "cunning-strike-option" && g.optionId === "knock-out"
    );
    expect(knock).toMatchObject({
      condition: "unconscious",
      lifetime: { kind: "timed", minutes: 1 },
      ends: [
        { on: "target-damaged" },
        { on: "repeat-save", ability: "CON", at: "target-turn-end" },
      ],
    });
  });

  it("Abjure Foes: a WIS save or Frightened for 1 minute, ending on damage", () => {
    const action = getSrdFeatureSource("paladin-abjure-foes")?.mechanics?.actions?.[0];
    expect(action).toMatchObject({
      saveAbility: "WIS",
      conditionApplication: {
        options: ["frightened"],
        on: "failed-save",
        ends: [{ on: "target-damaged" }],
      },
    });
  });
});
