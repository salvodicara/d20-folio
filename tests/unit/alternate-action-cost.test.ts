/**
 * alternate-action-cost primitive — `SrdActionDef.alternateCost`.
 *
 * A feature action may declare a SECOND, independent way to pay (a `CostSpec`),
 * chosen by the player at use-time INSTEAD of the primary cost. 2024 Wild
 * Companion (druid:main, Level 2): "you can expend a spell slot OR a use of
 * Wild Shape to cast Find Familiar." The primary cost is the Wild Shape tracker;
 * the alternate is a level-1+ spell slot.
 *
 * These tests pin the three seams end-to-end:
 *  1. DATA — the SRD action carries `alternateCost`.
 *  2. RESOLVER — `resolveActions` surfaces it verbatim on the ResolvedAction
 *     alongside the primary tracker cost.
 *  3. CONSUMER — `getActionCostOptions` enumerates BOTH payment routes (primary
 *     tracker + alternate slot), each as a cost-engine `CostSpec` ready for
 *     `planCommit`; and the override-first / no-alternate edge cases.
 */
import { describe, it, expect } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { foldLegacyClass } from "./_helpers";
import {
  resolveActions,
  getActionCostOptions,
  type ResolvedAction,
} from "@/lib/smart-tracker";
import { classFeatureIndex } from "@/data/classes";
import type { CharacterDoc, SessionState } from "@/types/character";

// ─── Minimal druid fixture ────────────────────────────────────────────────────

