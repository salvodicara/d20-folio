/**
 * The ready-made fill makes the class's own picks too (#1397), the way it already
 * makes cantrips and spells (D&D Beyond's quick build): a character built from it
 * owes nothing in «Scelte da completare» and its next level-up asks only the new
 * level's picks. Cases from SRD 5.2.1:
 *
 *   - Weapon Mastery: Barbarian 2, Fighter 3, Paladin 2, Ranger 2, Rogue 2 at level 1,
 *     weapons the class is proficient with, the starting equipment's first;
 *   - Fighting Style: Fighter 1, Paladin 2, Ranger 2 — a style the class allows;
 *   - Expertise: Rogue 1 and 6, Bard 2 and 9, two proficient skills each time;
 *   - Eldritch Invocations: the Warlock's known count;
 *   - the Wizard's spellbook: six level-1 spells, then two per Wizard level.
 */
import { describe, expect, it } from "vitest";

import { classTables } from "@/data/classes";
import { QUICKBUILD_PRESETS } from "@/data/quickbuild";
import { buildNewCharacter } from "@/lib/creation/build";
import {
  creationDraftReducer,
  creationFacts,
  initialCreationDraft,
  type CreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import { owedClassPicks } from "@/lib/owed-class-picks";
import { listMasterableWeapons } from "@/lib/weapon-mastery-pick";
import { wizardBookOwed } from "@/lib/wizard-spellbook";
import type { CharacterData } from "@/types/character";

const KINDS = ["fightingStyles", "weaponMasteries", "invocations", "expertise"] as const;

const apply = (d: CreationDraft, ...a: CreationDraftAction[]) =>
  a.reduce(creationDraftReducer, d);

/** The class's ready-made build at `level` (the classic screen's starting point). */
function readyMade(classId: string, level: number): CreationDraft {
  const table = classTables.find((t) => t.id === classId);
  const preset = QUICKBUILD_PRESETS[classId];
  if (!table || !preset) throw new Error(classId);
  const sub = table.subclasses[0]?.id ?? "";
  return apply(
    initialCreationDraft(),
    { type: "setName", name: "Lia" },
    { type: "applyQuickbuild", classId, preset },
    { type: "setLevel", level },
    ...(level >= 3 && sub
      ? [{ type: "setSubclass", subclassId: sub } as CreationDraftAction]
      : []),
    { type: "fillReadyMade" }
  );
}

function built(draft: CreationDraft): CharacterData {
  const result = buildNewCharacter(draft, { displayName: null });
  if (!result.ok) throw new Error(result.error);
  return result.payload.character;
}

const owed = (draft: CreationDraft) => {
  const result = buildNewCharacter(draft, { displayName: null });
  if (!result.ok) throw new Error(result.error);
  return owedClassPicks(
    result.payload.character,
    result.payload.session.grantBundleChoices
  );
};

describe("the ready-made fill makes the class's own picks", () => {
  for (const classId of [
    "barbarian",
    "fighter",
    "paladin",
    "ranger",
    "rogue",
    "bard",
    "warlock",
    "wizard",
  ]) {
    for (const level of [1, 2, 3, 5, 6, 9, 10]) {
      it(`${classId} ${level}: the class picks are complete and nothing is owed`, () => {
        const draft = readyMade(classId, level);
        // Each kind at its count, from its legal options (a subclass's own option,
        // as the Hunter's Prey, is the player's to choose and not counted here).
        const { classNeeds, classOptions } = creationFacts(draft);
        for (const kind of KINDS) {
          expect(draft.classPicks[kind], kind).toHaveLength(classNeeds[kind]);
          for (const id of draft.classPicks[kind]) {
            expect(classOptions[kind], kind).toContain(id);
          }
        }
        expect(owed(draft)).toEqual([]);
      });
    }
  }

  it("a Paladin masters two weapons of its starting kit (Longsword, Javelins)", () => {
    const draft = readyMade("paladin", 1);
    expect([...draft.classPicks.weaponMasteries].sort()).toEqual([
      "javelin",
      "longsword",
    ]);
    expect(built(draft).classes[0]?.weaponMasteries?.toSorted()).toEqual([
      "javelin",
      "longsword",
    ]);
  });

  it("a mastery is always a weapon the class may master", () => {
    for (const classId of ["barbarian", "fighter", "paladin", "ranger", "rogue"]) {
      const legal = listMasterableWeapons(classId).map((w) => w.id);
      for (const id of readyMade(classId, 1).classPicks.weaponMasteries) {
        expect(legal, `${classId}: ${id}`).toContain(id);
      }
    }
  });

  it("a Paladin at 2 takes a Fighting Style it allows: Defense, since it starts in armor", () => {
    const draft = readyMade("paladin", 2);
    expect(draft.classPicks.fightingStyles).toEqual(["defense"]);
    expect(built(draft).features.map((f) => ("srdId" in f ? f.srdId : ""))).toContain(
      "defense"
    );
  });

  it("a Champion at 7 keeps both Fighting Styles (Fighter 1, Additional Fighting Style 7)", () => {
    const draft = readyMade("fighter", 7);
    expect(draft.classPicks.fightingStyles).toHaveLength(2);
    const ids = built(draft).features.map((f) => ("srdId" in f ? f.srdId : ""));
    for (const style of draft.classPicks.fightingStyles) expect(ids).toContain(style);
  });

  it("a Bard at 2 has Expertise in two of its own proficient skills", () => {
    const character = built(readyMade("bard", 2));
    const expert = Object.entries(character.skills).filter(([, v]) => v === "expertise");
    expect(expert).toHaveLength(2);
  });

  it("a Bard at 9 has Expertise in four skills (2 at level 2, 2 at level 9)", () => {
    const character = built(readyMade("bard", 9));
    const expert = Object.entries(character.skills).filter(([, v]) => v === "expertise");
    expect(expert).toHaveLength(4);
  });

  for (const [level, book] of [
    [1, 6],
    [3, 10],
    [5, 14],
  ] as const) {
    it(`a Wizard at ${level} has a book of ${book} levelled spells`, () => {
      const character = built(readyMade("wizard", level));
      expect(book).toBe(6 + 2 * (level - 1));
      expect(wizardBookOwed(character, level)).toBe(0);
    });
  }

  it("keeps a mastery the player picked and tops up the rest", () => {
    let draft = readyMade("paladin", 1);
    draft = apply(
      draft,
      { type: "setClassPick", kind: "weaponMasteries", ids: ["warhammer"] },
      { type: "fillReadyMade" }
    );
    expect(draft.classPicks.weaponMasteries).toHaveLength(2);
    expect(draft.classPicks.weaponMasteries[0]).toBe("warhammer");
  });

  it("drops a pick that is no longer legal before topping up", () => {
    let draft = readyMade("barbarian", 1);
    // A Barbarian masters melee weapons only: a Longbow is never one of its picks.
    draft = apply(
      draft,
      { type: "setClassPick", kind: "weaponMasteries", ids: ["longbow"] },
      { type: "fillReadyMade" }
    );
    expect(draft.classPicks.weaponMasteries).not.toContain("longbow");
    expect(draft.classPicks.weaponMasteries).toHaveLength(2);
  });
});
