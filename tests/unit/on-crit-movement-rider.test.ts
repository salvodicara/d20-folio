/**
 * `on-crit-movement-rider` engine primitive — critical-hit-trigger movement.
 *
 * Two layers under test:
 *  1. The GRANT aggregates — `evaluateGrants` collects every
 *     `on-crit-movement-rider` grant into `AggregatedGrants.onCritMovement`,
 *     defaulting `ignoresOpportunityAttacks` to `true`.
 *  2. The CONSUMER applies it — `resolveOnCritMovement` resolves the
 *     character's effective walking Speed (`effectiveWalkingSpeedFt`) to the
 *     concrete distance the `fraction` grants (`"half"` ⇒ ⌊Speed/2⌋, 2024 RAW
 *     round-down), carrying the "ignores Opportunity Attacks" clause through.
 *
 * Override-first: the engine NEVER moves the token or mutates session state —
 * it only reports the distance, surfacing an option the player applies.
 * Deterministic: no dice / RNG anywhere.
 *
 * Source of truth (dnd2024.wikidot.com/fighter:champion): Fighter Champion "Remarkable Athlete" (L3) → "In addition,
 * immediately after you score a Critical Hit, you can move up to half your
 * Speed without provoking Opportunity Attacks."
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
import { resolveOnCritMovement, effectiveWalkingSpeedFt } from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";

const src = (id: string, grants: Grant[]): GrantSource => ({
  id,
  name: { en: id, it: id },
  grants,
});

// ─── Layer 1: the grant aggregates ──────────────────────────────────────────

describe("evaluateGrants — on-crit-movement-rider aggregation", () => {
  it("collects a crit-move rider into onCritMovement with its fraction + OA clause", () => {
    const agg = evaluateGrants([
      src("fighter-champion-remarkable-athlete", [
        { type: "on-crit-movement-rider", fraction: "half" },
      ]),
    ]);
    expect(agg.onCritMovement).toHaveLength(1);
    expect(agg.onCritMovement[0]).toEqual({
      sourceId: "fighter-champion-remarkable-athlete",
      fraction: "half",
      ignoresOpportunityAttacks: true,
    });
  });

  it("defaults ignoresOpportunityAttacks to true when the grant omits it", () => {
    const agg = evaluateGrants([
      src("rider-src", [{ type: "on-crit-movement-rider", fraction: "half" }]),
    ]);
    expect(agg.onCritMovement[0]?.ignoresOpportunityAttacks).toBe(true);
  });

  it("honors ignoresOpportunityAttacks: false when explicitly set", () => {
    const agg = evaluateGrants([
      src("rider-src", [
        {
          type: "on-crit-movement-rider",
          fraction: "full",
          ignoresOpportunityAttacks: false,
        },
      ]),
    ]);
    expect(agg.onCritMovement[0]).toEqual({
      sourceId: "rider-src",
      fraction: "full",
      ignoresOpportunityAttacks: false,
    });
  });

  it("collects EVERY crit-move rider (each source grants its own move)", () => {
    const agg = evaluateGrants([
      src("a", [{ type: "on-crit-movement-rider", fraction: "half" }]),
      src("b", [{ type: "on-crit-movement-rider", fraction: "full" }]),
    ]);
    expect(agg.onCritMovement).toHaveLength(2);
    expect(agg.onCritMovement.map((r) => r.sourceId)).toEqual(["a", "b"]);
  });

  it("the empty aggregate has no crit-move entries", () => {
    expect(emptyAggregate().onCritMovement).toEqual([]);
    expect(evaluateGrants([]).onCritMovement).toEqual([]);
  });
});

// ─── effectiveWalkingSpeedFt — the distance the rider is measured against ────

describe("effectiveWalkingSpeedFt — base + grant bonus + riders − exhaustion", () => {
  it("parses the plain base Speed string", () => {
    expect(effectiveWalkingSpeedFt(makeChar({ speed: "30 ft" }))).toBe(30);
    expect(effectiveWalkingSpeedFt(makeChar({ speed: "25" }))).toBe(25);
  });

  it("treats a missing / non-numeric base Speed as 0", () => {
    expect(effectiveWalkingSpeedFt(makeChar({ speed: "" }))).toBe(0);
  });

  it("subtracts the Exhaustion reduction (−5 ft per level), floored at 0", () => {
    // base 30, exhaustion 2 → −10 ⇒ 20.
    expect(effectiveWalkingSpeedFt(makeChar({ speed: "30" }, { exhaustion: 2 }))).toBe(
      20
    );
    // base 10, exhaustion 6 → −30 would be negative; floored at 0.
    expect(effectiveWalkingSpeedFt(makeChar({ speed: "10" }, { exhaustion: 6 }))).toBe(0);
  });
});

// ─── Layer 2: the consumer applies it (resolveOnCritMovement) ───────────────

describe("resolveOnCritMovement — Remarkable Athlete (real Champion SRD data)", () => {
  it("emits no option for a character without the feature", () => {
    const char = makeChar({ class: "fighter", subclass: "champion", level: 1 });
    expect(resolveOnCritMovement(char)).toEqual([]);
  });

  it("resolves half of a 30 ft Speed → 15 ft, ignoring Opportunity Attacks", () => {
    const char = makeAthlete({ speed: "30 ft" });
    const out = resolveOnCritMovement(char);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      sourceId: "fighter-champion-remarkable-athlete",
      distanceFt: 15,
      ignoresOpportunityAttacks: true,
    });
  });

  it("rounds DOWN per 2024 RAW for an odd-half Speed (25 → 12)", () => {
    // ⌊25 / 2⌋ = 12 (12.5 rounds down).
    const char = makeAthlete({ speed: "25" });
    expect(resolveOnCritMovement(char)[0]?.distanceFt).toBe(12);
  });

  it("tracks Exhaustion — half of a reduced Speed (30 − 10 = 20 → 10)", () => {
    const char = makeAthlete({ speed: "30" }, { exhaustion: 2 });
    expect(resolveOnCritMovement(char)[0]?.distanceFt).toBe(10);
  });

  it("OVERRIDE-FIRST: never mutates the session", () => {
    const char = makeAthlete({ speed: "30" });
    const before = JSON.stringify(char.session);
    resolveOnCritMovement(char);
    expect(JSON.stringify(char.session)).toBe(before);
  });

  it("is deterministic — no RNG", () => {
    const char = makeAthlete({ speed: "40" });
    const a = resolveOnCritMovement(char)[0]?.distanceFt;
    const b = resolveOnCritMovement(char)[0]?.distanceFt;
    expect(a).toBe(b);
    expect(a).toBe(20); // ⌊40 / 2⌋
  });
});

// ─── Fixtures ───────────────────────────────────────────────────────────────

/**
 * A Champion fighter at L3 carrying the real Remarkable Athlete feature, with a
 * chosen base Speed. Exercises the live SRD data → grant → consumer path (no
 * synthetic grant injection).
 */
