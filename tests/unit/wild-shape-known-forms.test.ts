/**
 * The Druid's known Wild Shape forms (SRD 5.2.1, Druid, Wild Shape, «Known Forms»):
 * the Beast Shapes table gives 4 known forms at Druid level 2, 6 at level 4 and 8 at
 * level 8 (Max CR 1/4, 1/2, 1; a Fly Speed only from level 8). «Whenever you finish a
 * Long Rest, you can replace one of your known forms with another eligible form.» The
 * stored list is optional: a Druid with none keeps seeing every eligible beast.
 */
import { describe, expect, it } from "vitest";

import { getBeast } from "@/data/beasts";
import {
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
} from "@/lib/character-codec";
import { formPool } from "@/lib/form-pool";
import {
  eligibleWildShapeForms,
  formSwapOptions,
  knownFormsAt,
  learnWildShapeForms,
  swapKnownForm,
  wildShapeFormsOwed,
  wildShapePickerPool,
} from "@/lib/wild-shape-forms";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function druid(level: number, wildShapeForms?: string[]): CharacterDoc {
  const doc = makeCharacterDoc({ classId: "druid", level });
  return wildShapeForms
    ? { ...doc, character: { ...doc.character, wildShapeForms } }
    : doc;
}

function roundTrip(doc: CharacterDoc) {
  const { build } = serializeCharacterEnvelope(doc);
  const parsed = parseCharacterEnvelope(structuredClone(build), {});
  if (!parsed.ok) throw new Error(parsed.error);
  return { build, character: parsed.character };
}

function crOf(id: string): number {
  const beast = getBeast(id);
  if (!beast) throw new Error(`no beast ${id}`);
  return beast.cr;
}
const flies = (id: string) => (getBeast(id)?.speeds.fly ?? 0) > 0;

describe("the known forms are stored on the build", () => {
  it("a chosen list is written as `build.wildShapeForms` and read back", () => {
    const { build, character } = roundTrip(druid(4, ["wolf", "giant-badger"]));
    expect(build.wildShapeForms).toEqual(["wolf", "giant-badger"]);
    expect(character.wildShapeForms).toEqual(["wolf", "giant-badger"]);
    expect(character.unknown?.wildShapeForms).toBeUndefined();
  });

  it("no forms chosen stores nothing", () => {
    expect(roundTrip(druid(4, [])).build).not.toHaveProperty("wildShapeForms");
    expect(roundTrip(druid(4)).build).not.toHaveProperty("wildShapeForms");
  });
});

describe("how many forms a Druid knows (the Beast Shapes table)", () => {
  it.each([
    [1, 0],
    [2, 4],
    [3, 4],
    [4, 6],
    [7, 6],
    [8, 8],
    [20, 8],
  ])("Druid %i knows %i forms", (level, count) => {
    expect(knownFormsAt(level)).toBe(count);
  });
});

describe("the forms a Druid may know", () => {
  it.each([
    [2, 0.25, false],
    [4, 0.5, false],
    [8, 1, true],
  ])("at Druid %i: CR up to %f, a Fly Speed: %s", (level, cap, fly) => {
    const ids = eligibleWildShapeForms(druid(level)).map((b) => b.id);
    expect(ids).toContain("wolf");
    expect(ids.every((id) => crOf(id) <= cap)).toBe(true);
    expect(ids.some((id) => crOf(id) === cap)).toBe(true);
    expect(ids.some(flies)).toBe(fly);
  });

  it("the level-up reads the new level's limits: Druid 3 going to 4 may learn CR 1/2", () => {
    expect(eligibleWildShapeForms(druid(3), 4).map((b) => b.id)).toContain("black-bear");
    expect(eligibleWildShapeForms(druid(3)).map((b) => b.id)).not.toContain("black-bear");
  });

  it("a Circle of the Moon Druid may know the higher-CR forms its Circle Forms allow", () => {
    const moon = makeCharacterDoc({
      classes: [{ classId: "druid", subclassId: "circle-of-the-moon", level: 6 }],
    });
    expect(eligibleWildShapeForms(moon).some((b) => crOf(b.id) === 2)).toBe(true);
  });
});

