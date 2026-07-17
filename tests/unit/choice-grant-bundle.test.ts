/**
 * L12 — `choice-grant-bundle` (single-select variant chooser). The selected
 * option's grants merge into the aggregate; spells inside an option are
 * level-gated by `minLevel` in the injection consumer. Used by Circle of the
 * Land (terrain re-chosen each Long Rest).
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { getAlwaysPreparedFromGrants, allBundleSpellIds } from "@/lib/expanded-spells";

const TERRAIN: GrantSource = {
  id: "druid-land-circle-spells",
  name: { en: "Circle Spells", it: "Incantesimi del Circolo" },
  grants: [
    {
      type: "choice-grant-bundle",
      bundleKey: "druid-land-terrain",
      label: { en: "Land Type", it: "Tipo di Terra" },
      options: [
        {
          id: "arid",
          label: { en: "Arid", it: "Arida" },
          grants: [
            { type: "always-prepared-spell", spellId: "fire-bolt", minLevel: 3 },
            { type: "always-prepared-spell", spellId: "fireball", minLevel: 5 },
            { type: "damage-resistance", damageType: "fire" },
          ],
        },
        {
          id: "polar",
          label: { en: "Polar", it: "Polare" },
          grants: [
            { type: "always-prepared-spell", spellId: "ray-of-frost", minLevel: 3 },
            { type: "damage-resistance", damageType: "cold" },
          ],
        },
      ],
    },
  ],
};

describe("choice-grant-bundle — evaluator", () => {
  it("unselected: no grants apply, but the chooser is surfaced", () => {
    const agg = evaluateGrants([TERRAIN]);
    expect(agg.damageResistances.size).toBe(0);
    expect(agg.grantBundles).toHaveLength(1);
    expect(agg.grantBundles[0]).toMatchObject({
      bundleKey: "druid-land-terrain",
      selected: null,
    });
    expect(agg.grantBundles[0]?.options.map((o) => o.id)).toEqual(["arid", "polar"]);
  });

  it("selected: only the chosen option's non-spell grants merge in", () => {
    const agg = evaluateGrants(
      [TERRAIN],
      new Set(),
      new Map([["druid-land-terrain", "arid"]])
    );
    expect([...agg.damageResistances]).toEqual(["fire"]);
    expect(agg.grantBundles[0]?.selected).toBe("arid");
  });

  it("switching the selection switches the resistance", () => {
    const polar = evaluateGrants(
      [TERRAIN],
      new Set(),
      new Map([["druid-land-terrain", "polar"]])
    );
    expect([...polar.damageResistances]).toEqual(["cold"]);
  });
});

describe("getAlwaysPreparedFromGrants — bundle descent + minLevel gate", () => {
  it("no selection → no bundle spells", () => {
    expect(getAlwaysPreparedFromGrants([TERRAIN], { level: 20 })).toEqual([]);
  });

  it("selected arid at L3 → only fire-bolt (fireball gated to L5)", () => {
    const out = getAlwaysPreparedFromGrants([TERRAIN], {
      level: 3,
      bundleChoices: new Map([["druid-land-terrain", "arid"]]),
    });
    expect(out).toEqual(["fire-bolt"]);
  });

  it("selected arid at L5 → fire-bolt + fireball", () => {
    const out = getAlwaysPreparedFromGrants([TERRAIN], {
      level: 5,
      bundleChoices: new Map([["druid-land-terrain", "arid"]]),
    });
    expect(out.sort()).toEqual(["fire-bolt", "fireball"]);
  });

  it("without a level, minLevel is ignored (all selected spells)", () => {
    const out = getAlwaysPreparedFromGrants([TERRAIN], {
      bundleChoices: new Map([["druid-land-terrain", "arid"]]),
    });
    expect(out.sort()).toEqual(["fire-bolt", "fireball"]);
  });
});

describe("choice-grant-bundle — choiceFrequency field", () => {
  it("defaults to 'rest' when choiceFrequency is omitted", () => {
    const agg = evaluateGrants([TERRAIN]);
    expect(agg.grantBundles[0]?.choiceFrequency).toBe("rest");
  });

  it("forwards 'creation' when the grant declares it", () => {
    const LINEAGE: GrantSource = {
      id: "elf-lineage-trait",
      name: { en: "Elven Lineage", it: "Stirpe Elfica" },
      grants: [
        {
          type: "choice-grant-bundle",
          bundleKey: "elf-lineage",
          label: { en: "Elven Lineage", it: "Stirpe Elfica" },
          choiceFrequency: "creation",
          options: [
            {
              id: "high-elf",
              label: { en: "High Elf", it: "Alto Elfo" },
              grants: [],
            },
          ],
        },
      ],
    };
    const agg = evaluateGrants([LINEAGE]);
    expect(agg.grantBundles[0]?.choiceFrequency).toBe("creation");
  });
});

describe("allBundleSpellIds — every option's spells (for re-selection cleanup)", () => {
  it("collects spells across ALL options of the bundle", () => {
    const ids = allBundleSpellIds([TERRAIN], "druid-land-terrain");
    expect([...ids].sort()).toEqual(["fire-bolt", "fireball", "ray-of-frost"]);
  });

  it("returns empty for an unknown bundleKey", () => {
    expect(allBundleSpellIds([TERRAIN], "nope").size).toBe(0);
  });
});
