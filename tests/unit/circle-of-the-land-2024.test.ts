/**
 * Circle of the Land — 2024 PHB feature set + terrain Circle Spells.
 * Verifies the data was migrated off the 2014 features (Bonus Cantrip, Land's
 * Stride) onto the 2024 set (Circle of the Land Spells, Land's Aid, Natural
 * Recovery@L6, Nature's Ward, Nature's Sanctuary) and that the terrain
 * choice-grant-bundle carries the right level-gated spells + resistances.
 */
import { describe, expect, it } from "vitest";
import { getClassTable, classFeatureIndex } from "@/data/classes";
import { evaluateGrants } from "@/lib/grants";
import { getAlwaysPreparedFromGrants } from "@/lib/expanded-spells";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { spellIndex } from "@/data/spells";

const LAND = getClassTable("druid")?.subclasses.find(
  (s) => s.id === "circle-of-the-land"
);

describe("Circle of the Land — 2024 feature set", () => {
  it("uses the 2024 features and drops the 2014 ones", () => {
    expect(LAND?.featureIds).toEqual([
      "druid-land-circle-spells",
      "druid-land-lands-aid",
      "druid-land-natural-recovery",
      "druid-land-natures-ward",
      "druid-land-natures-sanctuary",
    ]);
    expect(classFeatureIndex.get("druid-land-bonus-cantrip")).toBeUndefined();
    expect(classFeatureIndex.get("druid-land-lands-stride")).toBeUndefined();
  });

  it("Natural Recovery is a level-6 feature (was wrongly L3)", () => {
    expect(classFeatureIndex.get("druid-land-natural-recovery")?.level).toBe(6);
  });

  it("Land's Aid + Nature's Sanctuary cost a Wild Shape use", () => {
    for (const id of ["druid-land-lands-aid", "druid-land-natures-sanctuary"]) {
      const actions = classFeatureIndex.get(id)?.mechanics?.actions ?? [];
      expect(actions.some((a) => a.costTracker === "druid-wild-shape")).toBe(true);
    }
  });
});

describe("Circle of the Land — terrain Circle Spells (level-gated)", () => {
  const spellsFeature = {
    grants: classFeatureIndex.get("druid-land-circle-spells")?.grants,
  };

  it("all four terrains' spell slugs resolve in the spell index", () => {
    const grants = classFeatureIndex.get("druid-land-circle-spells")?.grants ?? [];
    const bundle = grants.find((g) => g.type === "choice-grant-bundle");
    expect(bundle?.type).toBe("choice-grant-bundle");
    if (bundle?.type !== "choice-grant-bundle") return;
    expect(bundle.options.map((o) => o.id)).toEqual([
      "arid",
      "polar",
      "temperate",
      "tropical",
    ]);
    for (const opt of bundle.options) {
      for (const g of opt.grants) {
        if (g.type === "always-prepared-spell") {
          expect(spellIndex.get(g.spellId), `${opt.id}:${g.spellId}`).toBeDefined();
        }
      }
    }
  });

  it("arid at druid L3 prepares Blur/Burning Hands/Fire Bolt only (Fireball gated to L5)", () => {
    const out = getAlwaysPreparedFromGrants([spellsFeature], {
      level: 3,
      bundleChoices: new Map([["druid-land-terrain", "arid"]]),
    });
    expect((out as string[]).sort()).toEqual(["blur", "burning-hands", "fire-bolt"]);
  });

  it("arid at druid L9 prepares the full arid list", () => {
    const out = getAlwaysPreparedFromGrants([spellsFeature], {
      level: 9,
      bundleChoices: new Map([["druid-land-terrain", "arid"]]),
    });
    expect((out as string[]).sort()).toEqual([
      "blight",
      "blur",
      "burning-hands",
      "fire-bolt",
      "fireball",
      "wall-of-stone",
    ]);
  });
});

describe("Circle of the Land — Nature's Ward resistance (L10) tracks terrain", () => {
  // Resolve the L10 + L3 features through the real pipeline.
  const features = [
    { srdId: "druid-land-circle-spells" },
    { srdId: "druid-land-natures-ward" },
  ];
  const sources = resolveGrantSourcesForFeatures(features);

  it("immune to Poisoned regardless of terrain; resistance follows the pick", () => {
    const arid = evaluateGrants(
      sources,
      new Set(),
      new Map([["druid-land-terrain", "arid"]])
    );
    expect([...arid.conditionImmunities]).toContain("poisoned");
    expect([...arid.damageResistances]).toEqual(["fire"]);

    const tropical = evaluateGrants(
      sources,
      new Set(),
      new Map([["druid-land-terrain", "tropical"]])
    );
    expect([...tropical.damageResistances]).toEqual(["poison"]);
  });

  it("one selector is surfaced even though two features share the bundleKey", () => {
    const agg = evaluateGrants(sources);
    // Two choice-grant-bundle grants (L3 + L10) → two bundle entries, same key.
    expect(
      agg.grantBundles.filter((b) => b.bundleKey === "druid-land-terrain")
    ).toHaveLength(2);
  });
});
