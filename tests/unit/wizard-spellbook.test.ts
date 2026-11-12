/**
 * The Wizard's spellbook (SRD 5.2.1 Wizard, "Spellbook"): six level 1 Wizard spells at
 * level 1, then "two Wizard spells of your choice" each Wizard level, of a level you
 * have spell slots for. The sheet's spell list is the book; `prepared` marks the
 * prepared ones. A grant's picks (Divination Savant) and always-prepared spells come on
 * top. A stored wizard short of the book owes the gap through «Scelte da completare»;
 * the picks land in the book, not prepared.
 */
import { describe, expect, it } from "vitest";

import { getSpellById } from "@/data/spells";
import { levelUpAsks, NO_ANSWERS } from "@/domains/leveling/level-up-asks";
import { emptyAsiChoice } from "@/lib/level-up-choices";
import { commitLevelUp } from "@/lib/level-up-commit";
import { levelUpPlan } from "@/lib/level-up-plan";
import { buildNewCharacter } from "@/lib/creation/build";
import {
  creationDraftReducer,
  creationFacts,
  initialCreationDraft,
} from "@/lib/creation/draft";
import {
  applyOwedClassPicks,
  classPickPool,
  owedClassPicks,
} from "@/lib/owed-class-picks";
import { unresolvedBuildChoices } from "@/lib/unresolved-build-choices";
import { owedClassPickRows } from "@/lib/views/owed-class-picks-view";
import {
  wizardBookAllotment,
  wizardBookSize,
  wizardBookSpellCount,
} from "@/lib/wizard-spellbook";
import "@/i18n";
import type { CharacterData, SrdSpellRef } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

/** Nine levelled Wizard spells: what the app asked a Wizard 5 for before the book. */
const NINE = [
  "magic-missile",
  "shield",
  "mage-armor",
  "sleep",
  "detect-magic",
  "misty-step",
  "web",
  "fireball",
  "counterspell",
];

const wizard = (level: number, spells: SrdSpellRef[]): CharacterData =>
  makeCharacterDoc({ classes: [{ classId: "wizard", level }], spells }).character;

const interim = { subclassId: null, asiChoice: emptyAsiChoice(), fightingStyle: null };

const prepared = (ids: string[]) => ids.map((srdId) => ({ srdId, prepared: true }));

describe("the Wizard's book size", () => {
  it("6 at level 1, then 2 per Wizard level", () => {
    expect(wizardBookSize(1)).toBe(6);
    expect(wizardBookSize(5)).toBe(14);
    expect(wizardBookSize(20)).toBe(44);
  });
});

describe("the spells that count toward the book", () => {
  it("levelled Wizard spells only: not cantrips, grant picks or always-prepared ones", () => {
    const character = wizard(5, [
      ...prepared(NINE),
      { srdId: "fire-bolt", prepared: true },
      { srdId: "identify", prepared: false, grantedBy: "a-savant-feature" },
      { srdId: "cure-wounds", prepared: true, alwaysPrepared: true },
    ]);
    expect(wizardBookSpellCount(character)).toBe(9);
  });
});

