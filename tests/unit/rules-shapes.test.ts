/**
 * The data shapes the rules lane authors ahead of their mechanisms (edge-case
 * families M3, M4, M14, M17): each one conforms at the authoring boundary, so a
 * catalogue entry or a homebrew one can carry it today.
 */
import { describe, expect, it } from "vitest";
import { conformHomebrewGrant } from "@/lib/grants";
import { homebrewActionDef } from "@/lib/homebrew-actions";
import type { ActionData } from "@/types/character";

const base = { type: "action", label: "Use", description: "Use it." } as const;

describe("rules shapes", () => {
  it("a failed repeat save applies its effects (Vision of Elapsing Eons)", () => {
    const action = {
      ...base,
      conditionApplication: {
        options: ["paralyzed"],
        on: "failed-save",
        ends: [
          {
            on: "repeat-save",
            ability: "INT",
            at: "target-turn-end",
            onFailedRepeatSave: [{ kind: "exhaustion", levels: 1 }],
          },
        ],
      },
    } as ActionData;
    expect(homebrewActionDef(action).conditionApplication?.ends?.[0]).toMatchObject({
      onFailedRepeatSave: [{ kind: "exhaustion", levels: 1 }],
    });
  });

  it("casting a school's spell can spend Hit Point Dice (Necromancy Adept)", () => {
    const trigger = {
      type: "trigger",
      on: "cast-spell",
      if: { school: "necromancy", slot: true },
      do: { kind: "hit-point-dice", max: 2, bonus: "slot-level" },
    };
    expect(conformHomebrewGrant(trigger)).toEqual(trigger);
    expect(
      conformHomebrewGrant({ ...trigger, do: { kind: "hit-point-dice" } })
    ).toBeNull();
  });

  it("each new effect kind rejects a malformed entry", () => {
    const bad = {
      ...base,
      effects: [{ kind: "exhaustion", upTo: 4 }],
    } as unknown as ActionData;
    expect(homebrewActionDef(bad).effects).toBeUndefined();
    const good = {
      ...base,
      effects: [{ kind: "exhaustion", levels: 1, upTo: 4 }],
    } as unknown as ActionData;
    expect(JSON.stringify(homebrewActionDef(good).effects)).toMatch(
      /"exhaustion"[^}]*"upTo":4/
    );
  });
});
