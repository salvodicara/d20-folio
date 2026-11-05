/**
 * Table rules (edge-case family M16): a campaign may vary a few rules; RAW is
 * the default. Expected RAW values come from the 2024 rules, and each must match
 * the constant the engine uses today, so the seam can replace them one by one.
 */
import { describe, expect, it, vi } from "vitest";

// The campaign read boundary lives in campaign-io, which starts Firebase on import.
vi.mock("@/lib/firebase", () => ({ db: {}, auth: {} }));
import {
  conformTableRules,
  effectiveTableRules,
  RAW_TABLE_RULES,
} from "@/lib/table-rules";
import { DEATH_FAIL_LIMIT, DEATH_SUCCESS_LIMIT } from "@/lib/character-status";
import { consumableActionSlot } from "@/lib/srd-resolve";
import { toCampaignDoc } from "@/features/campaigns/campaign-io";

describe("RAW table rules are the 2024 rules", () => {
  it("rests: Short Rest 1 hour, Long Rest 8 hours", () => {
    expect(RAW_TABLE_RULES.rest).toEqual({ shortMinutes: 60, longMinutes: 480 });
  });

  it("exhaustion: 6 levels, -2 to D20 Tests and -5 ft Speed per level", () => {
    expect(RAW_TABLE_RULES.exhaustion).toEqual({
      maxLevel: 6,
      d20PerLevel: -2,
      speedFtPerLevel: -5,
    });
  });

  it("death saves: three successes or three failures, as the engine counts them", () => {
    expect(RAW_TABLE_RULES.deathSaves).toEqual({
      successes: DEATH_SUCCESS_LIMIT,
      failures: DEATH_FAIL_LIMIT,
    });
  });

  it("potions: drink or administer as a Bonus Action, as the engine slots them", () => {
    expect(RAW_TABLE_RULES.potions).toEqual({ drink: "bonus", administer: "bonus" });
    expect(consumableActionSlot({ isPotion: true, isConsumable: true })).toBe("bonus");
  });

  it("optional rules start off: no flanking, no fumbles, familiars can't attack", () => {
    expect(RAW_TABLE_RULES.flanking).toBe("off");
    expect(RAW_TABLE_RULES.fumbles).toBe(false);
    expect(RAW_TABLE_RULES.familiarsAttack).toBe(false);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(RAW_TABLE_RULES)).toBe(true);
    expect(Object.isFrozen(RAW_TABLE_RULES.rest)).toBe(true);
  });
});

describe("a campaign's table rules merge over RAW", () => {
  it("no campaign, or no table rules: RAW", () => {
    expect(effectiveTableRules(null)).toEqual(RAW_TABLE_RULES);
    expect(effectiveTableRules({})).toEqual(RAW_TABLE_RULES);
  });

  it("gritty rests change only the rests", () => {
    const rules = effectiveTableRules({
      tableRules: { rest: { shortMinutes: 480, longMinutes: 7 * 24 * 60 } },
    });
    expect(rules.rest).toEqual({ shortMinutes: 480, longMinutes: 10080 });
    expect(rules.exhaustion).toEqual(RAW_TABLE_RULES.exhaustion);
  });

  it("a partial group keeps the RAW value for the missing field", () => {
    expect(
      effectiveTableRules({ tableRules: { potions: { drink: "action" } } }).potions
    ).toEqual({
      drink: "action",
      administer: "bonus",
    });
  });
});

describe("stored table rules are read field by field, never trusted whole", () => {
  it("drops unknown fields and bad values, keeps the valid ones", () => {
    expect(
      conformTableRules({
        flanking: "advantage",
        fumbles: "yes",
        rest: { shortMinutes: -5, longMinutes: 600 },
        madeUp: true,
      })
    ).toEqual({ flanking: "advantage", rest: { longMinutes: 600 } });
  });

  it("a non-object is no table rules at all", () => {
    expect(conformTableRules("gritty")).toEqual({});
    expect(conformTableRules(null)).toEqual({});
  });
});

describe("the campaign read boundary", () => {
  it("toCampaignDoc keeps valid table rules and drops the rest", () => {
    const doc = toCampaignDoc("c1", {
      memberDetails: {},
      tableRules: { flanking: "advantage", fumbles: 3 },
    });
    expect(doc.tableRules).toEqual({ flanking: "advantage" });
    expect(
      toCampaignDoc("c2", { memberDetails: {}, tableRules: "x" }).tableRules
    ).toBeUndefined();
    expect(toCampaignDoc("c3", { memberDetails: {} }).tableRules).toBeUndefined();
  });

  it("toCampaignDoc keeps a well-formed game clock and drops a malformed one", () => {
    expect(
      toCampaignDoc("c1", { memberDetails: {}, gameClock: { minute: 5.5 } }).gameClock
    ).toBeUndefined();
    expect(
      toCampaignDoc("c1", { memberDetails: {}, gameClock: { minute: 5, timeOfDay: 60 } })
        .gameClock
    ).toEqual({ minute: 5, timeOfDay: 60 });
  });
});