describe("a book grant's picks (a Savant feature) on top of the free picks", () => {
  // Evoker 5: Evocation Savant has given 2 at level 3 and 1 at level 5 (3rd-level
  // slots). Fifteen unmarked Wizard spells, as a sheet from before the grant marker:
  // 14 free picks + 3 Savant picks = 17, so 2 are owed.
  const FIFTEEN = [
    ...NINE,
    "burning-hands",
    "thunderwave",
    "find-familiar",
    "scorching-ray",
    "lightning-bolt",
    "feather-fall",
  ];
  const evoker = (spells: SrdSpellRef[]) =>
    makeCharacterDoc({
      classes: [{ classId: "wizard", subclassId: "evoker", level: 5 }],
      features: [{ srdId: "wizard-evoker-evocation-savant" }],
      spells,
    }).character;

  it("the grant's picks to date are added to the book's size", () => {
    expect(wizardBookAllotment(evoker([]), 5)).toBe(3);
    expect(wizardBookAllotment(evoker([]), 3)).toBe(2);
  });

  it("unmarked picks count toward the book, and the gap is owed", () => {
    const owed = owedClassPicks(evoker(prepared(FIFTEEN))).find(
      (o) => o.pick === "spellbook"
    );
    expect(owed).toEqual({ classId: "wizard", pick: "spellbook", owed: 2 });
  });

  it("another grant's marked pick (Magic Initiate) is not in the book", () => {
    const withInitiate = evoker([
      ...prepared(FIFTEEN),
      { srdId: "chromatic-orb", prepared: true, grantedBy: "magic-initiate-wizard" },
    ]);
    expect(wizardBookSpellCount(withInitiate)).toBe(15);
  });
});

describe("a stored wizard short of the book", () => {
  const short = wizard(5, prepared(NINE));

  it("owes the gap as one pick", () => {
    expect(owedClassPicks(short).filter((o) => o.pick === "spellbook")).toEqual([
      { classId: "wizard", pick: "spellbook", owed: 5 },
    ]);
    expect(unresolvedBuildChoices(short, {})).toContainEqual({
      kind: "class-pick",
      classId: "wizard",
      pick: "spellbook",
      owed: 5,
    });
  });

  it("a full book owes nothing", () => {
    const full = wizard(1, prepared(NINE.slice(0, 6)));
    expect(owedClassPicks(full).some((o) => o.pick === "spellbook")).toBe(false);
  });

  it("offers Wizard spells of a level it has slots for, not ones it knows", () => {
    const pool = classPickPool(short, "wizard", "spellbook");
    expect(pool).toContain("lightning-bolt");
    expect(pool).not.toContain("fireball");
    expect(pool).not.toContain("ice-storm");
    expect(pool).not.toContain("cure-wounds");
    expect(pool).not.toContain("fire-bolt");
    for (const id of pool) {
      const spell = getSpellById(id);
      expect(spell?.classes).toContain("wizard");
      expect(spell?.level).toBeGreaterThanOrEqual(1);
      expect(spell?.level).toBeLessThanOrEqual(3);
    }
  });

  it("the picks land in the book, not prepared, cut to what is owed", () => {
    const pool = classPickPool(short, "wizard", "spellbook");
    const next = applyOwedClassPicks(short, [
      { classId: "wizard", pick: "spellbook", ids: pool.slice(0, 7) },
    ]);
    const added = next.spells.slice(short.spells.length);
    expect(added).toEqual(pool.slice(0, 5).map((srdId) => ({ srdId, prepared: false })));
    expect(owedClassPicks(next).some((o) => o.pick === "spellbook")).toBe(false);
  });

  it("a non-wizard owes no book", () => {
    const cleric = makeCharacterDoc({
      classes: [{ classId: "cleric", level: 5 }],
      spells: prepared(["cure-wounds"]),
    }).character;
    expect(owedClassPicks(cleric).some((o) => o.pick === "spellbook")).toBe(false);
  });

  it("«Scelte da completare» shows one row: how many, and that they stay unprepared", () => {
    const rows = owedClassPickRows(short, "it").filter((r) => r.pick === "spellbook");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe(
      "Aggiungi 5 incantesimi al tuo libro: restano non preparati"
    );
    // The same spells as the pool (the picker sorts them by the reader's names).
    expect(new Set(rows[0]?.options.map((o) => o.id))).toEqual(
      new Set(classPickPool(short, "wizard", "spellbook"))
    );
  });
});

