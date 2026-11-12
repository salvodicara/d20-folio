/**
 * The turn's start on the new Play screen (headless): the classic turn notes, from the
 * same resolvers. 2024 Champion «Heroic Rally»: «at the start of each of your turns, you
 * regain Hit Points equal to 5 plus your Constitution modifier if you are Bloodied and
 * have at least 1 Hit Point». The player applies it in one tap; it is never automatic.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import { applyTurnStartOffer, turnStartNotes } from "@/domains/play/turn-start-notes";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

const t = ((key: string) => key) as unknown as TFunction;

/** A level-18 Champion with CON 14 (+2) and 100 maximum HP, at `hp` Hit Points. */
const champion = (hp: number) =>
  makeCharacterDoc(
    {
      classes: [{ classId: "fighter", level: 18, subclassId: "champion" }],
      abilityScores: { STR: 18, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      features: [{ srdId: "fighter-champion-survivor" }],
      hp: { max: 100 },
    },
    { hp: { current: hp, temp: 0 } }
  );

describe("turnStartNotes", () => {
  it("Bloodied with HP left: Heroic Rally offers 5 + CON = 7", () => {
    expect(turnStartNotes(champion(40), { round: 2 })).toEqual([
      {
        kind: "heal",
        id: "turn-start:fighter-champion-survivor",
        sourceId: "fighter-champion-survivor",
        amount: 7,
      },
    ]);
  });

  it("not Bloodied, or at 0 HP: nothing to offer", () => {
    expect(turnStartNotes(champion(80), { round: 2 })).toEqual([]);
    expect(turnStartNotes(champion(0), { round: 2 })).toEqual([]);
  });

  it("no round-1 reminder outside round 1, and none without the feature", () => {
    expect(turnStartNotes(champion(80), { round: 1 })).toEqual([]);
  });
});

describe("applyTurnStartOffer", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(champion(40));
    useUndoStore.getState().clear();
  });

  it("heals the open sheet by the offer, and the undo takes it back", () => {
    const [offer] = turnStartNotes(champion(40), { round: 2 });
    if (!offer || (offer.kind !== "heal" && offer.kind !== "temp-hp"))
      throw new Error("no offer");
    expect(applyTurnStartOffer(offer, t)).toBe(true);
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(47);
    useUndoStore.getState().undo();
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(40);
  });

  it("at full HP nothing changes and nothing is recorded", () => {
    useCharacterStore.getState().setCharacter(champion(100));
    expect(
      applyTurnStartOffer(
        { kind: "heal", id: "x", sourceId: "fighter-champion-survivor", amount: 7 },
        t
      )
    ).toBe(false);
  });
});
