/** Zones a monster casts (the DM's Spirit Guardians): its caster, DC and dice. */
import { describe, expect, it } from "vitest";

import { activeZones, monsterZoneEffect, zoneHitDamage } from "@/lib/zones";

/** A zone the DM casts for a monster: the stat block's DC, the dice at its level. */
describe("a monster's zone", () => {
  const zoneOf = (castLevel: number) =>
    activeZones([
      monsterZoneEffect({
        effectId: "z",
        monsterId: "monster-1",
        spellId: "spirit-guardians",
        castLevel,
        saveDc: 13,
        spared: ["monster-1"],
      }),
    ])[0];

  it("is cast by the monster, lasts the encounter and carries its DC", () => {
    const effect = monsterZoneEffect({
      effectId: "z",
      monsterId: "monster-1",
      spellId: "spirit-guardians",
      castLevel: 3,
      saveDc: 13,
    });
    expect(effect.actor).toEqual({ kind: "monster", combatantId: "monster-1" });
    expect(effect.duration).toEqual({ kind: "encounter" });
    expect(zoneOf(3)).toMatchObject({
      casterId: "monster-1",
      saveDc: 13,
      spared: ["monster-1"],
    });
  });

  it("a hit asks the spell's save at that DC, with its dice scaled to the cast level", () => {
    const zone = zoneOf(4);
    expect(zone && zoneHitDamage(zone)).toEqual({
      saveAbility: "WIS",
      dc: 13,
      dice: "4d8",
      damageType: "radiant",
      onSave: "half",
    });
  });
});
