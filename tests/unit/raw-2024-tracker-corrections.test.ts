/**
 * 2024 PHB RAW corrections — regression guards for tracker totals.
 *
 * Two features in the class data had quietly-wrong tracker totals that
 * drifted from the published 2024 PHB values during early data entry.
 * This file pins each value to the authoritative reading so a future
 * agent's "looks right to me" edit can't regress.
 *
 * Sources verified against http://dnd2024.wikidot.com (which mirrors the
 * 2024 SRD) and the Italian PDF SRD 5.2.1 for the EN-side mechanics.
 */
import { describe, expect, it } from "vitest";
import { srd } from "../_harness/loc";
import { classFeatureIndex } from "@/data/classes";

describe("Sorcerer Innate Sorcery — 2 uses per long rest (NOT PB)", () => {
  const feat = classFeatureIndex.get("sorcerer-innate-sorcery");

  it("feature is registered in the class index", () => {
    expect(feat).toBeDefined();
  });

  it("tracker total is the literal '2', not the PB formula", () => {
    // 2024 PHB Sorcerer L1: "You can use this feature TWICE..."
    expect(feat?.mechanics?.tracker?.total).toBe("2");
  });

  it("recovery is long-rest", () => {
    expect(feat?.mechanics?.tracker?.recovery).toBe("long-rest");
  });
});

describe("Sorcerer Arcane Apotheosis — 2024 RAW Metamagic wording (NOT UA)", () => {
  // 2024 PHB Sorcerer L20, verified against http://dnd2024.wikidot.com/sorcerer:main:
  // "While your Innate Sorcery feature is active, you can use one Metamagic
  //  option on each of your turns without spending Sorcery Points on it."
  // The prior text was the UA/2014 "spend 1 Sorcery Point to cast any spell of
  // 5th level or lower without expending a spell slot" wording.
  const feat = classFeatureIndex.get("sorcerer-arcane-apotheosis");

  it("feature is registered in the class index", () => {
    expect(feat).toBeDefined();
  });

  it("EN description describes the Metamagic-without-Sorcery-Points capstone", () => {
    expect(srd("class-feature", feat?.id ?? "", "description", "en")).toContain(
      "Metamagic"
    );
    expect(srd("class-feature", feat?.id ?? "", "description", "en")).toContain(
      "Innate Sorcery"
    );
    expect(srd("class-feature", feat?.id ?? "", "description", "en")).toContain(
      "Sorcery Points"
    );
    // Must NOT carry the stale UA wording.
    expect(srd("class-feature", feat?.id ?? "", "description", "en")).not.toContain(
      "5th level or lower"
    );
    expect(srd("class-feature", feat?.id ?? "", "description", "en")).not.toContain(
      "without expending a spell slot"
    );
  });

  it("IT description is non-empty and uses the official Metamagia term", () => {
    expect(
      srd("class-feature", feat?.id ?? "", "description", "it").trim().length
    ).toBeGreaterThan(0);
    expect(srd("class-feature", feat?.id ?? "", "description", "it")).toContain(
      "Metamagia"
    );
  });
});

describe("Druid Wild Shape — 2/3/4 uses scaling, partial short-rest", () => {
  const feat = classFeatureIndex.get("druid-wild-shape");

  it("feature is registered in the class index", () => {
    expect(feat).toBeDefined();
  });

  it("starts at 2 uses, scales to 3 at L6, then 4 at L17 (NOT 'PB')", () => {
    // 2024 PHB Druid L2 verified against
    // http://dnd2024.wikidot.com/druid:main — the prior `total: "PB"`
    // would have produced 2/3/4/5/6, off by 2 at the top tier.
    expect(feat?.mechanics?.tracker?.total).toBe("2");
    const at6 = feat?.mechanics?.tracker?.levels?.find((l) => l.from === 6);
    const at17 = feat?.mechanics?.tracker?.levels?.find((l) => l.from === 17);
    expect(at6?.total).toBe("3");
    expect(at17?.total).toBe("4");
  });

  it("recovery is short-rest with partial 1-use short-rest recovery", () => {
    expect(feat?.mechanics?.tracker?.recovery).toBe("short-rest");
    expect(feat?.mechanics?.tracker?.shortRestRecovery).toBe(1);
  });
});