function mkDruid(
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
      name: assertNonEmptyString("Thornwhistle"),
      quote: "",
      race: asRaceId("human"),
      classes: [{ classId: "druid", level: 2 }],
      background: "sage",
      alignment: asAlignmentId("neutral"),
      playerName: "",
      speed: "30 ft",
      ac: 14,
      armorNote: "",
      hp: { max: 16 },
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
      abilityScores: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 16, CHA: 8 },
      savingThrows: ["INT", "WIS"],
      skills: {},
      spellcasting: null,
      spellSlots: [],
      spells: [],
      weapons: [],
      equipment: [],
      features: [{ srdId: "druid-wild-companion" }],
      combatAlgorithm: [],
      customConditions: [],
      sidebar: [],
      ...foldLegacyClass(char, "druid"),
    },
    session: {
      hp: { current: 16, temp: 0 },
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

const WILD_COMPANION_ACTION_ID = "druid-wild-companion-action";

// ─── 1. DATA seam ──────────────────────────────────────────────────────────────

describe("alternate-action-cost — SRD data", () => {
  it("Wild Companion's action keeps its Wild Shape tracker cost AND adds a spell-slot alternate", () => {
    const feature = classFeatureIndex.get("druid-wild-companion");
    const action = feature?.mechanics?.actions?.[0];
    expect(action).toBeDefined();
    // Primary cost — unchanged.
    expect(action?.costTracker).toBe("druid-wild-shape");
    expect(action?.trackerCost).toBe(1);
    // Alternate cost — the new primitive: a level-1+ spell slot.
    expect(action?.alternateCost).toEqual({ kind: "spell-slot", minLevel: 1 });
  });
});

// ─── 2. RESOLVER seam ───────────────────────────────────────────────────────────

describe("alternate-action-cost — resolveActions surfaces alternateCost", () => {
  it("carries the alternate slot cost onto the resolved Wild Companion action", () => {
    const actions = resolveActions(mkDruid());
    const wc = actions.find((a) => a.id === WILD_COMPANION_ACTION_ID);
    expect(wc).toBeDefined();
    // Primary cost still resolves to the cross-feature Wild Shape tracker.
    expect(wc?.costTracker).toBe("druid-wild-shape");
    // Alternate cost rides through verbatim.
    expect(wc?.alternateCost).toEqual({ kind: "spell-slot", minLevel: 1 });
  });

  it("leaves alternateCost undefined for an action with no alternate (Wild Shape itself)", () => {
    const actions = resolveActions(
      mkDruid({ features: [{ srdId: "druid-wild-shape" }] })
    );
    // Any resolved feature action that isn't Wild Companion has no alternate.
    for (const a of actions.filter((x) => x.source === "feature")) {
      if (a.id !== WILD_COMPANION_ACTION_ID) {
        expect(a.alternateCost).toBeUndefined();
      }
    }
  });
});

// ─── 3. CONSUMER seam — getActionCostOptions ────────────────────────────────────

/** Build a bare ResolvedAction with only the cost-relevant fields set. */
function action(partial: Partial<ResolvedAction>): ResolvedAction {
  return {
    id: "x",
    name: "X",
    nameLoc: { custom: "X" },
    type: "action",
    source: "feature",
    spellLevel: null,
    concentration: false,
    summary: {},
    costsSlot: false,
    pinned: false,
    defaultPinned: false,
    ...partial,
  };
}

describe("alternate-action-cost — getActionCostOptions enumerates both routes", () => {
  it("Wild Companion offers primary tracker + alternate spell-slot, primary first", () => {
    const wc = resolveActions(mkDruid()).find((a) => a.id === WILD_COMPANION_ACTION_ID);
    expect(wc).toBeDefined();
    if (!wc) throw new Error("Wild Companion action missing");

    const options = getActionCostOptions(wc);
    expect(options).toHaveLength(2);

    // Primary first.
    expect(options[0]).toEqual({
      kind: "primary",
      cost: {
        kind: "tracker",
        trackerId: "druid-wild-shape",
        amount: 1,
        pool: false,
      },
    });
    // Alternate second — a level-1+ spell slot.
    expect(options[1]).toEqual({
      kind: "alternate",
      cost: { kind: "spell-slot", minLevel: 1 },
    });
  });

  it("returns ONLY the primary option when no alternate is declared", () => {
    const options = getActionCostOptions(
      action({ costTracker: "monk-focus", trackerCost: 2 })
    );
    expect(options).toEqual([
      {
        kind: "primary",
        cost: { kind: "tracker", trackerId: "monk-focus", amount: 2, pool: false },
      },
    ]);
  });

  it("primary is a spell-slot when the action costsSlot (slot ▸ tracker order)", () => {
    const options = getActionCostOptions(action({ costsSlot: true, slotLevel: 3 }));
    expect(options).toEqual([
      { kind: "primary", cost: { kind: "spell-slot", minLevel: 3 } },
    ]);
  });

  it("primary is an equipment charge when only costEquipment is set", () => {
    const options = getActionCostOptions(action({ costEquipment: "custom-Potion" }));
    expect(options).toEqual([
      { kind: "primary", cost: { kind: "equipment", key: "custom-Potion" } },
    ]);
  });

  it("an at-will action with no cost yields no options (combat auto-commits)", () => {
    expect(getActionCostOptions(action({}))).toEqual([]);
  });

  it("a pool tracker primary carries pool:true and defaults amount to 1", () => {
    const options = getActionCostOptions(
      action({ costTracker: "paladin-lay-on-hands", costTrackerIsPool: true })
    );
    expect(options).toEqual([
      {
        kind: "primary",
        cost: {
          kind: "tracker",
          trackerId: "paladin-lay-on-hands",
          amount: 1,
          pool: true,
        },
      },
    ]);
  });

  it("override-first — a non-slot alternate (tracker) rides through verbatim", () => {
    // Defensive: the primitive isn't slot-only. An alternate that is itself a
    // tracker spend is enumerated as-is (the consumer never re-derives it).
    const options = getActionCostOptions(
      action({
        costsSlot: true,
        slotLevel: 1,
        alternateCost: { kind: "tracker", trackerId: "druid-wild-shape", amount: 1 },
      })
    );
    expect(options).toEqual([
      { kind: "primary", cost: { kind: "spell-slot", minLevel: 1 } },
      {
        kind: "alternate",
        cost: { kind: "tracker", trackerId: "druid-wild-shape", amount: 1 },
      },
    ]);
  });
});
