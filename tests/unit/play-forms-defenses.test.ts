/**
 * A temporary defense, and the familiar's and a summon's form, on the new Play screen
 * (headless), from the classic sheet's own writes. A potion of Fire Resistance or a
 * Protection from Energy gives Resistance until it ends; 2024 Find Familiar: «a
 * Celestial, Fey, or Fiend (your choice) instead of a Beast».
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import {
  addDefenseOptions,
  addTemporaryDefense,
  defenseKindViews,
  pickSummonForm,
  summonFamiliarForm,
} from "@/domains/play/forms-defenses-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

const t = ((key: string) => key) as unknown as TFunction;

describe("temporary defenses", () => {
  const doc = () => makeCharacterDoc({}, { sessionDefenses: { resistance: ["fire"] } });

  it("a defense already held is offered disabled; another is free", () => {
    const options = addDefenseOptions(doc(), "resistance", "en", t);
    expect(options.find((o) => o.id === "fire")?.already).toBe(true);
    expect(options.find((o) => o.id === "cold")?.already).toBe(false);
    expect(defenseKindViews(doc()).resistance.session).toEqual(["fire"]);
  });

  it("condition immunities are offered by condition", () => {
    const ids = addDefenseOptions(doc(), "conditionImmunity", "en", t).map((o) => o.id);
    expect(ids).toContain("frightened");
  });

  it("adding Cold resistance lands on the open sheet's session defenses", () => {
    useCharacterStore.getState().setCharacter(doc());
    addTemporaryDefense("resistance", "cold");
    const after = useCharacterStore.getState().character;
    if (!after) throw new Error("no sheet");
    expect(defenseKindViews(after).resistance.effective).toEqual(["cold", "fire"]);
  });
});

describe("forms", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(makeCharacterDoc({}));
    useUndoStore.getState().clear();
  });

  it("a Fey Owl familiar with its printed HP; the undo dismisses it", () => {
    summonFamiliarForm({ id: "owl", hpAverage: 1 }, "fey", "Owl", t);
    expect(useCharacterStore.getState().character?.session.familiar).toEqual({
      monsterId: "owl",
      creatureType: "fey",
    });
    useUndoStore.getState().undo();
    expect(useCharacterStore.getState().character?.session.familiar).toBeUndefined();
  });

  it("a summon's form is the spell's companion variant", () => {
    pickSummonForm("conjure-animals", "wolf", "Wolf", t);
    expect(
      useCharacterStore.getState().character?.session.companionVariant?.[
        "conjure-animals"
      ]
    ).toBe("wolf");
  });
});
