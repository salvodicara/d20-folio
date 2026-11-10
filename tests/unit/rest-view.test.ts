/**
 * The Play screen's rest dialogs (approved prototypes rest-short, rest-long): a Short
 * Rest spends Hit Point Dice, heals the entered roll plus Constitution, and names what
 * else comes back or ends; a Long Rest lists what the character wakes with. Read from
 * the engine's own preview (`restPreview`), so it never promises what the rest doesn't do.
 */
import { describe, expect, it } from "vitest";
import { restView } from "@/domains/play/rest-view";
import { shortRestHeal } from "@/lib/play/short-rest-healing";
import { buildDevScenario } from "@/lib/dev-scenarios";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

/** The level 7 dev druid, hurt, two dice and a Wild Shape use spent, one slot used. */
function tired(): CharacterDoc {
  const doc = buildDevScenario("potent-druid");
  if (!doc) throw new Error("the potent-druid scenario is missing");
  return {
    ...doc,
    session: {
      ...doc.session,
      hp: { ...doc.session.hp, current: 20 },
      hitDice: { used: 2 },
      exhaustion: 2,
      trackers: { ...doc.session.trackers, "druid-wild-shape": { used: 1 } },
      spellSlots: { ...doc.session.spellSlots, "1": { used: 2 } },
    },
  };
}

describe("restView — Short Rest", () => {
  const view = restView(tired(), "short", "it");

  it("offers the dice left, by size", () => {
    expect(view.hitDice).toEqual({ available: 5, total: 7, dice: [8, 8, 8, 8, 8] });
  });

  it("names a use that comes back", () => {
    expect(view.recovers).toContainEqual({
      kind: "tracker",
      name: "Forma Selvatica",
      amount: 1,
    });
  });

  it("does not promise the Long Rest's recoveries", () => {
    expect(view.recovers.map((r) => r.kind)).not.toContain("slot");
    expect(view.recovers.map((r) => r.kind)).not.toContain("exhaustion");
  });
});

describe("restView — Long Rest", () => {
  const view = restView(tired(), "long", "it");

  it("wakes with full Hit Points", () => {
    expect(view.recovers).toContainEqual({ kind: "hp", from: 20, to: view.hp.max });
  });

  it("gets every spell slot back", () => {
    expect(view.recovers).toContainEqual({ kind: "slots", amount: 2, all: true });
  });

  it("gets the spent Hit Point Dice back, and says how many there are", () => {
    expect(view.recovers).toContainEqual({ kind: "hit-dice", amount: 2, total: 7 });
  });

  it("steps Exhaustion down by one", () => {
    expect(view.recovers).toContainEqual({ kind: "exhaustion", from: 2, to: 1 });
  });
});

describe("shortRestHeal", () => {
  it("heals the entered roll plus Constitution for each die", () => {
    // WIS-druid with CON 14 (+2): two dice rolled 9 heal 9 + 2 × 2.
    expect(shortRestHeal(tired(), 2, "9")).toEqual({ heal: 13, valid: true });
  });

  it("refuses a roll the dice can't make", () => {
    expect(shortRestHeal(tired(), 2, "17")).toEqual({ heal: null, valid: false });
  });

  it("needs no roll without dice", () => {
    expect(shortRestHeal(tired(), 0, "")).toEqual({ heal: 0, valid: true });
  });
});

describe("restView — who can rest (2024: a rest needs at least 1 Hit Point)", () => {
  const at = (hp: number, deathFail = 0): CharacterDoc => {
    const doc = makeCharacterDoc(
      { classId: "fighter", level: 3 },
      { hp: { current: hp, temp: 0 } }
    );
    return { ...doc, session: { ...doc.session, deathFail } };
  };
  it("standing: the rest can begin", () => {
    expect(restView(at(5), "short", "it").blocked).toBeNull();
  });
  it("at 0 Hit Points: not until it has 1", () => {
    expect(restView(at(0), "long", "it").blocked).toBe("zero-hp");
  });
  it("dead: no rest", () => {
    expect(restView(at(0, 3), "short", "it").blocked).toBe("dead");
  });
});
