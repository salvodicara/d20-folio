/**
 * INVOCATION → GRANT seam.
 *
 * `resolveGrantSourcesForInvocations` turns a Warlock's chosen Eldritch
 * Invocation ids (`character.invocationChoices`) into grant sources from their
 * SRD rows, so a sense/speed-bearing invocation flows through `evaluateGrants`
 * exactly like a class feature or magic item. Invocations without grants
 * (free-cast / damage riders) emit no source.
 *
 * Verified against the 2024 PHB invocation list (warlock:eldritch-invocation):
 *   - Devil's Sight (L2+)  → darkvision 120 (closest sense to "see in darkness")
 *   - Witch Sight  (L15+)  → truesight 30
 *   - Gift of the Depths (L5+) → swim speed equal to walking
 */
import { describe, expect, it } from "vitest";
import { srd } from "../_harness/loc";
import {
  resolveGrantSourcesForInvocations,
  resolveGrantSourcesForMetamagic,
  resolveAllGrantSources,
} from "@/lib/resolve-grant-sources";
import { evaluateGrants } from "@/lib/grants";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { SRD_METAMAGIC } from "@/data/metamagic";

describe("resolveGrantSourcesForInvocations", () => {
  it("emits a grant source for a sense-bearing invocation", () => {
    const sources = resolveGrantSourcesForInvocations(["devils-sight"]);
    expect(sources.map((s) => s.id)).toEqual(["devils-sight"]);
    expect(sources[0]?.grants).toEqual([{ type: "darkvision", range: 120 }]);
  });

  it("emits nothing for a grant-less invocation (rider / prose-only)", () => {
    // Gaze of Two Minds is a pure-prose scrying-sense rider — no declarative
    // grant. (Eldritch Spear now carries a `cantrip-range-bonus` grant — see
    // cantrip-range-bonus-primitive.test.ts; Agonizing Blast carries a
    // `cantrip-damage-bonus`; Armor of Shadows et al. carry at-will-cast grants
    // — see at-will-cast-spell.test.ts; Eldritch Mind (M17) now carries an
    // `advantage-on` grant — see the dedicated assertion below.)
    expect(resolveGrantSourcesForInvocations(["gaze-of-two-minds"])).toEqual([]);
  });

  it("M17 — Eldritch Mind emits Advantage on Constitution saves to maintain Concentration", () => {
    const sources = resolveGrantSourcesForInvocations(["eldritch-mind"]);
    expect(sources.map((s) => s.id)).toEqual(["eldritch-mind"]);
    expect(sources[0]?.grants).toEqual([
      { type: "advantage-on", rollType: "save", vs: "concentration-con-save" },
    ]);
    expect(
      evaluateGrants(sources).advantages.some(
        (a) => a.rollType === "save" && a.vs === "concentration-con-save"
      )
    ).toBe(true);
  });

  it("emits a cantrip-range-bonus source for Eldritch Spear", () => {
    const sources = resolveGrantSourcesForInvocations(["eldritch-spear"]);
    expect(sources.map((s) => s.id)).toEqual(["eldritch-spear"]);
    expect(sources[0]?.grants).toEqual([
      {
        type: "cantrip-range-bonus",
        choiceKey: "eldritch-spear-cantrip",
        defaultSpellId: "eldritch-blast",
        bonusPerLevel: 30,
        scalesWith: "warlock",
      },
    ]);
  });

  it("emits a cantrip-damage-bonus source for Agonizing Blast", () => {
    const sources = resolveGrantSourcesForInvocations(["agonizing-blast"]);
    expect(sources.map((s) => s.id)).toEqual(["agonizing-blast"]);
    expect(sources[0]?.grants).toEqual([
      {
        type: "cantrip-damage-bonus",
        choiceKey: "agonizing-blast-cantrip",
        defaultSpellId: "eldritch-blast",
        ability: "CHA",
        value: "modifier",
        min: 0,
      },
    ]);
  });

  it("skips unknown ids defensively", () => {
    expect(resolveGrantSourcesForInvocations(["not-a-real-invocation"])).toEqual([]);
  });

  it("resolves multiple chosen invocations, preserving order", () => {
    const ids = resolveGrantSourcesForInvocations([
      "gift-of-the-depths",
      "gaze-of-two-minds", // grant-less, dropped
      "witch-sight",
    ]).map((s) => s.id);
    expect(ids).toEqual(["gift-of-the-depths", "witch-sight"]);
  });
});

