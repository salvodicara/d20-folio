/**
 * A penalty on your damage rolls (Grave Ground: "the target subtracts 1d6 from its
 * damage rolls until the end of its next turn"): a `roll-die-adjustment` on
 * `damage` the spell's state grants, left on the target by a failed save.
 */
import { describe, expect, it } from "vitest";

import { evaluateGrants } from "@/lib/grants";
import { damageRollPenalty } from "@/lib/play/damage-roll-penalty";
import { stateEffectsFor } from "@/lib/play/outcome-effects";

describe("a damage-roll penalty", () => {
  it("reads the dice to subtract from the damage rolls, and nothing else", () => {
    const aggregate = evaluateGrants([
      {
        id: "grave-ground",
        grants: [
          {
            type: "roll-die-adjustment",
            rollType: "damage",
            operation: "subtract",
            dice: "1d6",
            consume: "each",
          },
          {
            type: "roll-die-adjustment",
            rollType: "attack",
            operation: "subtract",
            dice: "1d4",
            consume: "each",
          },
        ],
      },
    ]);
    expect(damageRollPenalty(aggregate)).toEqual([
      { dice: "1d6", sourceId: "grave-ground" },
    ]);
  });

  it("a failed save (not a success) leaves it on the target as the spell's state", () => {
    const penalty = {
      kind: "damage-roll-penalty" as const,
      dice: "1d6",
      activeKey: "grave-ground-weakened",
      until: { anchor: "target" as const, phase: "turn-end" as const },
    };
    expect(stateEffectsFor([penalty], "hit")).toEqual([penalty]);
    expect(stateEffectsFor([penalty], "save-success")).toEqual([]);
  });
});
