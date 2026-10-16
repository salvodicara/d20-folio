/**
 * Light and vision as a one-tap chip (SRD 5.2.1 rules glossary):
 *  - "Dim Light": "An area with Dim Light is Lightly Obscured."
 *  - "Lightly Obscured": "You have Disadvantage on Wisdom (Perception) checks to see
 *    something in a Lightly Obscured space."
 *  - "Darkness": "An area of Darkness is Heavily Obscured."
 *  - "Heavily Obscured": "you have the Blinded condition when trying to see
 *    something in that area." Blinded: "your attack rolls have Disadvantage."
 *  - "Darkvision": "you can see in Dim Light within a specified range as if it were
 *    Bright Light and in Darkness within that range as if it were Dim Light."
 *  - "Passive Perception": with Disadvantage, subtract 5.
 *
 * Cases: a sheet without Darkvision (Human) and one with it (Dwarf, from its species
 * trait), under each light level, read through the real aggregate, passives and
 * attack view. Blind spot: the Darkvision range against the distance is the table's.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import {
  LIGHT_LEVELS,
  lightStateKey,
  litLightLevel,
  sightUnder,
  type LightLevel,
} from "@/lib/light-states";
import { setLight } from "@/lib/play/light";
import { endFightSituations } from "@/lib/play/situations";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { passiveAdvantageStep } from "@/lib/compute";
import { deriveCharacter } from "@/lib/views/derive-character";
import { deriveAdvantageChips, deriveAttackRollView } from "@/lib/views/sheet-view";
import { asRaceId } from "@/data/srd-names";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

const human = makeCharacterDoc({ race: asRaceId("human") });
const dwarf = makeCharacterDoc({ race: asRaceId("dwarf") });

function lit(doc: CharacterDoc, level: LightLevel | null): CharacterDoc {
  return { ...doc, session: setLight(doc, level) ?? doc.session };
}
const aggregate = (doc: CharacterDoc) =>
  aggregateCharacterGrants(doc.character, doc.session);
const attackVerdict = (doc: CharacterDoc) =>
  deriveAttackRollView(
    deriveAdvantageChips(aggregate(doc)).filter((c) => c.rollType === "attack")
  ).state;

describe("what you see under each light level", () => {
  it("the fixtures: the Dwarf has Darkvision, the Human none", () => {
    expect(aggregate(dwarf).darkvisionFt).toBeGreaterThan(0);
    expect(aggregate(human).darkvisionFt).toBe(0);
  });

  it("without Darkvision: Dim Light is lightly obscured, Darkness heavily", () => {
    expect(sightUnder("dim", 0)).toBe("lightly-obscured");
    expect(sightUnder("darkness", 0)).toBe("heavily-obscured");
  });

  it("with Darkvision: Dim Light as Bright Light, Darkness as Dim Light", () => {
    expect(sightUnder("dim", 60)).toBeNull();
    expect(sightUnder("darkness", 60)).toBe("lightly-obscured");
  });
});

describe("the lit chip on the sheet", () => {
  it("Dim Light, no Darkvision: Disadvantage on Perception, passive Perception −5", () => {
    const before = deriveCharacter(human).passives.perception;
    const doc = lit(human, "dim");
    expect(passiveAdvantageStep(aggregate(doc), "perception")).toBe(-5);
    expect(deriveCharacter(doc).passives.perception).toBe(before - 5);
    expect(attackVerdict(doc)).not.toBe("disadvantage");
  });

  it("Dim Light with Darkvision changes nothing", () => {
    const doc = lit(dwarf, "dim");
    expect(passiveAdvantageStep(aggregate(doc), "perception")).toBe(0);
    expect(deriveCharacter(doc).passives.perception).toBe(
      deriveCharacter(dwarf).passives.perception
    );
  });

  it("Darkness, no Darkvision: Blinded for sight, so attack rolls have Disadvantage", () => {
    const doc = lit(human, "darkness");
    expect(attackVerdict(doc)).toBe("disadvantage");
  });

  it("Darkness with Darkvision reads as Dim Light: Perception −5, attacks unchanged", () => {
    const doc = lit(dwarf, "darkness");
    expect(passiveAdvantageStep(aggregate(doc), "perception")).toBe(-5);
    expect(attackVerdict(doc)).not.toBe("disadvantage");
  });

  it("a hand-set Darkvision range wins over the species one", () => {
    const blind = {
      ...dwarf,
      character: { ...dwarf.character, senseRangeOverrides: { darkvision: 0 } },
    };
    expect(attackVerdict(lit(blind, "darkness"))).toBe("disadvantage");
  });
});

describe("lighting and clearing", () => {
  it("one level at a time: Darkness replaces Dim Light", () => {
    const doc = lit(lit(human, "dim"), "darkness");
    expect(litLightLevel(doc.session)).toBe("darkness");
    expect(doc.session.activeFeatures).not.toContain(lightStateKey("dim"));
  });

  it("tapping the lit level again is a no-op; null clears it", () => {
    const doc = lit(human, "dim");
    expect(setLight(doc, "dim")).toBeNull();
    expect(litLightLevel(lit(doc, null).session)).toBeNull();
  });

  it("the sheet event runs the same transition", () => {
    const next = must(applySheetEvent(human, { kind: "set-light", level: "darkness" }));
    expect(litLightLevel(next.session)).toBe("darkness");
  });

  it("the light holds for the fight: ending the encounter clears every level", () => {
    for (const level of LIGHT_LEVELS) {
      const ended = must(endFightSituations(lit(human, level)));
      expect(litLightLevel(ended)).toBeNull();
    }
  });
});
