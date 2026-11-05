/**
 * Rerolling a failed save (SRD 5.2.1): Indomitable ("you can reroll the save, and
 * you gain a bonus to that roll equal to your Fighter level"), Disciplined Survivor
 * ("you can expend 1 Focus Point to reroll it"), Countercharm ("you or a creature
 * within 30 feet fails a saving throw against an effect that applies the Charmed or
 * Frightened condition … the save is rerolled, and the new roll has Advantage").
 * The app never rolls: the sheet offers the reroll on the failed save it knows of,
 * with its bonus, and the new roll is the one that counts.
 */
import { describe, expect, it } from "vitest";

import { rerollOffers, rollReactionOf } from "@/lib/play/roll-reactions";
import { resolveActions } from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

const fighter = makeCharacterDoc({
  classes: [{ classId: "fighter", level: 13 }],
  features: [{ srdId: "fighter-indomitable" }],
});
const monk = makeCharacterDoc({
  classes: [{ classId: "monk", level: 14 }],
  features: [{ srdId: "monk-focus" }, { srdId: "monk-disciplined-survivor" }],
});
const bard = makeCharacterDoc({
  classes: [{ classId: "bard", level: 7 }],
  features: [{ srdId: "bard-countercharm" }],
});

const offers = (doc: CharacterDoc, moment: Parameters<typeof rerollOffers>[2]) =>
  rerollOffers(doc, resolveActions(doc, "combat"), moment).map((o) => ({
    // The resolved id carries the economy suffix; the feature id names the use.
    id: FEATURES.find((f) => o.action.id.includes(f)) ?? o.action.id,
    reaction: o.reaction,
  }));

const FEATURES = [
  "fighter-indomitable",
  "monk-disciplined-survivor",
  "bard-countercharm",
];

describe("rerolling your own failed save", () => {
  it("Indomitable: + your Fighter level", () => {
    expect(offers(fighter, { roll: "save", whose: "self" })).toEqual([
      {
        id: "fighter-indomitable",
        reaction: { kind: "reroll", rolls: ["save"], whose: "self", bonus: 13 },
      },
    ]);
  });

  it("Disciplined Survivor: a plain reroll", () => {
    expect(offers(monk, { roll: "save", whose: "self" })).toEqual([
      {
        id: "monk-disciplined-survivor",
        reaction: { kind: "reroll", rolls: ["save"], whose: "self" },
      },
    ]);
  });

  it("nothing on a check, or on another creature's save", () => {
    expect(offers(fighter, { roll: "check", whose: "self" })).toEqual([]);
    expect(offers(fighter, { roll: "save", whose: "other" })).toEqual([]);
  });
});

describe("Countercharm", () => {
  it("rerolls a save against Charmed or Frightened, yours or another's, with Advantage", () => {
    const expected = [
      {
        id: "bard-countercharm",
        reaction: {
          kind: "reroll",
          rolls: ["save"],
          whose: "any",
          advantage: true,
          against: ["charmed", "frightened"],
        },
      },
    ];
    expect(offers(bard, { roll: "save", whose: "self", against: "frightened" })).toEqual(
      expected
    );
    expect(offers(bard, { roll: "save", whose: "other", against: "charmed" })).toEqual(
      expected
    );
  });

  it("not against anything else", () => {
    expect(offers(bard, { roll: "save", whose: "self", against: "paralyzed" })).toEqual(
      []
    );
    expect(offers(bard, { roll: "save", whose: "self" })).toEqual([]);
  });

  it("the reaction reads the same off the action", () => {
    const action = resolveActions(bard, "combat").find((a) =>
      a.id.includes("bard-countercharm")
    );
    expect(action && rollReactionOf(action, bard)).toMatchObject({ advantage: true });
  });
});
