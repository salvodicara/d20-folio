/**
 * The class picks a stored character still owes against its level table. The
 * counts come from the 2024 class tables as the app's class data carries them
 * (src/data/classes/*.ts, the SRD 5.2.1 "<Class> Features" tables):
 *
 *   - Warlock Features, Eldritch Invocations column: 1 at L1, 3 at L2, 5 at L5,
 *     6 at L7, 7 at L9, 8 at L12, 9 at L15, 10 at L18; Cantrips 2 / 3 at L4 / 4 at L10.
 *   - Sorcerer Features, Metamagic: 2 at L2, 4 at L10, 6 at L17; Cantrips 4 / 5 / 6.
 *   - Wizard Features, Cantrips: 3, 4 at L4, 5 at L10.
 *   - Fighter Features, Weapon Mastery column: 3, 4 at L4, 5 at L10, 6 at L16.
 *     Paladin: Weapon Mastery 2 at every level.
 *   - Battle Master (PHB 2024 Combat Superiority): 3 maneuvers at Fighter 3, +2 at
 *     7, 10 and 15.
 *
 * Prepared spells are a cap the player fills from the list, not picks owed: none
 * of the 2024 tables has a "Spells Known" column, so none is reported.
 */
import { describe, expect, it } from "vitest";

import { commitLevelUp, type LevelUpPicks } from "@/lib/level-up-commit";
import { emptyAsiChoice } from "@/lib/level-up-choices";
import { EMPTY_CHOICE_PICKS } from "@/lib/feature-choices";
import { emptySwapChoice } from "@/lib/spell-swap";
import {
  applyOwedClassPicks,
  owedClassPicks,
  type OwedClassPick,
} from "@/lib/owed-class-picks";
import { unresolvedBuildChoices } from "@/lib/unresolved-build-choices";
import type { CharacterData, ClassEntry, SrdSpellRef } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const INVOCATIONS = [
  "agonizing-blast",
  "armor-of-shadows",
  "devils-sight",
  "eldritch-mind",
  "eldritch-spear",
  "fiendish-vigor",
];

const cantrips = (...ids: string[]): SrdSpellRef[] =>
  ids.map((srdId) => ({ srdId, prepared: true }));

function build(classes: ClassEntry[], extra: Partial<CharacterData> = {}) {
  return makeCharacterDoc({ classes, ...extra }).character;
}

