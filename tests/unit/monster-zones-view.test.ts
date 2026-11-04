/**
 * Monster zones on the DM's Scontro (#752): the zone spells a monster can cast, what a
 * hit asks («TS Saggezza CD 14 · 3d8 Radiante · metà se riesce»), and the damage that
 * lands (half, rounded down, on a save that halves).
 */
import { describe, expect, it } from "vitest";

import {
  monsterZoneSpells,
  zoneHitAmount,
  zoneHitLine,
} from "@/domains/combat/monster-zones-view";

describe("monsterZoneSpells", () => {
  it("lists the catalogue's zone spells with their level, by name", () => {
    const spells = monsterZoneSpells("en");
    expect(spells.find((s) => s.id === "spirit-guardians")).toEqual({
      id: "spirit-guardians",
      name: "Spirit Guardians",
      level: 3,
    });
    expect(spells.map((s) => s.name)).toEqual([...spells.map((s) => s.name)].sort());
  });
});

describe("zoneHitLine", () => {
  it("names the save, the DC, the dice and type, and what a save does", () => {
    expect(
      zoneHitLine(
        {
          saveAbility: "WIS",
          dc: 14,
          dice: "3d8",
          damageType: "radiant",
          onSave: "half",
        },
        "en"
      )
    ).toBe("Wisdom save, DC 14 · 3d8 Radiant · half on a success");
  });

  it("leaves out what the zone doesn't have", () => {
    expect(zoneHitLine({ dice: "2d4", damageType: "piercing" }, "en")).toBe(
      "2d4 Piercing"
    );
  });
});

describe("zoneHitAmount", () => {
  it("full on a failed save, half rounded down on a save that halves, none otherwise", () => {
    expect(zoneHitAmount(13, false, { onSave: "half" })).toBe(13);
    expect(zoneHitAmount(13, true, { onSave: "half" })).toBe(6);
    expect(zoneHitAmount(13, true, {})).toBe(0);
  });
});
