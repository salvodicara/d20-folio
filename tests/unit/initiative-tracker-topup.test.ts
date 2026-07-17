/**
 * Unit tests for the `initiative-tracker-topup` primitive.
 *
 * Covers both halves of the data↔logic seam:
 *  1. The grant aggregates into `AggregatedGrants.initiativeTrackerTopUps`
 *     (collect + sourceId), via `evaluateGrants`.
 *  2. The consumer `getInitiativeTrackerTopUps` resolves the named tracker's
 *     level-scaled total + the session `used` to compute the NEW `used` after
 *     rolling Initiative ("regain expended uses until you have `upTo`").
 *
 * Feature under test: 2024 Bard L18 Superior Inspiration — on rolling
 * Initiative you regain expended uses of Bardic Inspiration until you have TWO
 * (if you have fewer). Verified against dnd2024.wikidot.com/bard:main:
 *   "When you roll Initiative, you regain expended uses of Bardic Inspiration
 *    until you have two if you have fewer than that."
 */

import { describe, it, expect } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { foldLegacyClass } from "./_helpers";
import {
  emptyAggregate,
  evaluateGrants,
  type Grant,
  type GrantSource,
} from "@/lib/grants";
import { getInitiativeTrackerTopUps } from "@/lib/smart-tracker";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import type { CharacterDoc, SessionState } from "@/types/character";

const make = (id: string, grants: Grant[]): GrantSource => ({
  id,
  name: { en: id, it: id },
  grants,
});

// ─── 1. Aggregation ──────────────────────────────────────────────────────────

describe("evaluateGrants — initiative-tracker-topup aggregation", () => {
  it("no grant leaves the aggregate field an empty array", () => {
    expect(evaluateGrants([]).initiativeTrackerTopUps).toEqual([]);
    // and the field is part of the canonical empty aggregate
    expect(emptyAggregate().initiativeTrackerTopUps).toEqual([]);
  });

  it("collects a single top-up grant with its trackerId, upTo, and sourceId", () => {
    const out = evaluateGrants([
      make("bard-superior-inspiration", [
        {
          type: "initiative-tracker-topup",
          trackerId: "bard-bardic-inspiration",
          upTo: 2,
        },
      ]),
    ]);
    expect(out.initiativeTrackerTopUps).toEqual([
      {
        trackerId: "bard-bardic-inspiration",
        upTo: 2,
        sourceId: "bard-superior-inspiration",
      },
    ]);
  });

  it("collects multiple top-up grants (one entry per source)", () => {
    const out = evaluateGrants([
      make("feature-a", [
        { type: "initiative-tracker-topup", trackerId: "tracker-x", upTo: 1 },
      ]),
      make("feature-b", [
        { type: "initiative-tracker-topup", trackerId: "tracker-x", upTo: 3 },
      ]),
    ]);
    expect(out.initiativeTrackerTopUps).toHaveLength(2);
    expect(out.initiativeTrackerTopUps).toContainEqual({
      trackerId: "tracker-x",
      upTo: 1,
      sourceId: "feature-a",
    });
    expect(out.initiativeTrackerTopUps).toContainEqual({
      trackerId: "tracker-x",
      upTo: 3,
      sourceId: "feature-b",
    });
  });
});

// ─── 2. Consumer (getInitiativeTrackerTopUps) ────────────────────────────────

function mk(
  char: Partial<CharacterDoc["character"]> & {
    class?: string;
    classId?: string;
    subclass?: string;
    subclassId?: string;
    level?: number;
  } = {},
  session: Partial<SessionState> = {}
): CharacterDoc {
  return {
    id: "t",
    createdAt: new Date(),
    updatedAt: new Date(),
    portraitUrl: null,
    portraitCrop: null,
    shareId: null,
    status: "active",
    character: {
      name: assertNonEmptyString("Lyra"),
      quote: "",
      race: asRaceId("elf"),
      classes: [{ classId: "bard", subclassId: "college-of-lore", level: 18 }],
      background: "criminal",
      alignment: asAlignmentId("chaotic-good"),
      playerName: "",
      speed: "30 ft",
      ac: 14,
      armorNote: "",
      hp: { max: 100 },
      hitDieType: 8,
      languageIds: [],
      customLanguages: [],
      toolProficiencyIds: [],
      customToolProficiencies: [],
      abilityBudget: 27,
      proficiencyBonusOverride: null,
      levelUpChecklist: null,
      backgroundAsi: {},
      humanOriginFeat: "",
      bgFeat: "",
      lore: {
        traits: "",
        ideals: "",
        bonds: "",
        flaws: "",
        backstory: "",
        age: "",
        height: "",
        weight: "",
        eyes: "",
        hair: "",
        skin: "",
      },
      abilityScores: { STR: 8, DEX: 16, CON: 14, INT: 12, WIS: 10, CHA: 20 },
      savingThrows: ["DEX", "CHA"],
      skills: {},
      spellcasting: null,
      spellSlots: [],
      spells: [],
      weapons: [],
      equipment: [],
      features: [],
      combatAlgorithm: [],
      customConditions: [],
      sidebar: [],
      ...foldLegacyClass(char, "bard", "college-of-lore"),
    },
    session: {
      hp: { current: 100, temp: 0 },
      hitDice: { used: 0 },
      trackers: {},
      spellSlots: {},
      currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      concentration: "",
      initiative: "",
      conditions: [],
      deathSucc: 0,
      deathFail: 0,
      inspiration: false,
      exhaustion: 0,
      pinnedActions: [],
      unpinnedActions: [],
      notes: "",
      logEntries: [],
      ...session,
    },
  };
}