describe("the Wild Shape picker", () => {
  it("a Druid with no forms chosen sees every eligible beast", () => {
    const doc = druid(4);
    expect(wildShapePickerPool(doc).map((b) => b.id)).toEqual(
      formPool(doc, "druid-wild-shape").map((b) => b.id)
    );
  });

  it("a Druid with known forms sees only those, by CR", () => {
    const doc = druid(4, ["black-bear", "wolf", "giant-badger"]);
    expect(wildShapePickerPool(doc).map((b) => b.id)).toEqual([
      "giant-badger",
      "wolf",
      "black-bear",
    ]);
  });

  it("a known form the Druid can't take now is left out (a Fly Speed before Druid 8)", () => {
    const doc = druid(4, ["wolf", "eagle"]);
    expect(wildShapePickerPool(doc).map((b) => b.id)).toEqual(["wolf"]);
  });

  it("never goes empty: no usable known form falls back to every eligible beast", () => {
    const doc = druid(4, ["not-a-beast", "eagle"]);
    expect(wildShapePickerPool(doc).map((b) => b.id)).toEqual(
      formPool(doc, "druid-wild-shape").map((b) => b.id)
    );
  });
});

describe("the forms a Druid still owes", () => {
  it.each([
    ["Druid 1", 0, druid(1)],
    ["Druid 2 with none", 4, druid(2)],
    ["Druid 3 with 4", 0, druid(3, ["wolf", "giant-badger", "panther", "boar"])],
    ["Druid 4 with 4", 2, druid(4, ["wolf", "giant-badger", "panther", "boar"])],
    ["Druid 8 with none", 8, druid(8)],
    ["a Fighter", 0, makeCharacterDoc({ classId: "fighter", level: 8 })],
  ])("%s owes %i", (_, owed, doc) => {
    expect(wildShapeFormsOwed(doc)).toBe(owed);
  });

  it("a multiclass counts the Druid level only (Fighter 5 / Druid 2 owes 4)", () => {
    const doc = makeCharacterDoc({
      classes: [
        { classId: "fighter", level: 5 },
        { classId: "druid", level: 2 },
      ],
    });
    expect(wildShapeFormsOwed(doc)).toBe(4);
  });

  it("a duplicate or an unknown id doesn't count as a form known", () => {
    expect(wildShapeFormsOwed(druid(2, ["wolf", "wolf", "not-a-beast"]))).toBe(3);
  });
});

describe("learning and swapping forms", () => {
  it("learning adds new forms after the known ones, never one already known", () => {
    const doc = learnWildShapeForms(druid(4, ["wolf"]), ["wolf", "ape", "panther"]);
    expect(doc.character.wildShapeForms).toEqual(["wolf", "ape", "panther"]);
  });

  it("learning never goes past the count", () => {
    const doc = learnWildShapeForms(druid(2, ["wolf", "boar"]), [
      "panther",
      "giant-badger",
      "cat",
    ]);
    expect(doc.character.wildShapeForms).toEqual([
      "wolf",
      "boar",
      "panther",
      "giant-badger",
    ]);
  });

  it("learning only takes forms the Druid may know", () => {
    const doc = learnWildShapeForms(druid(2), ["eagle", "wolf"]);
    expect(doc.character.wildShapeForms).toEqual(["wolf"]);
  });

  it("a Long Rest replaces one known form with another eligible one", () => {
    expect(swapKnownForm(["wolf", "ape", "panther"], "ape", "black-bear")).toEqual([
      "wolf",
      "black-bear",
      "panther",
    ]);
  });

  it("a swap needs a known form out and a new one in", () => {
    expect(swapKnownForm(["wolf"], "ape", "boar")).toEqual(["wolf"]);
    expect(swapKnownForm(["wolf", "ape"], "ape", "wolf")).toEqual(["wolf", "ape"]);
    expect(swapKnownForm(["wolf"], "wolf", null)).toEqual(["wolf"]);
  });

  it("the Long Rest offers the eligible forms the Druid doesn't know", () => {
    const options = formSwapOptions(druid(4, ["wolf", "ape"])).map((b) => b.id);
    expect(options).toContain("black-bear");
    expect(options).not.toContain("wolf");
    expect(options).not.toContain("eagle");
  });
});