describe("owedClassPicks", () => {
  it("a Warlock 5 with one invocation owes four (the column reads 5 at L5)", () => {
    const c = build(
      [{ classId: "warlock", level: 5, invocationChoices: ["agonizing-blast"] }],
      {
        spells: cantrips("eldritch-blast", "chill-touch", "minor-illusion"),
      }
    );
    expect(owedClassPicks(c)).toEqual<OwedClassPick[]>([
      { classId: "warlock", pick: "invocations", owed: 4 },
    ]);
    // The banner's list carries it too.
    expect(unresolvedBuildChoices(c, {})).toContainEqual({
      kind: "class-pick",
      classId: "warlock",
      pick: "invocations",
      owed: 4,
    });
  });

  it("a level-appropriate character owes nothing", () => {
    const warlock = build(
      [{ classId: "warlock", level: 5, invocationChoices: INVOCATIONS.slice(0, 5) }],
      { spells: cantrips("eldritch-blast", "chill-touch", "minor-illusion") }
    );
    expect(owedClassPicks(warlock)).toEqual([]);
    const fighter = build([
      {
        classId: "fighter",
        level: 4,
        weaponMasteries: ["longsword", "greatsword", "longbow", "handaxe"],
      },
    ]);
    expect(owedClassPicks(fighter)).toEqual([]);
    // A class with none of these columns owes nothing.
    expect(owedClassPicks(build([{ classId: "monk", level: 9 }]))).toEqual([]);
  });

  it("never reports a negative count, nor a pick the table doesn't give yet", () => {
    const c = build([{ classId: "wizard", level: 1 }], {
      spells: cantrips("fire-bolt", "light", "mage-hand", "message", "ray-of-frost"),
    });
    // (The Wizard's empty book is its own pick: wizard-spellbook.test.ts.)
    expect(owedClassPicks(c).filter((o) => o.pick !== "spellbook")).toEqual([]);
    // Sorcerer 1: Metamagic opens at 2.
    const sorc = build([{ classId: "sorcerer", level: 1 }], {
      spells: cantrips("fire-bolt", "light", "mage-hand", "message"),
    });
    expect(owedClassPicks(sorc)).toEqual([]);
    // More invocations than the column (added by hand) is no debt, nor a credit.
    const warlock = build(
      [{ classId: "warlock", level: 2, invocationChoices: INVOCATIONS }],
      { spells: cantrips("eldritch-blast", "chill-touch") }
    );
    expect(owedClassPicks(warlock)).toEqual([]);
  });

  it("a multiclass Sorcerer/Warlock is counted per class, each at its own level", () => {
    const c = build(
      [
        {
          classId: "sorcerer",
          level: 10,
          metamagicChoices: ["careful-spell", "distant-spell"],
        },
        { classId: "warlock", level: 2, invocationChoices: ["agonizing-blast"] },
      ],
      {
        // Six Sorcerer cantrips; Eldritch Blast is the Warlock's only one.
        spells: cantrips(
          "fire-bolt",
          "light",
          "mage-hand",
          "message",
          "ray-of-frost",
          "sorcerous-burst",
          "eldritch-blast"
        ),
      }
    );
    expect(owedClassPicks(c)).toEqual<OwedClassPick[]>([
      { classId: "sorcerer", pick: "metamagic", owed: 2 },
      { classId: "warlock", pick: "invocations", owed: 2 },
      { classId: "warlock", pick: "cantrips", owed: 1 },
    ]);
  });

  it("a class cantrip off the class's list (added by hand) still fills the count", () => {
    // Wizard 1 knows 3; Sacred Flame is a Cleric cantrip, kept as a deviation.
    const c = build([{ classId: "wizard", level: 1 }], {
      spells: cantrips("fire-bolt", "light", "sacred-flame"),
    });
    expect(owedClassPicks(c).filter((o) => o.pick !== "spellbook")).toEqual([]);
  });

  it("Weapon Mastery follows the column: a Fighter 4 with 3 masteries owes 1, a Paladin's 2 is flat", () => {
    const fighter = build([
      {
        classId: "fighter",
        level: 4,
        weaponMasteries: ["longsword", "greatsword", "longbow"],
      },
    ]);
    expect(owedClassPicks(fighter)).toEqual([
      { classId: "fighter", pick: "weaponMasteries", owed: 1 },
    ]);
    const paladin = build([
      { classId: "paladin", level: 11, weaponMasteries: ["longsword", "javelin"] },
    ]);
    expect(owedClassPicks(paladin)).toEqual([]);
  });

  it("cantrips known: only the class's own count, never a species or feat cantrip", () => {
    // Wizard 4 knows 4. A feat's or a species' cantrip is always prepared and
    // doesn't fill the class's count.
    const c = build([{ classId: "wizard", level: 4 }], {
      spells: [
        ...cantrips("fire-bolt", "light", "mage-hand"),
        { srdId: "prestidigitation", prepared: true, alwaysPrepared: true },
        { srdId: "sacred-flame", prepared: true, alwaysPrepared: true },
        { srdId: "magic-missile", prepared: true },
      ],
    });
    expect(owedClassPicks(c).filter((o) => o.pick !== "spellbook")).toEqual([
      { classId: "wizard", pick: "cantrips", owed: 1 },
    ]);
  });

  it("maneuvers: a Battle Master 7 with three owes two", () => {
    const c = build(
      [
        {
          classId: "fighter",
          level: 7,
          maneuverChoices: ["a", "b", "c"],
          weaponMasteries: ["club", "dagger", "spear", "mace"],
        },
      ],
      { features: [{ srdId: "fighter-battle-master-combat-superiority" }] }
    );
    expect(owedClassPicks(c)).toEqual([
      { classId: "fighter", pick: "maneuvers", owed: 2 },
    ]);
    // Without the subclass there's no maneuver track.
    expect(
      owedClassPicks(
        build([
          {
            classId: "fighter",
            level: 7,
            weaponMasteries: ["club", "dagger", "spear", "mace"],
          },
        ])
      )
    ).toEqual([]);
  });
});

