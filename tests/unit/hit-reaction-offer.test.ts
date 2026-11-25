/**
 * The reactions offered after a hit is entered (#1330): only what the rules allow at
 * that moment. Uncanny Dodge (Rogue 5, "when an attacker you can see hits you with an
 * attack roll") and Shield ("when you are hit by an attack roll"), each with the
 * Reaction free, the trigger met (an attack's hit, never a fall) and, for Shield, a
 * slot to cast it with.
 */
import { describe, expect, it } from "vitest";

import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import { reactionPayable } from "@/features/character/molecules/hp-commits";
import { halvedHit, hitReactionChoices } from "@/lib/play/hit-reaction-offer";
import type { CharacterDoc, SessionState } from "@/types/character";

const SCORES = { STR: 10, DEX: 16, CON: 14, INT: 14, WIS: 10, CHA: 10 } as const;
const ROGUE: ScenarioSpec = {
  name: "Rogue",
  raceId: "human",
  classId: "rogue",
  level: 5,
  background: "criminal",
  abilityScores: SCORES,
};
const ROGUE_WIZARD: ScenarioSpec = {
  ...ROGUE,
  secondaryClasses: [{ classId: "wizard", level: 1 }],
  spells: [{ srdId: "shield", prepared: true }],
};

function doc(spec: ScenarioSpec, session: Partial<SessionState> = {}): CharacterDoc {
  const built = buildScenario(spec);
  return { ...built, session: { ...built.session, ...session } };
}

const ATTACK = { amount: 13, attack: true };
const FREE = { reactionUsed: false };
const ids = (d: CharacterDoc, hit = ATTACK, turn = FREE) =>
  hitReactionChoices(d, hit, turn, (a) => reactionPayable(d, a)).map((c) => c.actionId);

describe("which reactions a hit offers", () => {
  it("a Rogue 5 / Wizard 1 with Shield prepared is offered both", () => {
    const d = doc(ROGUE_WIZARD);
    expect(hitReactionChoices(d, ATTACK, FREE, (x) => reactionPayable(d, x))).toEqual([
      { actionId: "rogue-uncanny-dodge-reaction", kind: "halve-hit" },
      { actionId: "spell-shield", kind: "raise-ac" },
    ]);
  });

  it("a character with no such reaction is offered nothing", () => {
    expect(ids(doc({ ...ROGUE, level: 4 }))).toEqual([]);
  });

  it("nothing once the Reaction is used", () => {
    expect(ids(doc(ROGUE_WIZARD), ATTACK, { reactionUsed: true })).toEqual([]);
  });

  it("nothing for damage that is not an attack's hit (a fall)", () => {
    expect(ids(doc(ROGUE_WIZARD), { amount: 13, attack: false })).toEqual([]);
  });

  it("nothing for a hit that deals no damage", () => {
    expect(ids(doc(ROGUE_WIZARD), { amount: 0, attack: true })).toEqual([]);
  });

  it("Shield is left out with no slot to cast it", () => {
    const noSlot = doc(ROGUE_WIZARD, { spellSlots: { "1": { used: 2 } } });
    expect(ids(noSlot)).toEqual(["rogue-uncanny-dodge-reaction"]);
  });

  it("Shield is left out when a Wizard has not prepared it", () => {
    const wizard: ScenarioSpec = { ...ROGUE, classId: "wizard", level: 1 };
    expect(
      ids(doc({ ...wizard, spells: [{ srdId: "shield", prepared: true }] }))
    ).toEqual(["spell-shield"]);
    expect(ids(doc({ ...wizard, spells: [{ srdId: "shield" }] }))).toEqual([]);
  });

  it("a reaction already claimed before the hit (its state lit) is not offered again", () => {
    expect(ids(doc(ROGUE_WIZARD, { activeFeatures: ["rogue-uncanny-dodge"] }))).toEqual([
      "spell-shield",
    ]);
    expect(ids(doc(ROGUE_WIZARD, { activeFeatures: ["spell-shield"] }))).toEqual([
      "rogue-uncanny-dodge-reaction",
    ]);
  });

  it("nothing when the character could not react before the hit (at 0 HP, Incapacitated)", () => {
    expect(ids(doc(ROGUE_WIZARD, { hp: { current: 0, temp: 0 } }))).toEqual([]);
    expect(ids(doc(ROGUE_WIZARD, { conditions: ["incapacitated"] }))).toEqual([]);
  });
});

describe("Uncanny Dodge halves the hit, rounding down", () => {
  it("13 becomes 6, so 7 come back", () => {
    expect(halvedHit(13)).toEqual({ taken: 6, back: 7 });
  });

  it("an even hit splits evenly", () => {
    expect(halvedHit(12)).toEqual({ taken: 6, back: 6 });
  });
});
