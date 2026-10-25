/**
 * Environment hazards that map to clean mechanics (SRD 5.2.1):
 *
 *   Burning [Hazard]: "A burning creature or object takes 1d4 Fire damage at the start
 *   of each of its turns. As an action, you can extinguish fire on yourself by giving
 *   yourself the Prone condition and rolling on the ground. The fire also goes out if
 *   it is doused, submerged, or suffocated."
 *
 *   Slippery Ice: "Slippery ice is Difficult Terrain. A creature that moves onto
 *   slippery ice for the first time on a turn or starts its turn there must succeed on
 *   a DC 10 Dexterity saving throw or have the Prone condition."
 *
 *   Strong Wind: "Strong wind imposes Disadvantage on ranged attack rolls with weapons.
 *   It also extinguishes open flames and disperses fog. A flying creature in a strong
 *   wind must land at the end of its turn or fall."
 */
import { describe, expect, it } from "vitest";
import {
  burningTurnStart,
  extinguish,
  setOnFire,
  slipperyIceSave,
  STRONG_WIND,
  strongWindFall,
} from "@/lib/play/environment";
import { sessionToState, stateToSession } from "@/lib/session-state-codec";
import { makeCharacterDoc } from "./_helpers";

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

describe("burning", () => {
  const burning = () => {
    const doc = makeCharacterDoc();
    return { ...doc, session: must(setOnFire(doc)) };
  };

  it("takes 1d4 Fire damage at the start of each of its turns", () => {
    expect(burningTurnStart(burning())).toEqual({ dice: "1d4", damageType: "fire" });
    expect(burningTurnStart(makeCharacterDoc())).toBeNull();
  });

  it("catches fire once; the flag round-trips the stored session", () => {
    expect(setOnFire(burning())).toBeNull();
    const read = stateToSession(structuredClone(sessionToState(burning().session)));
    expect(read.burning).toBe(true);
  });

  it("rolling on the ground takes an action and leaves you Prone", () => {
    const out = must(extinguish(burning(), "roll"));
    expect(out.action).toBe(true);
    expect(out.session.burning).toBeUndefined();
    expect(out.session.conditions).toContain("prone");
  });

  it("doused, submerged or suffocated, the fire just goes out", () => {
    for (const how of ["doused", "submerged", "suffocated"] as const) {
      const out = must(extinguish(burning(), how));
      expect(out.action).toBe(false);
      expect(out.session.burning).toBeUndefined();
      expect(out.session.conditions).not.toContain("prone");
    }
    expect(extinguish(makeCharacterDoc(), "doused")).toBeNull();
  });
});

describe("slippery ice", () => {
  it("first move onto it this turn, or starting the turn there: DC 10 DEX or Prone", () => {
    const save = { ability: "DEX", dc: 10, onFail: "prone", difficultTerrain: true };
    expect(slipperyIceSave("entered")).toEqual(save);
    expect(slipperyIceSave("turn-start")).toEqual(save);
  });

  it("moving on across it later in the same turn asks nothing more", () => {
    expect(slipperyIceSave("again")).toBeNull();
  });
});

describe("strong wind", () => {
  it("gives Disadvantage to ranged weapon attack rolls", () => {
    expect(STRONG_WIND.attack).toEqual({
      mode: "disadvantage",
      kinds: ["ranged"],
      weaponOnly: true,
    });
  });

  it("a flyer that hasn't landed by the end of its turn falls", () => {
    expect(strongWindFall({ flying: true, landed: false })).toBe(true);
    expect(strongWindFall({ flying: true, landed: true })).toBe(false);
    expect(strongWindFall({ flying: false, landed: false })).toBe(false);
  });
});
