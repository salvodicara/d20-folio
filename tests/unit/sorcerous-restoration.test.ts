/**
 * H9 — Sorcerous Restoration (Sorcerer L5).
 *
 * Verified against the official IT SRD 5.2.1 PDF (page 81 — authoritative per
 * domain rule D2) and cross-checked against the EN 2024 wikidot mirror at
 * http://dnd2024.wikidot.com/sorcerer:main#Sorcerous-Restoration. Both
 * sources agree:
 *
 *   "When you finish a Short Rest, you can regain expended Sorcery Points,
 *   but no more than a number equal to half your Sorcerer level (round down).
 *   Once you use this feature, you can't do so again until you finish a
 *   Long Rest."
 *
 * Modeling: a 1/long-rest tracker on the feature itself (the player manually
 * spends the use; we never auto-modify pools without input — golden rule 21).
 */

import { describe, it, expect } from "vitest";
import { srd } from "../_harness/loc";
import { SORCERER_FEATURES } from "@/data/classes/sorcerer";

describe("Sorcerous Restoration — H9 / IT SRD 5.2.1 page 81", () => {
  const feat = SORCERER_FEATURES.find((f) => f.id === "sorcerer-sorcerous-restoration");

  it("exists in the sorcerer feature list", () => {
    expect(feat).toBeDefined();
  });

  it("is gained at level 5", () => {
    expect(feat?.level).toBe(5);
  });

  it("carries a 1/long-rest tracker (per-use gate)", () => {
    expect(feat?.mechanics?.tracker).toBeDefined();
    expect(feat?.mechanics?.tracker?.total).toBe("1");
    expect(feat?.mechanics?.tracker?.recovery).toBe("long-rest");
  });

  it("declares an action so the combat panel can surface it", () => {
    const actions = feat?.mechanics?.actions ?? [];
    expect(actions.length).toBeGreaterThan(0);
  });

  it("Italian name matches the official SRD casing ('Ripristino stregonesco', not Title Case)", () => {
    expect(srd("class-feature", feat?.id ?? "", "name", "it")).toBe(
      "Ripristino stregonesco"
    );
  });

  it("description mentions the 1/long-rest gate in both locales", () => {
    expect(
      srd("class-feature", feat?.id ?? "", "description", "en").toLowerCase()
    ).toContain("long rest");
    expect(
      srd("class-feature", feat?.id ?? "", "description", "it").toLowerCase()
    ).toContain("riposo lungo");
  });
});
