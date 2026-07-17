/**
 * S4 — `at-zero-hp-interrupt` primitive (the "drop to 1 instead" interrupts:
 * Orc Relentless Endurance, Paladin Undying Sentinel, Boon of Misty Escape).
 *
 * Covers the three seam stages:
 *   1. evaluator — the kind aggregates into `atZeroHpInterrupts` (collect +
 *      trackerId + sourceId).
 *   2. data — each real SRD source (race trait / class feature / feat) carries
 *      the grant with the trackerId matching the id `resolveTrackers` keys its
 *      tracker by.
 *   3. consumer — `resolveAtZeroHpInterrupts` offers ONLY interrupts whose 1/rest
 *      tracker has an unspent use (a spent one never prompts), reading the FULL
 *      grant sources (race + feats), so a real Orc / Paladin / boon-holder
 *      surfaces it.
 */
import { describe, it, expect } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { foldLegacyClass } from "./_helpers";
import { evaluateGrants, type Grant, type GrantSource } from "@/lib/grants";
import { resolveAtZeroHpInterrupts } from "@/lib/smart-tracker";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import type { CharacterDoc, SessionState } from "@/types/character";

const make = (id: string, grants: Grant[]): GrantSource => ({
  id,
  name: { en: id, it: id },
  grants,
});

// ─── 1. Aggregation ──────────────────────────────────────────────────────────

describe("evaluateGrants — at-zero-hp-interrupt aggregation", () => {
  it("no grant leaves the aggregate field an empty array", () => {
    expect(evaluateGrants([]).atZeroHpInterrupts).toEqual([]);
  });

  it("collects one entry per source with its trackerId + sourceId", () => {
    const out = evaluateGrants([
      make("orc-relentless", [
        { type: "at-zero-hp-interrupt", trackerId: "race:orc:relentless-endurance" },
      ]),
      make("boon-of-misty-escape", [
        { type: "at-zero-hp-interrupt", trackerId: "boon-of-misty-escape" },
      ]),
    ]);
    expect(out.atZeroHpInterrupts).toContainEqual({
      trackerId: "race:orc:relentless-endurance",
      sourceId: "orc-relentless",
    });
    expect(out.atZeroHpInterrupts).toContainEqual({
      trackerId: "boon-of-misty-escape",
      sourceId: "boon-of-misty-escape",
    });
  });
});

// ─── 2. Data wiring (the real SRD sources carry the grant) ───────────────────

describe("data — the real interrupt sources emit the grant", () => {
  it("Orc Relentless Endurance (race trait) → race-trait session id", () => {
    const out = evaluateGrants(
      resolveAllGrantSources({
        race: "orc",
        features: [],
        equipment: [],
        classes: [{ classId: "barbarian", level: 3 }],
      })
    );
    expect(out.atZeroHpInterrupts).toContainEqual({
      trackerId: "race:orc:relentless-endurance",
      sourceId: "race:orc:relentless-endurance",
    });
  });

  // The feat + class-feature sources (Boon of Misty Escape, Paladin Undying
  // Sentinel) are PACK content — their data pins live in
  // content-pack/tests/unit/at-zero-hp-interrupt.pack.test.ts.
});

// ─── 3. Consumer (resolveAtZeroHpInterrupts) ─────────────────────────────────

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
      name: assertNonEmptyString("X"),
      quote: "",
      race: asRaceId("orc"),
      classes: [{ classId: "barbarian", level: 3 }],
      background: "soldier",
      alignment: asAlignmentId("neutral"),
      playerName: "",
      speed: "30 ft",
      ac: 14,
      armorNote: "",
      hp: { max: 30 },
      hitDieType: 12,
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
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 8, WIS: 10, CHA: 8 },
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
      ...foldLegacyClass(char, "barbarian"),
    },
    session: {
      hp: { current: 0, temp: 0 },
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

describe("resolveAtZeroHpInterrupts — Orc Relentless Endurance", () => {
  it("offers the interrupt while the 1/LR use is unspent", () => {
    const out = resolveAtZeroHpInterrupts(mk());
    expect(out).toHaveLength(1);
    expect(out[0]?.trackerId).toBe("race:orc:relentless-endurance");
  });

  it("does NOT offer the interrupt once the use is spent", () => {
    const out = resolveAtZeroHpInterrupts(
      mk({}, { trackers: { "race:orc:relentless-endurance": { used: 1 } } })
    );
    expect(out).toEqual([]);
  });

  it("a non-Orc without any interrupt feature gets nothing", () => {
    const out = resolveAtZeroHpInterrupts(mk({ race: asRaceId("elf") }));
    expect(out).toEqual([]);
  });
});
