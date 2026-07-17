/**
 * Durable advantage/disadvantage rail — regression for the "wired but invisible"
 * gap. `advantage-on` clauses on saves/checks/initiative aggregated but rendered
 * NOWHERE (PlayTab only read the attack-roll ones). The ResourceRail now surfaces
 * the non-attack ones via `deriveAdvantageChips`. This pins:
 *   1. Barbarian Danger Sense declares the DEX-save advantage grant (was prose);
 *   2. a built Barbarian's aggregate yields the non-attack chips the rail renders.
 */
import { describe, expect, it } from "vitest";
import { classFeatureIndex } from "@/data/classes";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { deriveAdvantageChips } from "@/lib/views/sheet-view";
import { incomingAttackAdvantageVMs } from "@/lib/views/tracker-view";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import { loc } from "../_harness/loc";

// A Barbarian 7 (Danger Sense + Feral Instinct + Reckless Attack — all base-class).
const BARBARIAN_7: ScenarioSpec = {
  name: "Vokka, Berserker",
  raceId: "human",
  classId: "barbarian",
  subclassId: "berserker",
  level: 7,
  background: "soldier",
  abilityScores: { STR: 18, DEX: 14, CON: 16, INT: 8, WIS: 12, CHA: 10 },
};

// A Halfling (Brave — Advantage vs Frightened lives on the RACE, not features[]).
const HALFLING_ROGUE: ScenarioSpec = {
  name: "Pip, Thief",
  raceId: "halfling",
  classId: "rogue",
  subclassId: "thief",
  level: 5,
  background: "criminal",
  abilityScores: { STR: 10, DEX: 17, CON: 14, INT: 12, WIS: 12, CHA: 10 },
};

describe("Barbarian Danger Sense declares the DEX-save advantage", () => {
  it("carries the exact advantage-on(save) grant", () => {
    const grants = classFeatureIndex.get("barbarian-danger-sense")?.grants ?? [];
    // The grant's display `description` BiText was stripped to the SRD catalogue
    // (SLICE 7d); the mechanical fields (rollType / vs) remain.
    expect(grants.find((g) => g.type === "advantage-on")).toEqual({
      type: "advantage-on",
      rollType: "save",
      vs: "dex-save",
    });
  });
});

describe("Ranger Precise Hunter declares the attack advantage (G16)", () => {
  it("carries the exact advantage-on(attack) clause vs its target", () => {
    // The hunters-mark-target pattern — a stable `vs` token (never rendered to
    // the user; surfaced as the inline attack gloss). Its pack sibling (Paladin
    // Vow of Enmity) is pinned in content-pack/tests/unit/advantage-rail.pack.test.ts.
    const grants = classFeatureIndex.get("ranger-precise-hunter")?.grants ?? [];
    expect(grants.find((g) => g.type === "advantage-on")).toEqual({
      type: "advantage-on",
      rollType: "attack",
      vs: "hunters-mark-target",
    });
  });
});

describe("the rail surfaces durable non-attack advantages", () => {
  it("a Barbarian 7 yields DEX-save + initiative advantage chips (not attack)", () => {
    const doc = buildScenario(BARBARIAN_7);
    const aggregate = aggregateCharacterGrants(doc.character, doc.session);
    const railChips = deriveAdvantageChips(aggregate).filter(
      (c) => c.rollType !== "attack"
    );
    expect(railChips.some((c) => c.rollType === "save" && /dex/i.test(c.vs))).toBe(true);
    expect(railChips.some((c) => c.rollType === "initiative")).toBe(true);
  });

  it("surfaces Reckless Attack's defensive downside ONLY while the toggle is active", () => {
    // Reckless Attack's second RAW half — "attack rolls against YOU have
    // Advantage until your next turn" — is a SELF-side downside (your own
    // defenses worsen; no enemy modeling). It rides the SAME `while-active`
    // toggle as the offensive STR-attack advantage, so it lights only when the
    // player declares Reckless. The rail renders it as a clearly-framed downside.
    const doc = buildScenario(BARBARIAN_7); // Barbarian 7 → has Reckless

    // Toggle OFF → no incoming-attack-advantage downside reported.
    const off = aggregateCharacterGrants(doc.character, {
      ...doc.session,
      activeFeatures: [],
    });
    expect(off.incomingAttackAdvantages).toHaveLength(0);

    // Toggle ON → the marker resolves, carries the while-active key, and the
    // localized VM renders the defensive downside line.
    const on = aggregateCharacterGrants(doc.character, {
      ...doc.session,
      activeFeatures: ["barbarian-reckless-attack"],
    });
    expect(on.incomingAttackAdvantages).toHaveLength(1);
    const clause = on.incomingAttackAdvantages[0];
    if (!clause) throw new Error("clause missing");
    expect(clause.sourceId).toBe("barbarian-reckless-attack");
    expect(clause.whileActiveKey).toBe("barbarian-reckless-attack");

    const [vmEn] = incomingAttackAdvantageVMs(on.incomingAttackAdvantages, "en");
    if (!vmEn) throw new Error("vm missing");
    expect(vmEn.whileActive).toBe(true);
    expect(vmEn.description).toMatch(/attacks against you/i);
    const [vmIt] = incomingAttackAdvantageVMs(on.incomingAttackAdvantages, "it");
    if (!vmIt) throw new Error("vm missing");
    // Real IT — never an English leak.
    expect(vmIt.description).not.toMatch(/attacks against you/i);
    expect(vmIt.description.length).toBeGreaterThan(0);
  });

  it("does NOT double-count a species advantage (race traits live outside features[])", () => {
    // A Halfling's Brave (Advantage vs Frightened) must appear ONCE — `features[]`
    // excludes race traits (they resolve via resolveGrantSourcesForRace), so a
    // scenario/inferFeatures that wrongly put them in features[] would show twice.
    const aggregate = aggregateCharacterGrants(
      buildScenario(HALFLING_ROGUE).character,
      buildScenario(HALFLING_ROGUE).session
    );
    const frightened = aggregate.advantages.filter((c) =>
      /frightened/i.test(loc(c.description, "en"))
    );
    expect(frightened).toHaveLength(1);
  });
});
