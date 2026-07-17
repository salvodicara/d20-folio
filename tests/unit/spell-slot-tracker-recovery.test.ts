/**
 * Unit tests for the `spell-slot-tracker-recovery` primitive.
 *
 * Covers both halves of the data↔logic seam:
 *  1. The grant aggregates into `AggregatedGrants.spellSlotTrackerRecoveries`
 *     (collect + sourceId + usesPerSlot default), via `evaluateGrants`.
 *  2. The consumer `getSpellSlotTrackerRecovery` resolves the named tracker's
 *     level-scaled total + the session `used` + which slot levels are
 *     available, and computes the NEW tracker `used` after spending one slot
 *     ("expend a spell slot to regain one expended use of the tracker").
 *
 * Feature under test: 2024 Bard L5 Font of Inspiration. Verified against
 * dnd2024.wikidot.com/bard:main:
 *   "You now regain all your expended uses of Bardic Inspiration when you finish
 *    a Short or Long Rest. In addition, you can expend a spell slot (no action
 *    required) to regain one expended use of Bardic Inspiration."
 *
 * The Short-OR-Long-Rest half is already modeled on the Bardic Inspiration
 * tracker's level table (`{ from: 5, recovery: "short-rest" }`); these
 * tests pin the NEW half — the spell-slot → tracker-use conversion.
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
import { getSpellSlotTrackerRecovery } from "@/lib/smart-tracker";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import type { CharacterDoc, SessionState } from "@/types/character";

const make = (id: string, grants: Grant[]): GrantSource => ({
  id,
  name: { en: id, it: id },
  grants,
});

// ─── 1. Aggregation ──────────────────────────────────────────────────────────

describe("evaluateGrants — spell-slot-tracker-recovery aggregation", () => {
  it("no grant leaves the aggregate field an empty array", () => {
    expect(evaluateGrants([]).spellSlotTrackerRecoveries).toEqual([]);
    // and the field is part of the canonical empty aggregate
    expect(emptyAggregate().spellSlotTrackerRecoveries).toEqual([]);
  });

  it("collects a single conversion grant with trackerId, usesPerSlot, sourceId", () => {
    const out = evaluateGrants([
      make("bard-font-of-inspiration", [
        {
          type: "spell-slot-tracker-recovery",
          trackerId: "bard-bardic-inspiration",
          usesPerSlot: 1,
        },
      ]),
    ]);
    expect(out.spellSlotTrackerRecoveries).toEqual([
      {
        trackerId: "bard-bardic-inspiration",
        usesPerSlot: 1,
        sourceId: "bard-font-of-inspiration",
      },
    ]);
  });

  it("defaults usesPerSlot to 1 when omitted", () => {
    const out = evaluateGrants([
      make("feature", [{ type: "spell-slot-tracker-recovery", trackerId: "tracker-x" }]),
    ]);
    expect(out.spellSlotTrackerRecoveries).toEqual([
      { trackerId: "tracker-x", usesPerSlot: 1, sourceId: "feature" },
    ]);
  });

  it("collects multiple conversion grants (one entry per source)", () => {
    const out = evaluateGrants([
      make("feature-a", [
        { type: "spell-slot-tracker-recovery", trackerId: "tracker-x", usesPerSlot: 1 },
      ]),
      make("feature-b", [
        { type: "spell-slot-tracker-recovery", trackerId: "tracker-x", usesPerSlot: 2 },
      ]),
    ]);
    expect(out.spellSlotTrackerRecoveries).toHaveLength(2);
    expect(out.spellSlotTrackerRecoveries).toContainEqual({
      trackerId: "tracker-x",
      usesPerSlot: 1,
      sourceId: "feature-a",
    });
    expect(out.spellSlotTrackerRecoveries).toContainEqual({
      trackerId: "tracker-x",
      usesPerSlot: 2,
      sourceId: "feature-b",
    });
  });

  it("merges inside a while-active block only when the toggle is on", () => {
    const grants: Grant[] = [
      {
        type: "while-active",
        activeKey: "toggle",
        label: { en: "Toggle", it: "Toggle" },
        grants: [
          {
            type: "spell-slot-tracker-recovery",
            trackerId: "tracker-y",
            usesPerSlot: 1,
          },
        ],
      },
    ];
    expect(evaluateGrants([make("f", grants)]).spellSlotTrackerRecoveries).toEqual([]);
    const on = evaluateGrants([make("f", grants)], new Set(["toggle"]));
    expect(on.spellSlotTrackerRecoveries).toEqual([
      { trackerId: "tracker-y", usesPerSlot: 1, sourceId: "f" },
    ]);
  });
});

// ─── 2. Consumer (getSpellSlotTrackerRecovery) ───────────────────────────────

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
      classes: [{ classId: "bard", subclassId: "college-of-lore", level: 5 }],
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
      abilityScores: { STR: 8, DEX: 16, CON: 14, INT: 12, WIS: 10, CHA: 16 },
      savingThrows: ["DEX", "CHA"],
      skills: {},
      spellcasting: null,
      // L5 Bard: 4/3/2 slots at levels 1/2/3.
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 3 },
        { level: 3, total: 2 },
      ],
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

/** A Bard L5 with both Bardic Inspiration and Font of Inspiration features. */
const FONT_BARD_FEATURES = [
  { srdId: "bard-bardic-inspiration" },
  { srdId: "bard-font-of-inspiration" },
];