describe("invocation grants flow through evaluateGrants", () => {
  it("Devil's Sight surfaces darkvision 120 via the aggregate", () => {
    const agg = evaluateGrants(resolveGrantSourcesForInvocations(["devils-sight"]));
    expect(agg.darkvisionFt).toBe(120);
  });

  it("Witch Sight surfaces truesight 30 via the aggregate", () => {
    const agg = evaluateGrants(resolveGrantSourcesForInvocations(["witch-sight"]));
    expect(agg.truesightFt).toBe(30);
  });

  it("Gift of the Depths surfaces an equal-to-walking swim speed", () => {
    const agg = evaluateGrants(resolveGrantSourcesForInvocations(["gift-of-the-depths"]));
    expect(agg.swimSpeed).toBe("equal-to-walking");
  });

  it("a Warlock WITH the invocation surfaces the grant; WITHOUT it, nothing", () => {
    const withInv = evaluateGrants(
      resolveAllGrantSources({
        features: [{ srdId: "warlock-eldritch-invocations" }],
        equipment: [],
        classes: [{ classId: "warlock", level: 1, invocationChoices: ["witch-sight"] }],
      })
    );
    const withoutInv = evaluateGrants(
      resolveAllGrantSources({
        features: [{ srdId: "warlock-eldritch-invocations" }],
        equipment: [],
        classes: [{ classId: "warlock", level: 1, invocationChoices: [] }],
      })
    );
    expect(withInv.truesightFt).toBe(30);
    expect(withoutInv.truesightFt).toBe(0);
  });

  it("omitting invocationChoices entirely (non-Warlock / legacy doc) contributes no invocation grants", () => {
    const agg = evaluateGrants(resolveAllGrantSources({ features: [], equipment: [] }));
    expect(agg.darkvisionFt).toBe(0);
    expect(agg.truesightFt).toBe(0);
    expect(agg.swimSpeed).toBeNull();
  });
});

describe("resolveGrantSourcesForMetamagic — the last source-seam (§5.2)", () => {
  it("emits nothing for the ten core 2024 options (per-cast modifiers, no standing grant)", () => {
    // Every core Metamagic option is a per-cast spell modifier resolved at the
    // cast layer, so none carries a standing grant — the seam exists, the data
    // carries no source today.
    expect(resolveGrantSourcesForMetamagic(SRD_METAMAGIC.map((m) => m.id))).toEqual([]);
  });

  it("skips unknown ids defensively", () => {
    expect(resolveGrantSourcesForMetamagic(["not-a-real-metamagic"])).toEqual([]);
  });

  it("preserves order + dedupes nothing across multiple chosen options", () => {
    // With no core option carrying grants, the resolver yields []; the contract
    // (one source per grant-bearing option, ref kind "metamagic") matches the
    // invocation resolver above and is exercised live via resolveAllGrantSources.
    expect(resolveGrantSourcesForMetamagic(["twinned-spell", "quickened-spell"])).toEqual(
      []
    );
  });

  it("metamagicChoices flows through resolveAllGrantSources (flattened across classes[])", () => {
    // The flatten + resolve path is wired; with only core options it contributes
    // no extra grants (no double-count, no crash) — the seam is inert-but-live.
    const agg = evaluateGrants(
      resolveAllGrantSources({
        features: [{ srdId: "sorcerer-metamagic" }],
        equipment: [],
        classes: [
          {
            classId: "sorcerer",
            level: 3,
            metamagicChoices: ["quickened-spell", "subtle-spell"],
          },
        ],
      })
    );
    // Core metamagic adds nothing to the aggregate (cast-layer modifiers).
    expect(agg.darkvisionFt).toBe(0);
  });
});

describe("invocation data integrity", () => {
  it("Witch Sight exists and is the L15 truesight invocation", () => {
    const witch = SRD_INVOCATIONS.find((i) => i.id === "witch-sight");
    expect(witch).toBeDefined();
    expect(witch?.prerequisite).toContain("Level 15+");
    expect(witch?.grants).toEqual([{ type: "truesight", range: 30 }]);
  });

  it("every grant-bearing sense/speed invocation has a non-empty IT name + description", () => {
    for (const id of ["devils-sight", "witch-sight", "gift-of-the-depths"]) {
      const inv = SRD_INVOCATIONS.find((i) => i.id === id);
      expect(inv, id).toBeDefined();
      expect(srd("invocation", inv?.id ?? "", "name", "it"), `${id} name.it`).not.toBe(
        ""
      );
      expect(
        srd("invocation", inv?.id ?? "", "description", "it"),
        `${id} description.it`
      ).not.toBe("");
    }
  });
});
