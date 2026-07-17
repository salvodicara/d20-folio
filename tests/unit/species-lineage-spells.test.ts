/**
 * M-species-spells — CORE PHB species lineage cantrips/spells wired via
 * `always-prepared-spell` grants (inside a `choice-grant-bundle` for the
 * choose-one lineages). Source of truth: dnd2024.wikidot.com species pages.
 *
 * Verifies for Elf / Tiefling / Gnome (+ a pack species' pinned-CHA case):
 *   - each lineage trait carries the expected bundle option spell ids,
 *   - every referenced spell id resolves in the SRD spell index,
 *   - `getAlwaysPreparedFromGrants` injects the cantrip at L1 and gates the
 *     L3 / L5 spells by `minLevel`,
 *   - casting ability defers to the species INT/WIS/CHA pick
 *     (`spellAbilitySource: "species"`), except one pack species' Light (pinned CHA),
 *   - non-spell aggregates (e.g. darkvision) are unaffected by the new grants.
 */
import { describe, expect, it } from "vitest";
import { raceFeatureIndex } from "@/data/races";
import { spellIndex } from "@/data/spells";
import { getAlwaysPreparedFromGrants, injectExpandedSpells } from "@/lib/expanded-spells";
import { evaluateGrants, type Grant, type GrantSource } from "@/lib/grants";
import type { DamageType } from "@/data/types";

