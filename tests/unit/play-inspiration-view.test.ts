/**
 * «Ispirazione» on the Play header: what the character holds now, a received Bardic
 * Inspiration die and Heroic Inspiration (2024 rules: one of each at a time), counted for
 * the chip, so a player sees and spends what an ally or the DM gave them.
 */
import { describe, expect, it } from "vitest";

import { playInspirationView } from "@/domains/play/play-inspiration-view";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const holding = (inspiration: boolean, die: string): CharacterDoc => {
  const doc = makeCharacterDoc({ class: "Fighter" });
  return {
    ...doc,
    session: { ...doc.session, inspiration, bardicInspirationDie: die },
  };
};

describe("playInspirationView", () => {
  it("holds nothing: the chip counts zero", () => {
    expect(playInspirationView(holding(false, ""))).toEqual({
      heroic: false,
      die: null,
      count: 0,
    });
  });

  it("counts Heroic Inspiration and a held die together", () => {
    expect(playInspirationView(holding(true, "d8"))).toEqual({
      heroic: true,
      die: "d8",
      count: 2,
    });
  });

  it("ignores a die it cannot read", () => {
    expect(playInspirationView(holding(false, "x9")).die).toBeNull();
  });
});
