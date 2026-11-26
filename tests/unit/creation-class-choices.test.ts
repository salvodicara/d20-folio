/**
 * Every class asks ALL of its level-1 choices at creation, read from its own
 * features (never a hand-kept list): a Divine/Primal Order bundle, a Fighting
 * Style, Weapon Mastery, Eldritch Invocations, Expertise. The class side is
 * complete only once each is made, and the build writes each where level-up does.
 */
import { describe, expect, it } from "vitest";

import { classTables } from "@/data/classes";
import { collectGrantBundles } from "@/lib/feature-choices";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { getFeaturesAtLevel } from "@/data/classes";
import { buildNewCharacter } from "@/lib/creation/build";
import {
  applyOwedClassPicks,
  classPickPool,
  owedClassPicks,
} from "@/lib/owed-class-picks";
import {
  creationDraftReducer,
  creationFacts,
  initialCreationDraft,
  type CreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import { classChoiceNeeds, type ClassChoicePicks } from "@/lib/creation/class-choices";

const apply = (draft: CreationDraft, ...actions: CreationDraftAction[]) =>
  actions.reduce(creationDraftReducer, draft);

const KINDS: (keyof ClassChoicePicks)[] = [
  "fightingStyles",
  "weaponMasteries",
  "invocations",
  "expertise",
];

function readyClass(classId: string): CreationDraft {
  return apply(
    initialCreationDraft(),
    { type: "setName", name: "Lia" },
    { type: "selectClass", classId },
    { type: "selectBackground", backgroundId: "soldier" },
    { type: "selectRace", raceId: "dwarf" },
    { type: "fillReadyMade" }
  );
}

/** The first option of each of the class's level-1 bundles. */
function bundlePicks(classId: string): CreationDraftAction[] {
  const refs = getFeaturesAtLevel(classId, 1).map((f) => ({ srdId: f.id }));
  return collectGrantBundles(resolveGrantSourcesForFeatures(refs), new Map()).map(
    (b) => ({
      type: "setLineageChoice",
      bundleKey: b.bundleKey,
      optionId: b.options[0]?.id ?? "",
    })
  );
}

describe("the class's level-1 choices at creation", () => {
  for (const table of classTables) {
    it(`${table.id}: complete only once every class choice is made`, () => {
      // The ready-made fill makes the class picks too (#1397): undo them, so each
      // one is made here by hand.
      let draft = apply(
        readyClass(table.id),
        ...KINDS.map(
          (kind): CreationDraftAction => ({ type: "setClassPick", kind, ids: [] })
        )
      );
      const { classNeeds, classOptions } = creationFacts(draft);
      const steps: CreationDraftAction[][] = bundlePicks(table.id).map((a) => [a]);
      for (const kind of KINDS) {
        const count = classNeeds[kind];
        if (count > 0) {
          steps.push([
            { type: "setClassPick", kind, ids: classOptions[kind].slice(0, count) },
          ]);
        }
      }
      // A bundle's chosen option may owe a pick of its own (Magician: an extra Druid
      // cantrip): the step is complete only once it is made too.
      if (!creationFacts(apply(draft, ...steps.flat())).classChoicesComplete) {
        steps.push([{ type: "fillReadyMade" }]);
      }
      for (const actions of steps) {
        expect(creationFacts(draft).classChoicesComplete).toBe(false);
        draft = apply(draft, ...actions);
      }
      expect(creationFacts(draft).classChoicesComplete).toBe(true);
    });
  }

  it("asks a Cleric's Divine Order and a Druid's Primal Order", () => {
    expect(creationFacts(readyClass("cleric")).classNeeds.bundleKeys).toEqual([
      "cleric-divine-order",
    ]);
    expect(creationFacts(readyClass("druid")).classNeeds.bundleKeys).toEqual([
      "druid-primal-order",
    ]);
  });

  it("asks a Fighter its Fighting Style and three Weapon Masteries", () => {
    const { classNeeds } = creationFacts(readyClass("fighter"));
    expect(classNeeds).toMatchObject({ fightingStyles: 1, weaponMasteries: 3 });
  });

  it("asks a Warlock one invocation and a Rogue two Expertise skills it is proficient in", () => {
    expect(creationFacts(readyClass("warlock")).classNeeds.invocations).toBe(1);
    const rogue = creationFacts(readyClass("rogue"));
    expect(rogue.classNeeds.expertise).toBe(2);
    expect(rogue.classOptions.expertise).toEqual(
      expect.arrayContaining(["athletics", "intimidation"])
    );
  });

  it("Expertise follows the class table: Bard 2 + 9, Rogue 1 + 6, two skills each time", () => {
    // SRD 5.2.1 Bard Features: Expertise at levels 2 and 9; Rogue Features: 1 and 6.
    const expertise = (classId: string, level: number) =>
      classChoiceNeeds(classId, level, "").expertise;
    expect(expertise("bard", 1)).toBe(0);
    expect(expertise("bard", 2)).toBe(2);
    expect(expertise("bard", 8)).toBe(2);
    expect(expertise("bard", 9)).toBe(4);
    expect(expertise("rogue", 1)).toBe(2);
    expect(expertise("rogue", 5)).toBe(2);
    expect(expertise("rogue", 6)).toBe(4);
  });

  // The classic form never fills the class picks (owner decision, #1397): a Bard made
  // at 9+ or a Rogue at 6+ has no skill at Expertise, «Choices to finish» asks the
  // table's 4 (two grants of two), and answering stores all four.
  for (const [classId, level, subclassId, skills] of [
    ["bard", 9, "college-of-lore", ["performance", "persuasion", "insight"]],
    ["rogue", 6, "thief", ["perception", "investigation", "deception", "acrobatics"]],
  ] as const) {
    it(`a classic ${classId} ${level} owes 4 Expertise, and the answer stores 4`, () => {
      const classic = apply(
        initialCreationDraft(),
        { type: "setName", name: "Lia" },
        { type: "selectClass", classId },
        { type: "setLevel", level },
        { type: "setSubclass", subclassId },
        { type: "selectBackground", backgroundId: "soldier" },
        { type: "selectRace", raceId: "dwarf" },
        ...skills.map(
          (skillId): CreationDraftAction => ({ type: "toggleClassSkill", skillId })
        )
      );
      const built = buildNewCharacter(classic, { displayName: "Player" });
      if (!built.ok) throw new Error(`build failed: ${JSON.stringify(built.error)}`);
      const character = built.payload.character;
      const expert = (c: typeof character) =>
        Object.values(c.skills).filter((v) => v === "expertise");
      expect(expert(character)).toEqual([]);
      expect(owedClassPicks(character)).toContainEqual({
        classId,
        pick: "expertise",
        owed: 4,
      });
      const answered = applyOwedClassPicks(character, [
        {
          classId,
          pick: "expertise",
          ids: classPickPool(character, classId, "expertise").slice(0, 4),
        },
      ]);
      expect(expert(answered)).toHaveLength(4);
      expect(
        owedClassPicks(answered).find((o) => o.pick === "expertise")
      ).toBeUndefined();
    });
  }

  it("a class change drops the class's picks and bundles, never the species'", () => {
    const cleric = apply(readyClass("cleric"), {
      type: "setLineageChoice",
      bundleKey: "cleric-divine-order",
      optionId: "protector",
    });
    const elf = apply(
      cleric,
      { type: "selectRace", raceId: "elf" },
      { type: "setLineageChoice", bundleKey: "elf-lineage", optionId: "wood-elf" },
      { type: "selectClass", classId: "fighter" }
    );
    expect(elf.lineageChoices).toEqual({ "elf-lineage": "wood-elf" });
  });

  it("the build writes each pick where level-up does", () => {
    const fighter = apply(
      readyClass("fighter"),
      { type: "setClassPick", kind: "fightingStyles", ids: ["defense"] },
      {
        type: "setClassPick",
        kind: "weaponMasteries",
        ids: ["longsword", "shortbow", "greataxe"],
      }
    );
    const built = buildNewCharacter(fighter, { displayName: null });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const c = built.payload.character;
    expect(c.classes[0]?.weaponMasteries).toEqual(["longsword", "shortbow", "greataxe"]);
    expect(c.features.some((f) => !("custom" in f) && f.srdId === "defense")).toBe(true);

    const rogue = apply(readyClass("rogue"), {
      type: "setClassPick",
      kind: "expertise",
      ids: ["athletics", "intimidation"],
    });
    const builtRogue = buildNewCharacter(rogue, { displayName: null });
    expect(builtRogue.ok && builtRogue.payload.character.skills.athletics).toBe(
      "expertise"
    );

    const cleric = apply(readyClass("cleric"), {
      type: "setLineageChoice",
      bundleKey: "cleric-divine-order",
      optionId: "protector",
    });
    const builtCleric = buildNewCharacter(cleric, { displayName: null });
    expect(
      builtCleric.ok && builtCleric.payload.session.grantBundleChoices
    ).toMatchObject({
      "cleric-divine-order": "protector",
    });
  });
});