describe("applyOwedClassPicks", () => {
  it("stores each answer where the level-up stores it, and the debt is gone", () => {
    const c = build(
      [
        {
          classId: "sorcerer",
          level: 10,
          metamagicChoices: ["careful-spell", "distant-spell"],
        },
        { classId: "warlock", level: 2, invocationChoices: ["agonizing-blast"] },
      ],
      {
        spells: cantrips(
          "fire-bolt",
          "light",
          "mage-hand",
          "message",
          "ray-of-frost",
          "sorcerous-burst"
        ),
      }
    );
    const next = applyOwedClassPicks(c, [
      {
        classId: "sorcerer",
        pick: "metamagic",
        ids: ["empowered-spell", "extended-spell"],
      },
      {
        classId: "warlock",
        pick: "invocations",
        ids: ["armor-of-shadows", "devils-sight"],
      },
      { classId: "warlock", pick: "cantrips", ids: ["eldritch-blast", "chill-touch"] },
    ]);
    expect(next.classes).toEqual([
      {
        classId: "sorcerer",
        level: 10,
        metamagicChoices: [
          "careful-spell",
          "distant-spell",
          "empowered-spell",
          "extended-spell",
        ],
      },
      {
        classId: "warlock",
        level: 2,
        invocationChoices: ["agonizing-blast", "armor-of-shadows", "devils-sight"],
      },
    ]);
    expect(next.spells.slice(-2)).toEqual([
      { srdId: "eldritch-blast" },
      { srdId: "chill-touch" },
    ]);
    expect(owedClassPicks(next)).toEqual([]);
  });

  it("a mastery answer adds to the weapons already mastered; more than owed is cut", () => {
    const c = build([
      {
        classId: "fighter",
        level: 4,
        weaponMasteries: ["longsword", "greatsword", "longbow"],
      },
    ]);
    const next = applyOwedClassPicks(c, [
      { classId: "fighter", pick: "weaponMasteries", ids: ["handaxe", "javelin"] },
    ]);
    expect(next.classes[0]?.weaponMasteries).toEqual([
      "longsword",
      "greatsword",
      "longbow",
      "handaxe",
    ]);
  });

  it("an answer for a pick that isn't owed writes nothing", () => {
    const c = build(
      [{ classId: "warlock", level: 5, invocationChoices: INVOCATIONS.slice(0, 5) }],
      { spells: cantrips("eldritch-blast", "chill-touch", "minor-illusion") }
    );
    expect(
      applyOwedClassPicks(c, [
        { classId: "warlock", pick: "invocations", ids: ["fiendish-vigor"] },
      ])
    ).toBe(c);
  });
});

describe("level-up and the report agree", () => {
  function picks(over: Partial<LevelUpPicks>): LevelUpPicks {
    return {
      classId: "warlock",
      asi: emptyAsiChoice(),
      subclassId: null,
      fightingStyle: null,
      expertise: [],
      weaponMasteries: null,
      metamagic: [],
      maneuvers: [],
      invocations: [],
      newCantrips: [],
      newSpells: [],
      choiceSlots: {
        skill: [],
        tool: [],
        skillOrTool: [],
        language: [],
        spell: [],
        expertise: [],
        feat: [],
      },
      choicePicks: EMPTY_CHOICE_PICKS,
      multiclass: null,
      spellMastery: null,
      signatureSpells: null,
      swap: emptySwapChoice(),
      bundlePicks: {},
      ...over,
    };
  }

  it("a Warlock 4 → 5 given the level's picks owes nothing after commitLevelUp", () => {
    const doc = makeCharacterDoc({
      classes: [
        { classId: "warlock", level: 4, invocationChoices: INVOCATIONS.slice(0, 3) },
      ],
      spells: cantrips("eldritch-blast", "chill-touch", "minor-illusion"),
    });
    expect(owedClassPicks(doc.character)).toEqual([]);
    const after = commitLevelUp(
      doc,
      picks({ invocations: ["eldritch-mind", "eldritch-spear"] })
    );
    expect(owedClassPicks(after.character)).toEqual([]);
    // Without the picks the report asks them.
    expect(owedClassPicks(commitLevelUp(doc, picks({})).character)).toEqual([
      { classId: "warlock", pick: "invocations", owed: 2 },
    ]);
  });

  it("a Sorcerer 9 → 10 given metamagic and a cantrip owes nothing", () => {
    const doc = makeCharacterDoc({
      classes: [
        {
          classId: "sorcerer",
          level: 9,
          metamagicChoices: ["careful-spell", "distant-spell"],
        },
      ],
      spells: cantrips("fire-bolt", "light", "mage-hand", "message", "ray-of-frost"),
    });
    const after = commitLevelUp(
      doc,
      picks({
        classId: "sorcerer",
        metamagic: ["empowered-spell", "extended-spell"],
        newCantrips: ["sorcerous-burst"],
      })
    );
    expect(owedClassPicks(after.character)).toEqual([]);
  });
});