describe("Paladin Channel Divinity — 2 → 3 at L11, partial short-rest", () => {
  const feat = classFeatureIndex.get("paladin-channel-divinity");

  it("feature is registered in the class index", () => {
    expect(feat).toBeDefined();
  });

  it("starts at 2 uses, scales to 3 at L11", () => {
    expect(feat?.mechanics?.tracker?.total).toBe("2");
    const at11 = feat?.mechanics?.tracker?.levels?.find((l) => l.from === 11);
    expect(at11?.total).toBe("3");
  });

  it("recovery is short-rest with partial 1-use short-rest recovery", () => {
    expect(feat?.mechanics?.tracker?.recovery).toBe("short-rest");
    expect(feat?.mechanics?.tracker?.shortRestRecovery).toBe(1);
  });
});

describe("Cleric Channel Divinity — 2/3/4 uses scaling, partial short-rest", () => {
  const feat = classFeatureIndex.get("cleric-channel-divinity");

  it("feature is registered in the class index", () => {
    expect(feat).toBeDefined();
  });

  it("starts at 2 uses at L2 (NOT 1)", () => {
    // 2024 PHB Cleric L2: "You can use this class's Channel Divinity TWICE."
    expect(feat?.mechanics?.tracker?.total).toBe("2");
  });

  it("level-up table scales to 3 at L6 and 4 at L18", () => {
    const lvls = feat?.mechanics?.tracker?.levels;
    expect(lvls).toBeDefined();
    const at6 = lvls?.find((l) => l.from === 6);
    const at18 = lvls?.find((l) => l.from === 18);
    expect(at6?.total).toBe("3");
    expect(at18?.total).toBe("4");
  });

  it("recovery is short-rest with partial 1-use short-rest recovery", () => {
    // RAW: "regain ONE of its expended uses when you finish a Short Rest,
    // and regain all expended uses when you finish a Long Rest."
    expect(feat?.mechanics?.tracker?.recovery).toBe("short-rest");
    expect(feat?.mechanics?.tracker?.shortRestRecovery).toBe(1);
  });
});

// ── Batch F — tracker corrections (verified vs the consolidated wikidot
//    :main pages on 2026-05-29) ────────────────────────────────────────────

describe("Ranger Tireless / Nature's Veil — uses = WIS modifier (NOT PB)", () => {
  it("Tireless uses scale with Wisdom, not Proficiency Bonus", () => {
    // RAW: "use this action a number of times equal to your Wisdom modifier."
    const feat = classFeatureIndex.get("ranger-tireless");
    expect(feat?.mechanics?.tracker?.total).toBe("WIS");
    expect(feat?.mechanics?.tracker?.die).toBe("d8");
  });

  it("Nature's Veil uses scale with Wisdom, not Proficiency Bonus", () => {
    const feat = classFeatureIndex.get("ranger-natures-veil");
    expect(feat?.mechanics?.tracker?.total).toBe("WIS");
  });
});

describe("Ranger Favored Enemy — Hunter's Mark free casts 2/3/4/5/6", () => {
  const feat = classFeatureIndex.get("ranger-favored-enemy");

  it("starts at 2, scaling to 3/4/5/6 at L5/9/13/17", () => {
    expect(feat?.mechanics?.tracker?.total).toBe("2");
    const lvls = feat?.mechanics?.tracker?.levels;
    expect(lvls?.find((l) => l.from === 5)?.total).toBe("3");
    expect(lvls?.find((l) => l.from === 9)?.total).toBe("4");
    expect(lvls?.find((l) => l.from === 13)?.total).toBe("5");
    expect(lvls?.find((l) => l.from === 17)?.total).toBe("6");
  });
});

// (The maneuver-Fighter / Rogue Soulknife / Monk Shadow Arts pins — pack
// subclasses — live in
// `content-pack/tests/unit/raw-2024-tracker-corrections.pack.test.ts`.)

describe("Druid Wild Resurgence — 1/Long-Rest Wild-Shape → Level-1-slot", () => {
  const feat = classFeatureIndex.get("druid-wild-resurgence");

  it("has a 1/long-rest tracker for the conversion", () => {
    expect(feat?.mechanics?.tracker?.total).toBe("1");
    expect(feat?.mechanics?.tracker?.recovery).toBe("long-rest");
  });

  it("description says Level 1 slot, not 'level 3'", () => {
    expect(srd("class-feature", feat?.id ?? "", "description", "en")).toContain(
      "Level 1 spell slot"
    );
    expect(srd("class-feature", feat?.id ?? "", "description", "en")).not.toContain(
      "level 3"
    );
  });
});

// (Artificer Flash of Genius — pack class — lives in
// `content-pack/tests/unit/raw-2024-tracker-corrections.pack.test.ts`.)