function makeAthlete(
  charOverrides: Partial<CharacterDoc["character"]> & {
    class?: string;
    classId?: string;
    subclass?: string;
    subclassId?: string;
    level?: number;
  } = {},
  sessionOverrides: Partial<CharacterDoc["session"]> = {}
): CharacterDoc {
  return makeChar(
    {
      classes: [{ classId: "fighter", subclassId: "champion", level: 3 }],
      features: [{ srdId: "fighter-champion-remarkable-athlete" }],
      ...foldLegacyClass(charOverrides, "fighter", "champion"),
    },
    sessionOverrides
  );
}

function makeChar(
  overrides: Partial<CharacterDoc["character"]> & {
    class?: string;
    classId?: string;
    subclass?: string;
    subclassId?: string;
    level?: number;
  } = {},
  sessionOverrides: Partial<CharacterDoc["session"]> = {}
): CharacterDoc {
  const max = overrides.hp?.max ?? 30;
  return {
    id: "test",
    createdAt: new Date(),
    updatedAt: new Date(),
    portraitUrl: null,
    portraitCrop: null,
    shareId: null,
    status: "active",
    character: {
      name: assertNonEmptyString("Tester"),
      quote: "",
      race: asRaceId("human"),
      classes: [{ classId: "fighter", subclassId: "champion", level: 3 }],
      background: "soldier",
      alignment: asAlignmentId("neutral"),
      playerName: "P",
      speed: "30 ft",
      ac: 16,
      armorNote: "",
      hp: { max },
      hitDieType: 10,
      languageIds: ["common"],
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
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 10 },
      savingThrows: ["STR", "CON"],
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
      ...foldLegacyClass(overrides, "fighter", "champion"),
    },
    session: {
      hp: { current: max, temp: 0 },
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
      ...sessionOverrides,
    },
  };
}
