/**
 * Every number explained (owner 2026-10-16, re-foundation phase 2): the walking Speed
 * decomposes into named parts that sum to the Speed the sheet shows. The base, every
 * feature or item that adds to it (named by its catalogue entry), a multiplier such as
 * Haste, the heavy-armor penalty, Exhaustion, and a floor or cap each become one line.
 * The guard runs over every dev scenario, with and without the equipment resolver and
 * on the first combat round, so the explanation can never drift from the number.
 */

import { describe, expect, it } from "vitest";

import { getEquipment } from "@/data/equipment";
import { DEV_SCENARIOS, buildDevScenario } from "@/lib/dev-scenarios";
import {
  effectiveWalkingSpeedBreakdown,
  effectiveWalkingSpeedFt,
} from "@/lib/smart-tracker";
import { breakdownTotal, type RawBreakdownPart } from "@/lib/value-breakdown";
import { makeCharacterDoc } from "./_helpers";
import type { ActiveCombatEffect } from "@/types/combat-effect";

function hasteEffect(phase: "active" | "aftereffect"): ActiveCombatEffect {
  return {
    id: `haste-${phase}`,
    actor: {
      kind: "pc",
      combatantId: "pc-caster",
      memberUid: "caster",
      characterId: "c",
    },
    target: {
      kind: "pc",
      combatantId: "pc-target",
      memberUid: "target",
      characterId: "t",
    },
    source: { kind: "spell", id: "haste", actionId: "spell-haste", castLevel: 3 },
    payload: { kind: "grant-group", activeKey: "spell-haste", phase },
    duration:
      phase === "active"
        ? { kind: "concentration", actorId: "pc-caster", sourceId: "haste" }
        : {
            kind: "turn-boundary",
            combatantId: "pc-target",
            round: 2,
            phase: "turn-end",
          },
  };
}

/** The label of a part, as a comparable string. */
function labelOf(part: RawBreakdownPart): string {
  if ("term" in part.label) return `term:${part.label.term}`;
  if ("ability" in part.label) return `ability:${part.label.ability}`;
  const loc = part.label.loc as { srd?: { kind: string; key: string } };
  return loc.srd ? `${loc.srd.kind}:${loc.srd.key}` : "loc";
}

const value = (part: RawBreakdownPart): number => ("value" in part ? part.value : 0);

describe("walking Speed breakdown", () => {
  it("is just the base for a character nothing modifies", () => {
    const doc = makeCharacterDoc({ classId: "wizard", level: 5, speed: "30 ft" });
    const parts = effectiveWalkingSpeedBreakdown(doc, getEquipment);
    expect(parts.map((p) => [labelOf(p), value(p)])).toEqual([
      ["term:breakdown.base", 30],
    ]);
  });

  it("names the feature that adds Speed (a Barbarian's Fast Movement)", () => {
    const doc = buildDevScenario("barbarian-extra-attack");
    if (!doc) throw new Error("scenario missing");
    const parts = effectiveWalkingSpeedBreakdown(doc, getEquipment);
    expect(parts.map((p) => [labelOf(p), value(p)])).toEqual([
      ["term:breakdown.base", 30],
      ["class-feature:barbarian-fast-movement", 10],
    ]);
  });

  it("names a multiplier item and the heavy-armor penalty (Boots of Speed in plate)", () => {
    const doc = buildDevScenario("s13-speed");
    if (!doc) throw new Error("scenario missing");
    const parts = effectiveWalkingSpeedBreakdown(doc, getEquipment);
    expect(parts.map((p) => [labelOf(p), value(p)])).toEqual([
      ["term:breakdown.base", 30],
      ["magic-item:boots-of-speed", 30],
      ["term:breakdown.speed.heavyArmor", -10],
    ]);
  });

  it("names the item whose floor lifts the Speed (Boots of Striding and Springing)", () => {
    const doc = buildDevScenario("boots-speed-floor");
    if (!doc) throw new Error("scenario missing");
    const parts = effectiveWalkingSpeedBreakdown(doc, getEquipment);
    expect(breakdownTotal(parts)).toBe(30);
    expect(parts.map(labelOf)).toEqual([
      "term:breakdown.base",
      expect.stringMatching(/^magic-item:boots-of-striding/),
    ]);
  });

  it("shows Exhaustion as its own reduction", () => {
    const doc = makeCharacterDoc(
      { classId: "wizard", level: 5, speed: "30 ft" },
      { exhaustion: 2 }
    );
    const parts = effectiveWalkingSpeedBreakdown(doc, getEquipment);
    expect(parts.map((p) => [labelOf(p), value(p)])).toEqual([
      ["term:breakdown.base", 30],
      ["term:character.exhaustion", -10],
    ]);
  });

  it("shows Haste doubling the Speed, and its aftereffect setting it to 0", () => {
    const hasted = makeCharacterDoc({ classId: "wizard", level: 5, speed: "30 ft" });
    hasted.session.encounterEffects = [hasteEffect("active")];
    const up = effectiveWalkingSpeedBreakdown(hasted);
    expect(breakdownTotal(up)).toBe(60);
    expect(up.map(value)).toEqual([30, 30]);

    const after = makeCharacterDoc({ classId: "wizard", level: 5, speed: "30 ft" });
    after.session.encounterEffects = [hasteEffect("aftereffect")];
    const down = effectiveWalkingSpeedBreakdown(after);
    expect(breakdownTotal(down)).toBe(0);
    expect(down.map(value)).toEqual([30, -30]);
  });

  it("sums to the Speed the sheet shows for every dev scenario", () => {
    const ids = Object.keys(DEV_SCENARIOS);
    expect(ids.length).toBeGreaterThan(5);
    for (const id of ids) {
      const doc = buildDevScenario(id);
      if (!doc) continue;
      for (const resolve of [getEquipment, undefined]) {
        for (const round of [undefined, 1]) {
          expect(
            breakdownTotal(effectiveWalkingSpeedBreakdown(doc, resolve, round)),
            `${id} (resolver ${resolve ? "on" : "off"}, round ${round ?? "-"})`
          ).toBe(effectiveWalkingSpeedFt(doc, resolve, round));
        }
      }
    }
  });
});
