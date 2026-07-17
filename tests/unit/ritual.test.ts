/**
 * Unit tests for canRitualCast (D&D 2024 ritual eligibility).
 */

import { describe, it, expect } from "vitest";
import { canRitualCast } from "@/lib/ritual";

const ritualL1 = { level: 1, ritual: true } as const;
const nonRitualL1 = { level: 1, ritual: false } as const;
const ritualCantrip = { level: 0, ritual: true } as const;

describe("canRitualCast", () => {
  it("rejects non-ritual spells regardless of class or preparation", () => {
    expect(
      canRitualCast({ spell: nonRitualL1, classId: "wizard", isPrepared: true })
    ).toBe(false);
    expect(
      canRitualCast({ spell: nonRitualL1, classId: "cleric", isPrepared: true })
    ).toBe(false);
  });

  it("rejects cantrips even when flagged ritual (shouldn't happen in data, but defensive)", () => {
    expect(
      canRitualCast({ spell: ritualCantrip, classId: "wizard", isPrepared: true })
    ).toBe(false);
  });

  it("wizard can always ritual-cast any ritual spell on character — even when unprepared", () => {
    expect(canRitualCast({ spell: ritualL1, classId: "wizard", isPrepared: false })).toBe(
      true
    );
    expect(canRitualCast({ spell: ritualL1, classId: "wizard", isPrepared: true })).toBe(
      true
    );
  });

  it("every non-wizard caster needs the ritual prepared (2024 RAW)", () => {
    // Bard / Sorcerer / Warlock used to be exempt under 2014's known-caster
    // model. In 2024 they all prepare spells; ritual requires preparation.
    for (const classId of [
      "bard",
      "cleric",
      "druid",
      "paladin",
      "ranger",
      "sorcerer",
      "warlock",
      "artificer",
    ]) {
      expect(
        canRitualCast({ spell: ritualL1, classId, isPrepared: false }),
        `${classId} should NOT ritual-cast an unprepared spell`
      ).toBe(false);
      expect(
        canRitualCast({ spell: ritualL1, classId, isPrepared: true }),
        `${classId} should ritual-cast when prepared`
      ).toBe(true);
    }
  });

  it("unknown / empty classId is treated like a non-wizard (must be prepared)", () => {
    expect(canRitualCast({ spell: ritualL1, classId: "", isPrepared: false })).toBe(
      false
    );
    expect(canRitualCast({ spell: ritualL1, classId: "", isPrepared: true })).toBe(true);
  });
});