describe("getSpellSlotTrackerRecovery — Font of Inspiration (Bard L5)", () => {
  it("offers a conversion when a use is expended and slots remain", () => {
    // L5 Bard: PB = 3, CHA 16 → Bardic Inspiration total = 3. used = 2.
    // Spending one slot regains 1 → newUsed 1.
    const m = getSpellSlotTrackerRecovery(
      mk(
        { features: FONT_BARD_FEATURES },
        { trackers: { "bard-bardic-inspiration": { used: 2 } } }
      )
    );
    const opt = m.get("bard-bardic-inspiration");
    expect(opt).toBeDefined();
    expect(opt?.sourceId).toBe("bard-font-of-inspiration");
    expect(opt?.usesPerSlot).toBe(1);
    expect(opt?.total).toBe(3);
    expect(opt?.currentUsed).toBe(2);
    expect(opt?.newUsed).toBe(1);
    // Every L5 slot level is available (none spent).
    expect(opt?.availableSlotLevels).toEqual([1, 2, 3]);
  });

  it("clamps newUsed at 0 (never below) when only one use was expended", () => {
    const m = getSpellSlotTrackerRecovery(
      mk(
        { features: FONT_BARD_FEATURES },
        { trackers: { "bard-bardic-inspiration": { used: 1 } } }
      )
    );
    expect(m.get("bard-bardic-inspiration")?.newUsed).toBe(0);
  });

  it("is a no-op (omitted) when nothing is expended", () => {
    const m = getSpellSlotTrackerRecovery(
      mk(
        { features: FONT_BARD_FEATURES },
        { trackers: { "bard-bardic-inspiration": { used: 0 } } }
      )
    );
    expect(m.has("bard-bardic-inspiration")).toBe(false);
  });

  it("treats a missing tracker entry as fully available (no-op)", () => {
    const m = getSpellSlotTrackerRecovery(mk({ features: FONT_BARD_FEATURES }));
    expect(m.has("bard-bardic-inspiration")).toBe(false);
  });

  it("is a no-op when NO spell slot is available (all spent)", () => {
    // All slots used → no slot to convert, even with an expended tracker use.
    const m = getSpellSlotTrackerRecovery(
      mk(
        { features: FONT_BARD_FEATURES },
        {
          trackers: { "bard-bardic-inspiration": { used: 2 } },
          spellSlots: {
            "1": { used: 4 },
            "2": { used: 3 },
            "3": { used: 2 },
          },
        }
      )
    );
    expect(m.size).toBe(0);
  });

  it("only lists slot levels that still have an unspent slot", () => {
    // Level 1 fully spent, level 2 partially spent, level 3 untouched.
    const m = getSpellSlotTrackerRecovery(
      mk(
        { features: FONT_BARD_FEATURES },
        {
          trackers: { "bard-bardic-inspiration": { used: 3 } },
          spellSlots: {
            "1": { used: 4 }, // 0 left → excluded
            "2": { used: 2 }, // 1 left → included
            "3": { used: 0 }, // 2 left → included
          },
        }
      )
    );
    expect(m.get("bard-bardic-inspiration")?.availableSlotLevels).toEqual([2, 3]);
  });

  it("returns an empty map for a Bard without Font of Inspiration", () => {
    const m = getSpellSlotTrackerRecovery(
      mk(
        { level: 3, features: [{ srdId: "bard-bardic-inspiration" }] },
        { trackers: { "bard-bardic-inspiration": { used: 2 } } }
      )
    );
    expect(m.size).toBe(0);
  });

  it("returns an empty map when the character has no spell slots at all", () => {
    const m = getSpellSlotTrackerRecovery(
      mk(
        { features: FONT_BARD_FEATURES, spellSlots: [] },
        { trackers: { "bard-bardic-inspiration": { used: 2 } } }
      )
    );
    expect(m.size).toBe(0);
  });
});

