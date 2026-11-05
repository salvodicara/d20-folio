/**
 * A spell that turns your failed d20 into a 20 when cast as a Reaction
 * (`failedD20Becomes`): offered while it is ready and a slot of its level or higher is
 * free. The spell here is a homebrew stand-in at level 8 (the public SRD has none).
 */
import { describe, expect, it } from "vitest";
import { failedD20Savers } from "@/lib/play/failed-d20";
import type { CharacterDoc, CustomSpell } from "@/types/character";
import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

const omen: CustomSpell = {
  custom: true,
  name: "Omen of Twenty",
  level: 8,
  school: "divination",
  castingTime: "reaction",
  range: "self",
  components: { v: true, s: false, m: false },
  duration: "instantaneous",
  concentration: false,
  description: "A failed roll becomes a 20.",
  instanceId: customInstanceId("omen-of-twenty"),
  mechanics: { failedD20Becomes: 20 },
};

function seer(used: Record<string, { used: number }> = {}): CharacterDoc {
  return makeCharacterDoc(
    {
      classes: [{ classId: "wizard", level: 17 }],
      spells: [omen, { srdId: "shield", prepared: true }],
      spellSlots: [
        { level: 8, total: 1 },
        { level: 9, total: 1 },
      ],
    },
    { spellSlots: used }
  );
}

describe("a failed d20 that a Reaction spell can turn into a 20", () => {
  it("offered with the lowest free slot of its level or higher", () => {
    expect(failedD20Savers(seer())).toEqual([
      { spellId: `custom:${omen.instanceId}`, face: 20, slotLevel: 8 },
    ]);
    expect(failedD20Savers(seer({ "8": { used: 1 } }))[0]?.slotLevel).toBe(9);
  });

  it("not offered with no slot left, nor for a spell without the rule", () => {
    expect(failedD20Savers(seer({ "8": { used: 1 }, "9": { used: 1 } }))).toEqual([]);
    expect(
      failedD20Savers(makeCharacterDoc({ spells: [{ srdId: "shield", prepared: true }] }))
    ).toEqual([]);
  });
});
