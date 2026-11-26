/**
 * «Scelte da completare» on the new Play screen offers a Druid 2+ the Wild Shape
 * known forms it lacks (SRD 5.2.1 Beast Shapes: 4 at Druid 2, 6 at 4, 8 at 8), named
 * like the other class picks («4 forme per Forma Selvatica (Druido)»). The answer is
 * stored through the character store.
 */
import { afterEach, describe, expect, it } from "vitest";

import { owedWildShapeForms } from "@/domains/play/wild-shape-forms-owed";
import i18n from "@/i18n";
import { speciesChoicesLine } from "@/lib/views/species-choices-view";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function druid(level: number, wildShapeForms?: string[]): CharacterDoc {
  const doc = makeCharacterDoc({ classId: "druid", level });
  return wildShapeForms
    ? { ...doc, character: { ...doc.character, wildShapeForms } }
    : doc;
}

afterEach(() => {
  useCharacterStore.getState().setCharacter(null);
  useCharacterStore.setState({ readonly: false });
});

describe("the forms «Scelte da completare» offers", () => {
  it("a Druid 3 with none owes 4, from the beasts up to CR 1/4", () => {
    const owed = owedWildShapeForms(druid(3), "en");
    expect(owed?.owed).toBe(4);
    expect(owed?.label).toBe("4 Wild Shape forms (Druid)");
    expect(owed?.title).toBe("Choose 4 known forms for Wild Shape");
    expect(owed?.options.map((o) => o.id)).toContain("wolf");
    expect(owed?.options.map((o) => o.id)).not.toContain("black-bear");
  });

  it("says it in Italian with the official names", () => {
    const owed = owedWildShapeForms(druid(4, ["wolf", "boar", "panther", "elk"]), "it");
    expect(owed?.label).toBe("2 forme per Forma Selvatica (Druido)");
    expect(owed?.options.find((o) => o.id === "black-bear")?.label).toBe("Orso nero");
    expect(owed?.options.map((o) => o.id)).not.toContain("wolf");
  });

  it("nothing for a Druid with its forms, a Druid 1, or another class", () => {
    expect(owedWildShapeForms(druid(3, ["wolf", "boar", "panther", "elk"]), "en")).toBe(
      null
    );
    expect(owedWildShapeForms(druid(1), "en")).toBe(null);
    expect(owedWildShapeForms(makeCharacterDoc({ classId: "fighter" }), "en")).toBe(null);
  });

  it("the callout names the forms with the class picks", () => {
    const owed = owedWildShapeForms(druid(2), "en");
    const line = speciesChoicesLine(
      [],
      i18n.getFixedT("en"),
      "en",
      druid(2).character,
      undefined,
      owed ? [owed.label] : []
    );
    expect(line).toBe("Your class lets you choose more: 4 Wild Shape forms (Druid).");
  });
});

describe("the forms answered through the store", () => {
  it("learns the picked forms, never past the count", () => {
    useCharacterStore.getState().setCharacter(druid(2, ["wolf"]));
    useCharacterStore
      .getState()
      .learnWildShapeForms(["boar", "panther", "elk", "giant-badger"]);
    expect(useCharacterStore.getState().character?.character.wildShapeForms).toEqual([
      "wolf",
      "boar",
      "panther",
      "elk",
    ]);
  });

  it("a read-only sheet writes nothing", () => {
    const doc = druid(2);
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.setState({ readonly: true });
    useCharacterStore.getState().learnWildShapeForms(["wolf"]);
    expect(useCharacterStore.getState().character?.character.wildShapeForms).toBe(
      undefined
    );
  });
});
