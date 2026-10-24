/**
 * The environment's Constitution saves (SRD 5.2.1 "Environmental Effects"), each a
 * failure of 1 Exhaustion level:
 *
 * - Extreme Cold: "a DC 10 Constitution saving throw at the end of each hour …
 *   Creatures that have Resistance or Immunity to Cold damage automatically succeed."
 * - Extreme Heat: "without access to drinkable water … at the end of each hour … The
 *   DC is 5 for the first hour and increases by 1 for each additional hour. Creatures
 *   wearing Medium or Heavy armor have Disadvantage on the save. Creatures that have
 *   Resistance or Immunity to Fire damage automatically succeed."
 * - Frigid Water: "immersed … for a number of minutes equal to its Constitution score
 *   before suffering any ill effects. Each additional minute … DC 10 … Resistance or
 *   Immunity to Cold damage automatically succeed."
 * - Deep Water: "After each hour of swimming in deep water, a creature that lacks a
 *   Swim Speed must succeed on a DC 10 Constitution saving throw."
 */
import { describe, expect, it } from "vitest";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { hazardSave, hazardSaveFailed } from "@/lib/views/hazard-saves";
import type { AbilityCode } from "@/data/types";
import type { CharacterData, CharacterDoc, SessionState } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function traveller(
  con: number,
  char: Partial<CharacterData> = {},
  session: Partial<SessionState> = {}
): CharacterDoc {
  const abilityScores: Record<AbilityCode, number> = {
    STR: 10,
    DEX: 10,
    CON: con,
    INT: 10,
    WIS: 10,
    CHA: 10,
  };
  return makeCharacterDoc(
    { classId: "fighter", level: 1, abilityScores, ...char },
    session
  );
}

describe("Extreme Cold", () => {
  it("a DC 10 Constitution save at the end of every hour", () => {
    const doc = traveller(14); // Fighter: proficient in CON, +2 PB, +2 mod
    expect(hazardSave(doc, { hazard: "extreme-cold", step: 1 })).toEqual({
      hazard: "extreme-cold",
      ability: "CON",
      dc: 10,
      bonus: 4,
      autoSuccess: false,
      disadvantage: false,
    });
    expect(hazardSave(doc, { hazard: "extreme-cold", step: 5 })?.dc).toBe(10);
  });

  it("Cold Resistance or Immunity succeeds on its own", () => {
    const resistant = traveller(10, {}, { sessionDefenses: { resistance: ["cold"] } });
    expect(hazardSave(resistant, { hazard: "extreme-cold", step: 1 })?.autoSuccess).toBe(
      true
    );
    const immune = traveller(10, {}, { sessionDefenses: { immunity: ["cold"] } });
    expect(hazardSave(immune, { hazard: "extreme-cold", step: 1 })?.autoSuccess).toBe(
      true
    );
  });
});

describe("Extreme Heat", () => {
  it("DC 5 for the first hour, +1 for each hour after", () => {
    const doc = traveller(10);
    expect(hazardSave(doc, { hazard: "extreme-heat", step: 1 })?.dc).toBe(5);
    expect(hazardSave(doc, { hazard: "extreme-heat", step: 3 })?.dc).toBe(7);
  });

  it("no save with drinkable water at hand", () => {
    const doc = traveller(10);
    expect(
      hazardSave(doc, { hazard: "extreme-heat", step: 2, drinkableWater: true })
    ).toBeNull();
  });

  it("Medium or Heavy armor puts Disadvantage on it; Light armor does not", () => {
    const wearing = (srdId: string) =>
      traveller(10, { equipment: [{ srdId, quantity: 1, equipped: true }] });
    const save = (doc: CharacterDoc) =>
      hazardSave(doc, { hazard: "extreme-heat", step: 1 })?.disadvantage;
    expect(save(wearing("chain-shirt"))).toBe(true);
    expect(save(wearing("chain-mail"))).toBe(true);
    expect(save(wearing("leather-armor"))).toBe(false);
  });

  it("Fire Resistance succeeds on its own; Cold Resistance does not", () => {
    const fire = traveller(10, {}, { sessionDefenses: { resistance: ["fire"] } });
    const cold = traveller(10, {}, { sessionDefenses: { resistance: ["cold"] } });
    expect(hazardSave(fire, { hazard: "extreme-heat", step: 1 })?.autoSuccess).toBe(true);
    expect(hazardSave(cold, { hazard: "extreme-heat", step: 1 })?.autoSuccess).toBe(
      false
    );
  });
});

describe("Frigid Water", () => {
  it("free for as many minutes as the Constitution score, then DC 10 every minute", () => {
    const doc = traveller(14);
    expect(hazardSave(doc, { hazard: "frigid-water", step: 14 })).toBeNull();
    expect(hazardSave(doc, { hazard: "frigid-water", step: 15 })?.dc).toBe(10);
    expect(hazardSave(doc, { hazard: "frigid-water", step: 20 })?.dc).toBe(10);
  });

  it("Cold Resistance succeeds on its own", () => {
    const doc = traveller(10, {}, { sessionDefenses: { resistance: ["cold"] } });
    expect(hazardSave(doc, { hazard: "frigid-water", step: 11 })?.autoSuccess).toBe(true);
  });
});

describe("Deep Water", () => {
  it("DC 10 after every hour of swimming without a Swim Speed", () => {
    expect(hazardSave(traveller(10), { hazard: "deep-water", step: 1 })?.dc).toBe(10);
  });

  it("a Swim Speed spares the save", () => {
    const swimmer = traveller(10, {
      equipment: [
        { srdId: "cloak-of-the-manta-ray", quantity: 1, equipped: true, attuned: true },
      ],
    });
    expect(hazardSave(swimmer, { hazard: "deep-water", step: 1 })).toBeNull();
  });
});

describe("a failed environment save", () => {
  it("is 1 Exhaustion level, through the sheet's own Exhaustion event", () => {
    const doc = traveller(10, {}, { exhaustion: 1 });
    const event = hazardSaveFailed(doc);
    expect(event).toEqual({ kind: "set-exhaustion", level: 2 });
    expect(applySheetEvent(doc, event)?.session.exhaustion).toBe(2);
  });
});
