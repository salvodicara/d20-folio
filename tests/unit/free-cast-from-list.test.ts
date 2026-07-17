/**
 * D4 — Cleric Divine Intervention as a free-cast-FROM-LIST mechanic.
 *
 * 2024 RAW (cleric:main, L10 Divine Intervention): "take the Magic action to cast
 * any Cleric spell of level 5 or lower without expending a spell slot … once per
 * Long Rest." (L20 Greater Divine Intervention extends the SAME pool to include Wish.)
 *
 * A genuinely NEW mechanic (no fixed-spell free-cast covers "pick any from a class
 * list"), so it gets its own test unit: the grant kind aggregates, the data carries
 * the descriptor, and the resolver produces the guided picker pool (Cleric ≤ 5th,
 * 6th+ excluded; Wish only with the L20 feature) + the per-rest tracker state.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { classFeatureIndex } from "@/data/classes";
import { resolveFreeCastFromList } from "@/lib/smart-tracker";
import { spellIndex } from "@/data/spells";
import { MOCK_CHARACTER } from "@/lib/mock";

describe("D4 — free-cast-from-list evaluator", () => {
  it("aggregates a free-cast-from-list grant into freeCastFromList", () => {
    const sources: GrantSource[] = [
      {
        id: "cleric-divine-intervention",
        name: { en: "Divine Intervention", it: "Intervento Divino" },
        grants: [
          {
            type: "free-cast-from-list",
            spellList: "cleric",
            maxSpellLevel: 5,
            chargesPerRest: 1,
            rest: "long",
            trackerId: "cleric-divine-intervention",
          },
        ],
      },
    ];
    const agg = evaluateGrants(sources);
    expect(agg.freeCastFromList).toHaveLength(1);
    expect(agg.freeCastFromList[0]).toMatchObject({
      sourceId: "cleric-divine-intervention",
      spellList: "cleric",
      maxSpellLevel: 5,
      chargesPerRest: 1,
      rest: "long",
      trackerId: "cleric-divine-intervention",
    });
  });

  it("defaults the trackerId to the source feature id when omitted", () => {
    const agg = evaluateGrants([
      {
        id: "src-feature",
        name: { en: "X", it: "X" },
        grants: [
          {
            type: "free-cast-from-list",
            spellList: "cleric",
            maxSpellLevel: 5,
            chargesPerRest: 1,
            rest: "long",
          },
        ],
      },
    ]);
    expect(agg.freeCastFromList[0]?.trackerId).toBe("src-feature");
  });

  it("the empty default has no free-cast-from-list pools", () => {
    expect(evaluateGrants([]).freeCastFromList).toEqual([]);
  });
});

describe("D4 — Divine Intervention data carries the descriptor (2024)", () => {
  it("cleric-divine-intervention has the free-cast-from-list grant (Cleric ≤ 5th, 1/LR)", () => {
    const f = classFeatureIndex.get("cleric-divine-intervention");
    expect(f?.grants).toContainEqual({
      type: "free-cast-from-list",
      spellList: "cleric",
      maxSpellLevel: 5,
      chargesPerRest: 1,
      rest: "long",
      trackerId: "cleric-divine-intervention",
    });
    // The 1/LR tracker is still present (the pool the cast debits).
    expect(f?.mechanics?.tracker).toMatchObject({ total: "1", recovery: "long-rest" });
  });
});

describe("D4 — resolveFreeCastFromList builds the guided picker pool", () => {
  function clericDoc(level: number, extraFeatures: string[] = []) {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.classes = [{ classId: "cleric", level }];
    doc.character.features = [
      { srdId: "cleric-divine-intervention" },
      ...extraFeatures.map((srdId) => ({ srdId })),
    ];
    return doc;
  }

  it("a L10 Cleric: the pool is every Cleric spell of level 1–5, 6th+ EXCLUDED", () => {
    const doc = clericDoc(10);
    const pools = resolveFreeCastFromList(doc);
    expect(pools).toHaveLength(1);
    const pool = pools[0];
    if (!pool) throw new Error("pool");
    expect(pool.spellIds.length).toBeGreaterThan(0);
    // Every offered spell is a Cleric spell of level 1–5.
    for (const id of pool.spellIds) {
      const data = spellIndex.get(id);
      expect(data).toBeDefined();
      expect(data?.level).toBeGreaterThanOrEqual(1);
      expect(data?.level).toBeLessThanOrEqual(5);
      expect(data?.classes.map((c) => c.toLowerCase())).toContain("cleric");
    }
    // A known 6th-level Cleric spell (Heal / Harm) is NOT offered.
    expect(pool.spellIds).not.toContain("heal");
    expect(pool.spellIds).not.toContain("harm");
    // A known ≤5th Cleric spell IS offered (Cure Wounds L1, Revivify L3).
    expect(pool.spellIds).toContain("cure-wounds");
    expect(pool.spellIds).toContain("revivify");
    // No cantrips (level 0) in the pool.
    for (const id of pool.spellIds) {
      expect(spellIndex.get(id)?.level).not.toBe(0);
    }
  });

  it("Wish is offered ONLY with the L20 Greater Divine Intervention feature", () => {
    const without = resolveFreeCastFromList(clericDoc(10))[0];
    expect(without?.spellIds).not.toContain("wish");
    const withL20 = resolveFreeCastFromList(
      clericDoc(20, ["cleric-improved-divine-intervention"])
    )[0];
    expect(withL20?.spellIds).toContain("wish");
  });

  it("reports the per-rest tracker state (1/LR, remaining reflects used)", () => {
    const doc = clericDoc(10);
    // Fresh: 1 charge, 1 remaining.
    expect(resolveFreeCastFromList(doc)[0]?.charges).toBe(1);
    expect(resolveFreeCastFromList(doc)[0]?.remaining).toBe(1);
    expect(resolveFreeCastFromList(doc)[0]?.rest).toBe("long");
    // Used once → 0 remaining.
    doc.session.trackers["cleric-divine-intervention"] = { used: 1 };
    expect(resolveFreeCastFromList(doc)[0]?.remaining).toBe(0);
  });

  it("a non-Cleric character has no free-cast-from-list pool", () => {
    const doc = structuredClone(MOCK_CHARACTER); // Bard
    expect(resolveFreeCastFromList(doc)).toEqual([]);
  });
});

// ── The FIXED-set pool shape (exactly N named spells debiting a shared,
//    cross-feature tracker). The shipped demonstrator (War God's Blessing,
//    cleric:war-domain) is PACK content — its data + resolver legs live in
//    content-pack/tests/unit/free-cast-from-list.pack.test.ts; the evaluator's
//    fixed-set aggregation stays pinned here over a synthetic grant.
describe("D4 — fixed-set free-cast-from-list (evaluator)", () => {
  it("aggregates the fixed-set grant (spellIds, no chargesPerRest/rest)", () => {
    const agg = evaluateGrants([
      {
        id: "cleric-war-war-gods-blessing",
        name: { en: "War God's Blessing", it: "Benedizione del Dio della Guerra" },
        grants: [
          {
            type: "free-cast-from-list",
            spellIds: ["shield-of-faith", "spiritual-weapon"],
            trackerId: "cleric-channel-divinity",
          },
        ],
      },
    ]);
    expect(agg.freeCastFromList).toHaveLength(1);
    const entry = agg.freeCastFromList[0];
    expect(entry?.spellIds).toEqual(["shield-of-faith", "spiritual-weapon"]);
    expect(entry?.trackerId).toBe("cleric-channel-divinity");
    expect(entry?.spellList).toBeUndefined();
    expect(entry?.chargesPerRest).toBeUndefined();
    expect(entry?.rest).toBeUndefined();
  });
});
