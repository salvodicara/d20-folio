/**
 * The Druid's known Wild Shape forms (SRD 5.2.1, Druid, Wild Shape, «Known Forms»):
 * the Beast Shapes table gives 4 known forms at Druid level 2, 6 at level 4 and 8 at
 * level 8 (Max CR 1/4, 1/2, 1; a Fly Speed only from level 8). The stored list is
 * optional: a Druid with none keeps seeing every eligible beast.
 */
import { describe, expect, it } from "vitest";

import {
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
} from "@/lib/character-codec";
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
