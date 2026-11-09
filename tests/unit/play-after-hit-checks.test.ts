/**
 * After a hit, and the check entries, on the new Play screen (headless): the classic
 * action card's options and checks, from the same functions. 2024 Rogue Cunning
 * Strike: «When you deal Sneak Attack damage, you can add one of the following Cunning
 * Strike effects»; Hide: «make a DC 15 Dexterity (Stealth) check. On a successful
 * check, you have the Invisible condition»; escaping a grapple: «a Strength
 * (Athletics) or Dexterity (Acrobatics) check against the escape DC».
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import {
  afterHitOptions,
  cunningStrikeOptionsFor,
} from "@/domains/play/after-hit-options";
import {
  applyEscapeCheck,
  applyHideCheck,
  checkEntriesFor,
  skillBonusFor,
} from "@/domains/play/check-entry";
import { ESCAPE_GRAPPLE_ACTION_ID } from "@/lib/play/escape-grapple";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

const t = ((key: string) => key) as unknown as TFunction;

/** A level-5 Rogue (DEX 16) with a Shortsword and Cunning Strike. */
const rogue = (session = {}) =>
  makeCharacterDoc(
    {
      classes: [{ classId: "rogue", level: 5 }],
      abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 10, CHA: 10 },
      features: [{ srdId: "rogue-sneak-attack" }, { srdId: "rogue-cunning-strike" }],
      weapons: [{ srdId: "shortsword", quantity: 1 }],
    },
    session
  );

const actionOf = (doc: ReturnType<typeof rogue>, pick: (id: string) => boolean) => {
  const action = localizeActions(doc, "en").find((a) => pick(a.id));
  if (!action) throw new Error("no such action");
  return action;
};

describe("after a hit", () => {
  it("a level-5 Rogue has Cunning Strike options; a Fighter has none", () => {
    expect(cunningStrikeOptionsFor(rogue(), "en").length).toBeGreaterThan(0);
    expect(
      cunningStrikeOptionsFor(
        makeCharacterDoc({ classes: [{ classId: "fighter", level: 5 }] }),
        "en"
      )
    ).toEqual([]);
  });

  it("a weapon attack offers them; a non-weapon action does not", () => {
    const doc = rogue();
    const cunning = cunningStrikeOptionsFor(doc, "en");
    const sword = localizeActions(doc, "en").find(
      (a) => a.weaponFacts && a.type === "action"
    );
    if (!sword) throw new Error("no weapon attack");
    expect(afterHitOptions(sword, cunning).cunningStrike).toEqual(cunning);
    const hide = actionOf(doc, (id) => id === "base-hide");
    expect(afterHitOptions(hide, cunning)).toEqual({
      riders: [],
      mastery: [],
      cunningStrike: [],
    });
  });
});

describe("check entries", () => {
  it("Hide: DC 15 Stealth with the sheet's bonus (DEX +3, proficient or not)", () => {
    const doc = rogue();
    const bonusFor = skillBonusFor(doc);
    const [entry] = checkEntriesFor(
      actionOf(doc, (id) => id === "base-hide"),
      bonusFor
    );
    expect(entry).toEqual({
      kind: "hide",
      dc: 15,
      skill: "stealth",
      bonus: bonusFor("stealth"),
    });
  });

  it("Escape a grapple: the better of Athletics and Acrobatics", () => {
    const doc = rogue({ conditions: ["grappled"] });
    const bonusFor = skillBonusFor(doc);
    const [entry] = checkEntriesFor(
      actionOf(doc, (id) => id === ESCAPE_GRAPPLE_ACTION_ID),
      bonusFor
    );
    expect(entry).toEqual({
      kind: "escape",
      skill: "acrobatics",
      bonus: bonusFor("acrobatics"),
    });
  });
});

describe("applying a check", () => {
  beforeEach(() => useUndoStore.getState().clear());

  it("a Hide total of 15 makes the open sheet Invisible; the undo takes it back", () => {
    useCharacterStore.getState().setCharacter(rogue());
    expect(applyHideCheck(12, { dc: 15, bonus: 3 }, t)).toBe(true);
    expect(useCharacterStore.getState().character?.session.conditions).toContain(
      "invisible"
    );
    useUndoStore.getState().undo();
    expect(useCharacterStore.getState().character?.session.conditions).not.toContain(
      "invisible"
    );
  });

  it("a Hide total under 15 changes nothing", () => {
    useCharacterStore.getState().setCharacter(rogue());
    expect(applyHideCheck(11, { dc: 15, bonus: 3 }, t)).toBe(false);
    expect(useCharacterStore.getState().character?.session.conditions).toEqual([]);
  });

  it("escaping at the DC drops Grappled; under it, nothing changes", () => {
    useCharacterStore.getState().setCharacter(rogue({ conditions: ["grappled"] }));
    expect(applyEscapeCheck(9, 13, 3, t)).toBe(false);
    expect(useCharacterStore.getState().character?.session.conditions).toEqual([
      "grappled",
    ]);
    expect(applyEscapeCheck(10, 13, 3, t)).toBe(true);
    expect(useCharacterStore.getState().character?.session.conditions).toEqual([]);
  });
});
