/**
 * Wizard L18 Spell Mastery picker — pure helpers.
 *
 * 2024 RAW: Choose a 1st-level AND a 2nd-level spell already in your
 * spellbook. You can cast those spells at their lowest level without
 * expending a spell slot, when you have them prepared. You can change
 * your selections by spending 8 hours in study.
 */
import { describe, expect, it } from "vitest";
import {
  applySpellMasteryPicks,
  eligibleSpellMasteryPicks,
  emptySpellMasteryPicks,
  hasEligibleSpellsAtLevel,
  isSpellMasteryComplete,
} from "@/lib/spell-mastery-pick";
import type { SrdSpellRef, CustomSpell } from "@/types/character";

describe("isSpellMasteryComplete", () => {
  it("requires both level1 AND level2 to be set", () => {
    expect(isSpellMasteryComplete(emptySpellMasteryPicks())).toBe(false);
    expect(isSpellMasteryComplete({ level1: "magic-missile" })).toBe(false);
    expect(isSpellMasteryComplete({ level2: "scorching-ray" })).toBe(false);
    expect(
      isSpellMasteryComplete({ level1: "magic-missile", level2: "scorching-ray" })
    ).toBe(true);
  });
});

describe("eligibleSpellMasteryPicks", () => {
  it("returns only spells of the requested level present on the character", () => {
    const spells: (SrdSpellRef | CustomSpell)[] = [
      { srdId: "magic-missile" }, // L1
      { srdId: "shield" }, // L1
      { srdId: "scorching-ray" }, // L2
      { srdId: "fireball" }, // L3
      { srdId: "fire-bolt" }, // cantrip
    ];
    const l1 = eligibleSpellMasteryPicks(spells, 1);
    expect(l1.map((s) => s.id).sort()).toEqual(["magic-missile", "shield"]);
    const l2 = eligibleSpellMasteryPicks(spells, 2);
    expect(l2.map((s) => s.id)).toEqual(["scorching-ray"]);
  });

  it("ignores custom (homebrew) spells — only SRD entries are eligible", () => {
    const spells: (SrdSpellRef | CustomSpell)[] = [
      { srdId: "magic-missile" },
      {
        custom: true,
        name: "Homebrew Bolt",
        level: 1,
        school: "evocation",
        castingTime: "1 action",
        range: "60 ft",
        components: { v: true, s: false, m: false },
        duration: "Instantaneous",
        concentration: false,
        description: "",
      },
    ];
    const l1 = eligibleSpellMasteryPicks(spells, 1);
    expect(l1.map((s) => s.id)).toEqual(["magic-missile"]);
  });
});

describe("hasEligibleSpellsAtLevel", () => {
  it("true when at least one matching SRD spell is on the character", () => {
    const spells: SrdSpellRef[] = [{ srdId: "magic-missile" }];
    expect(hasEligibleSpellsAtLevel(spells, 1)).toBe(true);
    expect(hasEligibleSpellsAtLevel(spells, 2)).toBe(false);
  });

  it("false on an empty character", () => {
    expect(hasEligibleSpellsAtLevel([], 1)).toBe(false);
    expect(hasEligibleSpellsAtLevel([], 2)).toBe(false);
  });
});

describe("applySpellMasteryPicks", () => {
  it("flags both chosen spells with wizardSpellMastery: true", () => {
    const spells: SrdSpellRef[] = [
      { srdId: "magic-missile" },
      { srdId: "shield" },
      { srdId: "scorching-ray" },
    ];
    const after = applySpellMasteryPicks(spells, {
      level1: "magic-missile",
      level2: "scorching-ray",
    });
    const mm = after.find((s) => !("custom" in s) && s.srdId === "magic-missile");
    const sr = after.find((s) => !("custom" in s) && s.srdId === "scorching-ray");
    const sh = after.find((s) => !("custom" in s) && s.srdId === "shield");
    expect(mm).toMatchObject({ wizardSpellMastery: true });
    expect(sr).toMatchObject({ wizardSpellMastery: true });
    // Non-chosen spells stay un-flagged.
    expect(
      sh && "wizardSpellMastery" in sh ? sh.wizardSpellMastery : undefined
    ).toBeUndefined();
  });

  it("clears the flag on previously-mastered spells when picks change", () => {
    const spells: SrdSpellRef[] = [
      { srdId: "magic-missile", wizardSpellMastery: true },
      { srdId: "shield" },
    ];
    const after = applySpellMasteryPicks(spells, { level1: "shield" });
    const mm = after.find((s) => !("custom" in s) && s.srdId === "magic-missile");
    const sh = after.find((s) => !("custom" in s) && s.srdId === "shield");
    // Magic Missile no longer mastered — flag should be cleared
    expect(
      mm && "wizardSpellMastery" in mm ? mm.wizardSpellMastery : undefined
    ).toBeUndefined();
    expect(sh).toMatchObject({ wizardSpellMastery: true });
  });

  it("is idempotent — reapplying the same picks doesn't duplicate or churn", () => {
    const spells: SrdSpellRef[] = [
      { srdId: "magic-missile" },
      { srdId: "scorching-ray" },
    ];
    const once = applySpellMasteryPicks(spells, {
      level1: "magic-missile",
      level2: "scorching-ray",
    });
    const twice = applySpellMasteryPicks(once, {
      level1: "magic-missile",
      level2: "scorching-ray",
    });
    expect(twice).toEqual(once);
  });

  it("leaves custom spells untouched", () => {
    const custom: CustomSpell = {
      custom: true,
      name: "Homebrew",
      level: 1,
      school: "evocation",
      castingTime: "1 action",
      range: "Self",
      components: { v: true, s: false, m: false },
      duration: "Instantaneous",
      concentration: false,
      description: "",
    };
    const spells: (SrdSpellRef | CustomSpell)[] = [custom, { srdId: "magic-missile" }];
    const after = applySpellMasteryPicks(spells, { level1: "magic-missile" });
    expect(after[0]).toBe(custom);
  });
});
