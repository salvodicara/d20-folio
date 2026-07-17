/**
 * Ring of Elemental Command — multi-variant per-element wiring (deferred in b6).
 *
 * Verified against dnd2024.wikidot.com/magic-item:ring-of-elemental-command
 * (dnd2024.wikidot.com/magic-item:ring-of-elemental-command):
 *   Elemental Focus grants properties for the ring's linked plane —
 *     Air   → know Auran, Resistance to Lightning, Fly Speed = Speed (hover)
 *     Earth → know Terran, Resistance to Acid
 *     Fire  → know Ignan, Immunity to Fire
 *     Water → know Aquan, Swim Speed 60, breathe underwater
 *
 * Modelled as a single-select `choice-grant-bundle` keyed by the linked plane,
 * gated by attunement through the L2 equipment → grant pipeline. Elemental Bane
 * (advantage vs Elementals) + the Spellcasting charges stay descriptive.
 */
import { describe, expect, it } from "vitest";
import { srd } from "../_harness/loc";
import { getMagicItem } from "@/data/magic-items";
import { evaluateGrants } from "@/lib/grants";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import type { SrdEquipmentRef } from "@/types/character";

const BUNDLE_KEY = "ring-of-elemental-command-plane";

/** Evaluate the ring through the full pipeline (equipped + attuned by default). */
function aggForRing(
  opts: { bundleChoices?: ReadonlyMap<string, string>; attuned?: boolean } = {}
) {
  const ref: SrdEquipmentRef = {
    srdId: "ring-of-elemental-command",
    equipped: true,
    attuned: opts.attuned ?? true,
  };
  return evaluateGrants(
    resolveAllGrantSources({ features: [], equipment: [ref] }),
    new Set(),
    opts.bundleChoices ?? new Map()
  );
}

describe("Ring of Elemental Command — declared shape", () => {
  const ring = getMagicItem("ring-of-elemental-command");

  it("is a legendary attunement ring", () => {
    expect(ring).toBeTruthy();
    expect(ring?.rarity).toBe("legendary");
    expect(ring?.type).toBe("ring");
    expect(ring?.attunement).toBe(true);
  });

  it("declares a single per-plane choice-grant-bundle with all four planes", () => {
    const bundle = ring?.grants?.find((g) => g.type === "choice-grant-bundle");
    expect(bundle, "bundle").toBeTruthy();
    if (bundle?.type !== "choice-grant-bundle") throw new Error("not a bundle");
    expect(bundle.bundleKey).toBe(BUNDLE_KEY);
    expect(bundle.options.map((o) => o.id).sort()).toEqual([
      "air",
      "earth",
      "fire",
      "water",
    ]);
  });

  it("each plane carries a language plus a resistance/immunity/movement grant", () => {
    const bundle = ring?.grants?.find((g) => g.type === "choice-grant-bundle");
    if (bundle?.type !== "choice-grant-bundle") throw new Error("not a bundle");
    for (const opt of bundle.options) {
      expect(
        opt.grants.some((g) => g.type === "language"),
        `${opt.id} language`
      ).toBe(true);
      // Each plane confers at least one defensive/mobility property.
      expect(opt.grants.length, `${opt.id} grant count`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("Ring of Elemental Command — override-first + attunement gating", () => {
  it("nothing applies until the player picks the linked plane", () => {
    const agg = aggForRing();
    expect(agg.damageResistances.size).toBe(0);
    expect(agg.damageImmunities.size).toBe(0);
    expect(agg.languages.size).toBe(0);
    const chooser = agg.grantBundles.find((b) => b.bundleKey === BUNDLE_KEY);
    expect(chooser?.selected).toBeNull();
    expect(chooser?.options.map((o) => o.id).sort()).toEqual([
      "air",
      "earth",
      "fire",
      "water",
    ]);
  });

  it("an unattuned ring contributes nothing even with a plane picked", () => {
    const agg = aggForRing({
      attuned: false,
      bundleChoices: new Map([[BUNDLE_KEY, "fire"]]),
    });
    expect(agg.damageImmunities.size).toBe(0);
    expect(agg.languages.size).toBe(0);
    expect(agg.grantBundles).toHaveLength(0);
  });
});

describe("Ring of Elemental Command — per-plane Elemental Focus", () => {
  it("Air → Auran, Lightning resistance, Fly Speed equal to walking", () => {
    const agg = aggForRing({ bundleChoices: new Map([[BUNDLE_KEY, "air"]]) });
    expect(agg.languages.has("Auran")).toBe(true);
    expect([...agg.damageResistances]).toEqual(["lightning"]);
    expect(agg.flySpeed).toBe("equal-to-walking");
    expect(agg.damageImmunities.size).toBe(0);
  });

  it("Earth → Terran, Acid resistance (no movement)", () => {
    const agg = aggForRing({ bundleChoices: new Map([[BUNDLE_KEY, "earth"]]) });
    expect(agg.languages.has("Terran")).toBe(true);
    expect([...agg.damageResistances]).toEqual(["acid"]);
    expect(agg.flySpeed).toBeNull();
    expect(agg.swimSpeed).toBeNull();
  });

  it("Fire → Ignan, Fire IMMUNITY (not resistance)", () => {
    const agg = aggForRing({ bundleChoices: new Map([[BUNDLE_KEY, "fire"]]) });
    expect(agg.languages.has("Ignan")).toBe(true);
    expect([...agg.damageImmunities]).toEqual(["fire"]);
    expect(agg.damageResistances.size).toBe(0);
  });

  it("Water → Aquan, Swim Speed 60", () => {
    const agg = aggForRing({ bundleChoices: new Map([[BUNDLE_KEY, "water"]]) });
    expect(agg.languages.has("Aquan")).toBe(true);
    expect(agg.swimSpeed).toBe(60);
    expect(agg.damageResistances.size).toBe(0);
    expect(agg.damageImmunities.size).toBe(0);
  });

  it("re-selecting the plane swaps every conferred property", () => {
    const fire = aggForRing({ bundleChoices: new Map([[BUNDLE_KEY, "fire"]]) });
    const water = aggForRing({ bundleChoices: new Map([[BUNDLE_KEY, "water"]]) });
    expect([...fire.damageImmunities]).toEqual(["fire"]);
    expect(water.damageImmunities.size).toBe(0);
    expect(water.swimSpeed).toBe(60);
    expect(fire.swimSpeed).toBeNull();
  });
});

describe("Ring of Elemental Command — bilingual content (golden rule 9)", () => {
  it("has non-empty EN + IT names + descriptions, no English leak in IT name", () => {
    const ring = getMagicItem("ring-of-elemental-command");
    expect(srd("magic-item", ring?.id ?? "", "name", "en")).toBeTruthy();
    expect(srd("magic-item", ring?.id ?? "", "name", "it")).toBeTruthy();
    expect(srd("magic-item", ring?.id ?? "", "name", "it")).not.toMatch(
      /\b(Command|Elemental|Ring|of)\b/
    );
    expect(srd("magic-item", ring?.id ?? "", "description", "en")).toBeTruthy();
    expect(srd("magic-item", ring?.id ?? "", "description", "it")).toBeTruthy();
    // The IT description must not be the verbatim English placeholder.
    expect(srd("magic-item", ring?.id ?? "", "description", "it")).not.toBe(
      srd("magic-item", ring?.id ?? "", "description", "en")
    );
    expect(srd("magic-item", ring?.id ?? "", "description", "it")).not.toContain(
      "Each Ring of Elemental Command"
    );
  });
});
