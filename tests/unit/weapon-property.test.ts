import { describe, expect, it } from "vitest";

import {
  conformWeaponCapabilities,
  conformWeaponCapability,
  conformWeaponProperty,
  conformWeaponRangePair,
  getWeaponRange,
  getWeaponReachFt,
  hasWeaponProperty,
  validateWeaponProperties,
} from "@/lib/weapon-property";
import type { WeaponCapability } from "@/types/weapon-property";

const die = (sides: 4 | 6 | 8 | 10 | 12) =>
  ({
    terms: [
      {
        count: { kind: "fixed", value: 1 },
        kind: "dice",
        operation: "add",
        sides,
        termId: "weapon-damage",
      },
    ],
  }) as const;

const ammunition = {
  ammunitionItemId: "crossbow-bolts",
  kind: "ammunition",
  range: { longFt: 320, normalFt: 80 },
} as const;

const thrown = {
  kind: "thrown",
  range: { longFt: 60, normalFt: 20 },
} as const;

describe("weapon property grammar", () => {
  it("models every official property and intrinsic range without prose", () => {
    const capabilities = conformWeaponCapabilities([
      ammunition,
      { kind: "finesse" },
      { kind: "heavy" },
      { kind: "light" },
      { kind: "loading" },
      { kind: "two-handed", requirement: "unless-mounted" },
    ]);

    expect(capabilities).toEqual([
      ammunition,
      { kind: "finesse" },
      { kind: "heavy" },
      { kind: "light" },
      { kind: "loading" },
      { kind: "two-handed", requirement: "unless-mounted" },
    ]);
    expect(conformWeaponProperty({ kind: "reach", reachFt: 10 })).not.toBeNull();
    expect(conformWeaponProperty({ damage: die(8), kind: "versatile" })).toEqual({
      damage: die(8),
      kind: "versatile",
    });
    expect(
      conformWeaponCapability({
        kind: "range",
        range: { longFt: 300, normalFt: 90 },
      })
    ).toEqual({
      kind: "range",
      range: { longFt: 300, normalFt: 90 },
    });
    expect(
      conformWeaponProperty({ kind: "two-handed", requirement: "always" })
    ).not.toBeNull();
    expect(conformWeaponProperty({ kind: "range", range: thrown.range })).toBeNull();
    expect(conformWeaponCapability("Finesse")).toBeNull();
  });

  it("accepts bounded canonical ranges and rejects aliases, extras, and hostile ids", () => {
    expect(conformWeaponRangePair({ longFt: 60, normalFt: 60 })).toEqual({
      longFt: 60,
      normalFt: 60,
    });
    expect(conformWeaponRangePair({ longFt: 20, normalFt: 60 })).toBeNull();
    expect(conformWeaponRangePair({ longFt: 60, normalFt: 0 })).toBeNull();
    expect(conformWeaponRangePair({ longFt: 61, normalFt: 20 })).toBeNull();
    expect(conformWeaponRangePair({ longFt: 10_005, normalFt: 20 })).toBeNull();
    expect(
      conformWeaponProperty({
        ...ammunition,
        ammunitionItemId: "__proto__",
      })
    ).toBeNull();
    expect(
      conformWeaponProperty({
        ...ammunition,
        ammunitionId: "crossbow-bolts",
      })
    ).toBeNull();
    expect(conformWeaponProperty({ kind: "reach", reachFt: 105 })).toBeNull();
    expect(
      conformWeaponProperty({
        damage: { terms: [{ kind: "legacy-die", value: "1d8" }] },
        kind: "versatile",
      })
    ).toBeNull();
  });

  it("requires unique canonically ordered kinds and one range authority", () => {
    expect(
      conformWeaponCapabilities([{ kind: "light" }, { kind: "finesse" }])
    ).toBeNull();
    expect(conformWeaponCapabilities([{ kind: "light" }, { kind: "light" }])).toBeNull();
    expect(conformWeaponCapabilities([ammunition, thrown])).toBeNull();
    expect(
      conformWeaponCapabilities([
        { kind: "range", range: { longFt: 300, normalFt: 90 } },
        thrown,
      ])
    ).toBeNull();
    expect(
      conformWeaponCapabilities([
        { kind: "two-handed", requirement: "always" },
        { damage: die(10), kind: "versatile" },
      ])
    ).toBeNull();
    expect(conformWeaponCapabilities([{ kind: "loading" }])).toBeNull();
    expect(
      conformWeaponCapabilities([ammunition, { kind: "reach", reachFt: 10 }])
    ).toBeNull();
    expect(
      conformWeaponCapabilities([
        { kind: "range", range: { longFt: 300, normalFt: 90 } },
        { damage: die(8), kind: "versatile" },
      ])
    ).toBeNull();
  });

  it("returns a fresh deeply frozen canonical tree", () => {
    const input: WeaponCapability[] = [
      { kind: "finesse" },
      { kind: "thrown", range: { longFt: 120, normalFt: 60 } },
    ];
    const result = conformWeaponCapabilities(input);

    expect(result).not.toBe(input);
    expect(result).toEqual(input);
    expect(Object.isFrozen(result)).toBe(true);
    if (!result || result[1]?.kind !== "thrown") {
      throw new Error("expected the canonical thrown capability");
    }
    expect(Object.isFrozen(result[1])).toBe(true);
    expect(Object.isFrozen(result[1].range)).toBe(true);
  });
});

