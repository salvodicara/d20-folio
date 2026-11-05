/**
 * A reaction taken when you fail a saving throw (Symbiotic Being), or a Constitution
 * one (Aberrant Fortitude): its trigger is a token the card words in both locales.
 */
import { describe, expect, it } from "vitest";

import { ALL_REACTION_TRIGGERS } from "@/data/types";
import i18n from "@/i18n";

describe("the self-fail-save reaction triggers", () => {
  it("are tokens a reaction can carry", () => {
    expect(ALL_REACTION_TRIGGERS).toEqual(
      expect.arrayContaining(["selfFailsSave", "selfFailsConSave"])
    );
  });

  it("are worded in English and Italian", () => {
    expect(i18n.getFixedT("en")("combat.reactionTrigger_selfFailsSave")).toBe(
      "you fail a saving throw"
    );
    expect(i18n.getFixedT("it")("combat.reactionTrigger_selfFailsConSave")).toBe(
      "fallisci un tiro salvezza su Costituzione"
    );
  });
});

describe("the self-succeeds-save reaction trigger", () => {
  it("is a token a reaction can carry, worded in English and Italian", () => {
    expect(ALL_REACTION_TRIGGERS).toContain("selfSucceedsSave");
    expect(i18n.getFixedT("en")("combat.reactionTrigger_selfSucceedsSave")).toBe(
      "you succeed on a saving throw"
    );
    expect(i18n.getFixedT("it")("combat.reactionTrigger_selfSucceedsSave")).toBe(
      "superi un tiro salvezza"
    );
  });
});
