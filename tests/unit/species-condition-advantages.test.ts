/**
 * Species condition-save / ability-roll advantages + the pack species' Heavenly Wings
 * fly toggle — wired via the existing `advantage-on` and `while-active` grant
 * kinds. Source of truth: dnd2024.wikidot.com species pages.
 *
 * Verifies for Elf / Halfling / Dwarf / Gnome / Goliath (+ the pack species' forms):
 *   - the trait carries the expected `advantage-on` grant(s) (rollType + vs),
 *   - the evaluator surfaces them as `advantages` clauses near the saves block,
 *   - Dwarven Resilience keeps its poison damage-resistance alongside the new
 *     condition-save advantage,
 *   - Goliath Powerful Build uses rollType "check" (2024 RAW — ability check,
 *     NOT a saving throw) and its prose was corrected to match,
 *   - the pack species' Celestial Revelation forms (Heavenly Wings / Inner Radiance /
 *     Necrotic Shroud) are a single-select `choice-grant-bundle`; the chosen form
 *     contributes its once-per-turn flat +PB extra-damage rider (Radiant / Necrotic
 *     per the SRD), and Heavenly Wings additionally grants a Fly Speed = Speed (G14).
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
  // The `ref` lets the engine localize each grant's text off the catalogue
  // (R6+R3 SLICE 7d); without it `loc(...)` resolves to an empty literal.
  return {
    id: entry.id,
    grants: entry.grants,
    ref: { kind: "race", key: raceTraitCatKey(entry) },
  };
}

/** All `advantage-on` clauses surfaced by evaluating one trait. */
function advantagesFor(id: string) {
  return evaluateGrants([srcFor(id)]).advantages;
}

describe("Elf — Fey Ancestry → Advantage on saves vs Charmed", () => {
  it("carries one advantage-on (save, Charmed) grant", () => {
    const adv = traitGrants("elf-fey-ancestry").filter(
      (g): g is Extract<Grant, { type: "advantage-on" }> => g.type === "advantage-on"
    );
    expect(adv).toHaveLength(1);
    expect(adv[0]).toMatchObject({ rollType: "save", vs: "charmed" });
  });

  it("surfaces as a save advantage clause", () => {
    const clauses = advantagesFor("elf-fey-ancestry");
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toMatchObject({ rollType: "save", vs: "charmed" });
    // RENDER PARITY (GR7 `vs`-slug refactor): the slug `vs` is NEVER rendered;
    // the chip's localized `description` (off the SRD catalogue) is what the rail
    // shows. EN stays as before; IT is a real translation (no English leak).
    const en = loc(clauses[0]?.description, "en");
    const it = loc(clauses[0]?.description, "it");
    expect(en).toContain("Charmed");
    expect(it).toContain("Affascinato");
    expect(it).not.toBe(en); // IT must NOT be the English string
  });
});

describe("Halfling — Brave → Advantage on saves vs Frightened", () => {
  it("surfaces a save advantage clause vs Frightened", () => {
    const clauses = advantagesFor("halfling-brave");
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toMatchObject({ rollType: "save", vs: "frightened" });
    expect(loc(clauses[0]?.description, "it")).toContain("Spaventato");
  });
});

describe("Dwarf — Dwarven Resilience → poison Resistance + saves vs Poisoned", () => {
  it("keeps the poison damage-resistance", () => {
    const agg = evaluateGrants([srcFor("dwarf-dwarven-resilience")]);
    expect(agg.damageResistances.has("poison")).toBe(true);
  });

  it("adds a save advantage clause vs Poisoned", () => {
    const clauses = advantagesFor("dwarf-dwarven-resilience");
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toMatchObject({ rollType: "save", vs: "poisoned" });
  });
});

// (The pack species' Construct Resilience pins live in
// `content-pack/tests/unit/species-condition-advantages.pack.test.ts`.)

describe("Gnome — Gnome Cunning → Advantage on INT/WIS/CHA saves", () => {
  it("carries three save advantage-on grants (one per mental ability)", () => {
    const adv = traitGrants("gnome-gnome-cunning").filter(
      (g): g is Extract<Grant, { type: "advantage-on" }> => g.type === "advantage-on"
    );
    expect(adv.map((g) => g.vs)).toEqual(["int", "wis", "cha"]);
    for (const g of adv) expect(g.rollType).toBe("save");
  });

  it("surfaces three save advantage clauses", () => {
    const clauses = advantagesFor("gnome-gnome-cunning");
    expect(clauses).toHaveLength(3);
    expect(clauses.every((c) => c.rollType === "save")).toBe(true);
  });
});

describe("Goliath — Powerful Build → Advantage on the CHECK to end Grappled", () => {
  it("uses rollType 'check' (NOT 'save') per 2024 RAW", () => {
    const adv = traitGrants("goliath-powerful-build").filter(
      (g): g is Extract<Grant, { type: "advantage-on" }> => g.type === "advantage-on"
    );
    expect(adv).toHaveLength(1);
    expect(adv[0]?.rollType).toBe("check");
    expect(adv[0]?.vs).toBe("grappled");
  });

  it("trait prose says 'ability check' / 'prova di caratteristica' (corrected)", () => {
    const _k = raceTraitCatKey({ id: "goliath-powerful-build", raceId: "goliath" });
    expect(srd("race", _k, "description", "en")).toContain("ability check");
    expect(srd("race", _k, "description", "en")).not.toContain("saving throw");
    expect(srd("race", _k, "description", "it")).toContain("prova di caratteristica");
    expect(srd("race", _k, "description", "it")).not.toContain("tiro salvezza");
  });

  it("surfaces as a CHECK advantage clause, not a save clause", () => {
    const clauses = advantagesFor("goliath-powerful-build");
    expect(clauses).toHaveLength(1);
    expect(clauses[0]?.rollType).toBe("check");
  });
});

// (The pack species' Celestial Revelation (G14) pins live in
// `content-pack/tests/unit/species-condition-advantages.pack.test.ts`.)