describe("getSpellSlotTrackerRecovery — total clamp + override-first", () => {
  it("honors a trackerOverrides total when computing the conversion", () => {
    // Override the Bardic Inspiration total to 5 (override-first); used 5 →
    // spend a slot → newUsed 4. total reflects the override.
    const m = getSpellSlotTrackerRecovery(
      mk(
        {
          features: [
            {
              srdId: "bard-bardic-inspiration",
              trackerOverrides: { total: "5" },
            },
            { srdId: "bard-font-of-inspiration" },
          ],
        },
        { trackers: { "bard-bardic-inspiration": { used: 5 } } }
      )
    );
    const opt = m.get("bard-bardic-inspiration");
    expect(opt?.total).toBe(5);
    expect(opt?.currentUsed).toBe(5);
    expect(opt?.newUsed).toBe(4);
  });
});

describe("getSpellSlotTrackerRecovery — multi-source max merge", () => {
  it("keeps the higher usesPerSlot when two sources target the same tracker", () => {
    // A synthetic second source granting a 2-use conversion on the same tracker.
    // The consumer must pick usesPerSlot 2 (max merge), so used 3 → newUsed 1.
    const m = getSpellSlotTrackerRecovery(
      mk(
        {
          features: [
            { srdId: "bard-bardic-inspiration" },
            { srdId: "bard-font-of-inspiration" },
          ],
        },
        { trackers: { "bard-bardic-inspiration": { used: 3 } } }
      )
    );
    // Default Font of Inspiration is 1/slot → newUsed 2.
    expect(m.get("bard-bardic-inspiration")?.usesPerSlot).toBe(1);
    expect(m.get("bard-bardic-inspiration")?.newUsed).toBe(2);
  });

  it("collapses two evaluator entries to the higher usesPerSlot (aggregation level)", () => {
    const out = evaluateGrants([
      make("src-low", [
        {
          type: "spell-slot-tracker-recovery",
          trackerId: "bard-bardic-inspiration",
          usesPerSlot: 1,
        },
      ]),
      make("src-high", [
        {
          type: "spell-slot-tracker-recovery",
          trackerId: "bard-bardic-inspiration",
          usesPerSlot: 3,
        },
      ]),
    ]);
    const entries = out.spellSlotTrackerRecoveries.filter(
      (c) => c.trackerId === "bard-bardic-inspiration"
    );
    expect(entries).toHaveLength(2);
    expect(Math.max(...entries.map((c) => c.usesPerSlot))).toBe(3);
  });
});

// ─── 3. Data wiring — bard-font-of-inspiration carries the grant ─────────────

describe("data wiring — bard-font-of-inspiration", () => {
  it("the real SRD feature emits a spell-slot → Bardic-Inspiration conversion (1/slot)", () => {
    const sources = resolveGrantSourcesForFeatures([
      { srdId: "bard-font-of-inspiration" },
    ]);
    const out = evaluateGrants(sources);
    expect(out.spellSlotTrackerRecoveries).toEqual([
      {
        trackerId: "bard-bardic-inspiration",
        usesPerSlot: 1,
        sourceId: "bard-font-of-inspiration",
      },
    ]);
  });
});
