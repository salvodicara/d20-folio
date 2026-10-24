/**
 * A damage tray target carries what the tray's rows need from the creature: its
 * defenses and, for the riders that hinge on it (Mace of Smiting's 14 against a
 * Construct, Life Stealing on anything but a Construct or Undead), its creature
 * type. A target whose type is unknown (a player character) carries none, and the
 * tray's rules treat that safely.
 */
import { describe, expect, it } from "vitest";

import {
  initialTrayRowFor,
  trayTargetFromRow,
} from "@/components/shared/damage-tray-target";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import { initialTrayRow, type DamageTrayPlan } from "@/lib/play/damage-tray";

const golem = {
  id: "monster-1",
  name: "Clay Golem",
  kind: "monster",
  currentHp: 60,
  maxHp: 60,
  tempHp: 0,
  creatureType: "construct",
  defenses: {
    resistances: new Set(),
    immunities: new Set(["poison"]),
    vulnerabilities: new Set(),
    allDamageResistance: false,
  },
} as unknown as EncounterCombatantView;

const plan: DamageTrayPlan = {
  effect: "damage",
  damageType: "bludgeoning",
  targets: ["monster-1"],
} as unknown as DamageTrayPlan;

describe("tray targets", () => {
  it("an encounter monster brings its creature type", () => {
    expect(trayTargetFromRow(golem, true).creatureType).toBe("construct");
  });

  it("its first row is the tray's own, with the defenses and the type", () => {
    const target = trayTargetFromRow(golem, true);
    expect(initialTrayRowFor(plan, target)).toEqual(
      initialTrayRow(plan, "monster-1", target.defenses, "construct")
    );
    expect(initialTrayRowFor(plan, target).creatureType).toBe("construct");
  });

  it("a target with no known type carries none", () => {
    const pc = trayTargetFromRow({ ...golem, kind: "pc", creatureType: undefined }, true);
    expect(pc.creatureType).toBeUndefined();
    expect(initialTrayRowFor(plan, pc).creatureType).toBeUndefined();
  });
});
