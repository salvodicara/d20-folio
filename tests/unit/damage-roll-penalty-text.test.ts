/**
 * A spell that makes its target subtract dice from its damage rolls, from the spell's own
 * SRD 5.2.1 text: "it also subtracts 1d8 from all its damage rolls" (Ray of Enfeeblement)
 * → a `damage-roll-penalty` effect whose `activeKey` names the target state granting the
 * subtraction, held on the target (never the caster) for the spell's duration.
 */
import { describe, expect, it } from "vitest";

import { getSpellById } from "@/data/spells";
import en from "@/i18n/en/srd/spells.json";

const text = (id: string) =>
  (en as Record<string, { description?: string }>)[id]?.description ?? "";

describe("spells that subtract from the target's damage rolls", () => {
  it("ray-of-enfeeblement: −1d8 on every damage roll while the spell lasts", () => {
    const spell = getSpellById("ray-of-enfeeblement");
    expect(text("ray-of-enfeeblement")).toMatch(
      /subtracts 1d8 from all its damage rolls/i
    );
    expect(spell?.effects).toEqual([
      {
        kind: "damage-roll-penalty",
        dice: "1d8",
        activeKey: "ray-of-enfeeblement-weakened",
      },
    ]);
    expect(spell?.targetStates).toEqual([
      {
        type: "while-active",
        activeKey: "ray-of-enfeeblement-weakened",
        grants: [
          {
            type: "roll-die-adjustment",
            rollType: "damage",
            operation: "subtract",
            dice: "1d8",
            consume: "each",
          },
        ],
      },
    ]);
    // The state lives on the target: the spell lights nothing on its caster.
    expect(spell?.grants).toBeUndefined();
  });
});