/** A Bard L18 with both Bardic Inspiration and Superior Inspiration features. */
const SUPERIOR_BARD_FEATURES = [
  { srdId: "bard-bardic-inspiration" },
  { srdId: "bard-superior-inspiration" },
];

describe("getInitiativeTrackerTopUps — Superior Inspiration (Bard L18)", () => {
  it("regains expended uses up to TWO when fully expended", () => {
    // 2024 Bard uses = CHA mod (min 1). The setup has CHA 20 → total 5.
    // used = 5 (all spent) → remaining must be >= 2 → used drops to 3.
    const m = getInitiativeTrackerTopUps(
      mk(
        { features: SUPERIOR_BARD_FEATURES },
        { trackers: { "bard-bardic-inspiration": { used: 5 } } }
      )
    );
    expect(m.get("bard-bardic-inspiration")).toBe(3);
  });

  it("tops up to exactly two remaining when one use is left", () => {
    // total 5, used 4 → remaining 1 → top up to remaining 2 → used 3.
    const m = getInitiativeTrackerTopUps(
      mk(
        { features: SUPERIOR_BARD_FEATURES },
        { trackers: { "bard-bardic-inspiration": { used: 4 } } }
      )
    );
    expect(m.get("bard-bardic-inspiration")).toBe(3);
  });

  it("is a no-op when the character already has two or more remaining", () => {
    // total 5, used 3 → remaining 2 → already at floor → omitted from the map.
    const m = getInitiativeTrackerTopUps(
      mk(
        { features: SUPERIOR_BARD_FEATURES },
        { trackers: { "bard-bardic-inspiration": { used: 3 } } }
      )
    );
    expect(m.has("bard-bardic-inspiration")).toBe(false);
  });

  it("is a no-op at full uses (nothing expended)", () => {
    const m = getInitiativeTrackerTopUps(
      mk(
        { features: SUPERIOR_BARD_FEATURES },
        { trackers: { "bard-bardic-inspiration": { used: 0 } } }
      )
    );
    expect(m.has("bard-bardic-inspiration")).toBe(false);
  });

  it("treats a missing tracker entry as fully available (no-op)", () => {
    const m = getInitiativeTrackerTopUps(mk({ features: SUPERIOR_BARD_FEATURES }));
    expect(m.has("bard-bardic-inspiration")).toBe(false);
  });

  it("returns an empty map for a Bard without Superior Inspiration", () => {
    // Only the L1 tracker feature, no L18 top-up grant.
    const m = getInitiativeTrackerTopUps(
      mk(
        { level: 5, features: [{ srdId: "bard-bardic-inspiration" }] },
        { trackers: { "bard-bardic-inspiration": { used: 3 } } }
      )
    );
    expect(m.size).toBe(0);
  });
});

describe("getInitiativeTrackerTopUps — total floor + override-first", () => {
  it("never restores beyond the tracker's resolved total (low-total clamp)", () => {
    // Force a low total via trackerOverrides (override-first): total 1, used 1.
    // Floor is min(upTo=2, total=1) = 1, so remaining → 1 → used → 0.
    const m = getInitiativeTrackerTopUps(
      mk(
        {
          features: [
            {
              srdId: "bard-bardic-inspiration",
              trackerOverrides: { total: "1" },
            },
            { srdId: "bard-superior-inspiration" },
          ],
        },
        { trackers: { "bard-bardic-inspiration": { used: 1 } } }
      )
    );
    // Restored to full (the only die available) — used 0, never negative.
    expect(m.get("bard-bardic-inspiration")).toBe(0);
  });

  it("honors a trackerOverrides total when computing the top-up (override-first)", () => {
    // Override total to 5 (override-first), used 5 → remaining 0 → floor 2 →
    // remaining 2 → used 3.
    const m = getInitiativeTrackerTopUps(
      mk(
        {
          features: [
            {
              srdId: "bard-bardic-inspiration",
              trackerOverrides: { total: "5" },
            },
            { srdId: "bard-superior-inspiration" },
          ],
        },
        { trackers: { "bard-bardic-inspiration": { used: 5 } } }
      )
    );
    expect(m.get("bard-bardic-inspiration")).toBe(3);
  });
});

describe("data wiring — bard-superior-inspiration carries the grant", () => {
  it("the real SRD feature emits a top-up grant for the Bardic Inspiration tracker (upTo 2)", () => {
    const sources = resolveGrantSourcesForFeatures([
      { srdId: "bard-superior-inspiration" },
    ]);
    const out = evaluateGrants(sources);
    expect(out.initiativeTrackerTopUps).toEqual([
      {
        trackerId: "bard-bardic-inspiration",
        upTo: 2,
        sourceId: "bard-superior-inspiration",
      },
    ]);
  });
});

describe("evaluateGrants — multi-source max merge inputs", () => {
  it("keeps every source so the consumer can take the higher upTo", () => {
    const out = evaluateGrants([
      make("src-low", [
        {
          type: "initiative-tracker-topup",
          trackerId: "bard-bardic-inspiration",
          upTo: 2,
        },
      ]),
      make("src-high", [
        {
          type: "initiative-tracker-topup",
          trackerId: "bard-bardic-inspiration",
          upTo: 4,
        },
      ]),
    ]);
    const ups = out.initiativeTrackerTopUps.filter(
      (u) => u.trackerId === "bard-bardic-inspiration"
    );
    expect(ups).toHaveLength(2);
    expect(Math.max(...ups.map((u) => u.upTo))).toBe(4);
  });
});
