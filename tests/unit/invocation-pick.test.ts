/**
 * Unit tests for the Eldritch Invocation picker helpers (M1).
 */

import { describe, it, expect } from "vitest";
import { srd } from "../_harness/loc";
import { getClassTable } from "@/data/classes";
import {
  isInvocationPlaceholder,
  invocationsKnownAt,
  newInvocationsAtLevel,
  minWarlockLevelFor,
  requiredInvocationIds,
  listInvocations,
  eligibleInvocations,
} from "@/lib/invocation-pick";

describe("isInvocationPlaceholder", () => {
  it("recognises warlock-eldritch-invocations", () => {
    expect(isInvocationPlaceholder("warlock-eldritch-invocations")).toBe(true);
  });
  it("rejects unrelated ids", () => {
    expect(isInvocationPlaceholder("warlock-pact-magic")).toBe(false);
    expect(isInvocationPlaceholder("")).toBe(false);
  });
});

describe("invocation prerequisite — localized SRD catalogue (EN + IT) (#40)", () => {
  it("renders the prerequisite natively in IT (not the EN prose)", () => {
    // eldritch-smite: 'Level 5+ Warlock, Pact of the Blade Invocation'.
    const en = srd("invocation", "eldritch-smite", "prerequisite", "en");
    const it = srd("invocation", "eldritch-smite", "prerequisite", "it");
    expect(en).toBe("Level 5+ Warlock, Pact of the Blade Invocation");
    // IT anchors on the official terms: Warlock (kept), 'Patto della Lama'.
    expect(it).toContain("Warlock di livello 5+");
    expect(it).toContain("Patto della Lama");
    expect(it).not.toBe(en); // no EN leak under the localized label
  });

  it("every invocation with a data prerequisite has a bilingual catalogue entry", () => {
    for (const inv of listInvocations()) {
      if (!inv.prerequisite) continue;
      expect(srd("invocation", inv.id, "prerequisite", "en").length).toBeGreaterThan(0);
      const it = srd("invocation", inv.id, "prerequisite", "it");
      expect(it.length).toBeGreaterThan(0);
      expect(it).not.toBe(srd("invocation", inv.id, "prerequisite", "en"));
    }
  });
});

describe("invocationsKnownAt — 2024 progression 1/3/5/6/7/8/9/10", () => {
  it("matches the 2024 RAW Eldritch Invocations column", () => {
    const got = Array.from({ length: 21 }, (_, lvl) => invocationsKnownAt(lvl));
    // index = warlock level (0..20)
    expect(got).toEqual([
      0, 1, 3, 3, 3, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10,
    ]);
  });

  it("is DERIVED from the class table (single source of truth — never drifts)", () => {
    const table = getClassTable("warlock");
    for (let lvl = 1; lvl <= 20; lvl++) {
      const fromTable = Number(
        table?.levels.find((l) => l.level === lvl)?.classSpecific?.invocationsKnown ?? -1
      );
      expect(invocationsKnownAt(lvl)).toBe(fromTable);
    }
  });
});

describe("newInvocationsAtLevel", () => {
  it("returns the right step at each grant level (2024)", () => {
    // 1@L1, +2@L2, +2@L5, +1@L7, +1@L9, +1@L12, +1@L15, +1@L18
    expect(newInvocationsAtLevel(1)).toBe(1);
    expect(newInvocationsAtLevel(2)).toBe(2);
    expect(newInvocationsAtLevel(5)).toBe(2);
    for (const lvl of [7, 9, 12, 15, 18]) {
      expect(newInvocationsAtLevel(lvl)).toBe(1);
    }
    for (const lvl of [3, 4, 6, 8, 10, 11, 13, 14, 16, 17, 19, 20]) {
      expect(newInvocationsAtLevel(lvl)).toBe(0);
    }
  });
});

describe("minWarlockLevelFor", () => {
  it("parses 'Level N+ Warlock' patterns", () => {
    expect(minWarlockLevelFor("Level 5+ Warlock")).toBe(5);
    expect(minWarlockLevelFor("Level 12+ Warlock, Thirsting Blade Invocation")).toBe(12);
  });

  it("returns 0 when no level requirement", () => {
    expect(minWarlockLevelFor("")).toBe(0);
    expect(minWarlockLevelFor("Pact of the Tome")).toBe(0);
  });
});

