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
  maneuverOptionsFor,
} from "@/domains/play/after-hit-options";
import {
  applyEscapeCheck,
  applyHideCheck,
  checkEntriesFor,
  skillBonusFor,
} from "@/domains/play/check-entry";
import { ESCAPE_GRAPPLE_ACTION_ID } from "@/lib/play/escape-grapple";
import { localizeActions, type CombatAction } from "@/lib/views/combat-action-view";
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
      maneuvers: [],
    });
  });
});

describe("Cunning Strike rides Sneak Attack: a Finesse or Ranged weapon only", () => {
  // SRD 5.2.1 Sneak Attack: «the attack must use a Finesse or a Ranged weapon»;
  // Cunning Strike: «when you deal Sneak Attack damage».
  const armed = rogue({});
  const withWeapons = {
    ...armed,
    character: {
      ...armed.character,
      weapons: [
        { srdId: "rapier", quantity: 1 },
        { srdId: "shortbow", quantity: 1 },
        { srdId: "club", quantity: 1 },
      ],
    },
  };
  const cunning = cunningStrikeOptionsFor(withWeapons, "en");
  const offered = (pick: (id: string) => boolean) =>
    afterHitOptions(actionOf(withWeapons, pick), cunning).cunningStrike.length > 0;

  it.each([
    ["a Rapier (Finesse)", (id: string) => id === "weapon-rapier", true],
    ["a Shortbow (Ranged)", (id: string) => id === "weapon-shortbow", true],
    ["an Unarmed Strike", (id: string) => id.startsWith("unarmed"), false],
    ["a Club (neither)", (id: string) => id === "weapon-club", false],
  ])("%s: %s", (_name, pick, expected) => {
    expect(cunning.length).toBeGreaterThan(0);
    expect(offered(pick)).toBe(expected);
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

describe("after a hit: the on-hit maneuvers", () => {
  // Rows as the engine builds them for a learned maneuver (`grantedActionRows`): no
  // action of its own ("free"), a Superiority Die from a tracker, and the roll the
  // die adds to. Synthetic ids: the maneuver catalogue is private content.
  const row = (id: string, summary: Record<string, unknown>, type = "free") =>
    ({ id, name: id, type, source: "feature", summary }) as unknown as CombatAction;
  const dice = { uses: { current: 3, total: 4 }, die: "d8" };
  const onDamage = row("m-shove", {
    ...dice,
    dieAddsTo: "damage",
    saveAbility: "STR",
    saveDC: 14,
  });
  const onAttackRoll = row("m-aim", { ...dice, dieAddsTo: "attack-roll" });
  const elsewhere = row("m-check", { ...dice });
  const asBonus = row("m-bonus", { ...dice, dieAddsTo: "damage" }, "bonus");

  it("lists the free rows whose die adds to the hit's damage or attack roll", () => {
    expect(maneuverOptionsFor([onDamage, onAttackRoll, elsewhere, asBonus])).toEqual([
      {
        action: onDamage,
        id: "m-shove",
        name: "m-shove",
        die: "d8",
        diceLeft: 3,
        diceTotal: 4,
        addsTo: "damage",
        save: { ability: "STR", dc: 14 },
        disabled: false,
      },
      {
        action: onAttackRoll,
        id: "m-aim",
        name: "m-aim",
        die: "d8",
        diceLeft: 3,
        diceTotal: 4,
        addsTo: "attack-roll",
        save: null,
        disabled: false,
      },
    ]);
  });

  it("with no Superiority Dice left, each comes disabled", () => {
    const spent = row("m-shove", {
      uses: { current: 0, total: 4 },
      die: "d8",
      dieAddsTo: "damage",
    });
    expect(maneuverOptionsFor([spent])[0]).toMatchObject({ diceLeft: 0, disabled: true });
  });

  it("a weapon attack offers them; a non-weapon action does not", () => {
    const doc = rogue();
    const maneuvers = maneuverOptionsFor([onDamage]);
    const sword = localizeActions(doc, "en").find(
      (a) => a.weaponFacts && a.type === "action"
    );
    if (!sword) throw new Error("no weapon attack");
    expect(afterHitOptions(sword, [], maneuvers).maneuvers).toEqual(maneuvers);
    const hide = actionOf(doc, (id) => id === "base-hide");
    expect(afterHitOptions(hide, [], maneuvers).maneuvers).toEqual([]);
  });
});
