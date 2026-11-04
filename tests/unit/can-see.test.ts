/**
 * `canSee` (2024 rules glossary): what the facts say about one creature seeing
 * another. Frightened's Disadvantage needs its source in sight; when the facts don't
 * say (the light is unknown), the answer is unknown and the table decides.
 */
import { describe, expect, it } from "vitest";

import { resolveConditionEffects } from "@/lib/condition-effects";
import { canSee, type Viewer } from "@/lib/light-states";

const eyes: Viewer = { conditions: [], sight: { darkvisionFt: 0 } };
const darkvision: Viewer = { conditions: [], sight: { darkvisionFt: 60 } };
const devilsSight: Viewer = {
  conditions: [],
  sight: { darkvisionFt: 120, magicalDarknessSightFt: 120 },
};

describe("canSee", () => {
  it("Blinded sees nothing, unless Blindsight perceives it", () => {
    expect(canSee({ ...eyes, conditions: ["blinded"] }, {}, { light: "bright" })).toBe(
      false
    );
    expect(
      canSee(
        { conditions: ["blinded"], sight: { darkvisionFt: 0, blindsightFt: 10 } },
        {},
        { light: "bright" }
      )
    ).toBe(true);
  });

  it("an Invisible source is unseen, unless See Invisibility or Truesight", () => {
    expect(canSee(eyes, { conditions: ["invisible"] }, { light: "bright" })).toBe(false);
    expect(
      canSee(
        { ...eyes, seeInvisibleFt: 30 },
        { conditions: ["invisible"] },
        {
          light: "bright",
        }
      )
    ).toBe(true);
  });

  it("Darkness: plain eyes can't, Darkvision can; magical Darkness only Devil's Sight", () => {
    expect(canSee(eyes, {}, { light: "darkness" })).toBe(false);
    expect(canSee(darkvision, {}, { light: "darkness" })).toBe(true);
    expect(canSee(darkvision, {}, { light: "magical-darkness" })).toBe(false);
    expect(canSee(devilsSight, {}, { light: "magical-darkness" })).toBe(true);
    expect(canSee(eyes, {}, { light: "dim" })).toBe(true);
  });

  it("the light unknown and nothing else deciding: unknown", () => {
    expect(canSee(eyes, {}, {})).toBeUndefined();
    // A known fact still decides without the light.
    expect(canSee({ ...eyes, conditions: ["blinded"] }, {}, {})).toBe(false);
  });
});

describe("Frightened and a source out of sight", () => {
  const attackDisadvantageFrom = (conditions: string[], seesSource?: boolean) =>
    resolveConditionEffects(conditions, { seesSource }).disadvantages.some(
      (d) => d.sourceId === "frightened" && d.rollType === "attack"
    );

  it("Blinded and Frightened: the fear's source can't be seen, so no Disadvantage from it", () => {
    expect(attackDisadvantageFrom(["frightened"])).toBe(true);
    expect(attackDisadvantageFrom(["frightened", "blinded"])).toBe(false);
  });

  it("a caller who knows better (Blindsight) says so", () => {
    expect(attackDisadvantageFrom(["frightened", "blinded"], true)).toBe(true);
  });
});
