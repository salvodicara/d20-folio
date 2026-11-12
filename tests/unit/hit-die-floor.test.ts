/**
 * A floor on Hit Point Die faces (a feature that counts a 1 or 2 as a 3): the faces
 * are typed one per die and each low one counts as the floor; without a floor the
 * total is typed as before. The `hit-die-floor` grant sets it.
 */
import { describe, expect, it } from "vitest";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import type { CustomFeature } from "@/types/character";
import { customInstanceId } from "./__helpers__/custom-items";
import { readHitDiceRoll } from "@/lib/play/hit-dice";
import { makeCharacterDoc } from "./_helpers";

const floor = { floorBelow: 2, floorTo: 3 };

describe("reading a Hit Point Dice roll", () => {
  it("without a floor: the total", () => {
    expect(readHitDiceRoll("9", 2)).toEqual({ total: 9 });
    expect(readHitDiceRoll("nine", 2)).toBeNull();
  });

  it("with the floor: one face per die, the low ones count as 3", () => {
    expect(readHitDiceRoll("1+5+2", 3, floor)).toEqual({ total: 11, faces: [3, 5, 3] });
    expect(readHitDiceRoll("2", 1, floor)).toEqual({ total: 3, faces: [3] });
  });

  it("with the floor: faces that don't match the dice spent don't read", () => {
    expect(readHitDiceRoll("1+5", 3, floor)).toBeNull();
    expect(readHitDiceRoll("0+5", 2, floor)).toBeNull();
    expect(readHitDiceRoll("8", 2, floor)).toBeNull();
  });
});

describe("the hit-die-floor grant", () => {
  it("sets the character's floor", () => {
    const recovery: CustomFeature = {
      custom: true,
      title: "Hearty Recovery",
      emoji: "*",
      source: "Homebrew",
      tags: [],
      contentBlocks: [],
      grants: [{ type: "hit-die-floor", floorBelow: 2, floorTo: 3 }],
      instanceId: customInstanceId("powerful-recovery"),
    };
    const doc = makeCharacterDoc({ features: [recovery] });
    expect(aggregateCharacterGrants(doc.character, doc.session).hitDieFloor).toEqual(
      floor
    );
    const plain = makeCharacterDoc({});
    expect(
      aggregateCharacterGrants(plain.character, plain.session).hitDieFloor
    ).toBeUndefined();
  });
});

describe("the Play screen's Short Rest reads the floor too (shortRestHeal)", () => {
  it("1+5 heals as 3+5 plus CON per die", async () => {
    const { shortRestHeal } = await import("@/lib/play/short-rest-healing");
    const recovery: CustomFeature = {
      custom: true,
      title: "Hearty Recovery",
      emoji: "*",
      source: "Homebrew",
      tags: [],
      contentBlocks: [],
      grants: [{ type: "hit-die-floor", floorBelow: 2, floorTo: 3 }],
      instanceId: customInstanceId("powerful-recovery-2"),
    };
    const doc = makeCharacterDoc(
      {
        features: [recovery],
        abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      },
      { hp: { current: 5, temp: 0 } }
    );
    const read = shortRestHeal(doc, 2, "1+5");
    expect(read.faces).toEqual([3, 5]);
    expect(read.heal).toBe(8 + 2 * 2);
  });
});
