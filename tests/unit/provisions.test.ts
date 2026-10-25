/**
 * Dehydration and Malnutrition (SRD 5.2.1 Rules Glossary, hazards):
 *
 *   "A creature that drinks less than half the required water for a day gains 1
 *   Exhaustion level at the day's end. Exhaustion caused by dehydration can't be
 *   removed until the creature drinks the full amount of water required for a day."
 *
 *   "A creature that eats but consumes less than half the required food for a day must
 *   succeed on a DC 10 Constitution saving throw or gain 1 Exhaustion level at the
 *   day's end. A creature that eats nothing for 5 days automatically gains 1 Exhaustion
 *   level at the end of the fifth day as well as an additional level at the end of each
 *   subsequent day without food. Exhaustion caused by malnutrition can't be removed
 *   until the creature eats the full amount of food required for a day."
 *
 * Water Needs per Day: Tiny 1/4 gallon, Small 1, Medium 1, Large 4, Huge 16,
 * Gargantuan 64. Food Needs per Day: the same numbers in pounds.
 */
import { describe, expect, it } from "vitest";
import {
  dailyNeeds,
  endDays,
  longRestExhaustionFloor,
  resolveMalnutritionSaves,
} from "@/lib/play/provisions";
import { sessionToState, stateToSession } from "@/lib/session-state-codec";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const traveller = (): CharacterDoc => makeCharacterDoc({ level: 5 });
const FULL = { waterGallons: 1, foodPounds: 1 };

describe("daily needs by size", () => {
  it.each([
    ["Tiny", 0.25],
    ["Small", 1],
    ["Medium", 1],
    ["Large", 4],
    ["Huge", 16],
    ["Gargantuan", 64],
  ] as const)("%s needs %s gallons of water and pounds of food", (size, amount) => {
    expect(dailyNeeds(size)).toEqual({ waterGallons: amount, foodPounds: amount });
  });
});

describe("dehydration", () => {
  it("less than half the water gains 1 Exhaustion at the day's end", () => {
    const result = endDays(traveller(), 1, { waterGallons: 0.4, foodPounds: 1 });
    expect(result.doc.session.exhaustion).toBe(1);
    expect(result.malnutritionSaves).toBe(0);
  });

  it("half the water is enough to gain none", () => {
    const result = endDays(traveller(), 1, { waterGallons: 0.5, foodPounds: 1 });
    expect(result.doc.session.exhaustion).toBe(0);
  });

  it("each dry day adds a level, and a Long Rest can't remove them", () => {
    const dry = endDays(traveller(), 3, { waterGallons: 0, foodPounds: 1 }).doc;
    expect(dry.session.exhaustion).toBe(3);
    expect(longRestExhaustionFloor(dry)).toBe(3);
  });

  it("a day with the full amount frees those levels for a Long Rest", () => {
    const dry = endDays(traveller(), 2, { waterGallons: 0, foodPounds: 1 }).doc;
    const drunk = endDays(dry, 1, FULL).doc;
    expect(drunk.session.exhaustion).toBe(2);
    expect(longRestExhaustionFloor(drunk)).toBe(0);
    expect(drunk.session.provisions).toBeUndefined();
  });
});

describe("malnutrition", () => {
  it("eating but less than half asks a DC 10 CON save per day", () => {
    const result = endDays(traveller(), 2, { waterGallons: 1, foodPounds: 0.25 });
    expect(result.malnutritionSaves).toBe(2);
    expect(result.doc.session.exhaustion).toBe(0);
    const failedOne = resolveMalnutritionSaves(result.doc, 1);
    expect(failedOne.session.exhaustion).toBe(1);
    expect(longRestExhaustionFloor(failedOne)).toBe(1);
  });

  it("eating nothing for 5 days gains a level on the fifth and each day after", () => {
    const four = endDays(traveller(), 4, { waterGallons: 1, foodPounds: 0 });
    expect(four.doc.session.exhaustion).toBe(0);
    expect(four.malnutritionSaves).toBe(0);
    expect(four.doc.session.provisions).toEqual({ daysWithoutFood: 4 });
    const six = endDays(four.doc, 2, { waterGallons: 1, foodPounds: 0 }).doc;
    expect(six.session.exhaustion).toBe(2);
    expect(longRestExhaustionFloor(six)).toBe(2);
  });

  it("any food breaks the fast; the full amount frees the levels", () => {
    const fasting = endDays(traveller(), 5, { waterGallons: 1, foodPounds: 0 }).doc;
    const ate = endDays(fasting, 1, FULL).doc;
    expect(ate.session.exhaustion).toBe(1);
    expect(longRestExhaustionFloor(ate)).toBe(0);
    expect(ate.session.provisions).toBeUndefined();
  });

  it("a larger creature needs more (Large: 4 pounds, 4 gallons)", () => {
    const result = endDays(traveller(), 1, FULL, "Large");
    // 1 of 4 gallons is less than half: dehydration; 1 of 4 pounds: a save.
    expect(result.doc.session.exhaustion).toBe(1);
    expect(result.malnutritionSaves).toBe(1);
  });
});

it("thirst and hunger round-trip the stored session", () => {
  const doc = endDays(traveller(), 6, { waterGallons: 0, foodPounds: 0 }).doc;
  expect(doc.session.provisions).toEqual({ daysWithoutFood: 6, thirst: 5, hunger: 1 });
  const read = stateToSession(structuredClone(sessionToState(doc.session)));
  expect(read.provisions).toEqual(doc.session.provisions);
});

it("the dead gain nothing more (Exhaustion stops at 6)", () => {
  const doc = endDays(traveller(), 8, { waterGallons: 0, foodPounds: 1 }).doc;
  expect(doc.session.exhaustion).toBe(6);
});

it("the floor never exceeds the Exhaustion left (a spell removed some by hand)", () => {
  const dry = endDays(traveller(), 3, { waterGallons: 0, foodPounds: 1 }).doc;
  const restored = { ...dry, session: { ...dry.session, exhaustion: 1 } };
  expect(longRestExhaustionFloor(restored)).toBe(1);
});
