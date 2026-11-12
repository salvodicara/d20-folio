/**
 * A failed-save reroll whose bonus is a class-table value and that only works while a
 * state is active: a subclass's "once per Rage, reroll a failed save with your Rage
 * Damage bonus". The reroll rides the same failed-save offer as Indomitable
 * (`rerollOffers`), with the bonus read from the Barbarian table at the
 * character's level (+2 to 8, +3 from 9, +4 from 16).
 */
import { describe, expect, it } from "vitest";
import type { ActionRollEffect } from "@/data/types";
import { rerollOffers, rollReactionOf } from "@/lib/play/roll-reactions";
import { makeCharacterDoc } from "./_helpers";

const effect: ActionRollEffect = {
  kind: "reroll",
  rolls: ["save"],
  whose: "self",
  bonus: { classTable: { classId: "barbarian", key: "rageDamage" } },
  whileActive: "barbarian-rage",
};
const action = { id: "focus", summary: { rollEffect: effect } };

function barbarian(level: number, raging: boolean) {
  return makeCharacterDoc(
    { classes: [{ classId: "barbarian", level }] },
    { activeFeatures: raging ? ["barbarian-rage"] : [] }
  );
}

describe("a failed-save reroll with the Rage Damage bonus, while raging", () => {
  it.each([
    [6, 2],
    [9, 3],
    [16, 4],
  ])("Barbarian %i: + %i", (level, bonus) => {
    expect(rollReactionOf(action, barbarian(level, true))).toMatchObject({
      kind: "reroll",
      bonus,
    });
  });

  it("is offered on a failed save while raging", () => {
    const offers = rerollOffers(barbarian(6, true), [action], {
      roll: "save",
      whose: "self",
    });
    expect(offers.map((o) => o.reaction.bonus)).toEqual([2]);
  });

  it("is not offered when not raging", () => {
    expect(
      rerollOffers(barbarian(6, false), [action], { roll: "save", whose: "self" })
    ).toEqual([]);
  });
});
