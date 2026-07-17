/**
 * `unarmed-strike-damage-type-option` grant primitive — the unarmed-attack
 * counterpart of `spell-damage-type-override`. An alternate damage type the
 * character's Unarmed Strike may deal at the player's choice each hit.
 *
 * Wired to Monk Empowered Strikes (L6): "Whenever you deal damage with your
 * Unarmed Strike, it can deal Force damage or its normal damage type." Verified
 * against http://dnd2024.wikidot.com/monk:main. The smart-tracker folds the
 * option into the Unarmed Strike row's damage-type CHOICE chip — engine rolls no
 * dice and never auto-swaps.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { classFeatureIndex } from "@/data/classes";

const empowered: GrantSource = {
  id: "x",
  name: { en: "Empowered Strikes", it: "Colpi Potenziati" },
  grants: [{ type: "unarmed-strike-damage-type-option", toType: "force" }],
};

describe("evaluateGrants — unarmed-strike-damage-type-option aggregation", () => {
  it("records the Force option", () => {
    expect(evaluateGrants([empowered]).unarmedStrikeDamageTypeOptions).toEqual(["force"]);
  });

  it("is empty by default", () => {
    expect(evaluateGrants([]).unarmedStrikeDamageTypeOptions).toEqual([]);
  });

  it("dedupes repeated options", () => {
    expect(evaluateGrants([empowered, empowered]).unarmedStrikeDamageTypeOptions).toEqual(
      ["force"]
    );
  });

  it("merges through a while-active wrapper only when toggled on", () => {
    const toggled: GrantSource = {
      id: "z",
      name: { en: "Z", it: "Z" },
      grants: [
        {
          type: "while-active",
          activeKey: "z",
          label: { en: "Z", it: "Z" },
          grants: empowered.grants ?? [],
        },
      ],
    };
    expect(evaluateGrants([toggled]).unarmedStrikeDamageTypeOptions).toEqual([]);
    expect(
      evaluateGrants([toggled], new Set(["z"])).unarmedStrikeDamageTypeOptions
    ).toEqual(["force"]);
  });
});

describe("Monk Empowered Strikes declares the grant", () => {
  it("carries the exact Force unarmed-strike-damage-type-option", () => {
    const grants = classFeatureIndex.get("monk-empowered-strikes")?.grants ?? [];
    expect(grants.find((g) => g.type === "unarmed-strike-damage-type-option")).toEqual({
      type: "unarmed-strike-damage-type-option",
      toType: "force",
    });
  });
});
