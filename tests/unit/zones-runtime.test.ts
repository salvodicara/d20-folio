/**
 * Persistent areas (edge-case M9). Cases from SRD 5.2.1: Spirit Guardians spares the
 * creatures its caster chooses and hits a creature "the first time on a turn" it
 * enters or ends its turn there; Spike Growth costs damage per 5 feet moved; Darkness
 * (2nd level) and Daylight (3rd) dispel each other by level.
 */
import { describe, expect, it } from "vitest";

import { isActiveCombatEffect } from "@/lib/combat-effect-io";
import { activeZones, zoneLight, zonePayload, zoneTriggers } from "@/lib/zones";
import type { ActiveCombatEffect } from "@/types/combat-effect";

const caster = { kind: "monster" as const, combatantId: "cleric" };

function zoneEffect(
  id: string,
  spellId: string,
  castLevel: number,
  spared: string[] = []
): ActiveCombatEffect {
  return {
    id,
    actor: caster,
    target: caster,
    source: { kind: "spell", id: spellId, actionId: `spell-${spellId}`, castLevel },
    payload: zonePayload(spellId, spared),
    duration: { kind: "concentration", actorId: "cleric", sourceId: spellId },
  };
}

const turn = (round: number, combatantId: string) => ({ round, combatantId });

describe("a zone is a stored combat effect", () => {
  it("reads back through the one effect parser", () => {
    const effect = zoneEffect("z1", "spirit-guardians", 3, ["fighter"]);
    expect(isActiveCombatEffect(effect)).toBe(true);
    expect(activeZones([effect])).toEqual([
      expect.objectContaining({
        spellId: "spirit-guardians",
        casterId: "cleric",
        castLevel: 3,
        spared: ["fighter"],
      }),
    ]);
  });
});

describe("what triggers a zone", () => {
  const [guardians] = activeZones([zoneEffect("z1", "spirit-guardians", 3, ["fighter"])]);
  if (!guardians) throw new Error("no zone");

  it("an enemy entering is hit once a turn; again on a later turn", () => {
    const first = zoneTriggers(guardians, {
      kind: "enter",
      creatureId: "goblin",
      turn: turn(2, "goblin"),
    });
    expect(first.fires).toBe(true);
    const ledger = first.fires ? first.ledger : {};
    expect(
      zoneTriggers(
        guardians,
        { kind: "end-turn", creatureId: "goblin", turn: turn(2, "goblin") },
        ledger
      )
    ).toEqual({ fires: false, reason: "already-this-turn" });
    expect(
      zoneTriggers(
        guardians,
        { kind: "enter", creatureId: "goblin", turn: turn(3, "goblin") },
        ledger
      ).fires
    ).toBe(true);
  });

  it("a spared ally is left alone", () => {
    expect(
      zoneTriggers(guardians, {
        kind: "enter",
        creatureId: "fighter",
        turn: turn(1, "x"),
      })
    ).toEqual({ fires: false, reason: "spared" });
  });

  it("starting a turn inside isn't one of Spirit Guardians' triggers", () => {
    expect(
      zoneTriggers(guardians, {
        kind: "start-turn",
        creatureId: "goblin",
        turn: turn(1, "goblin"),
      })
    ).toEqual({ fires: false, reason: "not-a-trigger" });
  });

  it("forced in, or the zone moved onto it, still counts", () => {
    expect(
      zoneTriggers(guardians, {
        kind: "moved-onto",
        creatureId: "orc",
        turn: turn(1, "cleric"),
        forced: true,
      }).fires
    ).toBe(true);
  });

  it("Spike Growth hits every 5 feet moved, no once-a-turn limit", () => {
    const [spikes] = activeZones([zoneEffect("z2", "spike-growth", 2)]);
    if (!spikes) throw new Error("no zone");
    const once = zoneTriggers(spikes, {
      kind: "move-within",
      creatureId: "orc",
      turn: turn(1, "orc"),
    });
    expect(once.fires).toBe(true);
    expect(
      zoneTriggers(
        spikes,
        { kind: "move-within", creatureId: "orc", turn: turn(1, "orc") },
        once.fires ? once.ledger : {}
      ).fires
    ).toBe(true);
  });
});

describe("light where zones overlap", () => {
  it("Darkness and Daylight dispel each other by level", () => {
    const darkness = zoneEffect("d", "darkness", 2);
    const daylight = zoneEffect("l", "daylight", 3);
    expect(zoneLight(activeZones([darkness]))).toBe("magical-darkness");
    expect(zoneLight(activeZones([darkness, daylight]))).toBe("bright");
    // A Darkness cast at 4th level is stronger than a 3rd-level Daylight.
    expect(zoneLight(activeZones([daylight, zoneEffect("d4", "darkness", 4)]))).toBe(
      "magical-darkness"
    );
    expect(zoneLight(activeZones([zoneEffect("s", "spirit-guardians", 3)]))).toBeNull();
  });
});
