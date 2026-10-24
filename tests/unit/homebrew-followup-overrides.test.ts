/**
 * The two homebrew-authored action dialects #443 left unchecked: a homebrew spell's
 * `followUp` action and a catalogue feature's `actionOverrides`. Both now go through
 * the action validator (`homebrewActionDef`'s field schemas): a field the schema
 * rejects is out of play, the rest plays, the stored value is never touched.
 */
import { describe, expect, it } from "vitest";
import { homebrewActionOverride } from "@/lib/homebrew-actions";
import { homebrewSpellMechanics } from "@/lib/homebrew-spells";
import { resolveActions } from "@/lib/smart-tracker";
import type { CustomSpell } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";
import { customInstanceId } from "./__helpers__/custom-items";

function spell(followUp: unknown): CustomSpell {
  return {
    custom: true,
    name: "Ember Stride",
    level: 1,
    school: "transmutation",
    castingTime: "bonus action",
    range: "Self",
    components: { v: true, s: false, m: false },
    duration: "Concentration, up to 10 minutes",
    concentration: true,
    description: "Your stride smoulders.",
    instanceId: customInstanceId("ember-stride"),
    mechanics: { followUp } as CustomSpell["mechanics"],
  };
}

describe("a homebrew spell's followUp is checked field by field", () => {
  it("a well-formed follow-up plays as authored", () => {
    const followUp = { type: "bonus", economyCategory: "dash" };
    expect(homebrewSpellMechanics(spell(followUp))?.followUp).toEqual(followUp);
  });

  it("a malformed field is left out, its siblings play", () => {
    const stored = {
      type: "bonus",
      economyCategory: "dash",
      forcedMovement: { direction: "sideways", feet: 10 },
      targetMark: { scope: 7 },
    };
    const mechanics = homebrewSpellMechanics(spell(stored));
    expect(mechanics?.followUp).toEqual({ type: "bonus", economyCategory: "dash" });
    // The stored follow-up is never repaired.
    expect(stored.forcedMovement).toEqual({ direction: "sideways", feet: 10 });
  });

  it("a follow-up with no known action type is out of play", () => {
    expect(homebrewSpellMechanics(spell({ type: "teleport" }))?.followUp).toBeUndefined();
  });
});

describe("a catalogue feature's actionOverrides are checked field by field", () => {
  it("keeps the label, the description and each well-formed field", () => {
    expect(
      homebrewActionOverride({
        label: "Field Remedy",
        description: "Use the table's alternate recovery.",
        heal: { dice: "1d6", plus: { kind: "flat", value: 2 } },
      })
    ).toEqual({
      label: "Field Remedy",
      description: "Use the table's alternate recovery.",
      heal: { dice: "1d6", plus: { kind: "flat", value: 2 } },
    });
  });

  it("drops a malformed field and an unknown action type", () => {
    expect(
      homebrewActionOverride({
        type: "teleport",
        label: 3,
        heal: { dice: 6 },
        trackerTopUp: { trackerId: "fighter-second-wind", upTo: "full" },
      })
    ).toEqual({ trackerTopUp: { trackerId: "fighter-second-wind", upTo: "full" } });
  });

  it("a malformed override field never reaches the resolved action", () => {
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 5,
      features: [
        {
          srdId: "fighter-second-wind",
          actionOverrides: [
            {
              label: "Field Remedy",
              // A heal the schema rejects: the catalogue's own heal still plays.
              heal: { dice: 6 } as never,
            },
          ],
        },
      ],
    });
    const action = resolveActions(doc).find(
      (candidate) => candidate.id === "fighter-second-wind-bonus"
    );
    expect(action?.name).toEqual({ custom: "Field Remedy" });
    expect(action?.summary.heal?.dice).toBe("1d10");
  });
});
