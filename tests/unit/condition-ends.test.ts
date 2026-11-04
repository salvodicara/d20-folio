/**
 * Early ends of a condition (edge-case family M3): one rule for every source that
 * says "for 1 minute or until it takes any damage", "repeats the save at the end of
 * each of its turns" or "ends if the grappler is Incapacitated".
 *
 * Corpus: Rogue Knock Out (rogue:main), Abjure Foes (paladin:main), Grappled 2024
 * (GLOSS; SAC #31).
 */
import { describe, expect, it } from "vitest";

import {
  actionRepeatSaves,
  answerTrackedSave,
  trackSettled,
  conditionsEndingOn,
  type SourcedCondition,
} from "@/lib/condition-ends";
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
          at: "target-turn-end",
          actorId: "rogue",
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

/**
 * The variants the SRD's spells need (rules session, 2026-11-04): Charm Person
 * ("ends early if you or your allies deal damage to the target"), Dominate Person
 * and Hideous Laughter ("each time it takes damage, it makes another save", the
 * latter with Advantage), Conjure Elemental (a repeat at the START of its turn),
 * Otto's Irresistible Dance (an action to repeat), Fear (a repeat only out of line
 * of sight of the caster).
 */
describe("the SRD's other ways to end a condition", () => {
  const sideOf = (id: string) => (id.startsWith("pc-") ? "party" : "enemy");
  const charm: SourcedCondition = {
    id: "charm",
    conditionId: "charmed",
    targetId: "bandit",
    actorId: "pc-bard",
    saveDc: 14,
    ends: [{ on: "target-damaged", by: "actor-side" }],
  };

  it("Charm Person ends on damage from the caster or an ally, not from the target's friends", () => {
    const damaged = (by?: string[]) =>
      conditionsEndingOn(
        [charm],
        { kind: "damaged", targetId: "bandit", ...(by ? { by } : {}) },
        sideOf
      ).ended;
    expect(damaged(["pc-bard"])).toEqual(["charm"]);
    expect(damaged(["pc-fighter"])).toEqual(["charm"]);
    expect(damaged(["bandit-captain"])).toEqual([]);
    // Who struck is unknown: it ends nothing (the table ends it by hand).
    expect(damaged()).toEqual([]);
    expect(
      conditionsEndingOn([charm], {
        kind: "damaged",
        targetId: "bandit",
        by: ["pc-bard"],
      }).ended
    ).toEqual([]);
  });

  it("Hideous Laughter: a repeat at turn end, and another with Advantage on damage", () => {
    const laughter: SourcedCondition = {
      id: "laugh",
      conditionId: "prone",
      targetId: "ogre",
      actorId: "pc-bard",
      saveDc: 13,
      ends: [
        { on: "repeat-save", ability: "WIS", at: "target-turn-end" },
        { on: "repeat-save", ability: "WIS", at: "target-damaged", advantage: true },
      ],
    };
    expect(
      conditionsEndingOn([laughter], { kind: "damaged", targetId: "ogre" }).saves
    ).toEqual([
      expect.objectContaining({ id: "laugh", at: "target-damaged", advantage: true }),
    ]);
    const atEnd = conditionsEndingOn([laughter], {
      kind: "turn-end",
      combatantId: "ogre",
    }).saves;
    expect(atEnd).toEqual([expect.objectContaining({ at: "target-turn-end" })]);
    expect(atEnd[0]).not.toHaveProperty("advantage");
  });

  it("Conjure Elemental's Restrained repeats at the start of the target's turn, not the end", () => {
    const restrained: SourcedCondition = {
      id: "grip",
      conditionId: "restrained",
      targetId: "ogre",
      ends: [{ on: "repeat-save", ability: "DEX", at: "target-turn-start" }],
    };
    expect(
      conditionsEndingOn([restrained], { kind: "turn-start", combatantId: "ogre" }).saves
    ).toEqual([expect.objectContaining({ id: "grip", at: "target-turn-start" })]);
    expect(
      conditionsEndingOn([restrained], { kind: "turn-end", combatantId: "ogre" }).saves
    ).toEqual([]);
  });

  it("Otto's Irresistible Dance: the target may spend its action on the save, never prompted", () => {
    const dance: SourcedCondition = {
      id: "dance",
      conditionId: "charmed",
      targetId: "ogre",
      saveDc: 17,
      ends: [{ on: "repeat-save", ability: "WIS", at: "target-action" }],
    };
    expect(
      conditionsEndingOn([dance], { kind: "turn-end", combatantId: "ogre" }).saves
    ).toEqual([]);
    expect(actionRepeatSaves([dance, charm], "ogre")).toEqual([
      expect.objectContaining({
        id: "dance",
        ability: "WIS",
        dc: 17,
        at: "target-action",
      }),
    ]);
    expect(actionRepeatSaves([dance], "bandit")).toEqual([]);
  });

  it("Fear's repeat is owed only out of the caster's sight, and carries who that is", () => {
    const fear: SourcedCondition = {
      id: "fear",
      conditionId: "frightened",
      targetId: "ogre",
      actorId: "pc-wizard",
      ends: [
        {
          on: "repeat-save",
          ability: "WIS",
          at: "target-turn-end",
          when: "out-of-actor-sight",
        },
      ],
    };
    expect(
      conditionsEndingOn([fear], { kind: "turn-end", combatantId: "ogre" }).saves
    ).toEqual([
      expect.objectContaining({ when: "out-of-actor-sight", actorId: "pc-wizard" }),
    ]);
  });
});

describe("a save track", () => {
  const track = { successes: 3, failures: 3 };
  it("counts each answer; three successes end it, three failures settle it", () => {
    expect(answerTrackedSave({ successes: 0, failures: 0 }, track, true)).toEqual({
      tally: { successes: 1, failures: 0 },
      outcome: "counted",
    });
    expect(answerTrackedSave({ successes: 2, failures: 2 }, track, true).outcome).toBe(
      "ended"
    );
    expect(answerTrackedSave({ successes: 2, failures: 2 }, track, false).outcome).toBe(
      "settled"
    );
  });

  it("a settled track asks no more", () => {
    expect(trackSettled({ successes: 2, failures: 3 }, track)).toBe(true);
    expect(trackSettled({ successes: 0, failures: 2 }, track)).toBe(false);
  });

  it("a tracked repeat save carries its track", () => {
    const contagion: SourcedCondition = {
      id: "plague",
      conditionId: "poisoned",
      targetId: "ogre",
      ends: [{ on: "repeat-save", ability: "CON", at: "target-turn-end", track }],
    };
    expect(
      conditionsEndingOn([contagion], { kind: "turn-end", combatantId: "ogre" }).saves
    ).toEqual([expect.objectContaining({ track })]);
  });
});
