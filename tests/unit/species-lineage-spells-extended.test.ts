/**
 * M-species-extended — second wave of species mechanic wiring (NON-spell
 * lineages this time): Dragonborn (Draconic Ancestry damage-resistance bundle +
 * Draconic Flight fly-speed toggle), Goliath (Giant Ancestry choice
 * bundle + Large Form speed toggle), and the Dhampir Spider Climb climb-speed
 * gap. Source of truth: the dragonborn/goliath/dhampir species pages on
 * dnd2024.wikidot.com.
 *
 * Verifies:
 *   - the Draconic Ancestry bundle offers all ten 2024-PHB ancestors and each
 *     injects the correct `damage-resistance` damage type,
 *   - choosing an ancestry lights up exactly that resistance in the aggregate,
 *   - Draconic Flight grants a Fly Speed equal to walking ONLY while toggled,
 *   - the Giant Ancestry bundle offers all six giants (the action rows they
 *     gate live in goliath-giant-ancestry-actions.test.ts),
 *   - Large Form adds +10 ft Speed ONLY while toggled,
 *   - Dhampir Spider Climb grants a Climb Speed equal to walking from L1.
 */
import { describe, expect, it } from "vitest";
import { raceFeatureIndex, raceTraitCatKey } from "@/data/races";
import { evaluateGrants, type Grant, type GrantSource } from "@/lib/grants";

/** Pull the grants array off a race-trait feature id. */
function traitGrants(id: string): ReadonlyArray<Grant> {
  const entry = raceFeatureIndex.get(id);
  expect(entry, `race trait ${id} should exist`).toBeDefined();
  return entry?.grants ?? [];
}

/** Build a GrantSource wrapping one trait's grants. */
function srcFor(id: string): GrantSource {
  const entry = raceFeatureIndex.get(id);
  if (!entry) throw new Error(`missing trait ${id}`);
  // The `ref` is what lets the bundle's inner granted-action localize its name off
  // the catalogue (R6+R3 SLICE 7d) — without it the engine emits an empty literal.
  return {
    id: entry.id,
    grants: entry.grants,
    ref: { kind: "race", key: raceTraitCatKey(entry) },
  };
}

/** Find the single choice-grant-bundle on a trait. */
function bundle(id: string): Extract<Grant, { type: "choice-grant-bundle" }> {
  const b = traitGrants(id).find(
    (g): g is Extract<Grant, { type: "choice-grant-bundle" }> =>
      g.type === "choice-grant-bundle"
  );
  expect(b, `trait ${id} should carry a choice-grant-bundle`).toBeDefined();
  if (!b) throw new Error("unreachable");
  return b;
}

describe("Dragonborn — Draconic Ancestry damage-resistance bundle", () => {
  const b = bundle("dragonborn-draconic-ancestry");

  it("offers exactly the ten 2024-PHB ancestors", () => {
    expect(b.bundleKey).toBe("dragonborn-ancestry");
    expect(b.options.map((o) => o.id)).toEqual([
      "black",
      "blue",
      "brass",
      "bronze",
      "copper",
      "gold",
      "green",
      "red",
      "silver",
      "white",
    ]);
  });

  it("each ancestry injects exactly its damage-type resistance", () => {
    const expected: Record<string, string> = {
      black: "acid",
      blue: "lightning",
      brass: "fire",
      bronze: "lightning",
      copper: "acid",
      gold: "fire",
      green: "poison",
      red: "fire",
      silver: "cold",
      white: "cold",
    };
    for (const opt of b.options) {
      expect(opt.grants).toHaveLength(1);
      const g = opt.grants[0];
      expect(g?.type).toBe("damage-resistance");
      if (g?.type === "damage-resistance") {
        expect(g.damageType).toBe(expected[opt.id]);
      }
    }
  });

  it("no ancestry chosen → no resistance in the aggregate", () => {
    const agg = evaluateGrants([srcFor("dragonborn-draconic-ancestry")]);
    expect(agg.damageResistances.size).toBe(0);
    expect(agg.grantBundles[0]?.selected).toBeNull();
  });

  it("choosing Red lights up Fire resistance only", () => {
    const agg = evaluateGrants(
      [srcFor("dragonborn-draconic-ancestry")],
      new Set(),
      new Map([["dragonborn-ancestry", "red"]])
    );
    expect([...agg.damageResistances]).toEqual(["fire"]);
  });

  it("choosing Green lights up Poison resistance only", () => {
    const agg = evaluateGrants(
      [srcFor("dragonborn-draconic-ancestry")],
      new Set(),
      new Map([["dragonborn-ancestry", "green"]])
    );
    expect([...agg.damageResistances]).toEqual(["poison"]);
  });

  it("the descriptive Damage Resistance trait carries no grant of its own", () => {
    expect(traitGrants("dragonborn-damage-resistance")).toHaveLength(0);
  });
});

describe("Dragonborn — Draconic Flight fly-speed toggle", () => {
  it("grants no Fly Speed while the wings are off", () => {
    const agg = evaluateGrants([srcFor("dragonborn-draconic-flight")]);
    expect(agg.flySpeed).toBeNull();
    // The toggle is still surfaced so the UI can offer it.
    expect(agg.activatableGroups.map((g) => g.key)).toContain(
      "dragonborn-draconic-flight"
    );
  });

  it("grants Fly Speed equal to walking while active", () => {
    const agg = evaluateGrants(
      [srcFor("dragonborn-draconic-flight")],
      new Set(["dragonborn-draconic-flight"])
    );
    expect(agg.flySpeed).toBe("equal-to-walking");
  });
});

describe("Goliath — Giant Ancestry choice bundle", () => {
  const b = bundle("goliath-giant-ancestry");

  it("offers all six giant boons", () => {
    expect(b.bundleKey).toBe("goliath-giant-ancestry");
    expect(b.options.map((o) => o.id)).toEqual([
      "clouds-jaunt",
      "fires-burn",
      "frosts-chill",
      "hills-tumble",
      "stones-endurance",
      "storms-thunder",
    ]);
  });

  // The pick only selects which `mechanics.actions` row appears (each action is
  // gated by `requiresBundleOption`): goliath-giant-ancestry-actions.test.ts
  // checks the rows, the economy and the shared PB / Long Rest counter.
  it("the options carry no grants of their own", () => {
    for (const opt of b.options) expect(opt.grants).toEqual([]);
    const agg = evaluateGrants(
      [srcFor("goliath-giant-ancestry")],
      new Set(),
      new Map([["goliath-giant-ancestry", "stones-endurance"]])
    );
    expect(agg.grantedActions).toHaveLength(0);
  });
});

describe("Goliath — Large Form speed toggle", () => {
  it("adds no Speed while Large Form is off", () => {
    const agg = evaluateGrants([srcFor("goliath-large-form")]);
    expect(agg.speedBonusFt).toBe(0);
    expect(agg.activatableGroups.map((g) => g.key)).toContain("goliath-large-form");
  });

  it("adds +10 ft Speed while Large Form is active", () => {
    const agg = evaluateGrants(
      [srcFor("goliath-large-form")],
      new Set(["goliath-large-form"])
    );
    expect(agg.speedBonusFt).toBe(10);
  });
});

// (The Dhampir Spider Climb pin — a pack species — lives in
// `content-pack/tests/unit/species-lineage-spells-extended.pack.test.ts`.)
