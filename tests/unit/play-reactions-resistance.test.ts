/**
 * The reaction extras and the choice-resistance pick on the new Play screen (headless),
 * from the classic sheet's own rules. 2024 Ready: the readied spell «is released with
 * your Reaction»; an off-list reaction (an opportunity attack called out loud) spends
 * the Reaction too. SRD Fiendish Resilience: «Choose one damage type, other than Force
 * … You have Resistance to that damage type until you choose a different one».
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import {
  choiceResistanceView,
  pickChoiceResistance,
  reactionExtrasView,
} from "@/domains/play/reactions-resistance-view";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { concentrationValue } from "@/lib/concentration";
import { nextChoiceResistancePicks } from "@/lib/choice-resistance-pick";
import {
  OFF_LIST_REACTION_ID,
  offListReactionAction,
} from "@/lib/play/off-list-reaction";
import { READIED_SPELL_REACTION_ID } from "@/lib/play/ready";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

const t = ((key: string) => key) as unknown as TFunction;

describe("nextChoiceResistancePicks", () => {
  it("adds under the cap, removes a picked one", () => {
    expect(nextChoiceResistancePicks([], 2, "fire")).toEqual(["fire"]);
    expect(nextChoiceResistancePicks(["fire", "cold"], 2, "fire")).toEqual(["cold"]);
  });

  it("a single-pick slot replaces; a full multi-pick slot ignores the tap", () => {
    expect(nextChoiceResistancePicks(["fire"], 1, "cold")).toEqual(["cold"]);
    expect(nextChoiceResistancePicks(["fire", "cold"], 2, "acid")).toBe(null);
  });
});

const fiend = () =>
  makeCharacterDoc({
    classes: [{ classId: "warlock", level: 10, subclassId: "fiend-patron" }],
    features: [{ srdId: "warlock-fiend-patron-fiendish-resilience" }],
  });

describe("choiceResistanceView", () => {
  it("Fiendish Resilience: one pick of every type but Force, none picked yet", () => {
    const [slot, ...rest] = choiceResistanceView(fiend());
    expect(rest).toEqual([]);
    expect(slot).toMatchObject({
      choiceKey: "warlock-fiend-patron-fiendish-resilience",
      amount: 1,
      picked: [],
    });
    expect(slot?.options).toContain("fire");
    expect(slot?.options).not.toContain("force");
  });

  it("no choice-resistance feature: no slot", () => {
    expect(choiceResistanceView(makeCharacterDoc({}))).toEqual([]);
  });
});

describe("pickChoiceResistance", () => {
  beforeEach(() => useCharacterStore.getState().setCharacter(fiend()));

  it("picking Fire gives the open sheet Resistance to Fire", () => {
    const [slot] = choiceResistanceView(fiend());
    if (!slot) throw new Error("no slot");
    pickChoiceResistance(slot, "fire");
    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("no sheet");
    expect(choiceResistanceView(doc)[0]?.picked).toEqual(["fire"]);
    const { damageResistances } = aggregateCharacterGrants(doc.character, doc.session);
    expect(damageResistances.has("fire")).toBe(true);
  });
});

describe("reactionExtrasView", () => {
  const free = { reactionUsed: false, reactionUsedId: null };

  it("nothing readied: no readied row; the off-list row is free", () => {
    expect(reactionExtrasView(makeCharacterDoc({}), free, "en")).toEqual({
      readied: null,
      offList: { disabled: false, committed: false },
    });
  });

  it("a readied spell reads as its name, released with the Reaction", () => {
    const doc = makeCharacterDoc(
      {},
      {
        concentration: concentrationValue("hold-person"),
        readiedSpell: { expiresRound: 3 },
      }
    );
    expect(reactionExtrasView(doc, free, "en").readied).toEqual({
      name: "Hold Person",
      disabled: false,
      committed: false,
    });
    const released = reactionExtrasView(
      doc,
      { reactionUsed: true, reactionUsedId: READIED_SPELL_REACTION_ID },
      "en"
    );
    expect(released.readied).toMatchObject({ disabled: true, committed: true });
    expect(released.offList).toEqual({ disabled: true, committed: false });
  });

  it("the off-list reaction is the classic sheet's synthesized action", () => {
    const action = offListReactionAction(t);
    expect(action).toMatchObject({ id: OFF_LIST_REACTION_ID, type: "reaction" });
    expect(
      reactionExtrasView(
        makeCharacterDoc({}),
        { reactionUsed: true, reactionUsedId: OFF_LIST_REACTION_ID },
        "en"
      ).offList
    ).toEqual({ disabled: true, committed: true });
  });
});
