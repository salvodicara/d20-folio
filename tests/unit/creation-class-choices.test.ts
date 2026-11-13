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
      let draft = readyClass(table.id);
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