describe("listInvocations", () => {
  const list = listInvocations();

  it("returns 28 SRD invocations (matches wiki count)", () => {
    expect(list.length).toBe(28);
  });

  it("includes Witch Sight (was missing — the 28th 2024 PHB invocation)", () => {
    expect(list.map((i) => i.id)).toContain("witch-sight");
  });

  it("every entry has a non-empty EN name + description", () => {
    for (const inv of list) {
      expect(srd("invocation", inv.id, "name", "en")).toBeTruthy();
      expect(srd("invocation", inv.id, "description", "en")).toBeTruthy();
    }
  });

  it("includes the three Pact options (Pact of the Blade/Chain/Tome)", () => {
    const ids = list.map((i) => i.id);
    expect(ids).toContain("pact-of-the-blade");
    expect(ids).toContain("pact-of-the-chain");
    expect(ids).toContain("pact-of-the-tome");
  });

  it("is sorted by EN name ascending", () => {
    const names = list.map((i) => srd("invocation", i.id, "name", "en"));
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});

describe("eligibleInvocations", () => {
  it("filters out invocations the character already knows", () => {
    const ids = eligibleInvocations(20, ["agonizing-blast"]).map((i) => i.id);
    expect(ids).not.toContain("agonizing-blast");
  });

  it("filters out invocations whose Level prerequisite exceeds the character level", () => {
    const list5 = eligibleInvocations(5, []);
    // Devouring Blade requires Level 12+, must NOT appear at L5.
    expect(list5.map((i) => i.id)).not.toContain("devouring-blade");
    // At L12 the level gate clears, but Devouring Blade ALSO requires the
    // Thirsting Blade invocation — still gated until that is known.
    const list12NoDep = eligibleInvocations(12, []);
    expect(list12NoDep.map((i) => i.id)).not.toContain("devouring-blade");
    const list12WithDep = eligibleInvocations(12, [
      "pact-of-the-blade",
      "thirsting-blade",
    ]);
    expect(list12WithDep.map((i) => i.id)).toContain("devouring-blade");
  });

  it("allows level-0 (no requirement) invocations at any character level", () => {
    const list1 = eligibleInvocations(1, []);
    // Armor of Shadows has no prerequisite.
    expect(list1.map((i) => i.id)).toContain("armor-of-shadows");
  });
});

// ── Prerequisite primitive: named-invocation dependency enforcement ───────────

describe("requiredInvocationIds — structured prerequisite parsing", () => {
  it("extracts Pact of the Blade for Eldritch Smite / Lifedrinker", () => {
    expect(
      requiredInvocationIds("Level 5+ Warlock, Pact of the Blade Invocation")
    ).toEqual(["pact-of-the-blade"]);
    expect(
      requiredInvocationIds("Level 9+ Warlock, Pact of the Blade Invocation")
    ).toEqual(["pact-of-the-blade"]);
  });

  it("extracts Thirsting Blade for Devouring Blade and the other Pact deps", () => {
    expect(
      requiredInvocationIds("Level 12+ Warlock, Thirsting Blade Invocation")
    ).toEqual(["thirsting-blade"]);
    expect(
      requiredInvocationIds("Level 9+ Warlock, Pact of the Tome Invocation")
    ).toEqual(["pact-of-the-tome"]);
    expect(
      requiredInvocationIds("Level 5+ Warlock, Pact of the Chain Invocation")
    ).toEqual(["pact-of-the-chain"]);
  });

  it("returns [] when there is no named-invocation prerequisite", () => {
    expect(requiredInvocationIds("")).toEqual([]);
    expect(requiredInvocationIds("Level 5+ Warlock")).toEqual([]);
    // "a Warlock Cantrip That Deals Damage" is free text, not an invocation.
    expect(
      requiredInvocationIds("Level 2+ Warlock, a Warlock Cantrip That Deals Damage")
    ).toEqual([]);
  });

  it("never yields an id that is not a real invocation (free-text safety)", () => {
    expect(requiredInvocationIds("Some Made Up Invocation")).toEqual([]);
  });
});

describe("eligibleInvocations — named-invocation prerequisite", () => {
  it("gates Eldritch Smite behind Pact of the Blade (level alone is not enough)", () => {
    // L5 clears the level gate, but Pact of the Blade is not yet known.
    const withoutBlade = eligibleInvocations(5, []).map((i) => i.id);
    expect(withoutBlade).not.toContain("eldritch-smite");
    // Once Pact of the Blade is known, Eldritch Smite becomes eligible.
    const withBlade = eligibleInvocations(5, ["pact-of-the-blade"]).map((i) => i.id);
    expect(withBlade).toContain("eldritch-smite");
  });

  it("gates Lifedrinker behind Pact of the Blade at L9", () => {
    expect(eligibleInvocations(9, []).map((i) => i.id)).not.toContain("lifedrinker");
    expect(eligibleInvocations(9, ["pact-of-the-blade"]).map((i) => i.id)).toContain(
      "lifedrinker"
    );
  });

  it("still hides the dependent if the LEVEL is too low even with the prerequisite", () => {
    // Lifedrinker needs Level 9 — at L5 it stays hidden even with Pact of the Blade.
    expect(eligibleInvocations(5, ["pact-of-the-blade"]).map((i) => i.id)).not.toContain(
      "lifedrinker"
    );
  });
});
