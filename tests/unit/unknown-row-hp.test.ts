/**
 * Missing = unknown, never 0 (#1306). A fight row whose live data has not loaded carries
 * `liveUnknown` and placeholder HP 0. That 0 must never read as an event: not damage
 * (which ends «until damaged» conditions), not a drop to 0 (the mark offer), not
 * Incapacitated (which ends the owner's Concentration and grapples, written once).
 */
import { describe, expect, it } from "vitest";
import { rowIsIncapacitated, incapacitationSweep } from "@/lib/combat-effects";
import { fightConditionEvents } from "@/lib/play/fight-condition-ends";
import { markDropOffers } from "@/lib/play/mark-offers";
import { makeCharacterDoc } from "./_helpers";

const known = { id: "pc-a", currentHp: 12, tempHp: 0, conditions: [] as string[] };
const unknown = {
  id: "pc-a",
  currentHp: 0,
  tempHp: 0,
  conditions: [] as string[],
  liveUnknown: true as const,
};

describe("an unknown row's placeholder HP is no event", () => {
  it("is not Incapacitated by its placeholder 0 HP", () => {
    expect(rowIsIncapacitated(unknown)).toBe(false);
    expect(rowIsIncapacitated({ ...unknown, conditions: ["stunned"] })).toBe(true);
  });

  it("the incapacitation sweep ends nothing when a row goes unknown", () => {
    const ops = [
      {
        kind: "apply",
        id: "conc-1",
        actor: { combatantId: "pc-a" },
        payload: { kind: "concentration" },
      },
    ] as never;
    expect(incapacitationSweep([known], [unknown], ops, () => true)).toEqual([]);
  });

  it("known → unknown is not damage", () => {
    const events = fightConditionEvents(
      { rows: [known], currentCombatantId: null },
      { rows: [unknown], currentCombatantId: null }
    );
    expect(events.filter((e) => e.kind === "damaged")).toEqual([]);
  });

  it("known → unknown is not a drop to 0 for the mark offer", () => {
    const hex = {
      id: "op-hex",
      kind: "apply",
      effect: {
        id: "hex-1",
        actor: { kind: "pc", combatantId: "pc-me", memberUid: "me" },
        target: { kind: "monster", combatantId: "monster-1" },
        source: { kind: "spell", id: "hex", actionId: "spell-hex" },
        payload: { kind: "target-mark", activeKey: "spell-hex", scope: "cursed" },
        duration: { kind: "encounter" },
      },
    } as never;
    const warlock = makeCharacterDoc(
      {
        classId: "warlock",
        level: 5,
        spells: [{ srdId: "hex", prepared: true }] as never,
      },
      { activeFeatures: ["spell-hex"], concentration: "hex" } as never
    );
    const before = [{ id: "monster-1", currentHp: 5 }];
    // The control: a real drop to 0 offers the move…
    expect(
      markDropOffers(warlock, before, [{ id: "monster-1", currentHp: 0 }], [hex], "pc-me")
    ).toHaveLength(1);
    // …an unknown row does not.
    expect(
      markDropOffers(
        warlock,
        before,
        [{ id: "monster-1", currentHp: 0, liveUnknown: true }],
        [hex],
        "pc-me"
      )
    ).toEqual([]);
  });
});
