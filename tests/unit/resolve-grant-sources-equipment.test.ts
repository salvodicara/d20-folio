/**
 * L2 — equipment → grant pipeline.
 *
 * `resolveGrantSourcesForEquipment` turns equipped, attunement-satisfied SRD
 * equipment refs into grant sources (from their magic-item rows), gated
 * identically to `computeAC`:
 *   - `equipped === true` (worn/wielded), AND
 *   - attunement satisfied — an item whose SRD data has `attunement: true`
 *     grants nothing until `attuned === true` (`undefined` = never attuned).
 *
 * `resolveAllGrantSources` combines feature + equipment sources — the
 * canonical input to `evaluateGrants` for sheet-wide derivation.
 *
 * Fixtures: armor-plus-1 (attunement:false, ac-bonus:1), ring-of-protection
 * (attunement:true, ac-bonus:1).
 */
import { describe, expect, it } from "vitest";
import {
  resolveGrantSourcesForEquipment,
  resolveAllGrantSources,
} from "@/lib/resolve-grant-sources";
import { evaluateGrants } from "@/lib/grants";
import type { SrdEquipmentRef, CustomEquipment } from "@/types/character";

describe("resolveGrantSourcesForEquipment — activity gate", () => {
  it("includes an equipped, non-attunement magic item", () => {
    const eq: SrdEquipmentRef[] = [{ srdId: "armor-plus-1", equipped: true }];
    const sources = resolveGrantSourcesForEquipment(eq);
    expect(sources.map((s) => s.id)).toEqual(["armor-plus-1"]);
    expect(sources[0]?.grants).toBeTruthy();
  });

  it("excludes an unequipped item (equipped !== true)", () => {
    expect(resolveGrantSourcesForEquipment([{ srdId: "armor-plus-1" }])).toEqual([]);
    expect(
      resolveGrantSourcesForEquipment([{ srdId: "armor-plus-1", equipped: false }])
    ).toEqual([]);
  });

  it("excludes an attunement item that is not yet attuned (attuned === false)", () => {
    const eq: SrdEquipmentRef[] = [
      { srdId: "ring-of-protection", equipped: true, attuned: false },
    ];
    expect(resolveGrantSourcesForEquipment(eq)).toEqual([]);
  });

  // Issue #37: a minimally-stored (hand-written) ref of an attunement-required
  // item leaves `attuned` undefined — which is NOT attuned. It must contribute
  // nothing until the player actually attunes (previously it granted effects).
  it("excludes an attunement item with attuned === undefined (never attuned)", () => {
    const eq: SrdEquipmentRef[] = [{ srdId: "ring-of-protection", equipped: true }];
    expect(resolveGrantSourcesForEquipment(eq)).toEqual([]);
  });

  it("includes an attunement item once attuned (equipped + attuned true)", () => {
    const eq: SrdEquipmentRef[] = [
      { srdId: "ring-of-protection", equipped: true, attuned: true },
    ];
    expect(resolveGrantSourcesForEquipment(eq).map((s) => s.id)).toEqual([
      "ring-of-protection",
    ]);
  });

  it("skips custom equipment (no SRD grants)", () => {
    const custom: CustomEquipment = {
      custom: true,
      name: "Homebrew Cloak",
      equipped: true,
    };
    expect(resolveGrantSourcesForEquipment([custom])).toEqual([]);
  });

  it("skips a non-magic-item srdId (plain gear has no grants)", () => {
    expect(
      resolveGrantSourcesForEquipment([{ srdId: "longsword", equipped: true }])
    ).toEqual([]);
  });
});

describe("resolveAllGrantSources — features + equipment", () => {
  it("combines feature sources and equipped magic-item sources", () => {
    const sources = resolveAllGrantSources({
      features: [{ srdId: "barbarian-primal-champion" }],
      equipment: [{ srdId: "armor-plus-1", equipped: true }],
    });
    const ids = sources.map((s) => s.id);
    expect(ids).toContain("barbarian-primal-champion");
    expect(ids).toContain("armor-plus-1");
  });

  it("an equipped magic item's grant flows through evaluateGrants (e.g. acBonus aggregate)", () => {
    const before = evaluateGrants(
      resolveAllGrantSources({ features: [], equipment: [] })
    );
    const after = evaluateGrants(
      resolveAllGrantSources({
        features: [],
        equipment: [{ srdId: "armor-plus-1", equipped: true }],
      })
    );
    // armor-plus-1 declares ac-bonus:1 — proves the equipment grant reaches the aggregate.
    expect(after.acBonus).toBe(before.acBonus + 1);
  });

  it("an unattuned attunement item contributes nothing to the aggregate", () => {
    const agg = evaluateGrants(
      resolveAllGrantSources({
        features: [],
        equipment: [{ srdId: "ring-of-protection", equipped: true, attuned: false }],
      })
    );
    expect(agg.acBonus).toBe(0);
  });

  // Issue #37: same for the undefined-attunement path (the actual live-data bug).
  it("an attunement item with attuned undefined contributes nothing to the aggregate", () => {
    const agg = evaluateGrants(
      resolveAllGrantSources({
        features: [],
        equipment: [{ srdId: "ring-of-protection", equipped: true }],
      })
    );
    expect(agg.acBonus).toBe(0);
    expect(agg.saveBonusFlat).toBe(0);
  });
});
