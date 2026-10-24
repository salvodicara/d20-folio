/**
 * What a rest would do, shown before it is taken (Play list row 19, approved): the
 * Hit Point Dice a Short Rest can spend and what each heals on average, and what the
 * rest gives back or ends. Read as the difference between the character now and
 * after the rest's own transition, so the preview can never promise what the rest
 * doesn't do. Cases: SRD 5.2.1 "Short Rest" / "Long Rest", a fighter's Second Wind and
 * Action Surge (both back on a Short Rest).
 */
import { describe, expect, it } from "vitest";

import { restPreview } from "@/lib/play/rest-preview";
import { makeCharacterDoc } from "./_helpers";

const tiredFighter = () =>
  makeCharacterDoc(
    {
      classId: "fighter",
      level: 5,
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 8 },
      features: [{ srdId: "fighter-second-wind" }, { srdId: "fighter-action-surge" }],
    },
    {
      hp: { current: 20, temp: 0 },
      hitDice: { used: 3 },
      trackers: {
        "fighter-second-wind": { used: 2 },
        "fighter-action-surge": { used: 1 },
      },
    }
  );

describe("restPreview — Short Rest", () => {
  const preview = restPreview(tiredFighter(), "short");

  it("the Hit Dice left to spend, and what one heals on average", () => {
    // Level 5: five d10, three spent. Average d10 = 6, CON 14 (+2): 8 per die.
    expect(preview.hitDice).toEqual({ total: 5, available: 2 });
    expect(preview.perDieHeal).toEqual([{ die: 10, average: 8 }]);
  });

  it("what comes back: the uses a Short Rest restores", () => {
    expect(preview.recovers).toEqual(
      expect.arrayContaining([
        { kind: "tracker", id: "fighter-action-surge", amount: 1 },
        { kind: "tracker", id: "fighter-second-wind", amount: 1 },
      ])
    );
    expect(preview.recovers.some((r) => r.kind === "hp")).toBe(false);
  });
});

describe("restPreview — Long Rest", () => {
  const preview = restPreview(tiredFighter(), "long");

  it("all HP back, all spent Hit Dice (SRD 5.2.1), every use", () => {
    expect(preview.recovers).toEqual(
      expect.arrayContaining([
        { kind: "hp", amount: expect.any(Number) as number },
        { kind: "hit-dice", amount: 3 },
        { kind: "tracker", id: "fighter-second-wind", amount: 2 },
        { kind: "tracker", id: "fighter-action-surge", amount: 1 },
      ])
    );
  });

  it("nothing to restore, nothing listed", () => {
    const fresh = makeCharacterDoc({ classId: "fighter", level: 5 });
    expect(restPreview(fresh, "long").recovers).toEqual([]);
    expect(restPreview(fresh, "short").recovers).toEqual([]);
  });
});

describe("restPreview — what ends", () => {
  it("a rest ends Rage (it lasts at most 10 minutes)", () => {
    const raging = makeCharacterDoc(
      { classId: "barbarian", level: 3, features: [{ srdId: "barbarian-rage" }] },
      { activeFeatures: ["barbarian-rage"] }
    );
    expect(restPreview(raging, "short").ends).toEqual(["barbarian-rage"]);
    expect(restPreview(raging, "long").ends).toEqual(["barbarian-rage"]);
  });
});