/** Pull the grants array off a race-trait feature id. */
function traitGrants(id: string): ReadonlyArray<Grant> {
  const entry = raceFeatureIndex.get(id);
  expect(entry, `race trait ${id} should exist`).toBeDefined();
  return entry?.grants ?? [];
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

/** Spell ids declared by a named option of a bundle, in order. */
function optionSpellIds(
  b: Extract<Grant, { type: "choice-grant-bundle" }>,
  optionId: string
): string[] {
  const opt = b.options.find((o) => o.id === optionId);
  expect(opt, `bundle ${b.bundleKey} should have option ${optionId}`).toBeDefined();
  return (opt?.grants ?? [])
    .filter(
      (g): g is Extract<Grant, { type: "always-prepared-spell" }> =>
        g.type === "always-prepared-spell"
    )
    .map((g) => g.spellId);
}

/** Build a GrantSource wrapping one trait's grants (for the consumer helpers). */
function srcFor(id: string): GrantSource {
  const entry = raceFeatureIndex.get(id);
  if (!entry) throw new Error(`missing trait ${id}`);
  return { id: entry.id, grants: entry.grants };
}

describe("Elf — Elven Lineage bundle (Drow / High Elf / Wood Elf)", () => {
  const b = bundle("elf-elven-lineage");

  it("offers exactly the three 2024-PHB core lineages", () => {
    expect(b.bundleKey).toBe("elf-lineage");
    expect(b.options.map((o) => o.id)).toEqual(["drow", "high-elf", "wood-elf"]);
  });

  it("Drow → Dancing Lights (L1) / Faerie Fire (L3) / Darkness (L5)", () => {
    expect(optionSpellIds(b, "drow")).toEqual([
      "dancing-lights",
      "faerie-fire",
      "darkness",
    ]);
  });

  it("High Elf → Prestidigitation (L1) / Detect Magic (L3) / Misty Step (L5)", () => {
    expect(optionSpellIds(b, "high-elf")).toEqual([
      "prestidigitation",
      "detect-magic",
      "misty-step",
    ]);
  });

  it("Wood Elf → Druidcraft (L1) / Longstrider (L3) / Pass without Trace (L5)", () => {
    expect(optionSpellIds(b, "wood-elf")).toEqual([
      "druidcraft",
      "longstrider",
      "pass-without-trace",
    ]);
  });

  it("every lineage spell defers casting ability to the species pick", () => {
    for (const opt of b.options) {
      for (const g of opt.grants) {
        if (g.type !== "always-prepared-spell") continue;
        expect(g.spellAbilitySource).toBe("species");
        expect("spellAbility" in g && g.spellAbility).toBeFalsy();
      }
    }
  });

  it("L3/L5 spells are minLevel-gated; the cantrip is not", () => {
    for (const opt of b.options) {
      const spells = opt.grants.filter(
        (g): g is Extract<Grant, { type: "always-prepared-spell" }> =>
          g.type === "always-prepared-spell"
      );
      expect(spells[0]?.minLevel).toBeUndefined(); // cantrip — always
      expect(spells[1]?.minLevel).toBe(3);
      expect(spells[2]?.minLevel).toBe(5);
    }
  });
});

describe("Tiefling — Fiendish Legacy bundle (Abyssal / Chthonic / Infernal)", () => {
  const b = bundle("tiefling-fiendish-legacy");

  it("offers exactly the three legacies", () => {
    expect(b.bundleKey).toBe("tiefling-legacy");
    expect(b.options.map((o) => o.id)).toEqual(["abyssal", "chthonic", "infernal"]);
  });

  it("Abyssal → Poison Spray / Ray of Sickness (L3) / Hold Person (L5)", () => {
    expect(optionSpellIds(b, "abyssal")).toEqual([
      "poison-spray",
      "ray-of-sickness",
      "hold-person",
    ]);
  });

  it("Chthonic → Chill Touch / False Life (L3) / Ray of Enfeeblement (L5)", () => {
    expect(optionSpellIds(b, "chthonic")).toEqual([
      "chill-touch",
      "false-life",
      "ray-of-enfeeblement",
    ]);
  });

  it("Infernal → Fire Bolt / Hellish Rebuke (L3) / Darkness (L5)", () => {
    expect(optionSpellIds(b, "infernal")).toEqual([
      "fire-bolt",
      "hellish-rebuke",
      "darkness",
    ]);
  });

  it("Otherworldly Presence keeps its species-deferred Thaumaturgy grant", () => {
    const g = traitGrants("tiefling-otherworldly-presence").find(
      (x): x is Extract<Grant, { type: "always-prepared-spell" }> =>
        x.type === "always-prepared-spell"
    );
    expect(g?.spellId).toBe("thaumaturgy");
    expect(g?.spellAbilitySource).toBe("species");
  });
});

describe("Gnome — Gnomish Lineage bundle (Forest / Rock)", () => {
  const b = bundle("gnome-gnomish-lineage");

  it("offers Forest Gnome + Rock Gnome", () => {
    expect(b.bundleKey).toBe("gnome-lineage");
    expect(b.options.map((o) => o.id)).toEqual(["forest-gnome", "rock-gnome"]);
  });

  it("Forest Gnome → Minor Illusion + Speak with Animals (no level gate)", () => {
    expect(optionSpellIds(b, "forest-gnome")).toEqual([
      "minor-illusion",
      "speak-with-animals",
    ]);
    const opt = b.options.find((o) => o.id === "forest-gnome");
    for (const g of opt?.grants ?? []) {
      if (g.type === "always-prepared-spell") expect(g.minLevel).toBeUndefined();
    }
  });

  it("Rock Gnome → Mending + Prestidigitation cantrips", () => {
    expect(optionSpellIds(b, "rock-gnome")).toEqual(["mending", "prestidigitation"]);
  });

  it("all gnome lineage spells defer to the species pick", () => {
    for (const opt of b.options) {
      for (const g of opt.grants) {
        if (g.type === "always-prepared-spell") {
          expect(g.spellAbilitySource).toBe("species");
        }
      }
    }
  });
});

// (The pack species' Light Bearer pins live in
// `content-pack/tests/unit/species-lineage-spells.pack.test.ts`.)

describe("every species lineage spell id resolves in the SRD spell index", () => {
  const traitIds = [
    "elf-elven-lineage",
    "tiefling-fiendish-legacy",
    "tiefling-otherworldly-presence",
    "gnome-gnomish-lineage",
  ];
  const ids = new Set<string>();
  for (const tid of traitIds) {
    for (const g of traitGrants(tid)) {
      if (g.type === "always-prepared-spell") ids.add(g.spellId);
      if (g.type === "choice-grant-bundle") {
        for (const opt of g.options) {
          for (const inner of opt.grants) {
            if (inner.type === "always-prepared-spell") ids.add(inner.spellId);
          }
        }
      }
    }
  }

  it.each([...ids])("spell '%s' exists", (id) => {
    expect(spellIndex.get(id), `spell ${id} must exist in the SRD data`).toBeDefined();
  });
});

describe("getAlwaysPreparedFromGrants — level gating via the chosen lineage", () => {
  const drowChoice = new Map([["elf-lineage", "drow"]]);

  it("L1 Drow Elf → only the cantrip (Dancing Lights)", () => {
    const out = getAlwaysPreparedFromGrants([srcFor("elf-elven-lineage")], {
      level: 1,
      bundleChoices: drowChoice,
    });
    expect(out).toEqual([{ spellId: "dancing-lights", speciesSpellAbility: true }]);
  });

  it("L3 Drow Elf → cantrip + Faerie Fire (Darkness still gated)", () => {
    const out = getAlwaysPreparedFromGrants([srcFor("elf-elven-lineage")], {
      level: 3,
      bundleChoices: drowChoice,
    });
    expect(out).toEqual([
      { spellId: "dancing-lights", speciesSpellAbility: true },
      { spellId: "faerie-fire", speciesSpellAbility: true },
    ]);
  });

  it("L5 Drow Elf → all three lineage spells", () => {
    const out = getAlwaysPreparedFromGrants([srcFor("elf-elven-lineage")], {
      level: 5,
      bundleChoices: drowChoice,
    });
    expect(out.map((e) => (typeof e === "string" ? e : e.spellId))).toEqual([
      "dancing-lights",
      "faerie-fire",
      "darkness",
    ]);
  });

  it("no lineage chosen → no lineage spells injected", () => {
    expect(
      getAlwaysPreparedFromGrants([srcFor("elf-elven-lineage")], { level: 20 })
    ).toEqual([]);
  });

  it("L5 Infernal Tiefling → Fire Bolt + Hellish Rebuke + Darkness, all species-deferred", () => {
    const out = getAlwaysPreparedFromGrants([srcFor("tiefling-fiendish-legacy")], {
      level: 5,
      bundleChoices: new Map([["tiefling-legacy", "infernal"]]),
    });
    expect(out).toEqual([
      { spellId: "fire-bolt", speciesSpellAbility: true },
      { spellId: "hellish-rebuke", speciesSpellAbility: true },
      { spellId: "darkness", speciesSpellAbility: true },
    ]);
  });

  it("Forest Gnome at L1 → both spells (no gate)", () => {
    const out = getAlwaysPreparedFromGrants([srcFor("gnome-gnomish-lineage")], {
      level: 1,
      bundleChoices: new Map([["gnome-lineage", "forest-gnome"]]),
    });
    expect(out).toEqual([
      { spellId: "minor-illusion", speciesSpellAbility: true },
      { spellId: "speak-with-animals", speciesSpellAbility: true },
    ]);
  });

  // (The pack species' Light Bearer CHA-pin injection pin lives in
  // `content-pack/tests/unit/species-lineage-spells.pack.test.ts`.)
});

describe("injection → SrdSpellRef marks species deferral / CHA pin correctly", () => {
  it("species-deferred spell stamps speciesSpellAbility:true on the ref", () => {
    const entries = getAlwaysPreparedFromGrants([srcFor("elf-elven-lineage")], {
      level: 5,
      bundleChoices: new Map([["elf-lineage", "high-elf"]]),
    });
    const refs = injectExpandedSpells([], entries);
    const mistyStep = refs.find((r) => "srdId" in r && r.srdId === "misty-step");
    expect(mistyStep).toMatchObject({
      srdId: "misty-step",
      prepared: true,
      alwaysPrepared: true,
      speciesSpellAbility: true,
    });
    expect(mistyStep && "spellAbilityOverride" in mistyStep).toBe(false);
  });

  // (The CHA-pinned injection pin — the pack species' Light Bearer, the only species
  // spell with a concrete ability pin — lives in
  // `content-pack/tests/unit/species-lineage-spells.pack.test.ts`.)
});

describe("Elven Lineage — L1 non-spell benefits (Drow darkvision-120, Wood Elf +5 ft)", () => {
  it("with no lineage chosen, Elf keeps base Darkvision 60 from its own trait", () => {
    const agg = evaluateGrants([srcFor("elf-darkvision"), srcFor("elf-elven-lineage")]);
    expect(agg.darkvisionFt).toBe(60);
  });

  it("Drow → Darkvision range increases to 120 ft (overrides the base 60 by max)", () => {
    const agg = evaluateGrants(
      [srcFor("elf-darkvision"), srcFor("elf-elven-lineage")],
      new Set(),
      new Map([["elf-lineage", "drow"]])
    );
    expect(agg.darkvisionFt).toBe(120);
    // Drow grants no resistance/speed — only the darkvision upgrade + spells.
    expect(agg.damageResistances.size).toBe(0);
    expect(agg.speedBonusFt).toBe(0);
    expect(agg.grantBundles[0]?.selected).toBe("drow");
  });

  it("Wood Elf → +5 ft Speed bonus (base 30 + 5 = 35), Darkvision unchanged", () => {
    const agg = evaluateGrants(
      [srcFor("elf-darkvision"), srcFor("elf-elven-lineage")],
      new Set(),
      new Map([["elf-lineage", "wood-elf"]])
    );
    expect(agg.speedBonusFt).toBe(5);
    expect(agg.darkvisionFt).toBe(60); // Wood Elf does not touch darkvision
  });

  it("High Elf → no movement/sense change (spell-only option)", () => {
    const agg = evaluateGrants(
      [srcFor("elf-darkvision"), srcFor("elf-elven-lineage")],
      new Set(),
      new Map([["elf-lineage", "high-elf"]])
    );
    expect(agg.speedBonusFt).toBe(0);
    expect(agg.darkvisionFt).toBe(60);
  });
});

describe("Fiendish Legacy — L1 damage resistance per legacy", () => {
  const cases: ReadonlyArray<[string, DamageType]> = [
    ["abyssal", "poison"],
    ["chthonic", "necrotic"],
    ["infernal", "fire"],
  ];

  it.each(cases)("%s legacy → Resistance to %s damage", (legacy, dmg) => {
    const agg = evaluateGrants(
      [srcFor("tiefling-fiendish-legacy")],
      new Set(),
      new Map([["tiefling-legacy", legacy]])
    );
    expect(agg.damageResistances.has(dmg)).toBe(true);
    expect(agg.damageResistances.size).toBe(1);
  });

  it("no legacy chosen → no resistance injected", () => {
    const agg = evaluateGrants([srcFor("tiefling-fiendish-legacy")]);
    expect(agg.damageResistances.size).toBe(0);
  });
});
