/**
 * What a spell does to one target from its Hit Points, as the Play screen's tray asks
 * and shows it (approved prototypes cast-pw, cast-revive): Power Word asks the DM when
 * the viewer can't see the creature's Hit Points, and keeps the answer; Revivify says
 * what the creature comes back with, and whether it has been dead too long.
 */
import { describe, expect, it } from "vitest";
import { trayOutcomeView } from "@/domains/play/tray-form";
import {
  initialTrayRow,
  setThresholdAnswer,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

// The plans as the engine builds them (tests/unit/tray-threshold.test.ts).
const stun: DamageTrayPlan = {
  effect: null,
  hitPointThreshold: { max: 150, atOrBelow: "condition", otherwise: "speed-zero" },
  conditions: { options: ["stunned"], pickOne: false },
  targets: ["m1"],
};
const revivify: DamageTrayPlan = {
  effect: null,
  revive: { hitPoints: 1, withinMinutes: 1 },
  targets: ["pc-mara"],
};

describe("trayOutcomeView — Power Word Stun", () => {
  const unseen = initialTrayRow(stun, "m1");

  it("asks the DM when the creature's Hit Points are hidden", () => {
    expect(trayOutcomeView(unseen, stun, false, null)).toEqual({
      kind: "threshold",
      max: 150,
      atOrBelow: "condition",
      otherwise: "speed-zero",
      ask: true,
      answer: null,
    });
  });

  it("keeps the DM's answer", () => {
    const yes = setThresholdAnswer(unseen, stun, true);
    expect(trayOutcomeView(yes, stun, false, null)).toMatchObject({
      ask: true,
      answer: true,
    });
    const no = setThresholdAnswer(unseen, stun, false);
    expect(trayOutcomeView(no, stun, false, null)).toMatchObject({
      ask: true,
      answer: false,
    });
  });

  it("doesn't ask when the Hit Points are seen", () => {
    const seen = initialTrayRow(stun, "m1", undefined, undefined, {
      current: 40,
      max: 40,
    });
    expect(trayOutcomeView(seen, stun, true, null)).toMatchObject({
      ask: false,
      answer: true,
    });
  });
});

describe("trayOutcomeView — Revivify", () => {
  const row = initialTrayRow(revivify, "pc-mara");
  const dead = (minutesSince: number): CharacterDoc => {
    const doc = makeCharacterDoc(
      { classId: "fighter", level: 3 },
      { hp: { current: 0, temp: 0 } }
    );
    return { ...doc, session: { ...doc.session, deathFail: 3, death: { minutesSince } } };
  };

  it("brings a creature back with 1 Hit Point", () => {
    expect(trayOutcomeView(row, revivify, false, null)).toMatchObject({
      kind: "revive",
      hitPoints: 1,
    });
  });

  it("names how long it has been dead, within Revivify's minute", () => {
    expect(trayOutcomeView(row, revivify, false, dead(0.5))).toMatchObject({
      eligibility: { kind: "dead", minutesSince: 0.5, within: true },
    });
    expect(trayOutcomeView(row, revivify, false, dead(3))).toMatchObject({
      eligibility: { kind: "dead", within: false },
    });
  });

  it("leaves it to the table when it can't read the target", () => {
    expect(trayOutcomeView(row, revivify, false, null)).toMatchObject({
      eligibility: { kind: "dead", within: null },
    });
  });
});