describe("weapon profile semantics and lookup", () => {
  it("covers melee Thrown, ranged Ammunition, ranged Thrown, and manifested range", () => {
    expect(
      validateWeaponProperties({ capabilities: [thrown], weaponType: "melee" })
    ).toBe(true);
    expect(
      validateWeaponProperties({ capabilities: [ammunition], weaponType: "ranged" })
    ).toBe(true);
    expect(
      validateWeaponProperties({
        capabilities: [{ kind: "finesse" }, thrown],
        weaponType: "ranged",
      })
    ).toBe(true);
    expect(
      validateWeaponProperties({
        capabilities: [{ kind: "range", range: { longFt: 300, normalFt: 90 } }],
        weaponType: "ranged",
      })
    ).toBe(true);
  });

  it("rejects attack-type contradictions", () => {
    expect(
      validateWeaponProperties({ capabilities: [ammunition], weaponType: "melee" })
    ).toBe(false);
    expect(validateWeaponProperties({ capabilities: [], weaponType: "ranged" })).toBe(
      false
    );
    expect(
      validateWeaponProperties({
        capabilities: [
          { kind: "range", range: { longFt: 300, normalFt: 90 } },
          { kind: "reach", reachFt: 10 },
        ],
        weaponType: "ranged",
      })
    ).toBe(false);
    expect(
      validateWeaponProperties({
        capabilities: [{ damage: die(8), kind: "versatile" }],
        weaponType: "ranged",
      })
    ).toBe(false);
    expect(
      validateWeaponProperties({
        capabilities: [{ kind: "loading" }],
        weaponType: "melee",
      })
    ).toBe(false);
    expect(
      validateWeaponProperties({
        capabilities: [
          { kind: "loading" },
          { kind: "range", range: { longFt: 300, normalFt: 90 } },
        ],
        weaponType: "ranged",
      })
    ).toBe(false);
  });

  it("derives range and effective reach by stable kinds", () => {
    const capabilities = [
      { kind: "finesse" },
      { kind: "reach", reachFt: 10 },
      thrown,
    ] as const satisfies readonly WeaponCapability[];

    expect(hasWeaponProperty(capabilities, "finesse")).toBe(true);
    expect(hasWeaponProperty(capabilities, "heavy")).toBe(false);
    expect(getWeaponRange(capabilities)).toEqual(thrown.range);
    expect(getWeaponReachFt(capabilities)).toBe(10);
    expect(getWeaponRange([{ kind: "light" }])).toBeNull();
    expect(getWeaponReachFt([{ kind: "light" }])).toBe(5);
  });
});

// Blind spot: corpus migration is intentionally tested with the authored data cutover,
// not here; this unit pins only the terminal grammar and pure cross-field semantics.
