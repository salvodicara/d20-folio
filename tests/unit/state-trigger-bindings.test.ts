/**
 * A rule inside a state someone else cast on you reads the caster's numbers
 * (Synostodweomer: "plus your spellcasting ability modifier" is the caster's): the
 * trigger keeps the modifier frozen on the state.
 */
import { describe, expect, it } from "vitest";

import { evaluateGrants, type Grant } from "@/lib/grants";

const trigger: Grant = {
  type: "trigger",
  on: "cast-spell",
  if: { slot: true },
  do: {
    kind: "hit-point-dice",
    max: "slot-level",
    exactly: true,
    bonus: "spellcasting-mod",
  },
};

describe("a trigger carried by a cast state", () => {
  it("keeps the caster's spellcasting modifier frozen on the state", () => {
    const [rule] = evaluateGrants([
      {
        id: "combat-effect:fx-1",
        grants: [trigger],
        runtime: { bindings: { spellcastingModifier: 5 } },
      },
    ]).triggers;
    expect(rule?.bindings).toEqual({ spellcastingModifier: 5 });
  });

  it("an own rule has no caster numbers", () => {
    const [rule] = evaluateGrants([{ id: "feat", grants: [trigger] }]).triggers;
    expect(rule?.bindings).toBeUndefined();
  });
});
