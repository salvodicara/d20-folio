/**
 * Phase 7 — Choice grants (Multi-choice ASI feats).
 *
 * 83+ SRD feats grant +1 to a PLAYER-CHOSEN ability (Athlete: STR/DEX/CON;
 * Heavy Armor Master: STR or CON; Skilled "any of your choice": all six).
 * The Grant union has a `choice-ability-score` variant; the evaluator
 * surfaces these as `pendingChoices` entries the level-up wizard can
 * use to drive a picker.
 *
 * For UI-redesign purposes the agent reading the data sees:
 * - `feat.grants[0].type === "choice-ability-score"`
 * - `feat.grants[0].abilities === ["STR", "CON"]`
 * - `feat.grants[0].amount === 1`
 *
 * That's enough to render "this feat lets you pick STR or CON".
 */

import { describe, it, expect } from "vitest";
import { SRD_FEATS } from "@/data/feats";
import { evaluateGrants, type GrantSource } from "@/lib/grants";

describe("Phase 7 — Choice-ASI feats expose declarative options", () => {
  const choiceFeats = SRD_FEATS.filter((f) =>
    (f.grants ?? []).some((g) => g.type === "choice-ability-score")
  );

  it("the SRD core's choice-ASI feats all declare the grant (Grappler + the epic boons)", () => {
    // 8 in the SRD 5.2.1 core (Grappler + 7 epic boons); the pack-mode breadth
    // (50+) is pinned in content-pack/tests/unit/grants-choice-asi.pack.test.ts.
    expect(choiceFeats.length).toBeGreaterThanOrEqual(8);
    expect(choiceFeats.map((f) => f.id)).toContain("grappler");
  });

  it("Grappler offers STR or DEX +1 (cap 20)", () => {
    const grappler = SRD_FEATS.find((f) => f.id === "grappler");
    expect(grappler).toBeDefined();
    const grant = grappler?.grants?.find((g) => g.type === "choice-ability-score");
    expect(grant?.type).toBe("choice-ability-score");
    if (grant?.type === "choice-ability-score") {
      expect([...grant.abilities].sort()).toEqual(["DEX", "STR"]);
      expect(grant.amount).toBe(1);
    }
  });

  it("Boon of Irresistible Offense offers STR / DEX +1 to a cap of 30 (epic boon)", () => {
    const boon = SRD_FEATS.find((f) => f.id === "boon-of-irresistible-offense");
    const grant = boon?.grants?.find((g) => g.type === "choice-ability-score");
    expect(grant?.type).toBe("choice-ability-score");
    if (grant?.type === "choice-ability-score") {
      expect([...grant.abilities].sort()).toEqual(["DEX", "STR"]);
      expect(grant.cap).toBe(30);
    }
  });
});

describe("Phase 7 — evaluator surfaces unresolved choices as pendingChoices", () => {
  it("a choice-ability-score grant becomes a pendingChoices entry", () => {
    const grappler = SRD_FEATS.find((f) => f.id === "grappler");
    expect(grappler).toBeDefined();
    if (!grappler) return;
    const src: GrantSource = { id: grappler.id, grants: grappler.grants };
    const agg = evaluateGrants([src]);
    // Unresolved → no concrete ability bump (and a feat source never enters the
    // magic-item-only additive channel regardless).
    expect(agg.itemAbilityScoreBonus.STR).toBe(0);
    expect(agg.itemAbilityScoreBonus.DEX).toBe(0);
    // But surfaced as a pending choice
    expect(agg.pendingChoices.length).toBe(1);
    const pc = agg.pendingChoices[0];
    expect(pc?.sourceId).toBe("grappler");
    expect(pc?.kind).toBe("ability-score");
    expect(pc?.amount).toBe(1);
    // Type-narrow on the discriminant before reading `abilities`.
    if (pc?.kind === "ability-score") {
      expect([...pc.abilities].sort()).toEqual(["DEX", "STR"]);
    }
  });

  it("multiple unresolved choices all surface", () => {
    const grappler = SRD_FEATS.find((f) => f.id === "grappler");
    const boon = SRD_FEATS.find((f) => f.id === "boon-of-irresistible-offense");
    expect(grappler).toBeDefined();
    expect(boon).toBeDefined();
    if (!grappler || !boon) return;
    const agg = evaluateGrants([
      { id: grappler.id, grants: grappler.grants },
      { id: boon.id, grants: boon.grants },
    ]);
    expect(agg.pendingChoices.length).toBe(2);
    expect(agg.pendingChoices.map((p) => p.sourceId).sort()).toEqual([
      "boon-of-irresistible-offense",
      "grappler",
    ]);
  });
});
