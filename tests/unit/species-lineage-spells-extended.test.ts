/**
 * M-species-extended — second wave of species mechanic wiring (NON-spell
 * lineages this time): Dragonborn (Draconic Ancestry damage-resistance bundle +
 * Draconic Flight fly-speed toggle), Goliath (Giant Ancestry granted-action
 * bundle + Large Form speed toggle), and the Dhampir Spider Climb climb-speed
 * gap. Source of truth: the dragonborn/goliath/dhampir species pages on
 * dnd2024.wikidot.com.
 *
 * Verifies:
 *   - the Draconic Ancestry bundle offers all ten 2024-PHB ancestors and each
 *     injects the correct `damage-resistance` damage type,
 *   - choosing an ancestry lights up exactly that resistance in the aggregate,
 *   - Draconic Flight grants a Fly Speed equal to walking ONLY while toggled,
 *   - the Giant Ancestry bundle offers all six giants as `granted-action`s,
 *     each spending the shared "goliath-giant-ancestry" PB/Long-Rest tracker,
 *   - Large Form adds +10 ft Speed ONLY while toggled,
 *   - Dhampir Spider Climb grants a Climb Speed equal to walking from L1.
 */
import { describe, expect, it } from "vitest";
import { raceFeatureIndex, raceTraitCatKey } from "@/data/races";
import { evaluateGrants, type Grant, type GrantSource } from "@/lib/grants";
import { loc, srd } from "../_harness/loc";

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

describe("Goliath — Giant Ancestry granted-action bundle", () => {
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

  it("each boon is a granted-action spending the shared PB/Long-Rest tracker", () => {
    for (const opt of b.options) {
      const a = opt.grants.find(
        (g): g is Extract<Grant, { type: "granted-action" }> =>
          g.type === "granted-action"
      );
      expect(a, `boon ${opt.id} should be a granted-action`).toBeDefined();
      expect(a?.cost).toEqual({
        kind: "tracker",
        trackerId: "goliath-giant-ancestry",
      });
    }
  });

  it("maps each boon to the correct action-economy slot", () => {
    const slotById = new Map(
      b.options.map((o) => {
        const a = o.grants.find(
          (g): g is Extract<Grant, { type: "granted-action" }> =>
            g.type === "granted-action"
        );
        return [o.id, a?.slot];
      })
    );
    expect(slotById.get("clouds-jaunt")).toBe("bonus");
    expect(slotById.get("fires-burn")).toBe("free");
    expect(slotById.get("frosts-chill")).toBe("free");
    expect(slotById.get("hills-tumble")).toBe("free");
    expect(slotById.get("stones-endurance")).toBe("reaction");
    expect(slotById.get("storms-thunder")).toBe("reaction");
  });

  it("on-hit boons carry a trigger; the bonus-action teleport does not", () => {
    // The boon granted-action's trigger now lives in the catalogue, keyed
    // `<raceTraitKey>.grants.0.options.<optionId>.grants.<grantId>.trigger`. A boon
    // with no on-hit clause (clouds-jaunt's teleport) has no such key → "".
    const trigger = (optId: string) => {
      const a = b.options
        .find((o) => o.id === optId)
        ?.grants.find(
          (g): g is Extract<Grant, { type: "granted-action" }> =>
            g.type === "granted-action"
        );
      const grantId = a && "id" in a ? a.id : undefined;
      return grantId
        ? srd(
            "race",
            `goliath.traits.giant-ancestry.grants.0.options.${optId}.grants.${grantId}`,
            "trigger",
            "en"
          )
        : "";
    };
    expect(trigger("fires-burn")).toContain("hit");
    expect(trigger("storms-thunder")).toContain("take damage");
    expect(trigger("clouds-jaunt")).toBe("");
  });

  it("choosing a boon surfaces exactly one granted-action in the aggregate", () => {
    const agg = evaluateGrants(
      [srcFor("goliath-giant-ancestry")],
      new Set(),
      new Map([["goliath-giant-ancestry", "stones-endurance"]])
    );
    expect(agg.grantedActions).toHaveLength(1);
    expect(agg.grantedActions[0]?.slot).toBe("reaction");
    expect(loc(agg.grantedActions[0]?.name, "en")).toBe("Stone's Endurance");
  });

  it("no boon chosen → no granted-action surfaced", () => {
    const agg = evaluateGrants([srcFor("goliath-giant-ancestry")]);
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