describe("creating a wizard", () => {
  const SIX = [
    "magic-missile",
    "shield",
    "mage-armor",
    "sleep",
    "detect-magic",
    "burning-hands",
  ];
  const draftAt = (level: number, spells: string[]) =>
    [
      { type: "setName", name: "Ada" } as const,
      { type: "selectClass", classId: "wizard" } as const,
      { type: "setLevel", level } as const,
      ...spells.map(
        (spellId) =>
          ({ type: "toggleClassSpell", list: "spells", spellId, limit: 99 }) as const
      ),
    ].reduce(creationDraftReducer, initialCreationDraft());

  it("asks for the book (6 at level 1, 14 at level 5) and prepares the table's count", () => {
    expect(creationFacts(draftAt(1, [])).spellsNeeded).toBe(6);
    expect(creationFacts(draftAt(1, [])).preparedNeeded).toBe(4);
    expect(creationFacts(draftAt(5, [])).spellsNeeded).toBe(14);
    expect(creationFacts(draftAt(5, [])).preparedNeeded).toBe(9);
  });

  it("writes the six into the book, the first four prepared, and owes nothing", () => {
    const result = buildNewCharacter(draftAt(1, SIX), { displayName: "Tester" });
    if (!result.ok) throw new Error(result.error);
    const { character } = result.payload;
    const levelled = character.spells.filter(
      (s) => !("custom" in s) && SIX.includes(s.srdId)
    );
    expect(levelled.map((s) => ("custom" in s ? null : s.prepared))).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(character.spellcasting?.preparedMax).toBe(4);
    expect(owedClassPicks(character).some((o) => o.pick === "spellbook")).toBe(false);
  });

  it("another class still picks its prepared count", () => {
    const cleric = [{ type: "selectClass", classId: "cleric" } as const].reduce(
      creationDraftReducer,
      initialCreationDraft()
    );
    expect(creationFacts(cleric).spellsNeeded).toBe(creationFacts(cleric).preparedNeeded);
  });
});

describe("a wizard levelling up", () => {
  const SIX = [
    "magic-missile",
    "shield",
    "mage-armor",
    "sleep",
    "detect-magic",
    "burning-hands",
  ];
  const level1 = makeCharacterDoc({
    classes: [{ classId: "wizard", level: 1 }],
    spells: SIX.map((srdId, i) => ({ srdId, prepared: i < 4 })),
  });

  it("adds 2 spells to the book each level, not the prepared-count increase", () => {
    expect(levelUpPlan(level1, "wizard", interim).spellsKnownDiff).toBe(2);
    const at4 = makeCharacterDoc({ classes: [{ classId: "wizard", level: 4 }] });
    // Prepared goes 7 → 9 at level 5; the book still grows by 2.
    expect(levelUpPlan(at4, "wizard", interim).spellsKnownDiff).toBe(2);
  });

  it("a first Wizard level (multiclass) starts the book at 6", () => {
    const fighter = makeCharacterDoc({ classes: [{ classId: "fighter", level: 3 }] });
    expect(levelUpPlan(fighter, "wizard", interim).spellsKnownDiff).toBe(6);
  });

  it("the pick says it fills the book, not the prepared spells", () => {
    const row = levelUpAsks(level1, "wizard", NO_ANSWERS, "it").rows.find(
      (r) => r.key === "newSpells"
    );
    expect(row?.title).toBe("Aggiungi 2 incantesimi al tuo libro");
    expect(row?.help).toBe(
      "Vanno nel libro, non tra i preparati: prepari gli incantesimi del libro dopo un Riposo Lungo."
    );
  });

  it("the new picks fill the higher prepared limit first, the rest stay in the book", () => {
    const picks = levelUpAsks(
      level1,
      "wizard",
      { ...NO_ANSWERS, newSpells: ["thunderwave", "find-familiar"] },
      "en"
    ).picks;
    const after = commitLevelUp(level1, picks).character.spells;
    const added = after.filter(
      (s) => !("custom" in s) && ["thunderwave", "find-familiar"].includes(s.srdId)
    );
    // Level 2 prepares 5: four held, so one new pick is prepared.
    expect(added.map((s) => ("custom" in s ? null : s.prepared))).toEqual([true, false]);
  });
});
