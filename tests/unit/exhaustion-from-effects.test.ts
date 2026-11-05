/**
 * Exhaustion a source gives (edge-case M3): each failed save against a spell that
 * applies Exhaustion adds its levels, never above the spell's cap, and the levels
 * leave with the spell's effect (the fight revokes it when the spell ends). The
 * capped source here mirrors Waves of Exhaustion (1 level a failed save, never
 * above 4; private pack, its own case in the pack's conformance); a source the
 * catalogue names no rule for gives 1 level a failed save, no cap.
 */
import { describe, expect, it } from "vitest";

import { exhaustionOf } from "@/lib/compute";
import { diedOfExhaustion } from "@/lib/character-status";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import {
  effectiveExhaustion,
  exhaustionFromEffect,
  storedExhaustionFor,
} from "@/lib/play/exhaustion";
import { setExhaustion } from "@/lib/play/vitals";
import { deriveCharacter } from "@/lib/views/derive-character";
import type { CharacterDoc } from "@/types/character";
import type { ActiveCombatEffect } from "@/types/combat-effect";

import { makeCharacterDoc } from "./_helpers";

let n = 0;
const failedSave = (spellId: string): ActiveCombatEffect => ({
  id: `e${++n}`,
  actor: { kind: "pc", combatantId: "pc-caster", memberUid: "u", characterId: "c" },
  target: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: "mine" },
  source: { kind: "spell", id: spellId, actionId: "cast" },
  payload: { kind: "condition", conditionId: "exhaustion" },
  duration: { kind: "encounter" },
});

const tired = (stored: number, effects: ActiveCombatEffect[]): CharacterDoc => {
  const doc = makeCharacterDoc({ classId: "fighter", level: 5 });
  return {
    ...doc,
    session: { ...doc.session, exhaustion: stored, encounterEffects: effects },
  };
};

// A source capped at 4, as Waves of Exhaustion is; any other has the default rule.
const CAPPED = "capped-source";
const rules = (id: string) => (id === CAPPED ? { levels: 1, upTo: 4 } : { levels: 1 });
const waves = (count: number) => Array.from({ length: count }, () => failedSave(CAPPED));
const curse = (count: number) =>
  Array.from({ length: count }, () => failedSave("uncapped-source"));

describe("a source's Exhaustion, capped", () => {
  it("adds the levels, never above the cap, and never lowers a higher level", () => {
    expect(exhaustionFromEffect(0, { levels: 1, upTo: 4 })).toBe(1);
    expect(exhaustionFromEffect(3, { levels: 2, upTo: 4 })).toBe(4);
    expect(exhaustionFromEffect(5, { levels: 1, upTo: 4 })).toBe(5);
    expect(exhaustionFromEffect(5, { levels: 1 })).toBe(6);
  });

  it("a capped source: one level per failed save, four at most", () => {
    expect(effectiveExhaustion(tired(0, waves(3)).session, rules)).toBe(3);
    expect(effectiveExhaustion(tired(0, waves(6)).session, rules)).toBe(4);
    expect(effectiveExhaustion(tired(2, waves(3)).session, rules)).toBe(4);
    expect(effectiveExhaustion(tired(5, waves(1)).session, rules)).toBe(5);
  });

  it("a source with no rule of its own: one level per failed save, no cap", () => {
    expect(effectiveExhaustion(tired(0, curse(5)).session)).toBe(5);
  });

  it("the levels go when the spell's effect does", () => {
    expect(effectiveExhaustion(tired(1, []).session)).toBe(1);
  });
});

describe("every reader counts them", () => {
  it("the D20 Tests and the Speed take the penalty", () => {
    const fresh = deriveCharacter(tired(0, []));
    const hit = deriveCharacter(tired(0, curse(2)));
    expect(fresh.initiativeBonus - hit.initiativeBonus).toBe(4);
    expect(fresh.walkingSpeedFt - hit.walkingSpeedFt).toBe(10);
    expect(exhaustionOf(tired(0, curse(2)).session)).toBe(2);
  });

  it("it is a level, not a condition chip", () => {
    expect(effectiveSessionConditions(tired(0, curse(1)).session)).not.toContain(
      "exhaustion"
    );
  });

  it("a sixth level from a source with no cap is death", () => {
    expect(diedOfExhaustion(tired(0, curse(6)).session)).toBe(true);
    expect(diedOfExhaustion(tired(0, curse(5)).session)).toBe(false);
  });
});

describe("the stepper sets the level the sheet shows", () => {
  it("stores what, with the spell's levels, gives the level asked for", () => {
    const doc = tired(0, waves(2));
    expect(storedExhaustionFor(doc.session, 3, rules)).toBe(1);
    // The spell holds 2: asking for fewer clears the sheet's own.
    expect(storedExhaustionFor(doc.session, 1, rules)).toBe(0);
    // Past the cap only the sheet's own levels count.
    expect(storedExhaustionFor(tired(0, waves(4)).session, 5, rules)).toBe(5);
  });

  it("the stepper's +1 on a sheet holding 2 from the spell shows 3", () => {
    const doc = tired(0, curse(2));
    const next = setExhaustion(doc, 3);
    expect(next?.exhaustion).toBe(1);
    expect(effectiveExhaustion({ ...doc.session, ...next })).toBe(3);
  });
});
